// ==========================================
// AI 洞察 · 界面层（状态机 + 知情同意 + 安全渲染 + 结果缓存）
// ==========================================
// 几条不可退让的约束：
//   1. 只有用户点「生成洞察」才发请求 —— 刷新统计、切换时间范围都不会偷偷调用；
//   2. 换了服务商（域名变了）必须重新征求同意；
//   3. 模型返回的文本一律当**不可信输入**处理，只用 textContent 组装 DOM，不用 innerHTML。
import { el, state } from './state.js';
import { getSettings, updateAiConsent, openSettingsModal } from './settings.js';
import { showToast, setLayerOpen, registerModal } from './ui.js';
import { idbGet, idbSet } from './idb.js';
import { PROVIDERS, getProvider, normalizeBaseUrl, hostOf, providerHint } from './ai-providers.js';
import { buildSummary, buildMessages, cacheKeyOf, consentFields } from './ai-prompt.js';
import { requestInsight, fetchModels, AiError } from './ai-client.js';
import { formatDate, formatTime } from './utils.js';

const CACHE_IDB_KEY = 'aiInsightCacheV1';

// 模块内状态：生成中的取消控制器与当前累计文本
let abortController = null;
let pendingText = '';
let rafId = 0;
let cached = null;      // { key, text, model, createdAt }
let cacheLoaded = false;
let lastError = null;

/** 取当前时间范围（与统计页图表共用同一个下拉，保证「AI 看到的就是你看到的」） */
function currentDays() {
  const value = el.timeRangeSelect ? el.timeRangeSelect.value : '14';
  return value === 'all' ? 'all' : Number(value) || 14;
}

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
    consentedHost: String(ai.consentedHost || ''),
  };
}

function isConfigured(cfg) {
  return !!(cfg.enabled && cfg.baseUrl && cfg.model && cfg.apiKey);
}

// ---------- 结果缓存 ----------

async function loadCache() {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try {
    const stored = await idbGet(CACHE_IDB_KEY);
    if (stored && typeof stored.text === 'string') cached = stored;
  } catch {
    cached = null;
  }
}

