/**
 * 盘面解析工具（Task 11 提取，卦例库页 / 统计页共用）
 *
 * 规则：panSnapshot 快照优先；无快照（如 md 导入的卦例）按 method/params 重新排盘。
 */
import { paipan } from '../engine/paipan.js'

/** 解析 'YYYY-MM-DD HH:mm' / 'YYYY-MM-DD' → Date，失败返回 null */
export function parseDate(s) {
  if (!s) return null
  const d = new Date(String(s).replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * 盘面解析：快照优先；无快照按 method/params 重新排盘
 * @param {object} rec 卦例记录
 * @returns {{ok: true, pan: object} | {ok: false, error: string}}
 */
export function resolvePan(rec) {
  if (rec.panSnapshot) return { ok: true, pan: rec.panSnapshot }
  try {
    const pan = paipan({
      method: rec.method,
      params: rec.params ?? {},
      date: parseDate(rec.date) ?? new Date(),
    })
    return { ok: true, pan }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}
