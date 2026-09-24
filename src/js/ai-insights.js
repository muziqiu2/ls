// ==========================================
// AI 每周总结 · 界面层
// ==========================================
// 产品形态（2026-09-24 按用户要求调整）：
//   · 不再需要手动点「生成」—— 每周第一次打开时自动生成一次，结果显示在统计页
//     「规律洞察」结论的下方；
//   · 已去掉知情同意弹窗（密钥与服务商都由用户自己选定）。透明度改为非阻塞的：
//     设置页里列明「会发送什么 / 不会发送什么」，并可展开查看实际要发送的 JSON；
//   · 成本封顶：同一个自然周内最多自动请求 1 次，跨周才重新生成。
// 仍然不可退让的一条：模型返回的文本一律当**不可信输入**处理，只用 textContent 组装 DOM。
import { el, state } from './state.js';
import { getSettings } from './settings.js';
import { idbGet, idbSet } from './idb.js';
import { PROVIDERS, getProvider, normalizeBaseUrl, providerHint } from './ai-providers.js';
import { buildSummary, buildMessages, cacheKeyOf, consentFields } from './ai-prompt.js';
import { requestInsight, fetchModels, AiError } from './ai-client.js';
import { formatTime } from './utils.js';

const CACHE_IDB_KEY = 'aiWeeklyInsightV1';
const WEEK_DAYS = 7;   // 周报覆盖的窗口：最近 7 天（含今天）
const MIN_RECORDS = 3; // 数据太薄就没必要烧 token，本地的规则结论已经够用

let cached = null;          // { weekKey, key, text, model, provider, createdAt }
let cachePromise = null;
let generating = false;
let pendingText = '';
let rafId = 0;
let lastError = null;
// 已尝试过自动生成的组合（周 + 服务商 + 模型）。
// 不能只记周：周内换了模型就该重新生成一次，否则缓存不匹配又不放行自动生成，
// 界面会变成「什么都不显示」——比报错更让人困惑。
let autoTriedKey = '';

const pad = n => String(n).padStart(2, '0');

// ---------- 周与窗口 ----------

/** 周一为一周第一天，与统计模块保持一致 */
function weekStartOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
}

/** 用「本周周一」的日期当周标识，跨周即失效 */
function weekKeyOf(date = new Date()) {
  const s = weekStartOf(date);
  return `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}`;
}

/** 周报实际覆盖的窗口（最近 7 天，含今天）—— 标签与真实内容保持一致 */
function windowLabel(now = new Date()) {
  const from = new Date(now);
  from.setDate(from.getDate() - (WEEK_DAYS - 1));
  return `${from.getMonth() + 1}/${from.getDate()} – ${now.getMonth() + 1}/${now.getDate()}`;
}

// ---------- 配置 ----------

function aiConfig() {
  const ai = (getSettings().ai) || {};
  const provider = getProvider(ai.provider);
  return {
    enabled: !!ai.enabled,
    provider: ai.provider || provider.id,
    providerName: provider.name,
    region: provider.region,
    baseUrl: normalizeBaseUrl(ai.baseUrl || provider.baseUrl),
    model: String(ai.model || provider.model || '').trim(),
    apiKey: String(ai.apiKey || '').trim(),
  };
}

function isConfigured(cfg) {
  return !!(cfg.enabled && cfg.baseUrl && cfg.model && cfg.apiKey);
}

// ---------- 缓存 ----------

/**
 * 读一次缓存。**必须缓存 Promise 而不是布尔标志**：
 * 初始化与 stats-updated 会几乎同时调进来，若第二个调用者因为「已开始加载」
 * 就直接返回，它会拿到 cached === null，误判成「本周还没生成过」而重复发一次请求。
 */
function loadCache() {
  if (!cachePromise) {
    cachePromise = (async () => {
      try {
        const stored = await idbGet(CACHE_IDB_KEY);
        if (stored && typeof stored.text === 'string') cached = stored;
      } catch {
        cached = null;
      }
    })();
  }
  return cachePromise;
}

async function saveCache(entry) {
  cached = entry;
  try {
    await idbSet(CACHE_IDB_KEY, entry);
  } catch {
    // 缓存写不进去不影响本次展示，下周重新请求即可
  }
}

// ---------- 安全渲染 ----------
// 模型输出是不可信输入：全程 textContent，绝不 innerHTML。

