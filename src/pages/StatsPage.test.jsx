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
    await addGuashi(rec({ fankui: 'x', jixiong: '吉', jixiongOk: '对', tags: ['占病'] }))
    await addGuashi(rec({ fankui: 'x', jixiong: '凶', jixiongOk: '错', tags: ['工作'] }))
    renderPage()
    await waitTotal(2)
    // 未筛选：总数 2，吉凶对 1 错 1 → 50%
    expect(await cardValue('总卦例数')).toBe('2')
    // 勾选「占病」→ 只剩 1 条且为对 → 正确率 100%
    const tagBtn = await screen.findByRole('button', { name: /占病/ })
    tagBtn.click()
    await waitTotal(1)
    expect(screen.getAllByText('100%').length).toBeGreaterThanOrEqual(1) // 正确率卡 + 柱状图柱顶均可能出现
    // 吉凶卡总数（对1+错0 = 总1）
    expect(screen.getByText('总 1')).toBeTruthy()
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
    await addGuashi(rec({ fankui: 'x', jixiong: '吉', jixiongOk: '对', tags: ['占病'] }))
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

  test('未选标签时点击跳转不带 tags 参数（向后兼容；v1.3.0 文案「待反馈」）', async () => {
    await addGuashi(rec({ jixiong: '吉' })) // 有内容无反馈 → 待反馈
    renderPage()
    await waitTotal(1)
    screen.getByRole('button', { name: /待反馈/ }).click()
    const loc = decodeURIComponent((await screen.findByTestId('lib-loc')).textContent)
    expect(loc).toContain('status=unfed')
    expect(loc).not.toContain('tags=')
  })
})