async function saveCache(entry) {
  cached = entry;
  try {
    await idbSet(CACHE_IDB_KEY, entry);
  } catch {
    // 缓存写不进去不影响本次展示，下次重新请求即可
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

// ---------- 界面状态机 ----------

function setHidden(node, hidden) {
  if (node) node.classList.toggle('hidden', !!hidden);
}

function showError(message) {
  if (!el.aiError) return;
  el.aiError.textContent = message;
  setHidden(el.aiError, false);
}

function clearError() {
  if (!el.aiError) return;
  el.aiError.textContent = '';
  setHidden(el.aiError, true);
}

/** 把错误整理成一句给用户看的话（对方返回的原因也带上，方便自查） */
function errorMessageOf(error) {
  const base = error && error.message ? error.message : '生成失败，请稍后重试。';
  const detail = error && error.detail ? '（对方提示：' + String(error.detail).slice(0, 80) + '）' : '';
  return base + detail;
}

function stopCaret() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  setHidden(el.aiCaret, true);
}

function renderPreview(summary) {
  if (!el.aiPreviewBody || !el.aiPreview) return;
  // 把实际会发送的内容原样摆出来，用户能自己核对
  el.aiPreviewBody.textContent = JSON.stringify(summary, null, 2);
  setHidden(el.aiPreview, false);
}

function renderMeta(text, subline) {
  if (!el.aiMeta) return;
  el.aiMeta.textContent = '';
  if (text) {
    const span = document.createElement('span');
    span.textContent = text;
    el.aiMeta.appendChild(span);
  }
  if (subline) {
    const p = document.createElement('p');
    p.className = 'ai-disclaimer';
    p.textContent = subline;
    el.aiMeta.appendChild(p);
  }
  setHidden(el.aiMeta, !text && !subline);
}

/**
 * 刷新整张卡片。不发起任何网络请求，只根据「配置 / 缓存 / 生成中」决定显示什么。
 */
export async function refreshAiInsight() {
  if (!el.aiCard) return;

  await loadCache();

  const cfg = aiConfig();
  const generating = !!abortController;
  const summary = buildSummary(state.records, { days: currentDays() });
  const key = cacheKeyOf(summary, cfg);
  const hasData = state.records.length > 0;

  if (el.aiBadge) {
    const overseas = cfg.region === 'overseas';
    const known = cfg.region === 'cn' || overseas;
    // 自定义地址无从判断属地，不能替用户断言「数据不出境」
    el.aiBadge.textContent = overseas ? '数据出境' : known ? '境内服务' : '第三方服务';
    setHidden(el.aiBadge, !isConfigured(cfg));
    el.aiBadge.classList.toggle('ai-badge-warn', overseas || !known);
  }

  // 生成中：保留已渲染的文字，只交换按钮
  if (generating) {
    setHidden(el.aiOutput, false);
    setHidden(el.aiGenerateBtn, true);
    setHidden(el.aiSettingsBtn, true);
    setHidden(el.aiStopBtn, false);
    setHidden(el.aiPreview, true);
    return;
  }

  setHidden(el.aiStopBtn, true);
  stopCaret();

  // 错误要能留在屏幕上等用户读完：生成结束时会再调一次本函数，
  // 如果这里无脑 clearError()，刚显示出来的报错会被立刻擦掉。
  if (lastError) showError(errorMessageOf(lastError));
  else clearError();

  // 引导语默认显示；只有「已经有正文可看」时才隐藏（见下面的缓存命中分支）
  setHidden(el.aiIntro, false);

  if (!cfg.enabled) {
    lastError = null;
    clearError();
    if (el.aiIntro) el.aiIntro.textContent = '未启用。开启后可以调用你自己的大模型，把上面的统计结论总结成一段更容易读懂的解读。';
    setHidden(el.aiGenerateBtn, true);
    setHidden(el.aiSettingsBtn, false);
    setHidden(el.aiOutput, true);
    setHidden(el.aiPreview, true);
    renderMeta('');
    return;
  }

  if (!isConfigured(cfg)) {
    lastError = null;
    clearError();
    if (el.aiIntro) el.aiIntro.textContent = '已启用，但还没填完服务地址 / 模型 / API Key。填好之后就能生成。';
    setHidden(el.aiGenerateBtn, true);
    setHidden(el.aiSettingsBtn, false);
    setHidden(el.aiOutput, true);
    setHidden(el.aiPreview, true);
    renderMeta('');
    return;
  }

  if (!hasData) {
    lastError = null;
    clearError();
    if (el.aiIntro) el.aiIntro.textContent = '还没有记录。先积累几天数据，AI 解读才有意义。';
    setHidden(el.aiGenerateBtn, true);
    setHidden(el.aiSettingsBtn, false);
    setHidden(el.aiPreview, true);
    renderMeta('');
    return;
  }

  // 缓存命中：直接展示，不重复请求
  if (cached && cached.key === key && cached.text) {
    lastError = null;
    clearError();
    // 有正文在，上方那段引导语就是多余的
    setHidden(el.aiIntro, true);
    setHidden(el.aiOutput, false);
    renderRich(el.aiText, cached.text);
    renderMeta(
      `${cfg.model} · ${formatDate(new Date(cached.createdAt))} ${formatTime(new Date(cached.createdAt))}`,
      '以上仅供参考，不构成医疗建议。'
    );
    setHidden(el.aiGenerateBtn, false);
    el.aiGenerateBtn.textContent = '重新生成';
    setHidden(el.aiSettingsBtn, false);
    renderPreview(summary);
    return;
  }

  // 摘要变了但旧结果还在：继续展示旧内容并说明它已过期，
  // 不要因为多记了一条就把用户上次花钱换来的解读清空。
  const cacheStale = !!(cached && cached.text);
  if (cacheStale) {
    setHidden(el.aiOutput, false);
    renderRich(el.aiText, cached.text);
    renderMeta(
      `${cached.model || cfg.model} · 上次生成于 ${formatDate(new Date(cached.createdAt))} ${formatTime(new Date(cached.createdAt))}`,
      '记录或时间范围已变化，以上为上次生成的内容，仅供参考，不构成医疗建议。'
    );
  } else {
    setHidden(el.aiOutput, true);
    el.aiText.textContent = '';
    el.aiText.classList.remove('is-streaming');
    renderMeta('');
  }

  if (el.aiIntro) {
    el.aiIntro.textContent = cacheStale
      ? '记录或时间范围已变化，可以重新生成一份解读。'
      : '点「生成洞察」，让 AI 把上面的数据总结成一段更容易读懂的解读。只发送聚合统计，不含备注原文。';
  }
  setHidden(el.aiGenerateBtn, false);
  el.aiGenerateBtn.textContent = cacheStale ? '重新生成' : '生成洞察';
  setHidden(el.aiSettingsBtn, false);
  renderPreview(summary);
}

// ---------- 知情同意 ----------

function buildConsentBody(cfg, summary) {
  if (!el.aiConsentBody) return;
  el.aiConsentBody.textContent = '';

  const add = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    node.textContent = text;
    el.aiConsentBody.appendChild(node);
    return node;
  };

  add('p', 'ai-consent-lead', '「AI 洞察」需要把你的一部分统计数据发送给第三方大模型服务。请先确认以下内容：');

  const ul = document.createElement('ul');
  ul.className = 'ai-consent-list';
  const items = [
    `发送到：${hostOf(cfg.baseUrl) || cfg.baseUrl}（${cfg.providerName}）`,
    `使用的模型：${cfg.model}`,
    '发送内容：仅聚合统计结果，逐项如下',
    '不会发送：备注原文、精确时间、自定义地点名称',
    '数据用途：生成下方这一段解读文本，不用于训练你的个人数据',
  ];
  items.forEach(t => {
    const li = document.createElement('li');
    li.textContent = t;
    ul.appendChild(li);
  });
  el.aiConsentBody.appendChild(ul);

  // 字段逐条列出来太长，压成一行更好读；完整内容在下面的 details 里可查
  add('p', 'ai-consent-fields', '发送字段：' + consentFields(summary).join('、'));

  if (cfg.region === 'overseas') {
    add(
      'p',
      'ai-consent-warn',
      '注意：该服务商在境外，属于个人信息出境，数据将传输并存储于境外。如对此有顾虑，可在设置里换用境内服务商。'
    );
  } else if (cfg.region !== 'cn') {
    add(
      'p',
      'ai-consent-warn',
      '你使用的是自定义服务地址，本工具无法判断它的属地与合规要求。请自行确认你信任该服务商，并了解它如何处理你的数据。'
    );
  }

  const detail = document.createElement('details');
  detail.className = 'ai-consent-detail';
  const sum = document.createElement('summary');
  sum.textContent = '查看即将发送的完整内容';
  detail.appendChild(sum);
  const pre = document.createElement('pre');
  pre.className = 'ai-consent-pre';
  pre.textContent = JSON.stringify(summary, null, 2);
  detail.appendChild(pre);
  el.aiConsentBody.appendChild(detail);

  add('p', 'ai-consent-dim', '健康数据属于敏感个人信息，本次发送需要你的单独同意。你可以随时在设置里关闭该功能。同意只对上面这个域名生效，换服务商时会重新征求。');
}

