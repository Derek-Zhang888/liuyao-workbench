import 'fake-indexeddb/auto';
import { describe, expect, test, beforeEach } from 'vitest';
import { openDB } from './index.js';
import {
  addGuashi,
  updateGuashi,
  getGuashi,
  listGuashi,
  softDelete,
  restoreGuashi,
  purgeGuashi,
  purgeExpired,
  replaceAllGuashi,
  setPurgeAt,
  effectivePurgeAt,
} from './guashiRepo.js';
import { addTag, deleteTag, ensureTags, listTags } from './tagsRepo.js';
import { getSetting, setSetting } from './settingsRepo.js';

/** 构造符合字段设计的卦例 */
function makeGuashi(overrides = {}) {
  return {
    title: '测试卦例',
    date: '2026-08-04',
    method: 'qian',
    params: { coins: [1, 1, 0] },
    panSnapshot: null,
    duanyu: '',
    yingqi: '',
    jixiong: '',
    beizhu: '',
    fankui: '',
    status: '未反馈',
    jixiongOk: '',
    yingqiOk: '',
    fangweiOk: '',
    tags: [],
    deleted: false,
    delAt: 0,
    ...overrides,
  };
}

/** 每用例前清空三表（复用同一连接，避免重建库） */
beforeEach(async () => {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['guashi', 'tags', 'settings'], 'readwrite');
    tx.objectStore('guashi').clear();
    tx.objectStore('tags').clear();
    tx.objectStore('settings').clear();
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
});

describe('guashiRepo 基本 CRUD', () => {
  test('addGuashi 自动生成 id，getGuashi 返回同一条记录', async () => {
    const saved = await addGuashi(makeGuashi());
    expect(saved.id).toBeTruthy();
    expect(saved.deleted).toBe(false);
    expect(saved.delAt).toBe(0);
    expect(saved.createdAt).toBeGreaterThan(0);
    const got = await getGuashi(saved.id);
    expect(got).toEqual(saved);
  });

  test('listGuashi 默认列出全部未删除卦例', async () => {
    const a = await addGuashi(makeGuashi({ title: '第一卦' }));
    const b = await addGuashi(makeGuashi({ title: '第二卦' }));
    const list = await listGuashi();
    expect(list).toHaveLength(2);
    // 最新在前
    expect(list[0].id).toBe(b.id);
    expect(list[1].id).toBe(a.id);
  });

  test('updateGuashi 覆盖字段并刷新 updatedAt', async () => {
    const saved = await addGuashi(makeGuashi());
    const updated = await updateGuashi({ ...saved, status: '已反馈', duanyu: '卦辞吉' });
    expect(updated.duanyu).toBe('卦辞吉');
    expect(updated.status).toBe('已反馈');
    expect(updated.updatedAt).toBeGreaterThanOrEqual(saved.updatedAt);
    expect((await getGuashi(saved.id)).status).toBe('已反馈');
  });

  test('getGuashi 不存在时返回 undefined', async () => {
    expect(await getGuashi(999999)).toBeUndefined();
  });
});

