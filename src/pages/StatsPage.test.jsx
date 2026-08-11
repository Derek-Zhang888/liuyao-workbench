/**
 * 统计页测试（v0.2 功能 H/J）
 *
 * 覆盖：
 *   - 总览卡新增「待占断」（jixiong 未选计数），点击跳 /lib?pending=1
 *   - 标签多选筛选（任一命中）：勾选后只统计命中标签的卦例
 *   - 点击数字跳 /lib 时带标签参数（tags= 重复参数）+ 对应状态筛选
 *
 * 存储走 fake-indexeddb；跳转用 MemoryRouter + Routes 的探针路由捕获实际 query。
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { openDB } from '../db/index.js'
import { addGuashi } from '../db/guashiRepo.js'
import { addTag } from '../db/tagsRepo.js'
import StatsPage from './StatsPage.jsx'

/** /lib 探针：把跳转后的 query 渲染出来供断言 */
function LibProbe() {
  const loc = useLocation()
  return <div data-testid="lib-loc">{loc.search}</div>
}

/** 渲染统计页 + /lib 探针 */
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/stats']}>
      <Routes>
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/lib" element={<LibProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** 构造一条卦例（只保留统计相关字段） */
function rec(overrides = {}) {
  return {
    title: '测试卦例',
    status: '未反馈',
    jixiong: '',
    jixiongOk: '',
    yingqiOk: '',
    fangweiOk: '',
    tags: [],
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
})

beforeEach(async () => {
  sessionStorage.clear() // 惰性记忆 key 隔离（避免前一测试残留 from/to 干扰本测试）
  const db = await openDB()
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['guashi', 'tags'], 'readwrite')
    tx.objectStore('guashi').clear()
    tx.objectStore('tags').clear()
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
})

/** 取总览卡（按标签名定位卡片，再在卡内查值）；等待数据加载完成 */
async function cardValue(label) {
  const card = await waitFor(() => {
    const el = screen.getByRole('button', { name: new RegExp(label) })
    if (!el) throw new Error(`未找到卡片：${label}`)
    return el
  })
  return within(card).getByText(/\d+/).textContent
}

/** 等待总卦例数卡变为期望值（数据加载完成的可靠屏障） */
async function waitTotal(n) {
  await waitFor(async () => expect(await cardValue('总卦例数')).toBe(String(n)))
}

describe('StatsPage 待占断（v0.2 功能 H）', () => {
  test('待占断卡显示 jixiong 未选计数，点击跳 /lib?status=pending（v0.10 改进建8 #2）', async () => {
    await addGuashi(rec({ jixiong: '' }))
    await addGuashi(rec({ jixiong: '吉' }))
    renderPage()
    await waitTotal(2)
    expect(await cardValue('待占断')).toBe('1')
    // 点击待占断卡 → 跳转带 status=pending
    screen.getByRole('button', { name: /待占断/ }).click()
    expect((await screen.findByTestId('lib-loc')).textContent).toContain('status=pending')
    expect((await screen.findByTestId('lib-loc')).textContent).not.toContain('pending=1')
  })

  test('无待占断时待占断卡为 0 且禁用', async () => {
    await addGuashi(rec({ jixiong: '吉' }))
    renderPage()
    await waitTotal(1)
    const card = screen.getByRole('button', { name: /待占断/ })
    expect(card.disabled).toBe(true)
    expect(within(card).getByText(/\d+/).textContent).toBe('0')
  })
})

