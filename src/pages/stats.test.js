import { describe, expect, test } from 'vitest'
import { computeStats, wrongDims } from './stats.js'

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

describe('computeStats 混合数据', () => {
  test('已反馈+未反馈混合：计数与三维度正确率正确（v0.10 改进建8 #2 新口径）', () => {
    const list = [
      g({ status: '已反馈', jixiong: '吉', jixiongOk: '对', yingqiOk: '对', fangweiOk: '对' }),
      g({ status: '已反馈', jixiong: '凶', jixiongOk: '错', yingqiOk: '错', fangweiOk: '' }),
      g({ status: '已反馈', jixiong: '吉', jixiongOk: '对', yingqiOk: '', fangweiOk: '错' }),
      g({ status: '未反馈', jixiong: '吉' }), // 已断未反馈
      g({ status: '未反馈' }), // 待占断（未选吉凶）
    ]
    const s = computeStats(list)
    expect(s.total).toBe(5)
    expect(s.fed).toBe(3)
    expect(s.unfed).toBe(1) // 仅 jixiong 非空且未反馈
    expect(s.pending).toBe(1) // 仅 jixiong 未选
    // 吉凶：对2 错1 → 2/3
    expect(s.jxOk).toBe(2)
    expect(s.jxBad).toBe(1)
    expect(s.jxRate).toBeCloseTo(2 / 3, 10)
    // 应期：对1 错1 → 1/2
    expect(s.yqOk).toBe(1)
    expect(s.yqBad).toBe(1)
    expect(s.yqRate).toBe(0.5)
    // 方位：对1 错1 → 1/2
    expect(s.fwOk).toBe(1)
    expect(s.fwBad).toBe(1)
    expect(s.fwRate).toBe(0.5)
  })

  test('待占断计数（v0.2 功能 H）：jixiong 未选（空字符串或缺失）计入 pending', () => {
    const list = [
      g({ jixiong: '' }), // 待占断
      g({ jixiong: '吉' }),
      g({ jixiong: '凶' }),
      { id: 1 }, // 脏记录：jixiong 缺失 → 待占断
    ]
    const s = computeStats(list)
    expect(s.pending).toBe(2)
    expect(s.unfed).toBe(2) // 吉/凶 且 status 未反馈 → 已断未反馈
  })

  test('v0.10 改进建8 #2：已反馈但 jixiong 未选 → 只计 fed 与 pending（不混入 unfed）', () => {
    const s = computeStats([
      g({ status: '已反馈', jixiong: '', jixiongOk: '对' }),
      g({ status: '未反馈', jixiong: '' }),
    ])
    expect(s.fed).toBe(1)
    expect(s.unfed).toBe(0) // 两条 jixiong 均为空 → 都不算「未反馈」
    expect(s.pending).toBe(2)
  })

  test('v0.10 改进建8 #2 三态互斥：待占断/未反馈/已反馈互不重叠且总和=总数', () => {
    const list = [
      g({ status: '已反馈', jixiong: '吉', jixiongOk: '对' }),
      g({ status: '未反馈', jixiong: '凶' }), // 已断未反馈
      g({ status: '未反馈' }), // 待占断（未选吉凶）
      g({ status: '未反馈', jixiong: '平' }),
    ]
    const s = computeStats(list)
    expect(s.fed).toBe(1)
    expect(s.unfed).toBe(2)
    expect(s.pending).toBe(1)
    expect(s.fed + s.unfed + s.pending).toBe(4)
    expect(s.total).toBe(4)
  })

  test('空列表 pending=0 / unfed=0', () => {
    const s = computeStats([])
    expect(s.pending).toBe(0)
    expect(s.unfed).toBe(0)
  })

  test('未反馈卦例不参与任何维度计数', () => {
    const s = computeStats([
      g({ status: '未反馈', jixiongOk: '对', yingqiOk: '错', fangweiOk: '错' }),
      g({ status: '未反馈', jixiongOk: '错' }),
    ])
    expect(s.fed).toBe(0)
    expect(s.jxOk).toBe(0)
    expect(s.jxBad).toBe(0)
    expect(s.jxRate).toBeNull()
    expect(s.yqOk).toBe(0)
    expect(s.yqBad).toBe(0)
    expect(s.yqRate).toBeNull()
    expect(s.fwOk).toBe(0)
    expect(s.fwBad).toBe(0)
    expect(s.fwRate).toBeNull()
  })
})

describe('computeStats 边界', () => {
  test('空列表：全部为 0，rate 为 null', () => {
    const s = computeStats([])
    expect(s.total).toBe(0)
    expect(s.fed).toBe(0)
    expect(s.unfed).toBe(0)
    expect(s.jxRate).toBeNull()
    expect(s.yqRate).toBeNull()
    expect(s.fwRate).toBeNull()
  })

  test('非数组入参不抛错（防御）', () => {
    expect(computeStats(undefined).total).toBe(0)
    expect(computeStats(null).fed).toBe(0)
  })

  test('全部已反馈但某维度无数据：该维度 rate=null，其余正常', () => {
    const list = [
      g({ status: '已反馈', jixiongOk: '对' }),
      g({ status: '已反馈', jixiongOk: '错' }),
    ]
    const s = computeStats(list)
    expect(s.fed).toBe(2)
    expect(s.jxOk).toBe(1)
    expect(s.jxBad).toBe(1)
    expect(s.jxRate).toBe(0.5)
    // 应期/方位无任何记录 → null
    expect(s.yqRate).toBeNull()
    expect(s.fwRate).toBeNull()
    expect(s.yqOk).toBe(0)
    expect(s.yqBad).toBe(0)
  })

  test("jixiongOk='' 不计入；'留空' 同样不计入", () => {
    const list = [
      g({ status: '已反馈', jixiongOk: '' }), // 未填
      g({ status: '已反馈', jixiongOk: '留空' }), // 留空（DuanInput 三选一）
      g({ status: '已反馈', jixiongOk: '对' }),
    ]
    const s = computeStats(list)
    expect(s.jxOk).toBe(1)
    expect(s.jxBad).toBe(0)
    expect(s.jxRate).toBe(1)
  })

  test('维度全错：rate=0（不是 null）', () => {
    const s = computeStats([
      g({ status: '已反馈', jixiongOk: '错' }),
      g({ status: '已反馈', jixiongOk: '错' }),
    ])
    expect(s.jxRate).toBe(0)
    expect(s.jxBad).toBe(2)
  })

  test('缺字段的脏记录不抛错（防御）', () => {
    const s = computeStats([{ id: 1 }, { status: '已反馈' }])
    expect(s.total).toBe(2)
    expect(s.fed).toBe(1)
    expect(s.jxOk).toBe(0)
    expect(s.jxBad).toBe(0)
    expect(s.jxRate).toBeNull()
  })
})

describe('wrongDims 错题判定', () => {
  test("'错' 才计为错，'对'/'留空'/'' 均不是", () => {
    expect(wrongDims({ jixiongOk: '错', yingqiOk: '错', fangweiOk: '错' })).toEqual({
      jixiong: true,
      yingqi: true,
      fangwei: true,
    })
    expect(wrongDims({ jixiongOk: '对', yingqiOk: '', fangweiOk: '留空' })).toEqual({
      jixiong: false,
      yingqi: false,
      fangwei: false,
    })
    expect(wrongDims({})).toEqual({ jixiong: false, yingqi: false, fangwei: false })
    expect(wrongDims(null)).toEqual({ jixiong: false, yingqi: false, fangwei: false })
  })
})