describe('listGuashi 筛选', () => {
  test('deleted：正常列表不含已删，deleted:true 只见回收站', async () => {
    await addGuashi(makeGuashi({ title: '正常卦' }));
    const g2 = await addGuashi(makeGuashi({ title: '待回收' }));
    await softDelete(g2.id);
    expect((await listGuashi()).map((g) => g.title)).toEqual(['正常卦']);
    expect((await listGuashi({ deleted: true })).map((g) => g.title)).toEqual(['待回收']);
  });

  test('status：精确匹配', async () => {
    await addGuashi(makeGuashi({ status: '未反馈' }));
    await addGuashi(makeGuashi({ status: '已反馈' }));
    const list = await listGuashi({ status: '已反馈' });
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe('已反馈');
  });

  test('tag：数组包含匹配', async () => {
    await addGuashi(makeGuashi({ tags: ['工作', '财运'] }));
    await addGuashi(makeGuashi({ tags: ['感情'] }));
    const list = await listGuashi({ tag: '工作' });
    expect(list).toHaveLength(1);
    expect(list[0].tags).toContain('工作');
  });

  test('keyword：匹配 title 或 duanyu（简单 includes）', async () => {
    await addGuashi(makeGuashi({ title: '出差是否顺利' }));
    await addGuashi(makeGuashi({ title: '考试', duanyu: '顺利通过' }));
    await addGuashi(makeGuashi({ title: '出行' }));
    expect(await listGuashi({ keyword: '顺利' })).toHaveLength(2);
    expect(await listGuashi({ keyword: '考试' })).toHaveLength(1);
    expect(await listGuashi({ keyword: '不存在的词' })).toHaveLength(0);
  });

  test('多个条件可组合', async () => {
    await addGuashi(makeGuashi({ title: '工作出差', status: '未反馈', tags: ['工作'] }));
    await addGuashi(makeGuashi({ title: '工作出差', status: '已反馈', tags: ['工作'] }));
    const list = await listGuashi({ status: '已反馈', tag: '工作', keyword: '出差' });
    expect(list).toHaveLength(1);
  });
});

describe('软删除与回收站', () => {
  test('softDelete → 回收站可见 → restoreGuashi 恢复正常', async () => {
    const g = await addGuashi(makeGuashi());
    const sd = await softDelete(g.id);
    expect(sd.deleted).toBe(true);
    expect(sd.delAt).toBeGreaterThan(0);
    expect(await getGuashi(g.id)).toMatchObject({ deleted: true, delAt: sd.delAt });
    expect(await listGuashi({ deleted: true })).toHaveLength(1);
    expect(await listGuashi()).toHaveLength(0);

    const restored = await restoreGuashi(g.id);
    expect(restored.deleted).toBe(false);
    expect(restored.delAt).toBe(0);
    expect(await listGuashi()).toHaveLength(1);
    expect(await listGuashi({ deleted: true })).toHaveLength(0);
  });

  test('softDelete 不存在的 id 返回 undefined', async () => {
    expect(await softDelete(999999)).toBeUndefined();
  });

  test('purgeGuashi 彻底删除', async () => {
    const g = await addGuashi(makeGuashi());
    await purgeGuashi(g.id);
    expect(await getGuashi(g.id)).toBeUndefined();
    expect(await listGuashi()).toHaveLength(0);
  });
});

describe('replaceAllGuashi 批量覆盖（备份导入用）', () => {
  test('正常全量写入：清空后写入全部记录并返回条数，保留 id 与 deleted 标记', async () => {
    await addGuashi(makeGuashi({ title: '旧卦1' }));
    await addGuashi(makeGuashi({ title: '旧卦2' }));
    const items = [
      makeGuashi({ id: 111, title: '新卦1', deleted: true }),
      makeGuashi({ id: 222, title: '新卦2' }),
      makeGuashi({ id: 333, title: '新卦3', deleted: true, delAt: 123 }),
    ];
    const count = await replaceAllGuashi(items);
    expect(count).toBe(3);
    // 旧数据被清空，新数据全量写入（列表按 id 倒序）
    expect((await listGuashi()).map((g) => g.title)).toEqual(['新卦2']);
    expect((await listGuashi({ deleted: true })).map((g) => g.title)).toEqual(['新卦3', '新卦1']);
    expect((await getGuashi(111)).deleted).toBe(true);
    expect((await getGuashi(333)).delAt).toBe(123);
  });

  test('重复 id 只写入第一条', async () => {
    const count = await replaceAllGuashi([
      makeGuashi({ id: 111, title: '首条' }),
      makeGuashi({ id: 111, title: '重复条' }),
    ]);
    expect(count).toBe(1);
    expect((await getGuashi(111)).title).toBe('首条');
  });

  test('含非对象记录时整体失败回滚，原数据保留', async () => {
    await addGuashi(makeGuashi({ title: '原始卦' }));
    await expect(
      replaceAllGuashi([makeGuashi({ id: 1, title: '合法新卦' }), null]),
    ).rejects.toThrow();
    // 原数据未被清空，失败部分未写入
    expect((await listGuashi()).map((g) => g.title)).toEqual(['原始卦']);
    expect(await getGuashi(1)).toBeUndefined();
  });

  test('缺少有效 id（含 NaN）的记录整体失败回滚，原数据保留', async () => {
    await addGuashi(makeGuashi({ title: '原始卦' }));
    await expect(replaceAllGuashi([makeGuashi({ title: '无id' })])).rejects.toThrow();
    await expect(replaceAllGuashi([makeGuashi({ id: NaN, title: 'NaN id' })])).rejects.toThrow();
    expect((await listGuashi()).map((g) => g.title)).toEqual(['原始卦']);
  });
});