function openConsentModal(cfg, summary) {
  buildConsentBody(cfg, summary);
  el.aiConsentModal.classList.remove('hidden');
  setLayerOpen(true);
}

function closeConsentModal() {
  if (!el.aiConsentModal || el.aiConsentModal.classList.contains('hidden')) return;
  el.aiConsentModal.classList.add('hidden');
  setLayerOpen(false);
}

// ---------- 生成 ----------

async function handleGenerate() {
  if (abortController) return;

  const cfg = aiConfig();
  if (!isConfigured(cfg)) {
    showToast('请先在设置里填好服务地址、模型和 API Key。', 'info');
    return;
  }
  if (state.records.length === 0) {
    showToast('还没有记录，先积累几天数据吧。', 'info');
    return;
  }

  const summary = buildSummary(state.records, { days: currentDays() });

  // 同意按「域名」记账：换了服务商就要重新确认
  if (cfg.consentedHost !== hostOf(cfg.baseUrl)) {
    openConsentModal(cfg, summary);
    return;
  }

  await startGeneration(cfg, summary);
}

async function startGeneration(cfg, summary) {
  closeConsentModal();

  abortController = new AbortController();
  pendingText = '';
  lastError = null;

  setHidden(el.aiOutput, false);
  setHidden(el.aiError, true);
  setHidden(el.aiPreview, true);
  setHidden(el.aiGenerateBtn, true);
  setHidden(el.aiSettingsBtn, true);
  setHidden(el.aiStopBtn, false);
  setHidden(el.aiCaret, false);
  if (el.aiIntro) el.aiIntro.textContent = '正在生成…';
  el.aiText.textContent = '';
  // 流式阶段用 pre-wrap 保留换行；富文本渲染时由 renderRich 摘掉这个类
  el.aiText.classList.add('is-streaming');

  const scheduleFlush = () => {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      el.aiText.textContent = pendingText;
      // 生成过程中始终把光标滚进视野，长文本就不会「看不见进度」
      if (el.aiCard && el.aiCard.scrollIntoView) {
        el.aiCaret.scrollIntoView({ block: 'nearest' });
      }
    });
  };

  try {
    const text = await requestInsight(cfg, buildMessages(summary), {
      signal: abortController.signal,
      onToken: chunk => {
        pendingText += chunk;
        scheduleFlush();
      },
    });

    stopCaret();
    el.aiText.textContent = '';
    renderRich(el.aiText, text);
    renderMeta(
      `${cfg.model} · ${formatDate(new Date())} ${formatTime(new Date())}`,
      '以上仅供参考，不构成医疗建议。'
    );
    el.aiGenerateBtn.textContent = '重新生成';
    await saveCache({
      key: cacheKeyOf(summary, cfg),
      text,
      model: cfg.model,
      provider: cfg.provider,
      createdAt: Date.now(),
    });
  } catch (error) {
    stopCaret();
    const kind = error instanceof AiError ? error.kind : 'unknown';
    if (kind === 'aborted') {
      // 用户主动取消：保留已生成的部分，不要让辛苦等到的内容消失
      if (pendingText.trim()) {
        renderRich(el.aiText, pendingText);
        renderMeta(`${cfg.model} · 已中断`, '以上内容不完整，仅供参考，不构成医疗建议。');
      } else {
        setHidden(el.aiOutput, true);
      }
      showToast('已停止生成。', 'info');
    } else {
      setHidden(el.aiOutput, true);
      lastError = error;
      showError(errorMessageOf(error));
    }
  } finally {
    abortController = null;
    await refreshAiInsight();
  }
}

