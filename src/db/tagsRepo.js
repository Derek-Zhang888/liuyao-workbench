/**
 * 标签表（tags）仓储（Task 6）
 * 记录结构：{ id, name, color, createdAt }
 *
 * 说明（Bug #14）：
 *   - deleteTag 只删标签表记录，绝不改动 guashi 表，已保存卦例的 tags 字段原样保留
 *     （卦例卡片对未知 tag 用弱化灰展示，不会因删标签而丢数据）
 *   - 预置标签只在首次（settings.tagsSeeded 未置位时）种子写入一次，
 *     用户删除预置标签后不会被再次种回
 */
import { openDB, reqToPromise, txDone, nextId } from './index.js';
import { getSetting, setSetting } from './settingsRepo.js';
import { PRESET_TAGS, paletteColor } from '../config/presetTags.js';

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

/**
 * 删除标签（仅删标签表记录，不触碰任何卦例）
 * @param {number} id 标签 id
 */
export async function deleteTag(id) {
  const db = await openDB();
  const tx = db.transaction('tags', 'readwrite');
  await reqToPromise(tx.objectStore('tags').delete(id));
  await txDone(tx);
}

/**
 * 确保这些标签名都在库中存在，缺失的自动新建（导入 md / 导入备份时用）
 * @param {string[]} names 标签名数组（自动 trim、去重、忽略空串）
 * @returns {Promise<object[]>} 本次新建的标签记录
 */
export async function ensureTags(names = []) {
  const wanted = [
    ...new Set((names ?? []).map((n) => (typeof n === 'string' ? n.trim() : '')).filter(Boolean)),
  ];
  if (wanted.length === 0) return [];
  const existing = await listTags();
  const have = new Set(existing.map((t) => t.name));
  const created = [];
  for (const name of wanted) {
    if (have.has(name)) continue;
    const preset = PRESET_TAGS.find((p) => p.name === name);
    const rec = await addTag({
      name,
      color: preset ? preset.color : paletteColor(existing.length + created.length),
    });
    have.add(name);
    created.push(rec);
  }
  return created;
}

/**
 * 预置标签种子写入：仅执行一次（settings.tagsSeeded 标记），
 * 之后即使用户删光预置标签也不会重新写入。
 * 模块级共享 Promise：React StrictMode 双挂载时避免并发重复入库。
 */
let seedPromise = null;
export function ensurePresetTags() {
  if (!seedPromise) {
    seedPromise = (async () => {
      if (await getSetting('tagsSeeded')) return;
      const have = new Set((await listTags()).map((t) => t.name));
      for (const p of PRESET_TAGS) {
        if (!have.has(p.name)) await addTag({ name: p.name, color: p.color });
      }
      await setSetting('tagsSeeded', true);
    })().catch((e) => {
      seedPromise = null; // 失败可重试
      throw e;
    });
  }
  return seedPromise;
}