describe('purgeExpired 过期清理', () => {
  test('recycleDays=1：delAt 2 天前被清理，delAt 现在保留', async () => {
    await setSetting('recycleDays', 1);
    // 过期：delAt 手动改为 2 天前
    const expired = await addGuashi(makeGuashi({ title: '过期卦' }));
    await softDelete(expired.id);
    await updateGuashi({ ...(await getGuashi(expired.id)), delAt: Date.now() - 2 * 86400000 });
    // 未过期：delAt 为现在
    const fresh = await addGuashi(makeGuashi({ title: '新删卦' }));
    await softDelete(fresh.id);

    const purged = await purgeExpired();
    expect(purged).toBe(1);
    expect(await getGuashi(expired.id)).toBeUndefined();
    expect(await getGuashi(fresh.id)).not.toBeUndefined();
  });

  test('未设置 recycleDays 时按默认 30 天清理', async () => {
    const g = await addGuashi(makeGuashi());
    await softDelete(g.id);
    // 35 天前删除 → 超过默认 30 天 → 清理
    await updateGuashi({ ...(await getGuashi(g.id)), delAt: Date.now() - 35 * 86400000 });
    expect(await purgeExpired()).toBe(1);
    expect(await getGuashi(g.id)).toBeUndefined();
  });

  test('未删除或 30 天内的卦例不受影响', async () => {
    await addGuashi(makeGuashi({ title: '未删除' }));
    const g = await addGuashi(makeGuashi({ title: '10 天前删除' }));
    await softDelete(g.id);
    await updateGuashi({ ...(await getGuashi(g.id)), delAt: Date.now() - 10 * 86400000 });
    expect(await purgeExpired()).toBe(0);
    expect(await listGuashi()).toHaveLength(1);
    expect(await listGuashi({ deleted: true })).toHaveLength(1);
  });
});

