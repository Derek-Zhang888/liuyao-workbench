import { describe, expect, test } from 'vitest'
import { computeStats, wrongDims, hasDuanContent } from './stats.js'

/** 构造一条卦例（只保留统计相关的字段） */
function g(overrides = {}) {
  return {
    status: '未反馈',
    jixiongOk: '',
    yingqiOk: '',
    fangweiOk: '',
    ...overrides,
  }
}

describe('computeStats v1.3.0 三态口径', () => {
  test('已反馈 = fankui 非空（与 status 字段解耦：status 只是 fankui 的派生）', () => {
    const list = [
      g({ fankui: '应验', status: '已反馈', jixiong: '吉', jixiongOk: '对' }),
      g({ fankui: '准了' }), // fankui 非空但 status 未反馈 → 仍算已反馈
      g({ status: '已反馈' }), // status 已反馈但 fankui 空 → 不算已反馈（五者全空 → 待占断）
      g({}),
    ]
    const s = computeStats(list)
    expect(s.fed).toBe(2)
    expect(s.pending).toBe(2)
    expect(s.unfed).toBe(0)
  })

  test('待反馈 = 五者任一非空且 fankui 空；待占断 = 五者全空', () => {
    const list = [
      g({ duanyu: '吉' }), // 只填断语 → 待反馈
      g({ yingqi: '明日' }), // 只填应期 → 待反馈
      g({ fangwei: '东' }), // 只填方位 → 待反馈
      g({ quShu: '三' }), // 只填取数 → 待反馈
      g({ jixiong: '吉' }), // 只选吉凶 → 待反馈
      g({}), // 五者全空 → 待占断
    ]
    const s = computeStats(list)
    expect(s.unfed).toBe(5)
    expect(s.pending).toBe(1)
    expect(s.fed).toBe(0)
    expect(s.total).toBe(6)
  })

  test('三态互斥且总和 = 总数', () => {
    const list = [
      g({ fankui: 'x', jixiong: '吉', jixiongOk: '对' }),
      g({ duanyu: '凶' }),
      g({ quShu: '五' }),
      g({}),
    ]
    const s = computeStats(list)
    expect(s.fed + s.unfed + s.pending).toBe(4)
    expect(s.total).toBe(4)
  })

  test('维度计数仅统计已反馈（fankui 非空）卦例', () => {
    const list = [
      g({ fankui: '1', jixiongOk: '对', yingqiOk: '错', fangweiOk: '对' }),
      g({ fankui: '2', jixiongOk: '错' }),
      g({ jixiongOk: '对' }), // fankui 空 → 不参与维度计数
    ]
    const s = computeStats(list)
    expect(s.fed).toBe(2)
    expect(s.jxOk).toBe(1)
    expect(s.jxBad).toBe(1)
    expect(s.jxRate).toBe(0.5)
    expect(s.yqOk).toBe(0)
    expect(s.yqBad).toBe(1)
    expect(s.fwOk).toBe(1)
    expect(s.fwBad).toBe(0)
  })
})

describe('computeStats 取数维度（v1.3.0）', () => {
  test('取数三档计数 + 双口径（神准率 / 神准+相近率），分母 = 三档已勾选总数', () => {
    const list = [
      g({ fankui: '1', quShuFb: '神准' }),
      g({ fankui: '2', quShuFb: '神准' }),
      g({ fankui: '3', quShuFb: '相近' }),
      g({ fankui: '4', quShuFb: '错' }),
      g({ fankui: '5', quShuFb: '' }), // 未选三档 → 不摊薄
    ]
    const s = computeStats(list)
    expect(s.qsSz).toBe(2)
    expect(s.qsXj).toBe(1)
    expect(s.qsCuo).toBe(1)
    expect(s.qsRate).toBeCloseTo(2 / 4, 10)
    expect(s.qsRate2).toBeCloseTo(3 / 4, 10)
  })

  test('取数无反馈：qsRate / qsRate2 为 null，计数为 0', () => {
    const s = computeStats([g({ fankui: '1' })])
    expect(s.qsSz).toBe(0)
    expect(s.qsXj).toBe(0)
    expect(s.qsCuo).toBe(0)
    expect(s.qsRate).toBeNull()
    expect(s.qsRate2).toBeNull()
  })
})

