/**
 * QuXiangPage 取象页测试
 *
 * 覆盖：爻位取象表格按「上爻在最上面、初爻在最下面」展示（数据源仍为初→上）。
 */
import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import QuXiangPage from './QuXiangPage.jsx'

afterEach(() => {
  cleanup()
})

describe('QuXiangPage 取象页（爻位顺序）', () => {
  test('爻位取象：上爻在第一行、初爻在最后一行', () => {
    const { container } = render(<QuXiangPage />)
    const rows = Array.from(container.querySelectorAll('table'))[0]?.querySelectorAll('tbody tr') ?? []

    expect(rows.length).toBe(6)
    expect(rows[0].textContent).toContain('上爻')
    expect(rows[1].textContent).toContain('五爻')
    expect(rows[4].textContent).toContain('二爻')
    expect(rows[5].textContent).toContain('初爻')
    expect(screen.getByText('头（顶部）')).toBeTruthy()
    expect(screen.getByText('足（脚）')).toBeTruthy()
  })
})
