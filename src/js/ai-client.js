// ==========================================
// AI 洞察 · 客户端适配层（OpenAI 兼容协议）
// ==========================================
// 不引入任何 SDK，也不引入外部静态资源：直接 fetch。
// 所有国内主流服务商（DeepSeek / 通义 / Kimi / 智谱 / 豆包 / 混元 / 硅基流动）
// 和 OpenAI 都提供 /v1/chat/completions，换 baseUrl + model 即可。
import { normalizeBaseUrl } from './ai-providers.js';

const TIMEOUT_MS = 60000;
const MAX_TOKENS = 800;

/**
 * 带分类的 AI 调用错误，上层据此给出「能看懂、能照着改」的提示
 */
export class AiError extends Error {
  constructor(kind, message, detail) {
    super(message);
    this.name = 'AiError';
    this.kind = kind;
    this.detail = detail;
  }
}

function friendlyHttpError(status, bodyText) {
  // 尽量从各家五花八门的错误体里抠出一句可读的原因，抠不到就用兜底文案
  let reason = '';
  try {
    const json = JSON.parse(bodyText);
    reason = json?.error?.message || json?.message || json?.error?.code || '';
  } catch {
    reason = String(bodyText || '').slice(0, 120);
  }

  if (status === 401 || status === 403) {
    return new AiError('auth', '密钥被拒绝（401/403）。请检查 API Key 是否填对、是否已过期。', reason);
  }
  if (status === 404) {
    return new AiError('notfound', '接口地址或模型名不存在（404）。请检查服务地址，或用「读取可用模型」确认模型名。', reason);
  }
  if (status === 429) {
    return new AiError('ratelimit', '请求过于频繁或额度不足（429）。稍后再试，或检查账户余额。', reason);
  }
  if (status >= 500) {
    return new AiError('server', `服务商返回错误（${status}）。这是对方服务的问题，稍后再试。`, reason);
  }
  return new AiError('http', `请求失败（${status}）。${reason ? '对方提示：' + reason : ''}`, reason);
}

/**
 * 把网络层异常翻译成人话。浏览器直连第三方 API 时，
 * 最常见的就是 CORS 被拦，此时 fetch 只会抛 TypeError: Failed to fetch，
 * 必须提示用户往 CORS 方向查，否则他会一直以为是自己密钥填错了。
 */
function wrapNetworkError(error) {
  if (error && error.name === 'AbortError') return error;
  if (error && error.name === 'AiError') return error;
  return new AiError(
    'network',
    '无法连接到该服务地址。常见原因：地址写错、网络不通，或该服务不允许浏览器直接调用（CORS）。',
    error && error.message
  );
}

function buildRequest(config, messages, stream) {
  const base = normalizeBaseUrl(config.baseUrl);
  return {
    url: `${base}/chat/completions`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: typeof config.temperature === 'number' ? config.temperature : 0.4,
        max_tokens: MAX_TOKENS,
        stream,
      }),
    },
  };
}

/** 从一次响应里取出正文；兼容流式与非流式两种返回 */
function pickDelta(payload) {
  const choice = payload?.choices?.[0];
  if (!choice) return '';
  const content = choice.delta?.content ?? choice.message?.content;
  return typeof content === 'string' ? content : '';
}

/**
 * 发起一次洞察请求。
 *
 * @param {Object} config { baseUrl, apiKey, model, temperature }
 * @param {Array} messages 由 buildMessages() 生成
 * @param {Object} [options]
 * @param {(text: string) => void} [options.onToken] 流式回调，逐块追加
 * @param {AbortSignal} [options.signal] 外部取消信号
 * @returns {Promise<string>} 完整文本
 */
export async function requestInsight(config, messages, { onToken, signal } = {}) {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) throw new AiError('aborted', '已取消');
    signal.addEventListener('abort', onExternalAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    const { url, init } = buildRequest(config, messages, true);
    response = await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onExternalAbort);
    if (error && error.name === 'AbortError') {
      throw signal && signal.aborted
        ? new AiError('aborted', '已取消')
        : new AiError('timeout', '请求超过 60 秒没有响应，已中断。可以稍后重试。');
    }
    throw wrapNetworkError(error);
  }

  if (!response.ok) {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onExternalAbort);
    let bodyText = '';
    try { bodyText = await response.text(); } catch { /* 读不到就用状态码兜底 */ }
    throw friendlyHttpError(response.status, bodyText);
  }

  const isEventStream = String(response.headers.get('content-type') || '').includes('text/event-stream');

  try {
    // 有些服务商即使收到 stream:true 也会直接返回完整 JSON，这里两种都支持
    if (!isEventStream || !response.body) {
      const payload = await response.json();
      const text = pickDelta(payload);
      if (!text) throw new AiError('empty', '服务返回了空内容，请稍后重试。');
      if (onToken) onToken(text);
      return text;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let full = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      // SSE 以空行分隔事件；按 \n\n 切，最后一段可能不完整，留在 buffer 里
      const parts = buffer.split(/\r?\n\r?\n/);
      buffer = parts.pop() || '';

      for (const part of parts) {
        for (const rawLine of part.split(/\r?\n/)) {
          const line = rawLine.trim();
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;

          let payload;
          try { payload = JSON.parse(data); } catch { continue; }
          // 部分服务商会在 [DONE] 前多发一个空 chunk，取不到正文就跳过
          const chunk = pickDelta(payload);
          if (!chunk) continue;
          full += chunk;
          if (onToken) onToken(chunk);
        }
      }
    }

    if (!full.trim()) throw new AiError('empty', '服务返回了空内容，请稍后重试。');
    return full;
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw signal && signal.aborted
        ? new AiError('aborted', '已取消')
        : new AiError('timeout', '生成超时，已中断。');
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * 读取该服务地址下账号可用的模型列表（GET /models）。
 * 模型名更新快，预设值很容易过期，让用户能一键换成真实存在的模型。
 * 并非所有兼容服务都实现该接口，失败时抛错由上层提示「手动填写」。
 */
export async function fetchModels(config) {
  const base = normalizeBaseUrl(config.baseUrl);
  if (!base) throw new AiError('config', '请先填写服务地址。');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      let bodyText = '';
      try { bodyText = await res.text(); } catch { /* ignore */ }
      throw friendlyHttpError(res.status, bodyText);
    }
    const payload = await res.json();
    const list = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
    return list.map(m => m?.id).filter(id => typeof id === 'string' && id).sort();
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw new AiError('timeout', '读取模型列表超时。');
    }
    throw wrapNetworkError(error);
  } finally {
    clearTimeout(timer);
  }
}
