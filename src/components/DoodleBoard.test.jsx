/**
 * 盘面画板组件测试（v0.2 功能 A）
 * 覆盖：enabled=false 不渲染；工具栏 6 工具切换；外框/填充切换；
 *       pointer 绘制（画笔折线 / 矩形 / 圆形 / 画线 / 箭头）回调 onChange；
 *       文字工具浮层输入落字；撤销（弹末元素）/ 清空。
 * jsdom 无真实布局：mock svg.getBoundingClientRect 为 600x400（viewBox 与容器 1:1）。
 */
import { afterEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import DoodleBoard from './DoodleBoard.jsx'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  sessionStorage.clear() // 工具栏位置等会话状态隔离（避免用例间串扰）
})

const BASE = { version: 1, width: 600, height: 400, elements: [] }

/** mock svg 测量矩形：viewBox=600x400 ↔ 容器像素 1:1，clientX/Y 即画布坐标 */
function mockSvgRect(svg) {
  svg.getBoundingClientRect = () => ({
    left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400, x: 0, y: 0,
    toJSON: () => ({}),
  })
}

/**
 * 派发 pointer 事件（jsdom 25 无 PointerEvent 构造器，用 MouseEvent 承载 clientX/clientY；
 * 组件 handler 仅读取 clientX/clientY/pointerId，pointerId 缺失时 setPointerCapture 走 try/catch）
 */
function firePointer(type, target, { x, y }) {
  const evt = new window.MouseEvent(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y,
  })
  act(() => {
    target.dispatchEvent(evt)
  })
  return evt
}

/** 取最近一次 onChange 的 doodle（elements 数组） */
function lastDoodle(onChange) {
  return onChange.mock.calls[onChange.mock.calls.length - 1][0]
}

/** 绘制序列：pointerDown → pointerMove → pointerUp */
function draw(svg, { from, to }) {
  firePointer('pointerdown', svg, { x: from[0], y: from[1] })
  firePointer('pointermove', svg, { x: to[0], y: to[1] })
  firePointer('pointerup', svg, { x: to[0], y: to[1] })
}

