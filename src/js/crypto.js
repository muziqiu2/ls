// ==========================================
// 加密/解密（数据透明地存储到 localStorage）
// ==========================================
// 优先使用 Web Crypto API (AES-GCM)，不可用时回退到简单异或混淆。

const IV_LENGTH = 12;

/**
 * 使用 Web Crypto API 加密文本
 * @param {string} text 明文
 * @returns {Promise<string>} 合并 IV 后的 Base64 字符串
 */
export async function encrypt(text) {
  try {
    const key = await getEncryptionKey();
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const encoder = new TextEncoder();
    const data = encoder.encode(text);

    const encryptedData = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );

    // 将 IV 和加密数据合并并转为 Base64
    const combined = new Uint8Array(iv.length + encryptedData.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encryptedData), iv.length);
    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.warn('Web Crypto API 不可用，使用回退加密方式');
    return simpleEncrypt(text);
  }
}

/**
 * 使用 Web Crypto API 解密
 * @param {string} encryptedText Base64 字符串
 * @returns {Promise<string>} 明文
 */
export async function decrypt(encryptedText) {
  try {
    const key = await getEncryptionKey();
    const combined = new Uint8Array(atob(encryptedText).split('').map(c => c.charCodeAt(0)));

    const iv = combined.slice(0, IV_LENGTH);
    const encryptedData = combined.slice(IV_LENGTH);

    const decryptedData = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encryptedData
    );

    return new TextDecoder().decode(decryptedData);
  } catch (error) {
    // 解密失败时尝试旧方式（向后兼容旧版本数据）
    console.warn('新解密方式失败，尝试旧方式:', error.message);
    return simpleDecrypt(encryptedText);
  }
}

/**
 * 获取或生成 AES 密钥（256 位），存储在本机
 * @returns {Promise<CryptoKey>}
 */
async function getEncryptionKey() {
  const storedKey = localStorage.getItem('poopEncryptionKey');

  if (storedKey) {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new Uint8Array(atob(storedKey).split('').map(c => c.charCodeAt(0))),
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
    return keyMaterial;
  }

  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  const exportedKey = await crypto.subtle.exportKey('raw', key);
  localStorage.setItem('poopEncryptionKey', btoa(String.fromCharCode(...new Uint8Array(exportedKey))));
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