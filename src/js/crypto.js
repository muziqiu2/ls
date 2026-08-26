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