/**
 * 标签表（tags）仓储（Task 6）
 * 记录结构：{ id, name, color, createdAt }
 */
import { openDB, reqToPromise, txDone, nextId } from './index.js';

/** 列出全部标签（按创建时间升序） */
export async function listTags() {
  const db = await openDB();
  const all = await reqToPromise(db.transaction('tags').objectStore('tags').getAll());
  return all.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
}

/** 新增标签，返回落库后的完整记录 */
export async function addTag({ name, color } = {}) {
  const db = await openDB();
  const record = { id: nextId(), name, color, createdAt: Date.now() };
  const tx = db.transaction('tags', 'readwrite');
  await reqToPromise(tx.objectStore('tags').add(record));
  await txDone(tx);
  return record;
}
