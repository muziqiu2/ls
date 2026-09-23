// ==========================================
// AI 服务商预设（全部走 OpenAI 兼容接口）
// ==========================================
// 只存「默认值」，用户填写的 baseUrl / model 始终以设置里的实际值为准。
// 模型名更新很快，所以设置页提供「读取可用模型」按钮（GET /models），
// 默认值失效时用户可一键换成自己账号下真实可用的模型。

/**
 * region 用于知情同意弹窗里区分「境内服务」和「数据出境」，
 * 这两者的合规要求不同，必须让用户看到区别。
 */
export const PROVIDERS = [
  {
    id: 'deepseek',
    name: 'DeepSeek（深度求索）',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    region: 'cn',
  },
  {
    id: 'dashscope',
    name: '通义千问（阿里云百炼）',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    region: 'cn',
  },
  {
    id: 'moonshot',
    name: 'Kimi（月之暗面）',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    region: 'cn',
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    region: 'cn',
  },
  {
    id: 'doubao',
    name: '豆包（火山方舟）',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-seed-2.0-pro',
    region: 'cn',
  },
  {
    id: 'hunyuan',
    name: '腾讯混元',
    baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    model: 'hunyuan-turbo-s',
    region: 'cn',
  },
  {
    id: 'siliconflow',
    name: '硅基流动 SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'Qwen/Qwen2.5-7B-Instruct',
    region: 'cn',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    region: 'overseas',
  },
  {
    id: 'custom',
    name: '自定义（任意 OpenAI 兼容服务）',
    baseUrl: '',
    model: '',
    region: '',
  },
];

export const DEFAULT_PROVIDER = 'deepseek';

/**
 * 按 id 取预设；未知 id 回退到自定义
 */
export function getProvider(id) {
  return PROVIDERS.find(p => p.id === id) || PROVIDERS[PROVIDERS.length - 1];
}

/**
 * 规范化 baseUrl：去掉尾部斜杠，方便统一拼 `/chat/completions`
 */
export function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || '').trim().replace(/\/+$/, '');
}

/**
 * 从 baseUrl 取出主机名，用于：
 *  1. 告知用户「数据会发送到哪个域名」
 *  2. 记录用户已同意的域名，换了服务商就要重新同意
 */
export function hostOf(baseUrl) {
  try {
    return new URL(normalizeBaseUrl(baseUrl)).host;
  } catch {
    return '';
  }
}

/**
 * 服务商下方的说明文案（设置页与卡片共用，避免两处写法不一致）
 */
export function providerHint(providerId) {
  const provider = getProvider(providerId);
  if (provider.id === 'custom') {
    return '填写任意 OpenAI 兼容服务的地址，会以「地址 + /chat/completions」调用。';
  }
  if (provider.region === 'overseas') {
    return '该服务在境外，使用时会提示数据出境。';
  }
  return '境内服务，数据不出境。地址与模型都可以自行修改。';
}
