/**
 * IndexedDB 连接管理（Task 6）
 * 库名 liuyao_workbench，版本 1，三张表：
 *   guashi   (keyPath: id)    卦例
 *   tags     (keyPath: id)    标签
 *   settings (keyPath: key)   设置
 *
 * 本层不依赖 React，纯浏览器 IndexedDB 封装。
 */

let dbPromise = null;

/**
 * 打开数据库（单例，内部缓存 Promise）
 * @returns {Promise<IDBDatabase>}
 */
export function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('liuyao_workbench', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('guashi')) {
          db.createObjectStore('guashi', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('tags')) {
          db.createObjectStore('tags', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

/**
 * IDBRequest → Promise
 * @template T
 * @param {IDBRequest<T>} req
 * @returns {Promise<T>}
 */
export function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * 等待事务完成（写操作后确保落盘）
 * @param {IDBTransaction} tx
 * @returns {Promise<void>}
 */
export function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('transaction aborted'));
  });
}

// 单调递增的时间戳 id：保证同一进程内不重复（防同一毫秒内多次添加）
let lastId = 0;

/** 生成自增时间戳 id */
export function nextId() {
  const now = Date.now();
  lastId = Math.max(now, lastId + 1);
  return lastId;
}
