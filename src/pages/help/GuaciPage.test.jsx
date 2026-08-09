/**
 * GuaciPage 卦辞爻辞页测试
 *
 * 覆盖：详情模式渲染卦辞正文与单爻爻辞，且不再出现「解析：解析整理中…」占位（用户要求删除）。
 */
import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import GuaciPage from './GuaciPage.jsx'

afterEach(() => {
  cleanup()
})

const renderAt = (url) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <GuaciPage />
    </MemoryRouter>
  )

describe('GuaciPage 卦辞爻辞页（解析占位删除）', () => {
  test('卦辞详情页：显示卦辞正文，无「解析整理中」占位', () => {
    renderAt('/help/guaci?gua=乾为天')
    expect(screen.getByText('元亨利贞。')).toBeTruthy()
    expect(screen.queryByText(/解析整理中/)).toBeNull()
    expect(screen.queryByText(/解析：/)).toBeNull()
  })

  test('单爻爻辞视图：显示爻辞正文，无「解析整理中」占位', () => {
    renderAt('/help/yaoci?gua=乾为天&line=0')
    // 「潜龙勿用。」同时出现在选中爻区与爻辞列表，故用 getAllByText
    expect(screen.getAllByText('潜龙勿用。').length).toBeGreaterThan(0)
    expect(screen.queryByText(/解析整理中/)).toBeNull()
    expect(screen.queryByText(/解析：/)).toBeNull()
  })
})
