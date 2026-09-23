// ==========================================
// WebDAV 客户端（坚果云）
// ==========================================
// 通过 WebDAV 协议把本应用数据上传/下载到一个 JSON 文件。
// 认证：Basic Auth（坚果云用户名 + 应用密码）。
// 注意：文件内容是「口令加密」的密文（见 crypto.js），不在本层处理加密。
// 安全提示：Basic Auth 凭据是明文随请求头发送的，只有 HTTPS 才安全，
// 因此这里强制要求 https（本机调试除外）。

const REMOTE_FILE = 'poop-records.json';
const REQUEST_TIMEOUT_MS = 20000;

/**
 * 拼接远端文件完整地址
 * @param {string} davUrl 用户在设置里填写的 WebDAV 文件夹地址，如
 *   https://dav.jianguoyun.com/dav/ 或 https://dav.jianguoyun.com/dav/打卡备份/
 */
export function buildRemoteUrl(davUrl) {
  const base = String(davUrl || '').trim().replace(/\/+$/, '');
  if (!base) return '';
  return base + '/' + REMOTE_FILE;
}

/**
 * 带超时的 fetch（网络挂起时不再无限等待，用户至少能看到失败提示）
 */
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('请求超时，请检查网络或服务器地址');
    }
    throw new Error('网络请求失败：' + error.message);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Basic Auth 头
 *
 * btoa() 只接受码点 ≤0xFF 的字符，账号/密码含中文时必抛 InvalidCharacterError，
 * 用户只会看到一句「Invalid character」。按 RFC 7617 应先转 UTF-8 再 base64。
 */
function authHeader(username, appPassword) {
  return 'Basic ' + base64Utf8(`${username}:${appPassword}`);
}

function base64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * 校验服务器地址是否可用于 Basic Auth
 */
function assertSecureUrl(url) {
  if (!url) throw new Error('请先填写 WebDAV 地址');
  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    throw new Error('WebDAV 地址格式不正确，需以 http(s):// 开头');
  }
  const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !isLocalhost) {
    throw new Error('出于账号安全考虑，WebDAV 地址必须使用 https://');
  }
}

/**
 * 测试连接并判断远端是否已有数据
 *
 * 只取状态码、不读响应体（原先 GET 整个文件，数据越大越慢）。
 * @returns {Promise<{ok: boolean, hasRemote: boolean, status: number}>}
 */
export async function webdavProbe(davUrl, username, appPassword) {
  const url = buildRemoteUrl(davUrl);
  assertSecureUrl(url);

  const res = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      Authorization: authHeader(username, appPassword),
      Range: 'bytes=0-0', // 只请求首字节；服务器不支持时也只是多传一点，不影响判断
    },
  });

  // 服务端返回的响应体这里用不到，主动取消以免继续占用带宽
  if (res.body && typeof res.body.cancel === 'function') {
    res.body.cancel().catch(() => {});
  }

  if (res.status === 200 || res.status === 206) {
    return { ok: true, hasRemote: true, status: res.status };
  }
  if (res.status === 404) {
    return { ok: true, hasRemote: false, status: res.status };
  }
  return { ok: false, hasRemote: false, status: res.status };
}

/**
 * 上传（覆盖）云端数据文件
 * @param {string} encryptedBody 口令加密后的密文字符串
 */
export async function webdavUpload(davUrl, username, appPassword, encryptedBody) {
  const url = buildRemoteUrl(davUrl);
  assertSecureUrl(url);

  const res = await fetchWithTimeout(url, {
    method: 'PUT',
    headers: {
      Authorization: authHeader(username, appPassword),
      'Content-Type': 'application/octet-stream',
    },
    body: encryptedBody,
  });

  if (!res.ok) {
    throw new Error(`上传失败（HTTP ${res.status}）`);
  }
  return true;
}

/**
 * 下载云端数据文件内容（不存在或为空时返回 null）
 * @returns {Promise<string|null>} 口令加密后的密文
 */
export async function webdavDownload(davUrl, username, appPassword) {
  const url = buildRemoteUrl(davUrl);
  assertSecureUrl(url);

  const res = await fetchWithTimeout(url, {
    method: 'GET',
    headers: { Authorization: authHeader(username, appPassword) },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`下载失败（HTTP ${res.status}）`);
  }

  const text = await res.text();
  return text ? text : null;
}
