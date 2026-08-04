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
} from './guashiRepo.js';
import { addTag, listTags } from './tagsRepo.js';
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
