/**
 * resolvePan 回归测试（修复：编辑页自定用神变化触发重排时，丢失快照的排盘选项——
 *   纳干天干消失、地支分析消失、真太阳时丢失）
 */
import { describe, expect, test } from 'vitest'
import { paipan } from '../engine/paipan.js'
import { resolvePan } from './panResolve.js'

/** 带快照的卦例记录：快照用 2026-08-08 乾为天（甲寅日）排盘 */
function makeRec(panOpts) {
  const snap = paipan({
    method: 'qian',
    params: { lines: '111111', dong: [] },
    date: new Date(2026, 7, 8, 10, 0),
    ...panOpts,
  })
  return {
    id: 1,
    method: 'qian',
    params: { lines: '111111', dong: [] },
    date: '2026-08-08 10:00',
    panSnapshot: snap,
  }
}

describe('resolvePan 重排继承快照排盘选项', () => {
  test('快照开启纳干 → 换用神重排后爻仍含天干（修复天干消失）', () => {
    const rec = makeRec({ nagan: true })
    const res = resolvePan(rec, { yongShen: { type: 'liuqin', value: '官' } })
    expect(res.ok).toBe(true)
    const ganCount = res.pan.yao.filter((y) => y.gan).length
    expect(ganCount).toBe(6) // 乾为天纳干全部非空
    expect(res.pan.nagan).toBe(true)
  })

  test('快照未开纳干 → 重排后爻无 gan（与快照一致）', () => {
    const rec = makeRec({})
    const res = resolvePan(rec, { yongShen: { type: 'liuqin', value: '官' } })
    expect(res.ok).toBe(true)
    expect(res.pan.yao.every((y) => y.gan === undefined)).toBe(true)
  })

  test('快照含地支分析 → 清空用神重排后分析仍保留（原会随 yongShen=null 消失）', () => {
    const rec = makeRec({ dizhi: true })
    expect(rec.panSnapshot.dizhiAnalysis).toBeTruthy()
    const res = resolvePan(rec, { yongShen: null })
    expect(res.ok).toBe(true)
    expect(res.pan.dizhiAnalysis).toBeTruthy()
  })

  test('快照含真太阳时 → 重排后仍按原配置重算（时柱/信息一致）', () => {
    const rec = makeRec({ trueSolar: { lng: 87.6, tzOffsetMin: 480, cityName: '乌鲁木齐' } })
    const before = rec.panSnapshot
    const res = resolvePan(rec, { yongShen: { type: 'liuqin', value: '官' } })
    expect(res.ok).toBe(true)
    expect(res.pan.hourGZ).toBe(before.hourGZ)
    expect(res.pan.trueSolarInfo.cityName).toBe('乌鲁木齐')
    expect(res.pan.trueSolarInfo.lng).toBe(87.6)
  })

  test('用神与快照一致 → 直接返回快照不重排（既有行为不回归）', () => {
    const rec = makeRec({ nagan: true })
    const res = resolvePan(rec, { yongShen: rec.panSnapshot.yongShen ?? null })
    expect(res.pan).toBe(rec.panSnapshot)
  })
})
