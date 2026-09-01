// ==========================================
// WebDAV 客户端（坚果云）
// ==========================================
// 通过 WebDAV 协议把本应用数据上传/下载到一个 JSON 文件。
// 认证：Basic Auth（坚果云用户名 + 应用密码）。
// 注意：文件内容是“口令加密”的密文（见 crypto.js），不在本层处理加密。

const REMOTE_FILE = 'poop-records.json';

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

function authHeader(username, appPassword) {
  return 'Basic ' + btoa(username + ':' + appPassword);
}

/**
 * 测试连接并读取远端是否存在数据
 * @returns {Promise<{ok: boolean, hasRemote: boolean, status: number}>}
 */
export async function webdavProbe(davUrl, username, appPassword) {
  const url = buildRemoteUrl(davUrl);
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: authHeader(username, appPassword) },
  });

  if (res.status === 200) {
    const text = await res.text();
    return { ok: true, hasRemote: !!text, status: res.status };
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
  const res = await fetch(url, {
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
  const res = await fetch(url, {
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