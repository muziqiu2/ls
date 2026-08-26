// ==========================================
// 数据持久化层（记录 + 备份）
// ==========================================
// 只负责 localStorage 的读写，不涉及任何 DOM 操作。
import { state } from './state.js';
import { encrypt, decrypt } from './crypto.js';

const RECORDS_KEY = 'poopRecords';
const BACKUPS_KEY = 'poopBackups';
const MAX_BACKUPS = 10;

/**
 * 从本地存储异步加载记录数据
 */
export async function loadRecords() {
  try {
    const encryptedRecords = localStorage.getItem(RECORDS_KEY);
    if (encryptedRecords) {
      const decryptedRecords = await decrypt(encryptedRecords);
      state.records = JSON.parse(decryptedRecords);
    }
  } catch (error) {
    try {
      state.records = JSON.parse(localStorage.getItem(RECORDS_KEY)) || [];
      await saveRecords();
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
  localStorage.setItem(RECORDS_KEY, encryptedRecords);
  await createAutoBackup();
}

/**
 * 创建自动备份（限制最多保存 MAX_BACKUPS 个）
 */
export async function createAutoBackup() {
  let backups = [];
  try {
    const encryptedBackups = localStorage.getItem(BACKUPS_KEY);
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
  localStorage.setItem(BACKUPS_KEY, encryptedBackups);
}

/**
 * 读取备份列表（使用当前记录覆盖数据时看到）
 * @returns {Promise<Array>} 备份数组
 */
export async function loadBackupList() {
  try {
    const encryptedBackups = localStorage.getItem(BACKUPS_KEY);
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