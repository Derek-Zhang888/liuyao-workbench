/**
 * 卦例表（guashi）仓储（Task 6）
 * 记录结构：
 * {
 *   id, title, date: 'YYYY-MM-DD', method: 'qian'等, params: {起卦参数},
 *   panSnapshot, // 盘面快照 JSON（可选，UI 层存）
 *   duanyu:'', yingqi:'', jixiong:'', beizhu:'', fankui:'',
 *   status: '未反馈'|'已反馈', jixiongOk:'', yingqiOk:'', fangweiOk:'', // ''|'对'|'错'
 *   tags: [], createdAt, updatedAt, deleted: false, delAt: 0
 * }
 */
import { openDB, reqToPromise, txDone, nextId } from './index.js';
import { getSetting } from './settingsRepo.js';

const DAY_MS = 86400000;

/** 补齐操作性字段默认值（业务字段由调用方提供） */
function withDefaults(g) {
  return {
    ...g,
    id: g.id ?? nextId(),
    tags: g.tags ?? [],
    createdAt: g.createdAt ?? Date.now(),
    updatedAt: g.updatedAt ?? Date.now(),
    deleted: g.deleted ?? false,
    delAt: g.delAt ?? 0,
  };
}

/** 新增卦例，返回落库后的完整记录 */
export async function addGuashi(g) {
  const db = await openDB();
  const record = withDefaults(g);
  const tx = db.transaction('guashi', 'readwrite');
  await reqToPromise(tx.objectStore('guashi').add(record));
  await txDone(tx);
  return record;
}

/** 更新卦例（整体覆盖），自动刷新 updatedAt，返回更新后的记录 */
export async function updateGuashi(g) {
  if (g.id == null) throw new Error('updateGuashi: id 必填');
  const db = await openDB();
  const record = { ...g, updatedAt: Date.now() };
  const tx = db.transaction('guashi', 'readwrite');
  await reqToPromise(tx.objectStore('guashi').put(record));
  await txDone(tx);
  return record;
}

/** 按 id 取卦例，不存在返回 undefined */
export async function getGuashi(id) {
  const db = await openDB();
  return reqToPromise(db.transaction('guashi').objectStore('guashi').get(id));
}

/**
 * 列出卦例（内存过滤，本应用数据量小，简单 includes 即可）
 * @param {{status?: string, tag?: string, keyword?: string, deleted?: boolean}} opts
 *   deleted: false=正常列表（默认），true=回收站
 *   status:  精确匹配；tag: 数组包含；keyword: title 或 duanyu 包含（简单 includes）
 * 返回按 id 倒序（最新在前）
 */
export async function listGuashi({ status, tag, keyword, deleted = false } = {}) {
  const db = await openDB();
  const all = await reqToPromise(db.transaction('guashi').objectStore('guashi').getAll());
  return all
    .filter((r) => !!r.deleted === !!deleted)
    .filter((r) => (status ? r.status === status : true))
    .filter((r) => (tag ? Array.isArray(r.tags) && r.tags.includes(tag) : true))
    .filter((r) => {
      if (!keyword) return true;
      const kw = String(keyword);
      return (r.title ?? '').includes(kw) || (r.duanyu ?? '').includes(kw);
    })
    .sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
}

/**
 * 软删除：置 deleted=true + delAt=Date.now()
 * 保留天数由 purgeExpired 时按 settings.recycleDays（默认 30）统一计算，
 * 记录上不落天数字段。
 * @param {number|string} id
 * @param {number} [days] 接口兼容参数（brief 签名保留），实际按 settings 计算
 */
export async function softDelete(id, _days) {
  const rec = await getGuashi(id);
  if (!rec) return undefined;
  return updateGuashi({ ...rec, deleted: true, delAt: Date.now() });
}

/** 恢复：deleted=false + delAt=0 */
export async function restoreGuashi(id) {
  const rec = await getGuashi(id);
  if (!rec) return undefined;
  return updateGuashi({ ...rec, deleted: false, delAt: 0 });
}

/** 彻底删除一条卦例 */
export async function purgeGuashi(id) {
  const db = await openDB();
  const tx = db.transaction('guashi', 'readwrite');
  await reqToPromise(tx.objectStore('guashi').delete(id));
  await txDone(tx);
}

/**
 * 清理回收站中已过期的卦例：delAt + recycleDays*86400000 < now
 * recycleDays 从 settings 读，默认 30
 * @returns {Promise<number>} 清理条数
 */
export async function purgeExpired() {
  const db = await openDB();
  const days = (await getSetting('recycleDays')) ?? 30;
  const tx = db.transaction('guashi', 'readwrite');
  const store = tx.objectStore('guashi');
  const all = await reqToPromise(store.getAll());
  const now = Date.now();
  let count = 0;
  for (const r of all) {
    if (r.deleted && r.delAt && r.delAt + days * DAY_MS < now) {
      await reqToPromise(store.delete(r.id));
      count++;
    }
  }
  await txDone(tx);
  return count;
}