describe('StatsPage 标签筛选（v0.2 功能 J）', () => {
  test('勾选标签后只统计命中标签的卦例（任一命中）', async () => {
    await addTag({ name: '占病', color: '#e74c3c' })
    await addTag({ name: '工作', color: '#3498db' })
    await addGuashi(rec({ status: '已反馈', jixiong: '吉', jixiongOk: '对', tags: ['占病'] }))
    await addGuashi(rec({ status: '已反馈', jixiong: '凶', jixiongOk: '错', tags: ['工作'] }))
    renderPage()
    await waitTotal(2)
    // 未筛选：总数 2，吉凶对 1 错 1 → 50%
    expect(await cardValue('总卦例数')).toBe('2')
    // 勾选「占病」→ 只剩 1 条且为对 → 正确率 100%
    const tagBtn = await screen.findByRole('button', { name: /占病/ })
    tagBtn.click()
    await waitTotal(1)
    expect(screen.getByText('100%')).toBeTruthy()
  })

  test('多选标签=任一命中：同时选两个标签统计两者之和', async () => {
    await addTag({ name: '占病', color: '#e74c3c' })
    await addTag({ name: '工作', color: '#3498db' })
    await addGuashi(rec({ tags: ['占病'] }))
    await addGuashi(rec({ tags: ['工作'] }))
    await addGuashi(rec({ tags: [] }))
    renderPage()
    await waitTotal(3)
    const tagA = await screen.findByRole('button', { name: /占病/ })
    const tagB = await screen.findByRole('button', { name: /工作/ })
    tagA.click()
    tagB.click()
    await waitTotal(2)
  })

  test('点击已反馈数字跳转带 tags= 重复参数 + status=fed（v0.10 改进建8 #2）', async () => {
    await addTag({ name: '占病', color: '#e74c3c' })
    await addGuashi(rec({ status: '已反馈', jixiong: '吉', jixiongOk: '对', tags: ['占病'] }))
    renderPage()
    await waitTotal(1)
    const tagBtn = await screen.findByRole('button', { name: /占病/ })
    tagBtn.click()
    // 等待选中态渲染（title 变为取消筛选）后再点卡片，确保 goLib 读到最新标签
    await waitFor(() => expect(screen.getByTitle('取消筛选')).toBeTruthy())
    // 已反馈卡点击 → /lib?status=fed&tags=占病
    screen.getByRole('button', { name: /已反馈/ }).click()
    const loc = decodeURIComponent((await screen.findByTestId('lib-loc')).textContent)
    expect(loc).toContain('status=fed')
    expect(loc).toContain('tags=占病')
  })

  test('未选标签时点击跳转不带 tags 参数（向后兼容）', async () => {
    await addGuashi(rec({ status: '未反馈', jixiong: '吉' }))
    renderPage()
    await waitTotal(1)
    screen.getByRole('button', { name: /未反馈/ }).click()
    const loc = decodeURIComponent((await screen.findByTestId('lib-loc')).textContent)
    expect(loc).toContain('status=unfed')
    expect(loc).not.toContain('tags=')
  })
})

