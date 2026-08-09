/**
 * 设置表（settings）仓储（Task 6）
 * 记录结构：{ key, value }，key 为主键
 */
import { openDB, reqToPromise } from './index.js';

/** 内置默认值：未在库中存储时返回 */
const DEFAULTS = { recycleDays: 30, 'remind-duplicate-title': true };

/** 读取设置值；无存储时返回默认值（无默认返回 undefined） */
export async function getSetting(key) {
  const db = await openDB();
  const rec = await reqToPromise(db.transaction('settings').objectStore('settings').get(key));
  return rec ? rec.value : DEFAULTS[key];
}

/** 写入设置值 */
export async function setSetting(key, value) {
  const db = await openDB();
  const tx = db.transaction('settings', 'readwrite');
  await reqToPromise(tx.objectStore('settings').put({ key, value }));
  return value;
}
