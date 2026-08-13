/**
 * GuashiCard 卡片标记测试（v1.3.0 拍板 2026-08-14）：
 *   已反馈卡上，应期/方位/取数文本框有内容但未勾对错 → 也要显示灰色标记（预测未反馈）
 */
import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import GuashiCard from './GuashiCard.jsx'

afterEach(cleanup)

const base = {
  id: 1,
  title: '测',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  duanyu: '',
  yingqi: '',
  fangwei: '',
  quShu: '',
  beizhu: '',
  fankui: '',
  jixiong: '',
  status: '未反馈',
  jixiongOk: '',
  yingqiOk: '',
  fangweiOk: '',
  quShuFb: '',
  tags: [],
}

describe('GuashiCard 已反馈未勾维度标记（拍板 2026-08-14）', () => {
  test('已反馈：吉凶勾了对错、应期/方位/取数有文本但未勾 → 显示灰色「应期/方位/数」标记', () => {
    render(
      <GuashiCard
        guashi={{
          ...base,
          fankui: '应验了',
          status: '已反馈',
          jixiong: '吉',
          jixiongOk: '对',
          yingqi: '明日',
          fangwei: '东',
          quShu: '三',
        }}
      />,
    )
    // 吉凶带 ✓（已反馈）
    expect(screen.getByText('吉✓')).toBeTruthy()
    // 应期/方位/取数：显示灰色标记，无 ✓/✗（预测未反馈）
    expect(screen.getByText('应期')).toBeTruthy()
    expect(screen.getByText('方位')).toBeTruthy()
    expect(screen.getByText('数')).toBeTruthy()
    expect(screen.queryByText('应期✓')).toBeNull()
    expect(screen.queryByText('方位✓')).toBeNull()
    expect(screen.queryByText('数准')).toBeNull()
    // 灰色样式（border-border text-muted 分支）
    const yq = screen.getByText('应期').closest('span')
    expect(yq.className).toContain('text-muted')
    expect(yq.className).not.toContain('text-red')
  })

  test('已反馈：应期/方位/取数勾了对错 → 彩色带 ✓/✗（不回归）', () => {
    render(
      <GuashiCard
        guashi={{
          ...base,
          fankui: '应验了',
          status: '已反馈',
          jixiong: '吉',
          jixiongOk: '对',
          yingqi: '明日',
          yingqiOk: '对',
          fangwei: '东',
          fangweiOk: '错',
          quShu: '三',
          quShuFb: '神准',
        }}
      />,
    )
    expect(screen.getByText('应期✓')).toBeTruthy()
    expect(screen.getByText('方位✗')).toBeTruthy()
    expect(screen.getByText('数准')).toBeTruthy()
  })

  test('未反馈：应期/方位/取数有文本显示灰色标记（不回归）', () => {
    render(
      <GuashiCard
        guashi={{ ...base, jixiong: '吉', yingqi: '明日', fangwei: '东', quShu: '三' }}
      />,
    )
    expect(screen.getByText('吉')).toBeTruthy()
    expect(screen.getByText('应期')).toBeTruthy()
    expect(screen.getByText('方位')).toBeTruthy()
    expect(screen.getByText('数')).toBeTruthy()
  })
})