describe('StatsPage 创建时间范围筛选（与卦例库 from=/to= 同口径，含起止当天）', () => {
  const D = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime()

  test('选择时间范围后只统计该时间段内的卦例（可与标签搭配）', async () => {
    await addTag({ name: '占病', color: '#e74c3c' })
    await addGuashi(rec({ status: '已反馈', jixiong: '吉', jixiongOk: '对', tags: ['占病'], createdAt: D(2026, 8, 1) }))
    await addGuashi(rec({ status: '已反馈', jixiong: '凶', jixiongOk: '错', tags: ['占病'], createdAt: D(2026, 8, 20) }))
    renderPage()
    await waitTotal(2)
    // 只选时间范围：8/5-8/15 → 只剩 8/1 之外的…… 只剩区间内 0 条？区间 8/5~8/15 不含 8/1 和 8/20
    const fromInput = screen.getByTitle('创建时间范围：开始日期')
    fireEvent.change(fromInput, { target: { value: '2026-08-05' } })
    const toInput = screen.getByTitle('创建时间范围：结束日期')
    fireEvent.change(toInput, { target: { value: '2026-08-15' } })
    await waitTotal(0)
    // 勾选占病标签 + 时间范围 8/1~8/15 → 只剩 8/1 那条（对）→ 100%
    const tagBtn = await screen.findByRole('button', { name: /占病/ })
    tagBtn.click()
    fireEvent.change(fromInput, { target: { value: '2026-08-01' } })
    await waitTotal(1)
    expect(screen.getByText('100%')).toBeTruthy()
  })

  test('时间范围含当天：to 当天 23:59:59.999 前的记录计入', async () => {
    await addGuashi(rec({ createdAt: D(2026, 8, 8, 23, 30) })) // 当天 23:30
    await addGuashi(rec({ createdAt: D(2026, 8, 9) })) // 次日
    renderPage()
    await waitTotal(2)
    const toInput = screen.getByTitle('创建时间范围：结束日期')
    fireEvent.change(toInput, { target: { value: '2026-08-08' } })
    await waitTotal(1)
  })

  test('设置时间范围后点击跳转带 from/to 参数（卦例库自动应用同一筛选）', async () => {
    await addGuashi(rec({ status: '已反馈', jixiong: '吉', jixiongOk: '对', createdAt: D(2026, 8, 1) }))
    renderPage()
    await waitTotal(1)
    const fromInput = screen.getByTitle('创建时间范围：开始日期')
    fireEvent.change(fromInput, { target: { value: '2026-08-01' } })
    const toInput = screen.getByTitle('创建时间范围：结束日期')
    fireEvent.change(toInput, { target: { value: '2026-08-08' } })
    // 点击已反馈卡 → /lib?status=fed&from=2026-08-01&to=2026-08-08
    screen.getByRole('button', { name: /已反馈/ }).click()
    const loc = decodeURIComponent((await screen.findByTestId('lib-loc')).textContent)
    expect(loc).toContain('status=fed')
    expect(loc).toContain('from=2026-08-01')
    expect(loc).toContain('to=2026-08-08')
  })

  test('时间范围 + 标签同选跳转：from/to 与 tags 同时携带', async () => {
    await addTag({ name: '占病', color: '#e74c3c' })
    await addGuashi(rec({ status: '已反馈', jixiong: '吉', jixiongOk: '对', tags: ['占病'], createdAt: D(2026, 8, 1) }))
    renderPage()
    await waitTotal(1)
    const tagBtn = await screen.findByRole('button', { name: /占病/ })
    tagBtn.click()
    await waitFor(() => expect(screen.getByTitle('取消筛选')).toBeTruthy())
    const fromInput = screen.getByTitle('创建时间范围：开始日期')
    fireEvent.change(fromInput, { target: { value: '2026-08-01' } })
    screen.getByRole('button', { name: /已反馈/ }).click()
    const loc = decodeURIComponent((await screen.findByTestId('lib-loc')).textContent)
    expect(loc).toContain('tags=占病')
    expect(loc).toContain('from=2026-08-01')
  })
})

describe('StatsPage 时间筛选惰性记忆（sessionStorage）', () => {
  test('设置时间范围后卸载重挂载：恢复上次筛选（惰性保持）', async () => {
    await addGuashi(rec({ createdAt: new Date(2026, 7, 1, 12).getTime() }))
    await addGuashi(rec({ createdAt: new Date(2026, 7, 20, 12).getTime() }))
    // 第一次挂载：设置 from/to
    const first = renderPage()
    await waitTotal(2)
    fireEvent.change(screen.getByTitle('创建时间范围：开始日期'), { target: { value: '2026-08-05' } })
    fireEvent.change(screen.getByTitle('创建时间范围：结束日期'), { target: { value: '2026-08-15' } })
    await waitTotal(0) // 区间内无记录
    expect(sessionStorage.getItem('liuyao-stats-time')).toContain('2026-08-05')
    // 卸载后重新挂载（模拟切页面返回）
    first.unmount()
    renderPage()
    await waitTotal(0) // 恢复时间筛选 → 仍无记录
    const dates = [...document.querySelectorAll('input[type=date]')].map((i) => ({ title: i.title, value: i.value }))
    expect(dates).toContainEqual({ title: '创建时间范围：开始日期', value: '2026-08-05' })
    expect(dates).toContainEqual({ title: '创建时间范围：结束日期', value: '2026-08-15' })
  })

  test('清除时间后重挂载：不再恢复旧筛选（惰性跟随最新操作）', async () => {
    await addGuashi(rec({ createdAt: new Date(2026, 7, 1, 12).getTime() }))
    sessionStorage.setItem('liuyao-stats-time', JSON.stringify({ from: '2026-08-05', to: '2026-08-15' }))
    const first = renderPage()
    await waitTotal(0) // 旧记忆生效
    fireEvent.click(screen.getByText('清除时间'))
    await waitTotal(1) // 清除后全部显示
    first.unmount()
    renderPage()
    await waitTotal(1) // 重挂载：清除被记忆，不再恢复旧筛选
  })
})

