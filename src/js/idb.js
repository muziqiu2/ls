// ==========================================
// IndexedDB 通用键值读写
// ==========================================
// 主存储：把加密后的数据放到 IndexedDB（容量更大、更抗浏览器缓存清理），
// 仅在 IndexedDB 不可用时由上层回退到 localStorage。
// 注意：这里存的是已经加密过的字符串，加解密逻辑仍在 crypto.js。

const DB_NAME = 'poop-store';
const STORE = 'kv';
const VERSION = 1;

let dbPromise = null;

function isAvailable() {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

function openDB() {
  if (!isAvailable()) return null;
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
      req.onblocked = () => {
        dbPromise = null;
        reject(new Error('IndexedDB 被占用'));
      };
    } catch (e) {
      dbPromise = null;
      reject(e);
    }
  });

  return dbPromise;
}

async function run(mode, fn) {
  const db = await openDB();
  if (!db) return undefined;
  return new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(STORE, mode);
    } catch (e) {
      reject(e);
      return;
    }
    const store = tx.objectStore(STORE);
    const req = typeof fn === 'function' ? fn(store) : fn;
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * 读取一个键的值；不存在或不可用时返回 undefined
 */
export async function idbGet(key) {
  const db = await openDB();
  if (!db) return undefined;
  try {
    const val = await run('readonly', store => store.get(key));
    return val;
  } catch (e) {
    return undefined;
  }
}

/**
 * 写入一个键的值
 */
export async function idbSet(key, value) {
  const db = await openDB();
  if (!db) return;
  await run('readwrite', store => store.put(value, key));
}

/**
 * 删除一个键
 */
export async function idbDelete(key) {
  const db = await openDB();
  if (!db) return;
  await run('readwrite', store => store.delete(key));
}