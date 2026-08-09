/**
 * 卦例表（guashi）仓储（Task 6）
 * 记录结构：
 * {
 *   id, title, date: 'YYYY-MM-DD', method: 'qian'等, params: {起卦参数},
 *   panSnapshot, // 盘面快照 JSON（可选，UI 层存）
 *   duanyu:'', yingqi:'', jixiong:'', beizhu:'', fankui:'',
 *   status: '未反馈'|'已反馈', jixiongOk:'', yingqiOk:'', fangweiOk:'', // ''|'对'|'错'
 *   tags: [], createdAt, updatedAt, deleted: false, delAt: 0,
 *   purgeAt: 0 // 自定义彻底删除时间（时间戳 ms），0 表示按 settings.recycleDays 计算
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
    purgeAt: g.purgeAt ?? 0,
  };
}

/** 归一化自定义删除时间：正数时间戳保留，其余（0/null/NaN/负数）视为未自定义 */
function normalizePurgeAt(at) {
  const n = Number(at);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/**
 * 计算一条卦例实际被彻底删除的时间点。
 * 自定义 purgeAt 优先；未自定义时按 delAt + 保留天数。
 * @param {object} rec 卦例记录
 * @param {number} days 全局保留天数（settings.recycleDays）
 * @returns {number} 时间戳 ms；0 表示不会被自动清理（未删除或无 delAt）
 */
export function effectivePurgeAt(rec, days) {
  if (!rec || !rec.deleted) return 0;
  const custom = normalizePurgeAt(rec.purgeAt);
  if (custom) return custom;
  if (!rec.delAt) return 0;
  const d = Number(days);
  return rec.delAt + (Number.isFinite(d) && d > 0 ? d : 30) * DAY_MS;
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
 * 返回按更新时间倒序（v0.10 #2：updatedAt 优先，旧记录无 updatedAt 回退 createdAt/id；
 * 时间戳相同时回退 id 倒序，保证「最新在前」确定有序）
 */
export async function listGuashi({ status, tag, keyword, deleted = false } = {}) {
  const db = await openDB();
  const all = await reqToPromise(db.transaction('guashi').objectStore('guashi').getAll());
  const tsOf = (r) => r.updatedAt ?? r.createdAt ?? 0;
  return all
    .filter((r) => !!r.deleted === !!deleted)
    .filter((r) => (status ? r.status === status : true))
    .filter((r) => (tag ? Array.isArray(r.tags) && r.tags.includes(tag) : true))
    .filter((r) => {
      if (!keyword) return true;
      const kw = String(keyword);
      return (r.title ?? '').includes(kw) || (r.duanyu ?? '').includes(kw);
    })
    .sort((a, b) => (tsOf(b) - tsOf(a)) || (b.id ?? 0) - (a.id ?? 0));
}

/**
 * 软删除：置 deleted=true + delAt=Date.now()
 * 不传 days 时保留天数由 purgeExpired 按 settings.recycleDays（默认 30）统一计算；
 * 传入正数 days 则为该条记录写入自定义删除时间 purgeAt=now+days*86400000。
 * @param {number|string} id
 * @param {number} [days] 自定义保留天数（可选）
 */
export async function softDelete(id, days) {
  const rec = await getGuashi(id);
  if (!rec) return undefined;
  const now = Date.now();
  const d = Number(days);
  const purgeAt = Number.isFinite(d) && d > 0 ? now + d * DAY_MS : 0;
  return updateGuashi({ ...rec, deleted: true, delAt: now, purgeAt });
}

/**
 * 设置回收站单条卦例的自定义彻底删除时间
 * @param {number|string} id
 * @param {number} at 时间戳 ms；传 0/null 表示清除自定义，回到全局保留天数
 * @returns {Promise<object|undefined>} 更新后的记录，记录不存在返回 undefined
 */
export async function setPurgeAt(id, at) {
  const rec = await getGuashi(id);
  if (!rec) return undefined;
  return updateGuashi({ ...rec, purgeAt: normalizePurgeAt(at) });
}

/** 恢复：deleted=false + delAt=0，同时清除自定义删除时间 */
export async function restoreGuashi(id) {
  const rec = await getGuashi(id);
  if (!rec) return undefined;
  return updateGuashi({ ...rec, deleted: false, delAt: 0, purgeAt: 0 });
}

/** 彻底删除一条卦例 */
export async function purgeGuashi(id) {
  const db = await openDB();
  const tx = db.transaction('guashi', 'readwrite');
  await reqToPromise(tx.objectStore('guashi').delete(id));
  await txDone(tx);
}

/**
 * 批量覆盖卦例表（备份导入用）：单事务内 clear + 逐条 put，
 * 任一步失败事务自动 abort 回滚，原数据保留，不会产生半覆盖状态。
 * 重复 id 只写入第一条；非法记录（非对象 / 无有效 id）整体拒绝。
 * @param {Array} items 完整卦例记录数组（须含有效 id，number 或 string）
 * @returns {Promise<number>} 实际写入条数
 */
export async function replaceAllGuashi(items) {
  // 同步预校验（事务外）：记录必须是含有效 id 的对象，非法输入整体拒绝、不动数据
  const clean = [];
  const seen = new Set();
  for (const g of items) {
    if (!g || typeof g !== 'object') throw new Error('replaceAllGuashi: 记录必须为对象');
    const idOk = (typeof g.id === 'number' && Number.isFinite(g.id)) || typeof g.id === 'string';
    if (!idOk) throw new Error('replaceAllGuashi: 记录缺少有效 id');
    if (seen.has(g.id)) continue;
    seen.add(g.id);
    clean.push(g);
  }

  const db = await openDB();
  const tx = db.transaction('guashi', 'readwrite');
  const store = tx.objectStore('guashi');
  try {
    await reqToPromise(store.clear());
    for (const g of clean) await reqToPromise(store.put(g));
  } catch (e) {
    try {
      tx.abort(); // 同步异常（如不可克隆值）时主动中止事务，已写入部分一并回滚
    } catch {
      /* 事务已因错误自动 abort */
    }
    throw e;
  }
  await txDone(tx);
  return clean.length;
}

/**
 * 清理回收站中已过期的卦例：到达 effectivePurgeAt（自定义删除时间优先，
 * 否则 delAt + recycleDays*86400000）即彻底删除。recycleDays 从 settings 读，默认 30
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
    const at = effectivePurgeAt(r, days);
    if (at && at < now) {
      await reqToPromise(store.delete(r.id));
      count++;
    }
  }
  await txDone(tx);
  return count;
}
