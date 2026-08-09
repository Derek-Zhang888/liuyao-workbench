/**
 * ChonghePage 生克冲合页测试
 *
 * 覆盖：三合选项展开/收起、四局单选互斥、与六冲/六合的双向互斥、
 * 选中三合局后圆环图渲染长生→帝旺→墓库带箭头连线与角色标注、取象页爻位顺序。
 */
import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import ChonghePage from './ChonghePage.jsx'

afterEach(() => {
  cleanup()
})

/** 按钮是否处于选中态（toggleCls/sanheSubCls on 态含 bg-goldSoft） */
const isOn = (btn) => btn.className.includes('bg-goldSoft')

/** 定位按钮（按文案；关系表卡片标题同名，须限定 role=button） */
const btnByText = (text) => screen.getByRole('button', { name: text })

describe('ChonghePage 生克冲合页（三合选项）', () => {
  test('默认渲染：六冲/六合开、三合收起且无子选项', () => {
    const { container } = render(<ChonghePage />)
    expect(isOn(btnByText('六冲'))).toBe(true)
    expect(isOn(btnByText('六合'))).toBe(true)
    expect(isOn(btnByText('三合'))).toBe(false)
    expect(screen.queryByText('申子辰·水局')).toBeNull()
    // 默认只画六冲+六合线，无三合箭头线
    expect(container.querySelectorAll('line[marker-end*="arrowSanhe"]').length).toBe(0)
  })

  test('点击三合：展开四局子选项，并自动取消六冲与六合', () => {
    const { container } = render(<ChonghePage />)
    fireEvent.click(btnByText('三合'))

    expect(isOn(btnByText('三合'))).toBe(true)
    expect(isOn(btnByText('六冲'))).toBe(false)
    expect(isOn(btnByText('六合'))).toBe(false)
    for (const t of ['申子辰·水局', '寅午戌·火局', '巳酉丑·金局', '亥卯未·木局']) {
      expect(screen.getByText(t)).toBeTruthy()
    }
    // 展开但未选局：仍无三合连线
    expect(container.querySelectorAll('line[marker-end*="arrowSanhe"]').length).toBe(0)
  })

  test('四局单选：选 A 后 B 自动取消选中，再点已选局则取消', () => {
    render(<ChonghePage />)
    fireEvent.click(btnByText('三合'))

    fireEvent.click(btnByText('申子辰·水局'))
    expect(isOn(btnByText('申子辰·水局'))).toBe(true)
    expect(isOn(btnByText('寅午戌·火局'))).toBe(false)

    fireEvent.click(btnByText('寅午戌·火局'))
    expect(isOn(btnByText('寅午戌·火局'))).toBe(true)
    expect(isOn(btnByText('申子辰·水局'))).toBe(false)

    fireEvent.click(btnByText('寅午戌·火局'))
    expect(isOn(btnByText('寅午戌·火局'))).toBe(false)
  })

  test('选中水局后渲染长生→帝旺→墓库两条带箭头连线与三处角色标注', () => {
    const { container } = render(<ChonghePage />)
    fireEvent.click(btnByText('三合'))
    fireEvent.click(btnByText('申子辰·水局'))

    // 申=长生、子=帝旺、辰=墓库 → 两条箭头线：申→子、子→辰
    const lines = container.querySelectorAll('line[marker-end*="arrowSanhe"]')
    expect(lines.length).toBe(2)
    expect(screen.getByText('长生')).toBeTruthy()
    expect(screen.getByText('帝旺')).toBeTruthy()
    expect(screen.getByText('墓库')).toBeTruthy()
  })

  test('再次点击三合收起子选项并清空选中', () => {
    const { container } = render(<ChonghePage />)
    fireEvent.click(btnByText('三合'))
    fireEvent.click(btnByText('寅午戌·火局'))
    expect(container.querySelectorAll('line[marker-end*="arrowSanhe"]').length).toBe(2)

    fireEvent.click(btnByText('三合'))
    expect(screen.queryByText('申子辰·水局')).toBeNull()
    expect(container.querySelectorAll('line[marker-end*="arrowSanhe"]').length).toBe(0)
    // 三合关闭后，六冲/六合保持关闭（不自动恢复）
    expect(isOn(btnByText('六冲'))).toBe(false)
    expect(isOn(btnByText('六合'))).toBe(false)
  })

  test('开启六合或六冲时自动关闭三合并清空选中', () => {
    const { container } = render(<ChonghePage />)
    fireEvent.click(btnByText('三合'))
    fireEvent.click(btnByText('申子辰·水局'))

    fireEvent.click(btnByText('六合'))
    expect(isOn(btnByText('六合'))).toBe(true)
    expect(isOn(btnByText('三合'))).toBe(false)
    expect(screen.queryByText('申子辰·水局')).toBeNull()
    expect(container.querySelectorAll('line[marker-end*="arrowSanhe"]').length).toBe(0)
  })

  test('四局角色标注均不越出 viewBox(320) 边界（回归：labelPos 裁切）', () => {
    const { container } = render(<ChonghePage />)
    fireEvent.click(btnByText('三合'))
    const VIEW = 320
    // 字形宽高约 20×10，中线需距边缘至少 2px 才不裁切
    for (const t of ['申子辰·水局', '寅午戌·火局', '巳酉丑·金局', '亥卯未·木局']) {
      fireEvent.click(btnByText(t))
      const labels = Array.from(container.querySelectorAll('svg text')).filter((el) =>
        ['长生', '帝旺', '墓库'].includes(el.textContent)
      )
      expect(labels.length).toBe(3)
      for (const el of labels) {
        const x = parseFloat(el.getAttribute('x'))
        const y = parseFloat(el.getAttribute('y'))
        expect(x).toBeGreaterThanOrEqual(2)
        expect(x).toBeLessThanOrEqual(VIEW - 2)
        expect(y).toBeGreaterThanOrEqual(2)
        expect(y).toBeLessThanOrEqual(VIEW - 2)
      }
      fireEvent.click(btnByText(t)) // 取消选中，进入下一局
    }
  })
})