describe('自定义删除时间', () => {
  test('softDelete 传入天数写入 purgeAt，不传则为 0（按全局保留天数）', async () => {
    const custom = await softDelete((await addGuashi(makeGuashi())).id, 2);
    expect(custom.purgeAt).toBeGreaterThan(Date.now() + 1.9 * 86400000);
    const plain = await softDelete((await addGuashi(makeGuashi())).id);
    expect(plain.purgeAt).toBe(0);
  });

  test('setPurgeAt 写入与清除自定义时间，不存在的 id 返回 undefined', async () => {
    const g = await addGuashi(makeGuashi());
    await softDelete(g.id);
    const at = Date.now() + 5 * 86400000;
    expect((await setPurgeAt(g.id, at)).purgeAt).toBe(at);
    expect((await getGuashi(g.id)).purgeAt).toBe(at);
    // 传 0 / 非法值视为清除自定义
    expect((await setPurgeAt(g.id, 0)).purgeAt).toBe(0);
    expect(await setPurgeAt(999999, at)).toBeUndefined();
  });

  test('effectivePurgeAt：自定义优先，未自定义按 delAt + 天数，未删除返回 0', async () => {
    const delAt = Date.now();
    expect(effectivePurgeAt({ deleted: true, delAt, purgeAt: 0 }, 10)).toBe(delAt + 10 * 86400000);
    expect(effectivePurgeAt({ deleted: true, delAt, purgeAt: 123456 }, 10)).toBe(123456);
    expect(effectivePurgeAt({ deleted: false, delAt, purgeAt: 0 }, 10)).toBe(0);
  });

  test('purgeExpired：自定义时间到点即清理，未到点保留（不受全局天数影响）', async () => {
    await setSetting('recycleDays', 365);
    // 自定义时间已过 → 清理
    const due = await addGuashi(makeGuashi({ title: '自定义到期' }));
    await softDelete(due.id);
    await setPurgeAt(due.id, Date.now() - 1000);
    // 自定义时间未到 → 保留
    const later = await addGuashi(makeGuashi({ title: '自定义未到' }));
    await softDelete(later.id);
    await setPurgeAt(later.id, Date.now() + 86400000);
    // 无自定义、按全局 365 天 → 保留
    const global = await addGuashi(makeGuashi({ title: '按全局' }));
    await softDelete(global.id);
    await updateGuashi({ ...(await getGuashi(global.id)), delAt: Date.now() - 40 * 86400000 });

    expect(await purgeExpired()).toBe(1);
    expect(await getGuashi(due.id)).toBeUndefined();
    expect(await getGuashi(later.id)).not.toBeUndefined();
    expect(await getGuashi(global.id)).not.toBeUndefined();
  });

  test('restoreGuashi 清除自定义删除时间', async () => {
    const g = await addGuashi(makeGuashi());
    await softDelete(g.id, 3);
    const restored = await restoreGuashi(g.id);
    expect(restored.purgeAt).toBe(0);
    expect(restored.deleted).toBe(false);
  });
});

describe('tagsRepo 标签', () => {
  test('addTag 自动生成 id，listTags 可见', async () => {
    const t = await addTag({ name: '财运', color: '#f59e0b' });
    expect(t.id).toBeTruthy();
    expect(t.name).toBe('财运');
    expect(t.color).toBe('#f59e0b');
    const list = await listTags();
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual(t);
  });

  test('支持多条标签并按创建时间排序', async () => {
    const a = await addTag({ name: '工作', color: '#3b82f6' });
    const b = await addTag({ name: '感情', color: '#ef4444' });
    const list = await listTags();
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe(a.id);
    expect(list[1].id).toBe(b.id);
  });

  test('deleteTag 只删标签，已保存卦例的 tags 原样保留', async () => {
    const t = await addTag({ name: '占病', color: '#c0392b' });
    const g = await addGuashi(makeGuashi({ tags: ['占病', '工作'] }));
    await deleteTag(t.id);
    expect(await listTags()).toHaveLength(0);
    const kept = await getGuashi(g.id);
    expect(kept).toBeTruthy();
    expect(kept.tags).toEqual(['占病', '工作']);
    expect(await listGuashi()).toHaveLength(1);
  });

  test('ensureTags 只补建缺失的标签（trim/去重/忽略空串）', async () => {
    await addTag({ name: '工作', color: '#3b82f6' });
    const created = await ensureTags(['工作', '新标签', ' 新标签 ', '', null, '占病']);
    expect(created.map((t) => t.name)).toEqual(['新标签', '占病']);
    expect((await listTags()).map((t) => t.name)).toEqual(['工作', '新标签', '占病']);
    expect(created.every((t) => typeof t.color === 'string' && t.color)).toBe(true);
    // 再次调用不重复新建
    expect(await ensureTags(['工作', '新标签'])).toEqual([]);
  });
});

describe('settingsRepo 设置', () => {
  test('recycleDays 默认值为 30', async () => {
    expect(await getSetting('recycleDays')).toBe(30);
  });

  test('setSetting 后 getSetting 返回新值', async () => {
    await setSetting('recycleDays', 15);
    expect(await getSetting('recycleDays')).toBe(15);
    await setSetting('theme', 'dark');
    expect(await getSetting('theme')).toBe('dark');
  });

  test('未设置且无默认值的 key 返回 undefined', async () => {
    expect(await getSetting('no_such_key')).toBeUndefined();
  });
});