describe('computeStats 边界', () => {
  test('空列表：全部为 0，rate 为 null', () => {
    const s = computeStats([])
    expect(s.total).toBe(0)
    expect(s.fed).toBe(0)
    expect(s.unfed).toBe(0)
    expect(s.pending).toBe(0)
    expect(s.jxRate).toBeNull()
    expect(s.yqRate).toBeNull()
    expect(s.fwRate).toBeNull()
    expect(s.qsRate).toBeNull()
  })

  test('非数组入参不抛错（防御）', () => {
    expect(computeStats(undefined).total).toBe(0)
    expect(computeStats(null).fed).toBe(0)
  })

  test('全部对 / 全部错：rate 为 1 / 0（不是 null）', () => {
    expect(computeStats([g({ fankui: '1', jixiongOk: '对' })]).jxRate).toBe(1)
    expect(computeStats([g({ fankui: '1', jixiongOk: '错' })]).jxRate).toBe(0)
    expect(computeStats([g({ fankui: '1', jixiongOk: '错' })]).jxBad).toBe(1)
  })

  test("jixiongOk='' 与 '留空' 不计入正确率（不摊薄）", () => {
    const s = computeStats([
      g({ fankui: '1', jixiongOk: '' }),
      g({ fankui: '2', jixiongOk: '留空' }),
      g({ fankui: '3', jixiongOk: '对' }),
    ])
    expect(s.jxOk).toBe(1)
    expect(s.jxBad).toBe(0)
    expect(s.jxRate).toBe(1)
  })

  test('缺字段的脏记录不抛错（防御）', () => {
    const s = computeStats([{ id: 1 }, { fankui: 'x' }])
    expect(s.total).toBe(2)
    expect(s.fed).toBe(1)
    expect(s.jxOk).toBe(0)
    expect(s.jxRate).toBeNull()
  })
})

describe('hasDuanContent 五者判定（v1.3.0）', () => {
  test('断语/应期/方位/取数/吉凶 任一非空即 true；全空 false', () => {
    expect(hasDuanContent({ duanyu: 'x' })).toBe(true)
    expect(hasDuanContent({ yingqi: 'x' })).toBe(true)
    expect(hasDuanContent({ fangwei: 'x' })).toBe(true)
    expect(hasDuanContent({ quShu: 'x' })).toBe(true)
    expect(hasDuanContent({ jixiong: '吉' })).toBe(true)
    expect(hasDuanContent({ jixiong: '' })).toBe(false)
    expect(hasDuanContent({ duanyu: '  ' })).toBe(false)
    expect(hasDuanContent({})).toBe(false)
    expect(hasDuanContent(null)).toBe(false)
  })
})

describe('wrongDims 错题判定（v1.3.0 追加取数 qushu）', () => {
  test("'错' 才计为错，'对'/'留空'/'' 均不是", () => {
    expect(wrongDims({ jixiongOk: '错', yingqiOk: '错', fangweiOk: '错', quShuFb: '错' })).toEqual({
      jixiong: true,
      yingqi: true,
      fangwei: true,
      qushu: true,
    })
    expect(wrongDims({ jixiongOk: '对', yingqiOk: '', fangweiOk: '留空', quShuFb: '神准' })).toEqual({
      jixiong: false,
      yingqi: false,
      fangwei: false,
      qushu: false,
    })
    expect(wrongDims({})).toEqual({ jixiong: false, yingqi: false, fangwei: false, qushu: false })
    expect(wrongDims(null)).toEqual({ jixiong: false, yingqi: false, fangwei: false, qushu: false })
  })
})
