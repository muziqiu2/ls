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

// 加载失败（通常是密钥丢失或数据损坏）时记录原因，并禁止写入。
// 否则用户会看到「暂无记录」，一旦再打卡就真的把原数据覆盖掉了。
let storageError = null;

/**
 * 最近一次加载是否失败
 * @returns {Error|null}
 */
export function getStorageError() {
  return storageError;
}

/**
 * 当前是否允许写入本地存储
 */
export function isStorageWritable() {
  return storageError === null;
}

/**
 * 解除「加载失败禁止写入」状态
 * 仅在用户明确选择「丢弃无法读取的数据」时调用（如清空所有数据）。
 */
export function resetStorageError() {
  storageError = null;
}

// ---------- 底层读写：优先 IndexedDB，回退 localStorage ----------

function safeLocalGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

function safeLocalSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    return false;
  }
}

function safeLocalRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) { /* 忽略 */ }
}

/**
 * 读取键值并标明来源，用于判断是否需要把 localStorage 数据迁移到 IndexedDB
 * @returns {Promise<{value: string|null, source: 'idb'|'local'|'none'}>}
 */
async function readStoredWithSource(key) {
  try {
    const value = await idbGet(key);
    if (value !== undefined && value !== null) return { value, source: 'idb' };
  } catch (e) { /* 忽略，走回退 */ }

  const legacy = safeLocalGet(key);
  if (legacy !== null && legacy !== undefined) return { value: legacy, source: 'local' };
  return { value: null, source: 'none' };
}

async function writeStored(key, value) {
  try {
    // idbSet 会返回是否真的写入成功：IndexedDB 不可用时必须落到 localStorage，
    // 否则数据只留在内存里，刷新就没了。
    if (await idbSet(key, value)) return;
  } catch (e) { /* 忽略，走回退 */ }

  if (!safeLocalSet(key, value)) {
    throw new Error('浏览器存储空间不足或不可写，保存失败');
  }
}

async function removeStored(key) {
  try {
    await idbDelete(key);
  } catch (e) { /* 忽略 */ }
  safeLocalRemove(key);
}

// ---------- 记录 ----------

/**
 * 从本地存储异步加载记录数据
 *
 * 失败时不再静默变成空数组，而是记录错误、保持「禁止写入」状态，
 * 由上层（app.js）提示用户，避免新增记录覆盖掉解不开的旧数据。
 */
export async function loadRecords() {
  let raw = null;
  let source = 'none';

  try {
    const read = await readStoredWithSource(RECORDS_KEY);
    raw = read.value;
    source = read.source;
  } catch (error) {
    storageError = error;
    state.records = [];
    return;
  }

  if (!raw) {
    storageError = null;
    state.records = [];
    return;
  }

  try {
    const decrypted = await decrypt(raw);
    const parsed = JSON.parse(decrypted);
    if (!Array.isArray(parsed)) {
      throw new Error('存储的数据不是数组');
    }
    state.records = parsed;
    storageError = null;
  } catch (error) {
    // 解密或解析失败：不删数据、不写数据，交给上层提示
    storageError = error;
    state.records = [];
    console.error('记录加载失败：', error);
    return;
  }

  // 真正的旧数据迁移：数据来自 localStorage 而 IndexedDB 里没有时，搬一份过去
  if (source === 'local') {
    try {
      await idbSet(RECORDS_KEY, raw);
      await createAutoBackup();
    } catch (e) {
      console.warn('旧数据迁移到 IndexedDB 失败（不影响使用）：', e.message);
    }
  }
}

/**
 * 保存记录到本地存储，并在每次数据修改时创建自动备份
 */
export async function saveRecords() {
  if (!isStorageWritable()) {
    throw new Error('数据加载失败，已暂停写入以保护原有数据。请先导出排查或清空数据。');
  }

  const serializedRecords = JSON.stringify(state.records);
  const encryptedRecords = await encrypt(serializedRecords);
  await writeStored(RECORDS_KEY, encryptedRecords);
  await createAutoBackup();
}

// ---------- 备份 ----------

/**
 * 读取备份数组
 *
 * 与记录不同，备份读取失败必须显式抛错：一旦用空数组继续，
 * 紧接着的写回会把历史上全部备份一次性覆盖掉。
 * @returns {Promise<Array>}
 */
async function readBackups() {
  const { value } = await readStoredWithSource(BACKUPS_KEY);
  if (!value) return [];

  const decrypted = await decrypt(value);
  const parsed = JSON.parse(decrypted);
  if (!Array.isArray(parsed)) {
    throw new Error('备份数据不是数组');
  }
  return parsed;
}

/**
 * 创建自动备份（限制最多保存 MAX_BACKUPS 个）
 * 读取失败时直接抛错返回，绝不用空数组覆盖已有备份。
 */
export async function createAutoBackup() {
  if (!isStorageWritable()) {
    throw new Error('数据加载失败，已暂停写入以保护原有数据。');
  }

  const backups = await readBackups();

  const backup = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    records: state.records.map(record => ({ ...record })), // 逐条浅拷贝，避免与实时对象共享引用
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
 * 读取备份列表（恢复备份时展示）
 * @returns {Promise<Array>} 备份数组
 */
export async function loadBackupList() {
  return readBackups();
}

/**
 * 清空本地持久化的备份（供「清空所有数据」使用）
 */
export async function clearStoredBackups() {
  await removeStored(BACKUPS_KEY);
}
