/**
 * NayinPage 纳音页测试
 *
 * 覆盖：六旬标题行均带旬空标注（如「甲子旬（戌亥空）」）；
 * 旬空数据与 NAYIN_60 自洽（每旬 10 组干支缺的两个地支恰为该旬旬空）。
 */
import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import NayinPage from './NayinPage.jsx'
import { NAYIN_60, NAYIN_XUN, NAYIN_XUN_KONG } from '../../data/helpData.js'
import { ZHI } from '../../engine/ganzhi.js'

afterEach(() => {
  cleanup()
})

describe('NayinPage 纳音页（旬空标注）', () => {
  test('六旬标题行均渲染「X旬（XX空）」', () => {
    render(<NayinPage />)
    const expected = [
      '甲子旬（戌亥空）',
      '甲戌旬（申酉空）',
      '甲申旬（午未空）',
      '甲午旬（辰巳空）',
      '甲辰旬（寅卯空）',
      '甲寅旬（子丑空）',
    ]
    for (const t of expected) {
      expect(screen.getByText(t)).toBeTruthy()
    }
  })

  test('旬空数据与 NAYIN_60 自洽：每旬 10 组缺的两个地支 = 旬空', () => {
    expect(NAYIN_XUN.length).toBe(NAYIN_XUN_KONG.length)
    for (let x = 0; x < NAYIN_XUN.length; x += 1) {
      const group = NAYIN_60.slice(x * 10, x * 10 + 10)
      expect(group.length).toBe(10)
      const used = new Set(group.map((g) => g.gz[1]))
      const missing = ZHI.filter((z) => !used.has(z)).join('')
      expect(missing).toBe(NAYIN_XUN_KONG[x])
    }
  })
})