describe('StatsPage 创建时间范围筛选（与卦例库 from=/to= 同口径，含起止当天）', () => {
  const D = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime()

  test('选择时间范围后只统计该时间段内的卦例（可与标签搭配）', async () => {
    await addTag({ name: '占病', color: '#e74c3c' })
    await addGuashi(rec({ fankui: 'x', jixiong: '吉', jixiongOk: '对', tags: ['占病'], createdAt: D(2026, 8, 1) }))
    await addGuashi(rec({ fankui: 'x', jixiong: '凶', jixiongOk: '错', tags: ['占病'], createdAt: D(2026, 8, 20) }))
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
    expect(screen.getAllByText('100%').length).toBeGreaterThanOrEqual(1)
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
    await addGuashi(rec({ fankui: 'x', jixiong: '吉', jixiongOk: '对', createdAt: D(2026, 8, 1) }))
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
    await addGuashi(rec({ fankui: 'x', jixiong: '吉', jixiongOk: '对', tags: ['占病'], createdAt: D(2026, 8, 1) }))
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
    await addGuashi(rec({ fankui: 'x', jixiong: '吉', jixiongOk: '对', tags: ['占病'] }))
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
    await addGuashi(rec({ fankui: 'x', jixiong: '吉', jixiongOk: '对', tags: ['占病', '工作'] }))
    await addGuashi(rec({ fankui: 'x', jixiong: '凶', jixiongOk: '错', tags: ['占病'] }))
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

describe('StatsPage v1.3.0 取数反馈统计', () => {
  test('取数卡：三档计数 + 双口径（神准率 / 神准+相近率），分母=三档总数', async () => {
    await addGuashi(rec({ fankui: '1', quShu: '三', quShuFb: '神准' }))
    await addGuashi(rec({ fankui: '2', quShu: '五', quShuFb: '神准' }))
    await addGuashi(rec({ fankui: '3', quShu: '七', quShuFb: '相近' }))
    await addGuashi(rec({ fankui: '4', quShu: '九', quShuFb: '错' }))
    renderPage()
    await waitTotal(4)
    // 三档计数按钮（可点击跳转）
    expect(screen.getByRole('button', { name: /神准 2/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /相近 1/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /错 1/ })).toBeTruthy()
    // 双口径：神准率 50%（取数卡 + 趋势图 Y 轴刻度均可能出现 → getAll）；神准+相近率 75%（同）
    expect(screen.getAllByText('50%').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('75%').length).toBeGreaterThanOrEqual(1)
  })

  test('取数无反馈：取数卡显示暂无数据，双口径不渲染百分比', async () => {
    await addGuashi(rec({ fankui: '1', jixiong: '吉', jixiongOk: '对' }))
    renderPage()
    await waitTotal(1)
    expect(screen.getByText('暂无取数反馈记录')).toBeTruthy()
    // 吉凶正确率仍正常（100%）
    expect(screen.getAllByText('100%').length).toBeGreaterThanOrEqual(1)
  })

  test('取数卡跳转 /lib?status=fed&quShuFb=神准（卦例库配套筛选）', async () => {
    await addGuashi(rec({ fankui: '1', quShu: '三', quShuFb: '神准' }))
    renderPage()
    await waitTotal(1)
    screen.getByRole('button', { name: /神准 1/ }).click()
    const loc = decodeURIComponent((await screen.findByTestId('lib-loc')).textContent)
    expect(loc).toContain('status=fed')
    expect(loc).toContain('quShuFb=神准')
  })

  test('v1.3.0 待占断/待反馈卡：五者口径（待反馈=有内容无反馈，待占断=五者全空）', async () => {
    await addGuashi(rec({})) // 五者全空 → 待占断
    await addGuashi(rec({ jixiong: '吉' })) // 有内容无反馈 → 待反馈
    await addGuashi(rec({ duanyu: 'x' })) // 只填断语 → 待反馈
    await addGuashi(rec({ quShu: '三' })) // 只填取数 → 待反馈
    await addGuashi(rec({ fankui: 'x' })) // 已反馈
    renderPage()
    await waitTotal(5)
    expect(await cardValue('待占断')).toBe('1')
    expect(await cardValue('待反馈')).toBe('3')
    expect(await cardValue('已反馈')).toBe('1')
  })

  test('v1.3.0 反馈结果筛选组合：同维度多选=或，跨维度=与；清除恢复全量', async () => {
    await addGuashi(rec({ fankui: '1', jixiong: '吉', jixiongOk: '对' }))
    await addGuashi(rec({ fankui: '2', jixiong: '凶', jixiongOk: '错' }))
    await addGuashi(rec({ fankui: '3', jixiong: '吉', jixiongOk: '对', yingqiOk: '对' }))
    renderPage()
    await waitTotal(3)
    // 吉凶选「对」→ 命中 1、3（同维度单选）
    fireEvent.click(screen.getByTitle('吉凶反馈对'))
    await waitTotal(2)
    // 吉凶再选「错」→ 同维度或 → 1、2、3 全命中
    fireEvent.click(screen.getByTitle('吉凶反馈错'))
    await waitTotal(3)
    // 应期选「对」→ 跨维度与（吉凶对或错 且 应期对）→ 只剩 3
    fireEvent.click(screen.getByTitle('应期反馈对'))
    await waitTotal(1)
    // 取数多选（神准+相近）：无取数反馈记录 → 0 条
    fireEvent.click(screen.getByTitle('取数反馈神准'))
    fireEvent.click(screen.getByTitle('取数反馈相近'))
    await waitTotal(0)
    // 清除反馈筛选 → 全量恢复
    fireEvent.click(screen.getByText('清除反馈筛选'))
    await waitTotal(3)
  })

  test('v1.3.0 趋势折线：按 createdAt 月度分组渲染（含 0 补齐），可切年度粒度', async () => {
    await addGuashi(rec({ createdAt: new Date(2026, 6, 5, 12).getTime() })) // 2026-07
    await addGuashi(rec({ createdAt: new Date(2026, 7, 5, 12).getTime() })) // 2026-08
    await addGuashi(rec({ createdAt: new Date(2026, 7, 20, 12).getTime(), fankui: 'x' })) // 2026-08 已反馈
    renderPage()
    await waitTotal(3)
    expect(screen.getByRole('img', { name: /趋势折线/ })).toBeTruthy()
    // 月度粒度 X 标签（step=2：01,03,05,07,09,11）
    expect(screen.getByText('2026-07')).toBeTruthy()
    // 切年度 → X 标签为年份（select option 也可能含 2026 → getAll）
    fireEvent.click(screen.getByText('年度'))
    expect(screen.getAllByText('2026').length).toBeGreaterThanOrEqual(1)
  })

  test('v1.3.0 反馈筛选随跳转携带：选「吉凶对」→ 已反馈卡跳转带 status=fed&jixiongOk=对', async () => {
    await addGuashi(rec({ fankui: '1', jixiong: '吉', jixiongOk: '对' }))
    renderPage()
    await waitTotal(1)
    // 选「吉凶对」反馈筛选
    fireEvent.click(screen.getByTitle('吉凶反馈对'))
    await waitFor(() => expect(screen.getByText('清除反馈筛选')).toBeTruthy())
    screen.getByRole('button', { name: /已反馈/ }).click()
    const loc = decodeURIComponent((await screen.findByTestId('lib-loc')).textContent)
    expect(loc).toContain('status=fed')
    expect(loc).toContain('jixiongOk=对')
  })

  test('v1.3.0 多维度反馈筛选跳转：跨维度合并 + 点总卦例卡强制 status=fed', async () => {
    await addGuashi(rec({ fankui: '1', jixiong: '吉', jixiongOk: '对', quShu: '三', quShuFb: '神准' }))
    renderPage()
    await waitTotal(1)
    fireEvent.click(screen.getByTitle('吉凶反馈对'))
    fireEvent.click(screen.getByTitle('取数反馈神准'))
    // 等待两个反馈按钮进入选中态（className 含 bg-goldSoft；按钮 title 固定不变，无切换标记）
    await waitFor(() => {
      expect(screen.getByTitle('吉凶反馈对').className).toContain('bg-goldSoft')
      expect(screen.getByTitle('取数反馈神准').className).toContain('bg-goldSoft')
    })
    // 点「总卦例数」卡（qs=''）→ 反馈筛选强制 status=fed + 双维度参数（重复参数=同维度或）
    screen.getByRole('button', { name: /总卦例数/ }).click()
    const loc = decodeURIComponent((await screen.findByTestId('lib-loc')).textContent)
    expect(loc).toContain('status=fed')
    expect(loc).toContain('jixiongOk=对')
    expect(loc).toContain('quShuFb=神准')
  })
})

describe('StatsPage v1.3.0 视觉联动 + 正确率趋势', () => {
  test('反馈筛选视觉联动：选中维度卡放大+金边框高亮，未选中缩小；清除恢复正常', async () => {
    await addGuashi(rec({ fankui: '1', jixiong: '吉', jixiongOk: '对' }))
    await addGuashi(rec({ fankui: '2', yingqiOk: '错' }))
    renderPage()
    await waitTotal(2)
    const card = (dim) => document.querySelector(`[data-dim="${dim}"]`)
    // 无筛选：全部正常尺寸（无 transform）
    expect(card('jixiong').style.transform).toBe('')
    expect(card('yingqi').style.transform).toBe('')
    // 选「吉凶反馈对」→ 吉凶卡放大+高亮，应期卡缩小
    fireEvent.click(screen.getByTitle('吉凶反馈对'))
    await waitFor(() => expect(card('jixiong').style.transform).toBe('scale(1.03)'))
    expect(card('yingqi').style.transform).toBe('scale(0.97)')
    expect(card('jixiong').className).toContain('border-gold')
    expect(card('yingqi').className).toContain('opacity-70')
    // 清除 → 恢复正常
    fireEvent.click(screen.getByText('清除反馈筛选'))
    await waitFor(() => expect(card('jixiong').style.transform).toBe(''))
    expect(card('yingqi').style.transform).toBe('')
  })

  test('v1.3.0 正确率趋势：4 色线 + 样本<3 空心点；不受反馈筛选影响', async () => {
    // 2026-07：吉凶 3 条（2对1错→66.7%，样本≥3 连线）；应期 1 条（对→空心点）
    // 2026-08：吉凶 1 条（对→100% 但样本<3 → 空心点不连线）
    await addGuashi(rec({ createdAt: new Date(2026, 6, 5, 12).getTime(), fankui: '1', jixiong: '吉', jixiongOk: '对' }))
    await addGuashi(rec({ createdAt: new Date(2026, 6, 10, 12).getTime(), fankui: '2', jixiong: '吉', jixiongOk: '对' }))
    await addGuashi(rec({ createdAt: new Date(2026, 6, 15, 12).getTime(), fankui: '3', jixiong: '凶', jixiongOk: '错' }))
    await addGuashi(rec({ createdAt: new Date(2026, 6, 20, 12).getTime(), fankui: '4', yingqiOk: '对' }))
    await addGuashi(rec({ createdAt: new Date(2026, 7, 5, 12).getTime(), fankui: '5', jixiong: '吉', jixiongOk: '对' }))
    renderPage()
    await waitTotal(5)
    const img = screen.getByRole('img', { name: /正确率趋势/ })
    // 4 色线（每维一条 path，即使空）
    const paths = img.querySelectorAll('path[stroke]')
    expect(paths.length).toBe(4)
    // 吉凶线 2026-07 有连线（非空 d）
    const jxPath = paths[0]
    expect(jxPath.getAttribute('d').length).toBeGreaterThan(0)
    // 样本<3 的空心点（8 月吉凶 + 7 月应期）
    expect(img.querySelectorAll('circle[stroke]').length).toBeGreaterThanOrEqual(2)
    // 反馈筛选不影响趋势：选「吉凶反馈对」→ 吉凶线 path 不变
    const beforeD = jxPath.getAttribute('d')
    fireEvent.click(screen.getByTitle('吉凶反馈对'))
    await waitFor(() => expect(screen.getByText('清除反馈筛选')).toBeTruthy())
    const paths2 = screen.getByRole('img', { name: /正确率趋势/ }).querySelectorAll('path[stroke]')
    expect(paths2[0].getAttribute('d')).toBe(beforeD)
  })

  test('v1.3.0 严格反馈：已反馈维度集合恰好等于勾选维度集合', async () => {
    await addGuashi(rec({ fankui: '1', jixiong: '吉', jixiongOk: '对' })) // 纯吉凶
    await addGuashi(rec({ fankui: '2', jixiong: '凶', jixiongOk: '错', yingqiOk: '对' })) // 吉凶+应期
    await addGuashi(rec({ fankui: '3', yingqiOk: '错' })) // 纯应期（无吉凶反馈）
    renderPage()
    await waitTotal(3)
    // 勾吉凶对+错（或）→ 1、2 命中（3 无吉凶反馈被排除）
    fireEvent.click(screen.getByTitle('吉凶反馈对'))
    fireEvent.click(screen.getByTitle('吉凶反馈错'))
    await waitTotal(2)
    // 开启严格反馈 → 只剩纯吉凶（2 有应期反馈被排除）
    const cb = screen.getByLabelText(/严格反馈/)
    expect(cb.disabled).toBe(false)
    fireEvent.click(cb)
    await waitTotal(1)
    // 清除反馈筛选 → 连带清严格，全量恢复
    fireEvent.click(screen.getByText('清除反馈筛选'))
    await waitTotal(3)
    expect(screen.getByLabelText(/严格反馈/).checked).toBe(false)
  })

  test('v1.3.0 严格反馈：无维度勾选时禁用；跳转携带 strictFb=1', async () => {
    await addGuashi(rec({ fankui: '1', jixiong: '吉', jixiongOk: '对' }))
    renderPage()
    await waitTotal(1)
    // 无勾选 → 严格开关禁用
    expect(screen.getByLabelText(/严格反馈/).disabled).toBe(true)
    // 勾吉凶对 + 严格 → 跳转带 strictFb=1（与标签 strict=1 区分）
    fireEvent.click(screen.getByTitle('吉凶反馈对'))
    fireEvent.click(screen.getByLabelText(/严格反馈/))
    await waitFor(() => expect(screen.getByLabelText(/严格反馈/).checked).toBe(true))
    screen.getByRole('button', { name: /已反馈/ }).click()
    const loc = decodeURIComponent((await screen.findByTestId('lib-loc')).textContent)
    expect(loc).toContain('status=fed')
    expect(loc).toContain('strictFb=1')
    expect(loc).toContain('jixiongOk=对')
  })

  test('v1.3.0 趋势：维度显隐 checkbox（默认全选，取消后线减少）+ 节点悬浮正确率 title', async () => {
    // 2026-07 吉凶 3 条（2 对 1 错 → 67%）
    await addGuashi(rec({ createdAt: new Date(2026, 6, 5, 12).getTime(), fankui: '1', jixiong: '吉', jixiongOk: '对' }))
    await addGuashi(rec({ createdAt: new Date(2026, 6, 10, 12).getTime(), fankui: '2', jixiong: '吉', jixiongOk: '对' }))
    await addGuashi(rec({ createdAt: new Date(2026, 6, 15, 12).getTime(), fankui: '3', jixiong: '凶', jixiongOk: '错' }))
    renderPage()
    await waitTotal(3)
    const img = () => screen.getByRole('img', { name: /正确率趋势/ })
    // 默认全选 → 4 条线（每条一个 path，即使空）
    expect(img().querySelectorAll('path[stroke]').length).toBe(4)
    // 点按节点 → 浮层显示正确率（吉凶 7 月 2对1错 = 67%）
    fireEvent.pointerDown(img().querySelector('circle[fill="transparent"]'), { clientX: 100, clientY: 120 })
    await waitFor(() => {
      expect(screen.getByTestId('trend-tip').textContent).toContain('吉凶正确率 67%')
      expect(screen.getByTestId('trend-tip').textContent).toContain('样本 3')
    })
    fireEvent.pointerDown(img(), { clientX: 5, clientY: 5 }) // 点空白关闭
    // 取消勾选「应期」→ 线变 3 条（图例跟随）
    fireEvent.click(screen.getByLabelText(/应期正确率线/))
    await waitFor(() => expect(img().querySelectorAll('path[stroke]').length).toBe(3))
    // 再勾回 → 恢复 4 条
    fireEvent.click(screen.getByLabelText(/应期正确率线/))
    await waitFor(() => expect(img().querySelectorAll('path[stroke]').length).toBe(4))
  })

  test('v1.3.0 趋势采样切换：累计模式逐月累加样本（正确率=截至该月累计）', async () => {
    // 3月 吉凶 2对1错=67%；4月 1对2错=33% → 累计4月 = 3对3错=50%
    await addGuashi(rec({ createdAt: new Date(2026, 2, 5, 12).getTime(), fankui: '1', jixiongOk: '对' }))
    await addGuashi(rec({ createdAt: new Date(2026, 2, 10, 12).getTime(), fankui: '2', jixiongOk: '对' }))
    await addGuashi(rec({ createdAt: new Date(2026, 2, 15, 12).getTime(), fankui: '3', jixiongOk: '错' }))
    await addGuashi(rec({ createdAt: new Date(2026, 3, 5, 12).getTime(), fankui: '4', jixiongOk: '对' }))
    await addGuashi(rec({ createdAt: new Date(2026, 3, 10, 12).getTime(), fankui: '5', jixiongOk: '错' }))
    await addGuashi(rec({ createdAt: new Date(2026, 3, 15, 12).getTime(), fankui: '6', jixiongOk: '错' }))
    renderPage()
    await waitTotal(6)
    const circles = () => [...screen.getByRole('img', { name: /正确率趋势/ }).querySelectorAll('circle[fill="transparent"]')]
    const openTip = (idx) => fireEvent.pointerDown(circles()[idx], { clientX: 100, clientY: 120 })
    // 当月模式：4 月吉凶（circles[1]）33%（1/3）
    openTip(1)
    await waitFor(() => {
      expect(screen.getByTestId('trend-tip').textContent).toContain('2026-04')
      expect(screen.getByTestId('trend-tip').textContent).toContain('吉凶正确率 33%')
    })
    openTip(1) // toggle 关闭
    // 切累计：4 月 = 3对3错 = 50%，样本 6
    fireEvent.click(screen.getByLabelText(/累计/))
    openTip(1)
    await waitFor(() => {
      const t = screen.getByTestId('trend-tip').textContent
      expect(t).toContain('吉凶正确率 50%')
      expect(t).toContain('样本 6')
    })
  })

  test('v1.3.0 趋势节点点按浮层（移动端）：pointerDown 显示正确率+样本，点空白关闭', async () => {
    await addGuashi(rec({ createdAt: new Date(2026, 6, 5, 12).getTime(), fankui: '1', jixiongOk: '对' }))
    await addGuashi(rec({ createdAt: new Date(2026, 6, 10, 12).getTime(), fankui: '2', jixiongOk: '对' }))
    renderPage()
    await waitTotal(2)
    const img = screen.getByRole('img', { name: /正确率趋势/ })
    const node = () => img.querySelector('circle[fill="transparent"]')
    expect(node()).toBeTruthy()
    fireEvent.pointerDown(node(), { clientX: 100, clientY: 120 })
    await waitFor(() => expect(screen.getByTestId('trend-tip')).toBeTruthy())
    // 再点同一节点 → toggle 关闭
    fireEvent.pointerDown(node(), { clientX: 100, clientY: 120 })
    await waitFor(() => expect(screen.queryByTestId('trend-tip')).toBeNull())
    // 再点显示 → 滚动页面浮层仍跟随卡片存在（absolute 锚定节点，不再 fixed 遮挡，无需关闭）
    fireEvent.pointerDown(node(), { clientX: 100, clientY: 120 })
    await waitFor(() => expect(screen.getByTestId('trend-tip')).toBeTruthy())
    fireEvent.scroll(window)
    expect(screen.getByTestId('trend-tip')).toBeTruthy()
    // 点 svg 空白关闭
    fireEvent.pointerDown(img, { clientX: 5, clientY: 5 })
    await waitFor(() => expect(screen.queryByTestId('trend-tip')).toBeNull())
  })
})
