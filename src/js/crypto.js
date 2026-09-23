// ==========================================
// 加密/解密（数据透明地存储到 localStorage）
// ==========================================
// 优先使用 Web Crypto API (AES-GCM)，不可用时回退到简单异或混淆。

const IV_LENGTH = 12;

// 密文版本前缀：带前缀 = AES-GCM（当前格式）；不带前缀 = 旧版数据（AES 或 XOR）
// 有了前缀才能区分「这是旧格式所以解不开」与「密钥不对所以解不开」——
// 否则密钥错时会被误判成旧数据，用 XOR 解出一串乱码而“看起来成功了”。
const AES_PREFIX = 'v2:';

/**
 * 当前环境是否支持 Web Crypto（非安全上下文下 crypto.subtle 为 undefined）
 */
export function isCryptoAvailable() {
  return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined';
}

/**
 * 使用 Web Crypto API 加密文本
 * @param {string} text 明文
 * @returns {Promise<string>} 'v2:' + （IV 合并密文后的 Base64）
 */
export async function encrypt(text) {
  if (!isCryptoAvailable()) {
    console.warn('当前环境不支持 Web Crypto，使用回退加密方式');
    return simpleEncrypt(text);
  }

  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const data = new TextEncoder().encode(text);

  const encryptedData = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  // 将 IV 和加密数据合并并转为 Base64
  const combined = new Uint8Array(iv.length + encryptedData.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encryptedData), iv.length);
  return AES_PREFIX + bytesToBase64(combined);
}

/**
 * 使用 Web Crypto API 解密
 *
 * - 带 'v2:' 前缀：只走 AES-GCM，解不开就抛错（通常是密钥丢失/不匹配），
 *   绝不静默降级，避免把乱码当成“成功解密”。
 * - 不带前缀：旧版本数据，先试 AES 再试 XOR。
 *
 * @param {string} encryptedText 密文
 * @returns {Promise<string>} 明文
 */
export async function decrypt(encryptedText) {
  if (typeof encryptedText !== 'string' || !encryptedText) {
    throw new Error('密文为空');
  }

  const isCurrentFormat = encryptedText.startsWith(AES_PREFIX);
  const payload = isCurrentFormat ? encryptedText.slice(AES_PREFIX.length) : encryptedText;

  if (!isCryptoAvailable()) {
    if (isCurrentFormat) {
      throw new Error('当前环境不支持 Web Crypto，无法解密现有数据');
    }
    return simpleDecrypt(payload);
  }

  try {
    const key = await getEncryptionKey();
    const combined = base64ToBytes(payload);

    if (combined.length <= IV_LENGTH) {
      throw new Error('密文长度异常');
    }

    const iv = combined.slice(0, IV_LENGTH);
    const encryptedData = combined.slice(IV_LENGTH);

    const decryptedData = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encryptedData
    );

    return new TextDecoder().decode(decryptedData);
  } catch (error) {
    if (isCurrentFormat) {
      // 当前格式仍然解不开 => 密钥不匹配或数据损坏，必须让上层知道
      throw new Error(`数据解密失败（密钥不匹配或数据已损坏）：${error.message}`);
    }
    // 旧格式兼容路径：AES 解不开时再试 XOR
    console.warn('旧格式数据 AES 解密失败，尝试 XOR：', error.message);
    return simpleDecrypt(payload);
  }
}

/**
 * 获取或生成 AES 密钥（256 位），存储在本机
 *
 * 密钥写不进去属于致命错误：若继续用一把“只存在于本次会话”的密钥，
 * 下次刷新会生成新密钥，旧数据将永远解不开。所以这里直接抛错。
 * @returns {Promise<CryptoKey>}
 */
async function getEncryptionKey() {
  const storedKey = localStorage.getItem('poopEncryptionKey');

  if (storedKey) {
    return crypto.subtle.importKey(
      'raw',
      base64ToBytes(storedKey),
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  const exportedKey = await crypto.subtle.exportKey('raw', key);
  try {
    localStorage.setItem('poopEncryptionKey', bytesToBase64(new Uint8Array(exportedKey)));
  } catch (e) {
    throw new Error('无法保存加密密钥（浏览器存储不可写），已中止写入以避免数据无法再读取');
  }
  return key;
}

/**
 * 简单加密（基于异或算法，向后兼容）
 * @param {string} text 明文
 * @returns {string} Base64 字符串
 */
export function simpleEncrypt(text) {
  const key = 'poop_recorder_secret_key';
  const bytes = new TextEncoder().encode(text);
  const xored = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    xored[i] = bytes[i] ^ key.charCodeAt(i % key.length);
  }
  return bytesToBase64(xored);
}

/**
 * 简单解密（基于异或算法，向后兼容）
 * @param {string} encryptedText Base64 字符串
 * @returns {string} 明文
 */
export function simpleDecrypt(encryptedText) {
  const key = 'poop_recorder_secret_key';
  const xored = base64ToBytes(encryptedText);
  const bytes = new Uint8Array(xored.length);
  for (let i = 0; i < xored.length; i++) {
    bytes[i] = xored[i] ^ key.charCodeAt(i % key.length);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * 字节数组转 Base64（分块处理，避免超长数组导致栈溢出）
 */
function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Base64 转字节数组
 */
function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ---------- 口令派生加密（用于云端数据，跨设备可用同一口令解密） ----------
// 直接使用 Web Crypto 的 PBKDF2 + AES-GCM，不做简单加密回退，
// 因为云数据必须真正加密才能安全存放。

const PBKDF2_ITERATIONS = 150000;
const SALT_LENGTH = 16;
const CLOUD_IV_LENGTH = 12;

/**
 * 从口令 + 盐派生 AES-GCM 密钥
 */
async function deriveKeyFromPassword(password, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * 用口令加密文本，输出格式：salt(16) + iv(12) + ciphertext，整体 Base64。
 * 只要记住口令，任何设备都能解密。
 * @returns {Promise<string>}
 */
export async function encryptWithPassword(text, password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(CLOUD_IV_LENGTH));
  const key = await deriveKeyFromPassword(password, salt);

  const encryptedData = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(text)
  );

  const combined = new Uint8Array(SALT_LENGTH + CLOUD_IV_LENGTH + encryptedData.byteLength);
  combined.set(salt, 0);
  combined.set(iv, SALT_LENGTH);
  combined.set(new Uint8Array(encryptedData), SALT_LENGTH + CLOUD_IV_LENGTH);

  return bytesToBase64(combined);
}

/**
 * 用口令解密（与 encryptWithPassword 对应）
 * @returns {Promise<string>}
 */
export async function decryptWithPassword(encryptedText, password) {
  const combined = base64ToBytes(encryptedText);

  const salt = combined.slice(0, SALT_LENGTH);
  const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + CLOUD_IV_LENGTH);
  const data = combined.slice(SALT_LENGTH + CLOUD_IV_LENGTH);

  const key = await deriveKeyFromPassword(password, salt);
  const decryptedData = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  return new TextDecoder().decode(decryptedData);
}