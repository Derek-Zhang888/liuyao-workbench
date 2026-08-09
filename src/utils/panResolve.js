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
 * 盘面解析：快照优先；无快照按 method/params 重新排盘。
 *
 * v0.2 功能 I：支持自定用神（编辑页用）——
 *   - 未显式传 yongShen（默认）：与历史行为一致，快照优先（旧快照自带用神）
 *   - 显式传 yongShen 且与快照用神一致：直接用快照（避免无谓重排）
 *   - 显式传 yongShen 且与快照用神不同（含清空）：按 method/params + 用神重排，
 *     快照仅作展示缓存，重排失败时回退快照
 * v0.10 #16：支持 opts.markers（盘面标记设置 11 键）——重排时携带当前设置重算标记，
 *   修复 md 导入记录（panSnapshot=null）重排后丢失增强显示的问题。
 * @param {object} rec 卦例记录
 * @param {{yongShen?: object|null, markers?: object|null}} [opts] 可选
 *   yongShen：目标用神 {type:'liuqin'|'zhi', value}（不传=默认行为）
 *   markers：盘面标记设置（marker-* 11 键布尔；不传则不携带，重排盘无标记）
 * @returns {{ok: true, pan: object} | {ok: false, error: string}}
 */
export function resolvePan(rec, opts = {}) {
  const snap = rec.panSnapshot
  const yongShen = opts.yongShen
  const markers = opts.markers
  // 默认（未显式指定用神）：快照优先，与历史行为一致（快照自带用神）
  if (yongShen === undefined && snap) return { ok: true, pan: snap }
  // 显式指定用神且与快照用神一致：直接用快照（用神未变化时不必重排）
  if (yongShen !== undefined && snap && (yongShen ?? null) === (snap.yongShen ?? null)) {
    return { ok: true, pan: snap }
  }
  try {
    // 重排继承快照的排盘选项（修复：自定用神变化后天干/地支分析/真太阳时丢失）：
    //   nagan 快照有布尔（保存时排盘开关），dizhi 按快照是否有分析判定，
    //   trueSolar 由快照 trueSolarInfo（lng/tzOffsetMin/cityName）重建；旧快照无字段时全部回退默认。
    const tsInfo = snap?.trueSolarInfo
    const pan = paipan({
      method: rec.method,
      params: rec.params ?? {},
      date: parseDate(rec.date) ?? new Date(),
      yongShen: yongShen ?? undefined,
      nagan: snap?.nagan ?? false,
      dizhi: snap?.dizhiAnalysis ? true : false,
      trueSolar:
        tsInfo && tsInfo.lng != null && typeof tsInfo.tzOffsetMin === 'number'
          ? { lng: tsInfo.lng, tzOffsetMin: tsInfo.tzOffsetMin, cityName: tsInfo.cityName }
          : null,
      ...(markers && typeof markers === 'object' ? { markers } : {}), // v0.10 #16：导入重排携带标记设置
    })
    return { ok: true, pan }
  } catch (e) {
    if (snap) return { ok: true, pan: snap } // 重排失败回退快照，不阻断编辑
    return { ok: false, error: e.message }
  }
}