describe('DoodleBoard 渲染与开关', () => {
  test('enabled=false → 不渲染工具栏/覆盖层（不拦截点击）', () => {
    const { container } = render(
      <DoodleBoard enabled={false} doodle={null} onChange={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
    expect(screen.queryByText('画笔')).toBeNull()
  })

  test('enabled=true → 工具栏与 SVG 覆盖层渲染', () => {
    const { container } = render(<DoodleBoard enabled doodle={BASE} onChange={vi.fn()} />)
    expect(screen.getByText('画笔')).toBeTruthy()
    expect(screen.getByText('文字')).toBeTruthy()
    expect(screen.getByText('矩形')).toBeTruthy()
    expect(screen.getByText('圆形')).toBeTruthy()
    expect(screen.getByText('画线')).toBeTruthy()
    expect(screen.getByText('箭头')).toBeTruthy()
    expect(screen.getByText('橡皮擦')).toBeTruthy()
    expect(screen.getByText('后退')).toBeTruthy() // v0.10 改进建7 #1：撤销 → 后退
    expect(screen.getByText('前进')).toBeTruthy() // v0.10 改进建7 #1：重做 → 前进
    expect(screen.getByText('清空')).toBeTruthy()
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg.getAttribute('viewBox')).toBe('0 0 600 400')
    expect(svg.getAttribute('preserveAspectRatio')).toBe('none')
  })

  test('容器测量兜底：无 doodle 尺寸时用容器实测（jsdom 为 0 → 600x400 兜底）', () => {
    const { container } = render(<DoodleBoard enabled doodle={null} onChange={vi.fn()} />)
    expect(container.querySelector('svg').getAttribute('viewBox')).toBe('0 0 600 400')
  })
})

describe('DoodleBoard 工具绘制', () => {
  test('默认画笔：pointer 绘制折线 → onChange 追加 pen 元素', async () => {
    const onChange = vi.fn()
    const { container } = render(<DoodleBoard enabled doodle={BASE} onChange={onChange} />)
    const svg = container.querySelector('svg')
    mockSvgRect(svg)
    draw(svg, { from: [10, 20], to: [50, 80] })
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const d = lastDoodle(onChange)
    expect(d.elements).toHaveLength(1)
    expect(d.elements[0]).toMatchObject({
      type: 'pen',
      color: '#e74c3c',
      width: 4,
      points: [{ x: 10, y: 20 }, { x: 50, y: 80 }],
    })
  })

  test('矩形工具：外框模式绘制矩形（负向拖拽归一化）', async () => {
    const onChange = vi.fn()
    const { container } = render(<DoodleBoard enabled doodle={BASE} onChange={onChange} />)
    fireEvent.click(screen.getByText('矩形'))
    const svg = container.querySelector('svg')
    mockSvgRect(svg)
    draw(svg, { from: [110, 70], to: [10, 20] })
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(lastDoodle(onChange).elements[0]).toMatchObject({
      type: 'rect', x: 10, y: 20, w: 100, h: 50, color: '#e74c3c', strokeWidth: 4, fill: false,
    })
  })

  test('圆形/画线/箭头工具各自产出对应元素', async () => {
    const cases = [
      { tool: '圆形', expectType: 'circle' },
      { tool: '画线', expectType: 'line' },
      { tool: '箭头', expectType: 'arrow' },
    ]
    for (const c of cases) {
      cleanup() // 每用例独立渲染，避免按钮文本重复命中
      const onChange = vi.fn()
      const { container } = render(<DoodleBoard enabled doodle={BASE} onChange={onChange} />)
      fireEvent.click(screen.getByText(c.tool))
      const svg = container.querySelector('svg')
      mockSvgRect(svg)
      draw(svg, { from: [0, 0], to: [100, 100] })
      await waitFor(() => expect(onChange).toHaveBeenCalled())
      expect(lastDoodle(onChange).elements[0].type).toBe(c.expectType)
    }
  })

  test('外框/填充切换：开启填充后矩形 fill=true', async () => {
    const onChange = vi.fn()
    const { container } = render(<DoodleBoard enabled doodle={BASE} onChange={onChange} />)
    fireEvent.click(screen.getByText('矩形'))
    fireEvent.click(screen.getByText('外框')) // 切换为「填充」
    const svg = container.querySelector('svg')
    mockSvgRect(svg)
    draw(svg, { from: [0, 0], to: [50, 50] })
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(lastDoodle(onChange).elements[0].fill).toBe(true)
  })

  test('文字工具：点画布弹输入，回车确认落字（字号=文字槽粗细，默认 20）', async () => {
    const onChange = vi.fn()
    const { container } = render(<DoodleBoard enabled doodle={BASE} onChange={onChange} />)
    fireEvent.click(screen.getByText('文字'))
    const svg = container.querySelector('svg')
    mockSvgRect(svg)
    firePointer('pointerdown', svg, { x: 120, y: 90 })
    const input = await screen.findByPlaceholderText('输入文字，回车确认')
    fireEvent.change(input, { target: { value: '测卦' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(lastDoodle(onChange).elements[0]).toMatchObject({
      type: 'text', x: 120, y: 90, text: '测卦', size: 20, color: '#e74c3c',
    })
  })

  test('后退弹末元素入 redo / 前进弹回 / 清空空全部（v0.10 redo 栈 + 文案）', async () => {
    const onChange = vi.fn()
    // 预置两个元素
    const withTwo = { ...BASE, elements: [
      { type: 'pen', color: '#e74c3c', width: 4, points: [{ x: 0, y: 0 }] },
      { type: 'line', x1: 0, y1: 0, x2: 10, y2: 10, color: '#e74c3c', strokeWidth: 4 },
    ] }
    const { container, rerender } = render(<DoodleBoard enabled doodle={withTwo} onChange={onChange} />)
    fireEvent.click(screen.getByText('后退'))
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const afterUndo = lastDoodle(onChange)
    expect(afterUndo.elements).toHaveLength(1)
    expect(afterUndo.redo).toHaveLength(1) // 末元素压入 redo 栈

    // 父组件更新 doodle prop（受控组件）后点「前进」：从 redo 弹回
    rerender(<DoodleBoard enabled doodle={afterUndo} onChange={onChange} />)
    fireEvent.click(screen.getByText('前进'))
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2))
    const afterRedo = lastDoodle(onChange)
    expect(afterRedo.elements).toHaveLength(2)
    expect(afterRedo.redo).toEqual([])

    rerender(<DoodleBoard enabled doodle={afterRedo} onChange={onChange} />)
    fireEvent.click(screen.getByText('清空'))
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(3))
    expect(lastDoodle(onChange).elements).toEqual([])
    expect(lastDoodle(onChange).redo).toEqual([])
    // 空元素时后退/前进/清空禁用（v0.10 增前进按钮 → 3 个禁用）
    // 工具栏经 createPortal 渲染到 body，同测试可能并存多个工具栏 → 取最新（最后）一个
    render(<DoodleBoard enabled doodle={BASE} onChange={vi.fn()} />)
    const toolbars = [...document.querySelectorAll('[data-testid="doodle-toolbar"]')]
    expect(toolbars.at(-1).querySelectorAll('button:disabled')).toHaveLength(3)
  })

  test('新画动作清空 redo 栈（提交元素后重做不可用）', async () => {
    const onChange = vi.fn()
    // 预置：1 元素 + redo 栈 1 项
    const d = { ...BASE, elements: [
      { type: 'pen', color: '#e74c3c', width: 4, points: [{ x: 0, y: 0 }] },
    ], redo: [
      { type: 'line', x1: 0, y1: 0, x2: 5, y2: 5, color: '#e74c3c', strokeWidth: 4 },
    ] }
    const { container } = render(<DoodleBoard enabled doodle={d} onChange={onChange} />)
    const svg = container.querySelector('svg')
    mockSvgRect(svg)
    draw(svg, { from: [0, 0], to: [30, 30] }) // 新画 → commit 清空 redo
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const after = lastDoodle(onChange)
    expect(after.elements).toHaveLength(2)
    expect(after.redo).toEqual([]) // 新画动作清空重做历史
  })

  test('根节点 onClick stopPropagation（拦截爻位跳转）', () => {
    const onChange = vi.fn()
    const { container } = render(<DoodleBoard enabled doodle={BASE} onChange={onChange} />)
    const root = container.firstChild
    const evt = new window.MouseEvent('click', { bubbles: true, cancelable: true })
    const spy = vi.spyOn(evt, 'stopPropagation')
    act(() => {
      root.dispatchEvent(evt)
    })
    expect(spy).toHaveBeenCalled()
  })
})

describe('DoodleBoard v0.10 改进建7 #1（橡皮擦/文字修复/箭头/工具栏）', () => {
  test('橡皮擦：点击元素删除并压入 redo，可后退还原', async () => {
    const onChange = vi.fn()
    const withTwo = { ...BASE, elements: [
      { type: 'pen', color: '#e74c3c', width: 4, points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] },
      { type: 'line', x1: 0, y1: 0, x2: 20, y2: 20, color: '#e74c3c', strokeWidth: 4 },
    ] }
    const { container, rerender } = render(<DoodleBoard enabled doodle={withTwo} onChange={onChange} />)
    fireEvent.click(screen.getByText('橡皮擦'))
    const svg = container.querySelector('svg')
    mockSvgRect(svg)
    // 第一个元素外包 <g>（含 path）
    const groups = svg.querySelectorAll('g')
    expect(groups.length).toBeGreaterThanOrEqual(2)
    fireEvent.click(groups[0])
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const after = lastDoodle(onChange)
    expect(after.elements).toHaveLength(1)
    expect(after.elements[0].type).toBe('line')
    expect(after.redo).toHaveLength(1) // 被删元素入 redo 栈（可撤销）
    // 后退还原
    rerender(<DoodleBoard enabled doodle={after} onChange={onChange} />)
    fireEvent.click(screen.getByText('后退'))
    await waitFor(() => expect(onChange.mock.calls.length).toBeGreaterThan(1))
    const restored = lastDoodle(onChange)
    expect(restored.elements).toHaveLength(2)
    expect(restored.elements[0].type).toBe('pen')
  })

  test('橡皮擦点击空白区不产生绘制/删除', () => {
    const noDraw = vi.fn()
    const { container } = render(<DoodleBoard enabled doodle={BASE} onChange={noDraw} />)
    fireEvent.click(screen.getByText('橡皮擦'))
    const svg = container.querySelector('svg')
    mockSvgRect(svg)
    draw(svg, { from: [10, 10], to: [50, 50] }) // pointerdown/up 不启动绘制
    expect(noDraw).not.toHaveBeenCalled()
  })

  test('混合 redo 栈：栈顶为橡皮擦记录时「前进」禁用且不把 erase 记录当元素追加（QA #1b）', async () => {
    const onChange = vi.fn()
    // 画 3 元素 → 后退×2（redo=[C,B]）→ 橡皮擦删除剩余元素（redo=[C,B,{erase}]）
    const mixed = { ...BASE, elements: [], redo: [
      { type: 'pen', color: '#e74c3c', width: 4, points: [{ x: 0, y: 0 }] },
      { type: 'line', x1: 0, y1: 0, x2: 5, y2: 5, color: '#e74c3c', strokeWidth: 4 },
      { op: 'erase', index: 0, element: { type: 'text', x: 1, y: 2, text: 'A', size: 12, color: '#fff' } },
    ] }
    const { rerender } = render(<DoodleBoard enabled doodle={mixed} onChange={onChange} />)
    // 栈顶为 erase → 前进禁用（擦除记录仅服务后退）
    expect(screen.getByText('前进').disabled).toBe(true)
    // 后退：消费 erase 记录按原位还原元素 → redo 恢复普通元素 → 前进启用
    fireEvent.click(screen.getByText('后退'))
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const afterUndo = lastDoodle(onChange)
    expect(afterUndo.elements).toEqual([{ type: 'text', x: 1, y: 2, text: 'A', size: 12, color: '#fff' }])
    rerender(<DoodleBoard enabled doodle={afterUndo} onChange={onChange} />)
    expect(screen.getByText('前进').disabled).toBe(false)
    // 前进：弹出普通元素，绝无 erase 垃圾对象混入 elements
    fireEvent.click(screen.getByText('前进'))
    await waitFor(() => expect(onChange.mock.calls.length).toBeGreaterThan(1))
    const afterRedo = lastDoodle(onChange)
    expect(afterRedo.elements.every((e) => !(e && e.op === 'erase'))).toBe(true)
    expect(afterRedo.elements).toHaveLength(2)
  })

  test('文字工具：Enter 确认后不重复落字（修复 onBlur 二次提交）', async () => {
    const onChange = vi.fn()
    const { container } = render(<DoodleBoard enabled doodle={BASE} onChange={onChange} />)
    fireEvent.click(screen.getByText('文字'))
    const svg = container.querySelector('svg')
    mockSvgRect(svg)
    firePointer('pointerdown', svg, { x: 120, y: 90 })
    const input = await screen.findByPlaceholderText('输入文字，回车确认')
    fireEvent.change(input, { target: { value: '测卦' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    // 浮层已卸载 → 不再触发 onBlur 二次提交
    expect(screen.queryByPlaceholderText('输入文字，回车确认')).toBeNull()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(lastDoodle(onChange).elements).toHaveLength(1)
  })

  test('文字工具：Escape 取消不落字', async () => {
    const onChange2 = vi.fn()
    const { container: c2 } = render(<DoodleBoard enabled doodle={BASE} onChange={onChange2} />)
    fireEvent.click(screen.getByText('文字'))
    const svg2 = c2.querySelector('svg')
    mockSvgRect(svg2)
    firePointer('pointerdown', svg2, { x: 120, y: 90 })
    const input2 = await screen.findByPlaceholderText('输入文字，回车确认')
    fireEvent.change(input2, { target: { value: '取消' } })
    fireEvent.keyDown(input2, { key: 'Escape' })
    expect(onChange2).not.toHaveBeenCalled()
  })

  test('箭头线末端精确落在箭头尖点（不再 round 线帽超出箭头尖）', async () => {
    const onChange = vi.fn()
    const { container } = render(<DoodleBoard enabled doodle={BASE} onChange={onChange} />)
    fireEvent.click(screen.getByText('箭头'))
    const svg = container.querySelector('svg')
    mockSvgRect(svg)
    draw(svg, { from: [0, 0], to: [100, 100] })
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const el = lastDoodle(onChange).elements[0]
    expect(el.type).toBe('arrow')
    // 重渲染含 <line> 与箭头 <polygon>，line 不设 round 线帽
    const { container: c2 } = render(<DoodleBoard enabled doodle={{ ...BASE, elements: [el] }} onChange={vi.fn()} />)
    const line = c2.querySelector('g line')
    expect(line.getAttribute('stroke-linecap')).toBeNull()
    // 序列化端 doodleToSvg 同样不带 stroke-linecap（导出与画板一致）
    const { doodleToSvg } = await import('../engine/doodleSvg.js')
    expect(doodleToSvg({ ...BASE, elements: [el] })).not.toContain('stroke-linecap')
  })

  test('工具栏可拖拽移动且位置持久化 sessionStorage（v0.10 #1）', () => {
    const onChange = vi.fn()
    const { container } = render(<DoodleBoard enabled doodle={BASE} onChange={onChange} />)
    const handle = screen.getByTitle('拖动移动工具栏')
    // 默认位置 (8,8)；拖拽增量 (100,50) → 期望 (108,58)
    firePointer('pointerdown', handle, { x: 10, y: 10 })
    firePointer('pointermove', handle, { x: 110, y: 60 })
    firePointer('pointerup', handle, { x: 110, y: 60 })
    // 工具栏容器 fixed 定位 left/top 更新
    const toolbar = document.querySelector('[data-testid="doodle-toolbar"]')
    expect(toolbar.style.left).toBe('108px')
    expect(toolbar.style.top).toBe('58px')
    expect(sessionStorage.getItem('liuyao-doodle-toolbar')).toContain('108')
  })
})

describe('DoodleBoard v0.10 改进建8 #1（箭头缩放/文字色/文字橡皮擦/工具栏自由移动）', () => {
  test('文字元素可被橡皮擦元素级删除，后退还原（确认 text 在 elements 中可命中删除）', async () => {
    const onChange = vi.fn()
    const withText = {
      ...BASE,
      elements: [
        { type: 'text', x: 120, y: 90, text: '测卦', size: 20, color: '#e74c3c' },
        { type: 'line', x1: 0, y1: 0, x2: 20, y2: 20, color: '#e74c3c', strokeWidth: 4 },
      ],
    }
    const { container, rerender } = render(<DoodleBoard enabled doodle={withText} onChange={onChange} />)
    fireEvent.click(screen.getByText('橡皮擦'))
    const svg = container.querySelector('svg')
    mockSvgRect(svg)
    // 第一个元素外包 <g>（text 元素在 g 内）
    const groups = svg.querySelectorAll('g')
    expect(groups.length).toBeGreaterThanOrEqual(2)
    fireEvent.click(groups[0])
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const after = lastDoodle(onChange)
    expect(after.elements).toHaveLength(1)
    expect(after.elements[0].type).toBe('line')
    expect(after.redo).toHaveLength(1) // 被删文字入 redo 栈（可撤销）
    // 后退还原文字
    rerender(<DoodleBoard enabled doodle={after} onChange={onChange} />)
    fireEvent.click(screen.getByText('后退'))
    await waitFor(() => expect(onChange.mock.calls.length).toBeGreaterThan(1))
    const restored = lastDoodle(onChange)
    expect(restored.elements).toHaveLength(2)
    expect(restored.elements[0].type).toBe('text')
    expect(restored.elements[0].text).toBe('测卦')
  })

  test('文字颜色随当前选中画笔颜色（与色板一致）', async () => {
    const onChange = vi.fn()
    const { container } = render(<DoodleBoard enabled doodle={BASE} onChange={onChange} />)
    fireEvent.click(screen.getByText('文字'))
    // 换色：预设色板按钮（aria-label=颜色 #3498db）
    fireEvent.click(screen.getByLabelText('颜色 #3498db'))
    const svg = container.querySelector('svg')
    mockSvgRect(svg)
    firePointer('pointerdown', svg, { x: 120, y: 90 })
    const input = await screen.findByPlaceholderText('输入文字，回车确认')
    fireEvent.change(input, { target: { value: '测卦' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(lastDoodle(onChange).elements[0]).toMatchObject({ type: 'text', color: '#3498db' })
  })

  test('箭头随粗细缩放：粗线箭头多边形大于细线（渲染端与序列化端同步）', async () => {
    const mk = (strokeWidth) => ({
      ...BASE,
      elements: [{ type: 'arrow', x1: 0, y1: 0, x2: 100, y2: 0, color: '#e74c3c', strokeWidth }],
    })
    const c1 = render(<DoodleBoard enabled doodle={mk(1)} onChange={vi.fn()} />)
    const c2 = render(<DoodleBoard enabled doodle={mk(30)} onChange={vi.fn()} />)
    const pts = (c) => c.container.querySelector('g polygon').getAttribute('points')
    const span = (p) => {
      const nums = p.split(/[\s,]+/).map(Number)
      return Math.max(...nums) - Math.min(...nums)
    }
    expect(span(pts(c2))).toBeGreaterThan(span(pts(c1)))
    // 序列化端（md 导出）同口径：粗线多边形更大
    const { doodleToSvg } = await import('../engine/doodleSvg.js')
    const s1 = /<polygon points="([\d.,\s-]+)"/.exec(doodleToSvg(mk(1)))[1]
    const s30 = /<polygon points="([\d.,\s-]+)"/.exec(doodleToSvg(mk(30)))[1]
    expect(span(s30)).toBeGreaterThan(span(s1))
  })

  test('工具栏自由移动：放开边界限制，可拖到负坐标（v0.10 改进建8 #1）', () => {
    const onChange = vi.fn()
    const { container } = render(<DoodleBoard enabled doodle={BASE} onChange={onChange} />)
    const handle = screen.getByTitle('拖动移动工具栏')
    // 默认 (8,8)；向左上拖拽（增量 -100,-60）→ 允许负坐标，不再 Math.max(0,…) 钳制
    firePointer('pointerdown', handle, { x: 20, y: 20 })
    firePointer('pointermove', handle, { x: -80, y: -40 })
    firePointer('pointerup', handle, { x: -80, y: -40 })
    const toolbar = document.querySelector('[data-testid="doodle-toolbar"]')
    expect(toolbar.style.left).toBe('-92px')
    expect(toolbar.style.top).toBe('-52px')
    expect(sessionStorage.getItem('liuyao-doodle-toolbar')).toContain('-92')
  })
})

describe('DoodleBoard 改进建9 #1（文字浮层可见性 / 工具栏 fixed 页面级自由移动）', () => {
  test('文字工具：pointerdown 阻止默认行为，浮层保持打开（修复浏览器自动失焦竞态）', async () => {
    const onChange = vi.fn()
    const { container } = render(<DoodleBoard enabled doodle={BASE} onChange={onChange} />)
    fireEvent.click(screen.getByText('文字'))
    const svg = container.querySelector('svg')
    mockSvgRect(svg)
    // 关键守卫：text 工具 pointerdown 必须 preventDefault，否则浏览器默认动作
    // （焦点移到 SVG/body）会让刚 autoFocus 的浮层 input 立即 blur → 输入框一闪而过
    const evt = firePointer('pointerdown', svg, { x: 120, y: 90 })
    expect(evt.defaultPrevented).toBe(true)
    // 浮层稳定打开（未因自动失焦而关闭），用户可见可输入
    expect(await screen.findByPlaceholderText('输入文字，回车确认')).toBeTruthy()
  })

  test('文字工具：打开浮层后立即 blur（不输入）→ 浮层关闭、不落字、不残留', async () => {
    const onChange = vi.fn()
    const { container } = render(<DoodleBoard enabled doodle={BASE} onChange={onChange} />)
    fireEvent.click(screen.getByText('文字'))
    const svg = container.querySelector('svg')
    mockSvgRect(svg)
    firePointer('pointerdown', svg, { x: 120, y: 90 })
    const input = await screen.findByPlaceholderText('输入文字，回车确认')
    // 用户未输入任何内容 → 立即失焦（如误点画布其他处 / WebView 自动失焦）
    fireEvent.blur(input)
    // 浮层关闭且不残留
    expect(screen.queryByPlaceholderText('输入文字，回车确认')).toBeNull()
    expect(screen.queryByText('测卦')).toBeNull()
    // 不落字：无 onChange 调用、无 text 元素残留
    expect(onChange).not.toHaveBeenCalled()
    expect(container.querySelectorAll('text')).toHaveLength(0)
  })

  test('文字工具：调色板 input[type=color] 换色 → 新文字用新色', async () => {
    const onChange = vi.fn()
    const { container } = render(<DoodleBoard enabled doodle={BASE} onChange={onChange} />)
    fireEvent.click(screen.getByText('文字'))
    // 调色板（非预设按钮）换色
    fireEvent.change(document.querySelector('input[type="color"]'), { target: { value: '#2ecc71' } })
    const svg = container.querySelector('svg')
    mockSvgRect(svg)
    firePointer('pointerdown', svg, { x: 120, y: 90 })
    const input = await screen.findByPlaceholderText('输入文字，回车确认')
    fireEvent.change(input, { target: { value: '测卦' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(lastDoodle(onChange).elements[0]).toMatchObject({ type: 'text', color: '#2ecc71' })
  })

  test('文字浮层定位兜底：点击靠近右/下边缘时输入框仍在画布内（不被 overflow 裁剪）', async () => {
    const onChange = vi.fn()
    const { container } = render(<DoodleBoard enabled doodle={BASE} onChange={onChange} />)
    fireEvent.click(screen.getByText('文字'))
    const svg = container.querySelector('svg')
    mockSvgRect(svg)
    // 点击画布右下角 (595, 395)：输入框宽约 190、高约 34，不钳制会溢出容器
    firePointer('pointerdown', svg, { x: 595, y: 395 })
    const input = await screen.findByPlaceholderText('输入文字，回车确认')
    const wrap = input.parentElement
    const leftPct = parseFloat(wrap.style.left)
    const topPct = parseFloat(wrap.style.top)
    // 钳制在画布内：left ≤ (600-190)/600=68.33%，top ≤ (400-34)/400=91.5%
    expect(leftPct).toBeGreaterThanOrEqual(0)
    expect(topPct).toBeGreaterThanOrEqual(0)
    expect(leftPct).toBeLessThanOrEqual(((600 - 190) / 600) * 100 + 1e-6)
    expect(topPct).toBeLessThanOrEqual(((400 - 34) / 400) * 100 + 1e-6)
  })

  test('工具栏 fixed 视口级定位：style position=fixed，left/top 来自 toolbarPos', () => {
    const onChange = vi.fn()
    const { container } = render(<DoodleBoard enabled doodle={BASE} onChange={onChange} />)
    const toolbar = document.querySelector('[data-testid="doodle-toolbar"]')
    expect(toolbar.style.position).toBe('fixed')
    // jsdom 容器 rect 全 0 → 默认位置 (8,8)
    expect(toolbar.style.left).toBe('8px')
    expect(toolbar.style.top).toBe('8px')
  })

  test('工具栏拖拽更新 toolbarPos 并持久化 sessionStorage（fixed 视口坐标直接累加）', () => {
    const onChange = vi.fn()
    const { container } = render(<DoodleBoard enabled doodle={BASE} onChange={onChange} />)
    const handle = screen.getByTitle('拖动移动工具栏')
    // fixed 视口定位：拖拽增量 (150, 80) → (158, 88)
    firePointer('pointerdown', handle, { x: 30, y: 20 })
    firePointer('pointermove', handle, { x: 180, y: 100 })
    firePointer('pointerup', handle, { x: 180, y: 100 })
    const toolbar = document.querySelector('[data-testid="doodle-toolbar"]')
    expect(toolbar.style.left).toBe('158px')
    expect(toolbar.style.top).toBe('88px')
    expect(sessionStorage.getItem('liuyao-doodle-toolbar')).toContain('158')
  })

  test('工具栏随 DoodleBoard 卸载自动移除（离开页面无残留，无 portal）', () => {
    const onChange = vi.fn()
    const { container, unmount } = render(<DoodleBoard enabled doodle={BASE} onChange={onChange} />)
    expect(document.querySelector('[data-testid="doodle-toolbar"]')).toBeTruthy()
    unmount()
    // 组件卸载 → fixed 工具栏从 DOM 移除（不依赖路由/页面，直接随组件消失）
    expect(document.querySelector('[data-testid="doodle-toolbar"]')).toBeNull()
    expect(container.firstChild).toBeNull()
  })

  test('箭头两端一致：同一线宽下渲染端与序列化端多边形尺寸完全相同', async () => {
    const mk = (strokeWidth) => ({
      ...BASE,
      elements: [{ type: 'arrow', x1: 0, y1: 0, x2: 100, y2: 0, color: '#e74c3c', strokeWidth }],
    })
    const { doodleToSvg } = await import('../engine/doodleSvg.js')
    const span = (p) => {
      const nums = p.split(/[\s,]+/).map(Number)
      return Math.max(...nums) - Math.min(...nums)
    }
    for (const w of [1, 4, 12, 24, 30]) {
      const { container } = render(<DoodleBoard enabled doodle={mk(w)} onChange={vi.fn()} />)
      const jsxPts = container.querySelector('g polygon').getAttribute('points')
      const svgPts = /<polygon points="([\d.,\s-]+)"/.exec(doodleToSvg(mk(w)))[1]
      expect(span(jsxPts)).toBe(span(svgPts))
      cleanup()
    }
  })
})

describe('DoodleBoard 四角拖拽调形（浮窗形状可变，功能跟随布局）', () => {
  const inner = (container) =>
    document.querySelector('[data-testid="doodle-toolbar"] > div:first-child')

  test('渲染四个边角拖拽把手（nw/ne/sw/se）', () => {
    const { container } = render(<DoodleBoard enabled doodle={BASE} onChange={vi.fn()} />)
    for (const c of ['nw', 'ne', 'sw', 'se']) {
      const h = document.querySelector(`[data-testid="resize-${c}"]`)
      expect(h).toBeTruthy()
    }
    // 未拖拽前：宽度/高度自适应内容（style 无固定值）
    expect(inner(container).style.width).toBe('')
    expect(inner(container).style.minHeight).toBe('')
  })

  test('拖动 SE 角：宽度/高度随拖拽增量变化（min 钳制 220x40）', () => {
    const { container } = render(<DoodleBoard enabled doodle={BASE} onChange={vi.fn()} />)
    const se = document.querySelector('[data-testid="resize-se"]')
    // jsdom 无布局 → 起始兜底 300x48；SE 拖 +120,+60 → 420x108
    firePointer('pointerdown', se, { x: 100, y: 100 })
    firePointer('pointermove', se, { x: 220, y: 160 })
    firePointer('pointerup', se, { x: 220, y: 160 })
    expect(inner(container).style.width).toBe('420px')
    expect(inner(container).style.minHeight).toBe('108px')
    // 持久化含尺寸
    expect(sessionStorage.getItem('liuyao-doodle-toolbar')).toContain('420')
  })

  test('拖动 NW 角：向右下拖增量反向生效（缩窄变矮）且不低于下限', () => {
    const { container } = render(<DoodleBoard enabled doodle={BASE} onChange={vi.fn()} />)
    const nw = document.querySelector('[data-testid="resize-nw"]')
    // 起始兜底 300x48；NW 向右下拖 +200,+100 → 100x-52 → clamp 到 220x40
    firePointer('pointerdown', nw, { x: 50, y: 50 })
    firePointer('pointermove', nw, { x: 250, y: 150 })
    firePointer('pointerup', nw, { x: 250, y: 150 })
    expect(inner(container).style.width).toBe('220px')
    expect(inner(container).style.minHeight).toBe('40px')
  })

  test('拖拽调形不改变工具栏位置（left/top 不动）', () => {
    const { container } = render(<DoodleBoard enabled doodle={BASE} onChange={vi.fn()} />)
    const se = document.querySelector('[data-testid="resize-se"]')
    firePointer('pointerdown', se, { x: 100, y: 100 })
    firePointer('pointermove', se, { x: 200, y: 150 })
    firePointer('pointerup', se, { x: 200, y: 150 })
    const toolbar = document.querySelector('[data-testid="doodle-toolbar"]')
    expect(toolbar.style.left).toBe('8px')
    expect(toolbar.style.top).toBe('8px')
  })

  test('已存尺寸重新挂载即恢复（sessionStorage 持久化）', () => {
    sessionStorage.setItem('liuyao-doodle-toolbar', JSON.stringify({ x: 30, y: 40, w: 360, h: 90 }))
    const { container } = render(<DoodleBoard enabled doodle={BASE} onChange={vi.fn()} />)
    expect(inner(container).style.width).toBe('360px')
    expect(inner(container).style.minHeight).toBe('90px')
  })
})

describe('DoodleBoard 粗细双槽记忆（文字/绘制独立）', () => {
  const slider = (container) => document.querySelector('input[type="range"]')

  test('默认画笔 4；点文字工具 → 粗细自动变 20（文字槽默认）', () => {
    const { container } = render(<DoodleBoard enabled doodle={BASE} onChange={vi.fn()} />)
    expect(slider(container).value).toBe('4')
    fireEvent.click(screen.getByText('文字'))
    expect(slider(container).value).toBe('20')
  })

  test('文字槽独立记忆：文字调 30 → 切画笔回 4 → 切回文字恢复 30', () => {
    const { container } = render(<DoodleBoard enabled doodle={BASE} onChange={vi.fn()} />)
    fireEvent.click(screen.getByText('文字'))
    fireEvent.change(slider(container), { target: { value: '30' } })
    expect(slider(container).value).toBe('30')
    fireEvent.click(screen.getByText('画笔'))
    expect(slider(container).value).toBe('4')
    fireEvent.click(screen.getByText('文字'))
    expect(slider(container).value).toBe('30')
  })

  test('绘制槽共享记忆：画笔调 8 → 切文字 20 → 切回画笔 8', () => {
    const { container } = render(<DoodleBoard enabled doodle={BASE} onChange={vi.fn()} />)
    fireEvent.change(slider(container), { target: { value: '8' } })
    fireEvent.click(screen.getByText('文字'))
    expect(slider(container).value).toBe('20')
    fireEvent.click(screen.getByText('画笔'))
    expect(slider(container).value).toBe('8')
  })

  test('文字落字字号用文字槽当前值（size=30），绘制元素用绘制槽', async () => {
    const onChange = vi.fn()
    const { container } = render(<DoodleBoard enabled doodle={BASE} onChange={onChange} />)
    // 画笔调 8 → 画一条线（width=8，绘制槽）
    fireEvent.change(slider(container), { target: { value: '8' } })
    const svg = container.querySelector('svg')
    mockSvgRect(svg)
    draw(svg, { from: [10, 10], to: [50, 50] })
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(lastDoodle(onChange).elements[0]).toMatchObject({ type: 'pen', width: 8 })
    // 文字槽调 30 → 落字 size=30（与绘制槽互不干扰；受控 doodle 每次基于 BASE 追加，取 elements[0]）
    fireEvent.click(screen.getByText('文字'))
    fireEvent.change(slider(container), { target: { value: '30' } })
    firePointer('pointerdown', svg, { x: 120, y: 90 })
    const input = await screen.findByPlaceholderText('输入文字，回车确认')
    fireEvent.change(input, { target: { value: '测' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(onChange.mock.calls.length).toBeGreaterThan(1))
    expect(lastDoodle(onChange).elements[0]).toMatchObject({ type: 'text', size: 30 })
  })

  test('双槽 sessionStorage 持久化：重挂载恢复各自记忆', () => {
    sessionStorage.setItem('liuyao-doodle-width', JSON.stringify({ draw: 9, text: 25 }))
    const { container } = render(<DoodleBoard enabled doodle={BASE} onChange={vi.fn()} />)
    expect(slider(container).value).toBe('9') // 初始画笔 = 绘制槽
    fireEvent.click(screen.getByText('文字'))
    expect(slider(container).value).toBe('25') // 文字槽
  })
})
