// ==========================================
// 数据持久化层（记录 + 备份）
// ==========================================
// 只负责数据的读写，不涉及任何 DOM 操作。
// 主存储使用 IndexedDB（容量更大、更抗清理），旧数据会自动从 localStorage 迁移；
// 若 IndexedDB 不可用（如某些隐私模式），则回退到 localStorage。
import { state } from './state.js';
import { encrypt, decrypt } from './crypto.js';
import { idbGet, idbSet, idbDelete } from './idb.js';

const RECORDS_KEY = 'poopRecords';
const BACKUPS_KEY = 'poopBackups';
const MAX_BACKUPS = 10;

// ---------- 底层读写：优先 IndexedDB，回退 localStorage ----------

async function readStored(key) {
  try {
    const v = await idbGet(key);
    if (v !== undefined && v !== null) return v;
  } catch (e) { /* 忽略，走回退 */ }
  return localStorage.getItem(key); // 可能为 null
}

async function writeStored(key, value) {
  try {
    await idbSet(key, value);
    return;
  } catch (e) { /* 忽略，走回退 */ }
  localStorage.setItem(key, value);
}

async function removeStored(key) {
  try {
    await idbDelete(key);
  } catch (e) { /* 忽略 */ }
  localStorage.removeItem(key);
}

/**
 * 从本地存储异步加载记录数据（含旧版 localStorage 数据的自动迁移）
 */
export async function loadRecords() {
  try {
    const encryptedRecords = await readStored(RECORDS_KEY);
    if (encryptedRecords) {
      const decryptedRecords = await decrypt(encryptedRecords);
      state.records = JSON.parse(decryptedRecords);
    } else {
      // 迁移旧数据：IndexedDB 里没有，但 localStorage 里可能有
      const legacy = localStorage.getItem(RECORDS_KEY);
      if (legacy) {
        const decryptedLegacy = await decrypt(legacy);
        state.records = JSON.parse(decryptedLegacy);
        await saveRecords(); // 把旧数据写入 IndexedDB（同时生成首份备份）
      }
    }
  } catch (error) {
    try {
      const legacy = localStorage.getItem(RECORDS_KEY);
      state.records = JSON.parse(legacy) || [];
    } catch (e) {
      state.records = [];
    }
  }
}

/**
 * 保存记录到本地存储，并在每次数据修改时创建自动备份
 */
export async function saveRecords() {
  const serializedRecords = JSON.stringify(state.records);
  const encryptedRecords = await encrypt(serializedRecords);
  await writeStored(RECORDS_KEY, encryptedRecords);
  await createAutoBackup();
}

/**
 * 创建自动备份（限制最多保存 MAX_BACKUPS 个）
 */
export async function createAutoBackup() {
  let backups = [];
  try {
    const encryptedBackups = await readStored(BACKUPS_KEY);
    if (encryptedBackups) {
      const decryptedBackups = await decrypt(encryptedBackups);
      backups = JSON.parse(decryptedBackups);
    }
  } catch (error) {
    try {
      backups = JSON.parse(localStorage.getItem(BACKUPS_KEY)) || [];
    } catch (e) {
      backups = [];
    }
  }

  const backup = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    records: [...state.records], // 深拷贝当前记录
  };

  backups.unshift(backup);
  if (backups.length > MAX_BACKUPS) {
    backups.splice(MAX_BACKUPS);
  }

  const serializedBackups = JSON.stringify(backups);
  const encryptedBackups = await encrypt(serializedBackups);
  await writeStored(BACKUPS_KEY, encryptedBackups);
}

/**
 * 读取备份列表（使用当前记录覆盖数据时看到）
 * @returns {Promise<Array>} 备份数组
 */
export async function loadBackupList() {
  try {
    const encryptedBackups = await readStored(BACKUPS_KEY);
    if (encryptedBackups) {
      const decryptedBackups = await decrypt(encryptedBackups);
      return JSON.parse(decryptedBackups);
    }
  } catch (error) {
    try {
      return JSON.parse(localStorage.getItem(BACKUPS_KEY)) || [];
    } catch (e) {
      return [];
    }
  }
  return [];
}

/**
 * 清空本地持久化的备份（供“清空所有数据”使用）
 */
export async function clearStoredBackups() {
  await removeStored(BACKUPS_KEY);
}