function handleStop() {
  if (abortController) abortController.abort();
}

// ---------- 设置页交互 ----------

/** 切换服务商时把预设地址与模型填进去，用户仍可改 */
function applyProviderPreset(keepFilled) {
  const provider = getProvider(el.aiProvider.value);

  if (!keepFilled || !el.aiBaseUrl.value.trim()) el.aiBaseUrl.value = provider.baseUrl;
  if (!keepFilled || !el.aiModel.value.trim()) el.aiModel.value = provider.model;

  if (el.aiProviderHint) el.aiProviderHint.textContent = providerHint(provider.id);
  if (el.aiFetchModelsBtn) el.aiFetchModelsBtn.disabled = false;
}

async function handleFetchModels() {
  const cfg = aiConfig();
  const baseUrl = normalizeBaseUrl(el.aiBaseUrl.value);
  const apiKey = el.aiApiKey.value.trim();

  if (!baseUrl) { showToast('请先填写服务地址。', 'info'); return; }
  if (!apiKey) { showToast('请先填写 API Key。', 'info'); return; }

  el.aiFetchModelsBtn.disabled = true;
  const original = el.aiFetchModelsBtn.textContent;
  el.aiFetchModelsBtn.textContent = '读取中…';

  try {
    const models = await fetchModels({ baseUrl, apiKey });
    if (!models.length) {
      showToast('该服务没有返回模型列表，请手动填写模型名。', 'info');
    } else {
      el.aiModelList.innerHTML = '';
      models.forEach(id => {
        const opt = document.createElement('option');
        opt.value = id;
        el.aiModelList.appendChild(opt);
      });
      showToast(`读取到 ${models.length} 个模型，可在「模型」输入框里选择。`, 'success');
    }
  } catch (error) {
    showToast(error && error.message ? error.message : '读取失败，请手动填写模型名。', 'error');
  } finally {
    el.aiFetchModelsBtn.disabled = false;
    el.aiFetchModelsBtn.textContent = original;
  }
}

function handleClearKey() {
  if (!el.aiApiKey.value) { showToast('当前没有填写密钥。', 'info'); return; }
  el.aiApiKey.value = '';
  showToast('密钥已清除，别忘了点下方「保存设置」。', 'info');
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
  if (el.aiProviderHint) el.aiProviderHint.textContent = providerHint(PROVIDERS[0].id);
  applyProviderPreset(true);
}

export function initAiInsights() {
  if (!el.aiGenerateBtn) return;

  el.aiGenerateBtn.addEventListener('click', handleGenerate);
  el.aiStopBtn.addEventListener('click', handleStop);
  el.aiSettingsBtn.addEventListener('click', openSettingsModal);

  el.aiConsentCancelBtn.addEventListener('click', closeConsentModal);
  el.aiConsentOkBtn.addEventListener('click', async () => {
    const cfg = aiConfig();
    // 同意只对当前域名生效；写入设置后立即生成
    await updateAiConsent(hostOf(cfg.baseUrl));
    closeConsentModal();
    await startGeneration(aiConfig(), buildSummary(state.records, { days: currentDays() }));
  });
  el.aiConsentModal.addEventListener('click', e => {
    if (e.target === e.currentTarget) closeConsentModal();
  });
  registerModal(el.aiConsentModal, closeConsentModal);

  if (el.aiProvider) el.aiProvider.addEventListener('change', () => applyProviderPreset(false));
  if (el.aiFetchModelsBtn) el.aiFetchModelsBtn.addEventListener('click', handleFetchModels);
  if (el.aiClearKeyBtn) el.aiClearKeyBtn.addEventListener('click', handleClearKey);

  // 记录/筛选变化后重算卡片状态（只重算，不发请求）
  window.addEventListener('stats-updated', refreshAiInsight);
  // 时间范围变了，摘要窗口也跟着变 —— 让卡片提示「可以重新生成」
  if (el.timeRangeSelect) el.timeRangeSelect.addEventListener('change', refreshAiInsight);

  // 首次进入时按当前设置渲染一次
  refreshAiInsight();
}