describe('StatsPage 标签惰性 + 严格筛选（v0.10 追加）', () => {
  test('标签惰性记忆：设置标签后卸载重挂载恢复选中（两页独立，不自动取消）', async () => {
    await addTag({ name: '占病', color: '#e74c3c' })
    await addGuashi(rec({ status: '已反馈', jixiong: '吉', jixiongOk: '对', tags: ['占病'] }))
    const first = renderPage()
    await waitTotal(1)
    fireEvent.click(screen.getByText('占病'))
    await waitFor(() => expect(screen.getByTitle('取消筛选')).toBeTruthy())
    expect(sessionStorage.getItem('liuyao-stats-tags')).toContain('占病')
    first.unmount()
    renderPage()
    await waitTotal(1)
    expect(await screen.findByTitle('取消筛选')).toBeTruthy() // 切页返回标签保持选中
  })

  test('严格筛选：勾选后只统计命中全部所选标签的卦例；跳转携带 strict=1', async () => {
    await addTag({ name: '占病', color: '#e74c3c' })
    await addTag({ name: '工作', color: '#3498db' })
    await addGuashi(rec({ status: '已反馈', jixiong: '吉', jixiongOk: '对', tags: ['占病', '工作'] }))
    await addGuashi(rec({ status: '已反馈', jixiong: '凶', jixiongOk: '错', tags: ['占病'] }))
    renderPage()
    await waitTotal(2)
    fireEvent.click(screen.getByText('占病'))
    fireEvent.click(screen.getByText('工作'))
    await waitFor(() => expect(screen.getAllByTitle('取消筛选')).toHaveLength(2))
    await waitTotal(2) // 任一命中：两标签统计 2 条
    fireEvent.click(screen.getByLabelText(/严格筛选/))
    await waitFor(async () => expect(await cardValue('总卦例数')).toBe('1')) // 全部命中：只剩同时带两标签的
    // 已反馈卡跳转 → 携带双标签 + strict=1
    fireEvent.click(screen.getByRole('button', { name: /已反馈/ }))
    await waitFor(() => {
      const loc = decodeURIComponent(screen.getByTestId('lib-loc').textContent)
      expect(loc).toContain('strict=1')
      expect(loc).toContain('tags=占病')
      expect(loc).toContain('tags=工作')
    })
  })

  test('清除标签连带清严格；<2 标签时严格勾选禁用', async () => {
    await addTag({ name: '占病', color: '#e74c3c' })
    await addTag({ name: '工作', color: '#3498db' })
    await addGuashi(rec({ tags: ['占病', '工作'] }))
    renderPage()
    await waitTotal(1)
    fireEvent.click(screen.getByText('占病'))
    fireEvent.click(screen.getByText('工作'))
    await waitFor(() => expect(screen.getAllByTitle('取消筛选')).toHaveLength(2))
    const cb = screen.getByLabelText(/严格筛选/)
    expect(cb.disabled).toBe(false)
    fireEvent.click(cb)
    expect(cb.checked).toBe(true)
    // 「清除标签」→ 标签清空 + 严格连带清空
    fireEvent.click(screen.getByText('清除标签'))
    await waitFor(() => {
      expect(screen.queryAllByTitle('取消筛选')).toHaveLength(0)
      expect(screen.getByLabelText(/严格筛选/).checked).toBe(false)
    })
    // 只选 1 个标签 → 严格禁用
    fireEvent.click(screen.getByText('占病'))
    await waitFor(() => expect(screen.getByTitle('取消筛选')).toBeTruthy())
    expect(screen.getByLabelText(/严格筛选/).disabled).toBe(true)
  })
})