function appendInline(parent, text) {
  // 只识别 **加粗** 与 `代码`，其余一律当纯文本
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  parts.forEach(part => {
    if (!part) return;
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      const strong = document.createElement('strong');
      strong.textContent = part.slice(2, -2);
      parent.appendChild(strong);
    } else if (/^`[^`]+`$/.test(part)) {
      const code = document.createElement('code');
      code.className = 'ai-code';
      code.textContent = part.slice(1, -1);
      parent.appendChild(code);
    } else {
      parent.appendChild(document.createTextNode(part));
    }
  });
}

/**
 * 极简 Markdown 渲染：段落、无序列表、# 标题、**加粗**、`代码`。
 * 刻意不做完整 Markdown —— 不支持原始 HTML 就不可能引入 XSS。
 */
function renderRich(container, text) {
  container.textContent = '';
  container.classList.remove('is-streaming');
  let list = null;
  let para = null;

  // 免责声明由界面统一追加（不依赖模型每次都照做），
  // 所以先把它从正文尾部摘掉，避免同一句话出现两遍。
  const body = String(text).replace(/[\s\n]*以上仅供参考[，,]?[^\n]*不构成医疗建议[。.]?\s*$/m, '');

  body.split(/\r?\n/).forEach(rawLine => {
    const line = rawLine.trim();
    if (!line) {
      list = null;
      para = null;
      return;
    }

    if (/^[-*•]\s+/.test(line)) {
      if (!list) {
        list = document.createElement('ul');
        list.className = 'ai-list';
        container.appendChild(list);
      }
      const li = document.createElement('li');
      appendInline(li, line.replace(/^[-*•]\s+/, ''));
      list.appendChild(li);
      para = null;
      return;
    }

    if (/^#{1,6}\s+/.test(line)) {
      const h = document.createElement('h4');
      h.className = 'ai-h';
      appendInline(h, line.replace(/^#{1,6}\s+/, ''));
      container.appendChild(h);
      list = null;
      para = null;
      return;
    }

    if (!para) {
      para = document.createElement('p');
      para.className = 'ai-p';
      container.appendChild(para);
    } else {
      para.appendChild(document.createTextNode(' '));
    }
    appendInline(para, line);
  });
}

// ---------- 界面 ----------

function setHidden(node, hidden) {
  if (node) node.classList.toggle('hidden', !!hidden);
}

function stopCaret() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  setHidden(el.aiWeeklyCaret, true);
  if (el.aiWeeklyText) el.aiWeeklyText.classList.remove('is-streaming');
}

function hideAll() {
  stopCaret();
  setHidden(el.aiWeekly, true);
  setHidden(el.aiWeeklyHint, true);
}

/**
 * 单行提示。带 action 时行尾附一个可点的「重试 / 去设置」。
 * 刻意做得很安静（与卡片内其它文本同一视觉重量），不做成大卡片。
 */
function showHint(text, action) {
  if (!el.aiWeeklyHint) return;
  el.aiWeeklyHint.textContent = '';
  el.aiWeeklyHint.appendChild(document.createTextNode(text));
  if (action) {
    el.aiWeeklyHint.appendChild(document.createTextNode(' '));
    const link = document.createElement('span');
    link.className = 'ai-weekly-link';
    link.textContent = action.label;
    link.setAttribute('role', 'button');
    link.setAttribute('tabindex', '0');
    link.dataset.action = action.id;
    el.aiWeeklyHint.appendChild(link);
  }
  setHidden(el.aiWeeklyHint, false);
}

function showSummary(text, cfg, createdAt) {
  setHidden(el.aiWeeklyHint, true);
  setHidden(el.aiWeekly, false);
  renderRich(el.aiWeeklyText, text);
  if (el.aiWeeklyRange) el.aiWeeklyRange.textContent = windowLabel();

  if (el.aiWeeklyMeta) {
    el.aiWeeklyMeta.textContent = '';
    const line = document.createElement('span');
    line.textContent = `${cfg.model} · 生成于 ${formatTime(new Date(createdAt))}`;
    el.aiWeeklyMeta.appendChild(line);
    const note = document.createElement('span');
    note.className = 'ai-weekly-note';
    note.textContent = '仅供参考，不构成医疗建议';
    el.aiWeeklyMeta.appendChild(note);
  }
}

function showStreaming(cfg) {
  setHidden(el.aiWeeklyHint, true);
  setHidden(el.aiWeekly, false);
  if (el.aiWeeklyRange) el.aiWeeklyRange.textContent = `${windowLabel()} · 正在生成`;
  el.aiWeeklyText.textContent = '';
  el.aiWeeklyText.classList.add('is-streaming');
  setHidden(el.aiWeeklyCaret, false);
  if (el.aiWeeklyMeta) el.aiWeeklyMeta.textContent = '';
}

function errorMessageOf(error) {
  const base = error && error.message ? error.message : '生成失败，请稍后重试。';
  const detail = error && error.detail ? '（' + String(error.detail).slice(0, 60) + '）' : '';
  return base + detail;
}

// ---------- 主流程 ----------

/**
 * 重算展示状态。**只有跨周且本周还没生成过时才会发请求**，其余情况纯读缓存。
 */
export async function refreshAiWeekly() {
  if (!el.aiWeekly) return;

  await loadCache();

  const cfg = aiConfig();

  // 未启用：什么都不显示，保持界面干净（入口在设置里）
  if (!cfg.enabled) {
    hideAll();
    return;
  }

  // 启用但没配完：给一行提示，别让用户以为坏了
  if (!isConfigured(cfg)) {
    hideAll();
    showHint('AI 每周总结已开启，还差服务地址 / 模型 / API Key。', { id: 'settings', label: '去设置' });
    return;
  }

  const summary = buildSummary(state.records, { days: WEEK_DAYS });

  // 数据太薄：本地的规则结论已经够用，不浪费 token
  if (summary.记录总数 < MIN_RECORDS) {
    hideAll();
    showHint(`AI 周报会在最近 7 天有 ${MIN_RECORDS} 条记录后自动出现在这里。`);
    return;
  }

  const weekKey = weekKeyOf();
  const sameWeek = !!(
    cached && cached.text &&
    cached.weekKey === weekKey &&
    cached.provider === cfg.provider &&
    cached.model === cfg.model
  );

  if (sameWeek) {
    showSummary(cached.text, cfg, cached.createdAt);
    return;
  }

  if (generating) return;

  // 本周 + 当前模型还没自动跑过 → 自动生成（同一组合每周仅一次）
  const autoKey = `${weekKey}|${cfg.provider}|${cfg.model}`;
  if (autoTriedKey !== autoKey) {
    autoTriedKey = autoKey;
    await generate(cfg);
    return;
  }

  // 该组合已经自动尝试过且失败：不当成错误刷屏，只留一行可重试的提示
  if (lastError) {
    hideAll();
    showHint(`AI 周报生成失败：${errorMessageOf(lastError)}`, { id: 'retry', label: '重试' });
  } else {
    hideAll();
  }
}

/** 发起一次生成并流式写入 */
async function generate(cfg) {
  if (generating) return;
  generating = true;
  lastError = null;
  pendingText = '';

  const summary = buildSummary(state.records, { days: WEEK_DAYS });
  showStreaming(cfg);

  const scheduleFlush = () => {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      if (el.aiWeeklyText) el.aiWeeklyText.textContent = pendingText;
    });
  };

  try {
    const text = await requestInsight(cfg, buildMessages(summary), {
      onToken: chunk => {
        pendingText += chunk;
        scheduleFlush();
      },
    });

    stopCaret();
    showSummary(text, cfg, Date.now());
    await saveCache({
      weekKey: weekKeyOf(),
      key: cacheKeyOf(summary, cfg),
      text,
      model: cfg.model,
      provider: cfg.provider,
      createdAt: Date.now(),
    });
  } catch (error) {
    stopCaret();
    lastError = error instanceof AiError ? error : new AiError('unknown', '生成失败，请稍后重试。');
    // 有上次结果就继续留着（多记几条不该把上周的总结弄丢），只把失败原因摆在下面
    if (cached && cached.text) {
      showSummary(cached.text, cfg, cached.createdAt);
      showHint(`本次更新失败：${errorMessageOf(lastError)}`, { id: 'retry', label: '重试' });
    } else {
      hideAll();
      showHint(`AI 周报生成失败：${errorMessageOf(lastError)}`, { id: 'retry', label: '重试' });
    }
  } finally {
    generating = false;
  }
}

// ---------- 设置页交互 ----------

function setFieldHint(text) {
  if (el.aiProviderHint) el.aiProviderHint.textContent = text;
}

function applyProviderPreset(keepFilled) {
  const provider = getProvider(el.aiProvider.value);
  if (!keepFilled || !el.aiBaseUrl.value.trim()) el.aiBaseUrl.value = provider.baseUrl;
  if (!keepFilled || !el.aiModel.value.trim()) el.aiModel.value = provider.model;
  setFieldHint(providerHint(provider.id));
  if (el.aiFetchModelsBtn) el.aiFetchModelsBtn.disabled = false;
  // 换了服务商，上一家的模型列表不再适用
  setHidden(el.aiModelPickWrap, true);
}

async function handleFetchModels() {
  const baseUrl = normalizeBaseUrl(el.aiBaseUrl.value);
  const apiKey = el.aiApiKey.value.trim();

  if (!baseUrl) { setFieldHint('请先填写服务地址。'); return; }
  if (!apiKey) { setFieldHint('请先填写 API Key。'); return; }

  el.aiFetchModelsBtn.disabled = true;
  const original = el.aiFetchModelsBtn.textContent;
  el.aiFetchModelsBtn.textContent = '读取中…';

  try {
    const models = await fetchModels({ baseUrl, apiKey });
    if (!models.length) {
      setHidden(el.aiModelPickWrap, true);
      setFieldHint('该服务没有返回模型列表，请手动填写模型名。');
    } else {
      renderModelPicker(models);
      setFieldHint(`读取到 ${models.length} 个模型，可在下方下拉框中选择。`);
    }
  } catch (error) {
    setHidden(el.aiModelPickWrap, true);
    setFieldHint(error && error.message ? error.message : '读取失败，请手动填写模型名。');
  } finally {
    el.aiFetchModelsBtn.disabled = false;
    el.aiFetchModelsBtn.textContent = original;
  }
}

/**
 * 用原生 <select> 承载模型列表。
 * 上一版用的是 `<datalist>` —— 它在 iOS Safari 上**根本不渲染下拉**，
 * 于是「可在模型输入框中选择」这句提示成了空话。换成所有浏览器都支持的 select。
 */
function renderModelPicker(models) {
  el.aiModelPick.textContent = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = `选择模型（共 ${models.length} 个）`;
  el.aiModelPick.appendChild(placeholder);

  models.forEach(id => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = id;
    el.aiModelPick.appendChild(opt);
  });

  // 当前已填的模型若在列表里就直接选中，省得用户再找一遍
  const current = el.aiModel.value.trim();
  el.aiModelPick.value = models.includes(current) ? current : '';
  setHidden(el.aiModelPickWrap, false);
}

function handleClearKey() {
  if (!el.aiApiKey.value) { setFieldHint('当前没有填写密钥。'); return; }
  el.aiApiKey.value = '';
  setFieldHint('密钥已清除，别忘了点下方「保存设置」。');
}

/**
 * 设置页里的「会发送什么 / 查看将发送的内容」。
 * 这是去掉知情同意弹窗后保留的透明度：内容随时可查，但不阻塞操作。
 * 字段名由 consentFields() 从真实摘要生成，避免说明与实际发送内容脱节。
 */
export function updateSendPreview() {
  if (el.aiPreviewBody || el.aiSendFields) {
    try {
      const summary = buildSummary(state.records, { days: WEEK_DAYS });
      if (el.aiSendFields) el.aiSendFields.textContent = consentFields(summary).join('、');
      if (el.aiPreviewBody) el.aiPreviewBody.textContent = JSON.stringify(summary, null, 2);
    } catch {
      if (el.aiPreviewBody) el.aiPreviewBody.textContent = '（暂时无法生成预览）';
    }
  }
}

// ---------- 绑定 ----------

/**
 * 填充设置页的服务商下拉。必须在 loadSettings() 之前调用 ——
 * loadSettings 会直接给 select 赋 value，选项还不存在时赋值会被丢弃。
 */
export function populateAiProviders() {
  if (!el.aiProvider) return;
  el.aiProvider.textContent = '';
  PROVIDERS.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    el.aiProvider.appendChild(opt);
  });
  el.aiProvider.value = PROVIDERS[0].id;
  setFieldHint(providerHint(PROVIDERS[0].id));
  applyProviderPreset(true);
}

export function initAiWeekly() {
  if (!el.aiWeekly) return;

  // 手动重新生成：不是主路径，只是跨周之前想提前刷新时用
  if (el.aiWeeklyRefresh) {
    el.aiWeeklyRefresh.addEventListener('click', () => {
      const cfg = aiConfig();
      if (!isConfigured(cfg) || generating) return;
      lastError = null;
      generate(cfg);
    });
  }

  // 提示行里的「重试 / 去设置」是动态插入的，用事件委托
  if (el.aiWeeklyHint) {
    const activate = e => {
      const link = e.target && e.target.closest ? e.target.closest('.ai-weekly-link') : null;
      if (!link) return;
      e.preventDefault();
      if (link.dataset.action === 'retry') {
        const cfg = aiConfig();
        if (isConfigured(cfg) && !generating) { lastError = null; generate(cfg); }
      } else if (link.dataset.action === 'settings') {
        if (el.settingsBtn) el.settingsBtn.click();
      }
    };
    el.aiWeeklyHint.addEventListener('click', activate);
    el.aiWeeklyHint.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') activate(e);
    });
  }

  if (el.aiProvider) el.aiProvider.addEventListener('change', () => applyProviderPreset(false));
  if (el.aiFetchModelsBtn) el.aiFetchModelsBtn.addEventListener('click', handleFetchModels);
  if (el.aiClearKeyBtn) el.aiClearKeyBtn.addEventListener('click', handleClearKey);
  if (el.aiModelPick) {
    el.aiModelPick.addEventListener('change', () => {
      if (el.aiModelPick.value) el.aiModel.value = el.aiModelPick.value;
    });
  }
  // 打开设置时顺手刷新「将发送的内容」预览
  if (el.settingsBtn) el.settingsBtn.addEventListener('click', updateSendPreview);

  // 记录/筛选变化后重算状态（只有跨周时才可能触发请求）
  window.addEventListener('stats-updated', refreshAiWeekly);

  refreshAiWeekly();
}
