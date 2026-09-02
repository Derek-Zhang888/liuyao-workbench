/**
 * 卦例库页测试（v0.2 功能 G/H/I/J）
 *
 * 覆盖：
 *   - G：编辑视图双栏布局（盘面左、占断右，≥lg 两栏）
 *   - H：待占断筛选（v0.10 改进建8 #2：主筛选互斥单组 status=pending/unfed/fed，旧 pending=1 兼容）
 *   - I：编辑视图自定用神回显（快照/顶层字段）+ 保存落库 + 导入记录重排恢复用神
 *   - J：URL tags= 重复参数预选标签
 *
 * 存储走 fake-indexeddb；PanView/TagEditor/GuashiCard/ConfirmDialog 以 mock 驱动，
 * DuanInput 用真实组件（2026-08-11：duanOf 漏 background 修复回归，需真实受控渲染验证背景回填/保存），
 * YongShenSelector mock 暴露 value 并可触发 onChange（模拟编辑页换用神）。
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { openDB } from '../db/index.js'
import { addGuashi, listGuashi, replaceAllGuashi } from '../db/guashiRepo.js'
import { addTag } from '../db/tagsRepo.js'
import { paipan } from '../engine/paipan.js'
import GuashiLibPage from './GuashiLibPage.jsx'

vi.mock('../components/PanView.jsx', () => ({
  default: ({ pan, doodle, doodleEnabled }) => (
    <div
      data-testid="pan-view"
      data-yongshen={pan?.yongShen ? pan.yongShen.value : 'none'}
      data-doodle={doodle ? 'yes' : 'no'}
      data-doodle-enabled={doodleEnabled ? 'yes' : 'no'}
    />
  ),
}))
vi.mock('../components/TagEditor.jsx', () => ({ default: () => null }))
vi.mock('../components/YongShenSelector.jsx', () => ({
  default: ({ value, onChange }) => (
    <div data-testid="yong-shen" data-value={value ? `${value.type}:${value.value}` : 'null'}>
      <button type="button" onClick={() => onChange({ type: 'liuqin', value: '官' })}>
        选官
      </button>
      <button type="button" onClick={() => onChange(null)}>
        清空用神
      </button>
    </div>
  ),
}))
vi.mock('../components/GuashiCard.jsx', () => ({
  default: ({ guashi, onOpen }) => (
    <button type="button" onClick={() => onOpen?.(guashi.id)}>
      {guashi.title || '未命名卦例'}
    </button>
  ),
}))
vi.mock('../components/ConfirmDialog.jsx', () => ({
  default: () => null,
  isNoRemind: () => false,
}))
vi.mock('../utils/exportBatch.js', () => ({
  downloadGuashiMd: vi.fn(),
  downloadGuashiBatch: vi.fn(),
}))

/** 渲染卦例库页（可指定初始 URL） */
function renderPage(url = '/lib') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/lib" element={<GuashiLibPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

/** 构造一条卦例记录（列表/筛选测试用，无需有效盘面） */
function rec(overrides = {}) {
  return {
    title: '测试卦例',
    date: '2026-08-04',
    method: 'qian',
    params: { lines: '111111' },
    jixiong: '',
    status: '未反馈',
    tags: [],
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  sessionStorage.clear()
})

beforeEach(async () => {
  sessionStorage.clear() // 会话级筛选恢复 key 隔离（避免前一测试残留 q/tags 干扰本测试）
  const db = await openDB()
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['guashi', 'tags'], 'readwrite')
    tx.objectStore('guashi').clear()
    tx.objectStore('tags').clear()
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
})

describe('GuashiLibPage 编辑视图双栏（v0.2 功能 G）', () => {
  test('打开编辑：盘面在左、占断在右，容器为 ≥lg 两栏', async () => {
    const snap = paipan({
      method: 'qian',
      params: { lines: '111111', dong: [0, 2] },
      date: new Date(2026, 7, 4, 10, 30),
    })
    await addGuashi(rec({ title: '双栏卦例', panSnapshot: snap }))
    renderPage()
    fireEvent.click(await screen.findByText('双栏卦例'))
    await screen.findByText('编辑卦例')
    // 双栏容器（2026-08-10：左列固定 672px 与排盘页 PanView 等宽，修复画板偏移）
    const grid = document.querySelector('[class*="672px"]')
    expect(grid).toBeTruthy()
    // 左列盘面 + 右列占断同在一个网格容器
    expect(within(grid).getByTestId('pan-view')).toBeTruthy()
    expect(within(grid).getByText('占断')).toBeTruthy()
    // 快照盘面正常传入（无自定用神 → none）
    expect(within(grid).getByTestId('pan-view').getAttribute('data-yongshen')).toBe('none')
  })
})

describe('GuashiLibPage 编辑视图背景信息（v0.2 功能 D，2026-08-11 回归）', () => {
  test('打开含 background 的卦例：背景文本框回填显示原内容', async () => {
    await addGuashi(rec({ title: '背景卦例', background: '原背景：问事业' }))
    renderPage()
    fireEvent.click(await screen.findByText('背景卦例'))
    await screen.findByText('编辑卦例')
    expect(screen.getByPlaceholderText('占问背景（事由、双方关系、环境等）…').value).toBe('原背景：问事业')
  })

  test('编辑页修改背景并保存：落库为最新输入（输入不被吞、保存不丢）', async () => {
    await addGuashi(rec({ title: '改背景卦例', background: '旧背景' }))
    renderPage()
    fireEvent.click(await screen.findByText('改背景卦例'))
    await screen.findByText('编辑卦例')
    const bg = screen.getByPlaceholderText('占问背景（事由、双方关系、环境等）…')
    // 回填显示旧背景后，输入新内容（duanOf 若缺 background 会吞输入——回归点）
    fireEvent.change(bg, { target: { value: '新背景：占测出行' } })
    expect(bg.value).toBe('新背景：占测出行')
    fireEvent.click(screen.getAllByText('保存修改')[0])
    await waitFor(() => expect(screen.getAllByText('已保存修改').length).toBeGreaterThan(0))
    const list = await listGuashi()
    expect(list[0].background).toBe('新背景：占测出行')
  })
})

describe('GuashiLibPage 主筛选互斥单组（v1.3.0 三态口径）', () => {
  test('URL status=pending 只显示五者全空（待占断）的卦例', async () => {
    await addGuashi(rec({ title: '待占断卦例' })) // 断语/应期/方位/取数/吉凶 全空
    await addGuashi(rec({ title: '有吉凶卦例', jixiong: '吉' }))
    await addGuashi(rec({ title: '有取数卦例', quShu: '三' }))
    renderPage('/lib?status=pending')
    expect(await screen.findByText('待占断卦例')).toBeTruthy()
    expect(screen.queryByText('有吉凶卦例')).toBeNull()
    expect(screen.queryByText('有取数卦例')).toBeNull()
  })

  test('旧 query 兼容过渡：pending=1 / status=未反馈 / status=已反馈 均可解析', async () => {
    await addGuashi(rec({ title: '旧pending' }))
    await addGuashi(rec({ title: '旧待反馈', jixiong: '吉' }))
    await addGuashi(rec({ title: '旧已反馈', fankui: 'x', jixiongOk: '对' }))
    // 旧 pending=1 → 待占断
    renderPage('/lib?pending=1')
    expect(await screen.findByText('旧pending')).toBeTruthy()
    expect(screen.queryByText('旧待反馈')).toBeNull()
    expect(screen.queryByText('旧已反馈')).toBeNull()
    // 旧 status=未反馈 → unfed（待反馈）
    cleanup()
    renderPage('/lib?status=未反馈')
    expect(await screen.findByText('旧待反馈')).toBeTruthy()
    expect(screen.queryByText('旧pending')).toBeNull()
    expect(screen.queryByText('旧已反馈')).toBeNull()
    // 旧 status=已反馈 → fed
    cleanup()
    renderPage('/lib?status=已反馈')
    expect(await screen.findByText('旧已反馈')).toBeTruthy()
    expect(screen.queryByText('旧pending')).toBeNull()
    expect(screen.queryByText('旧待反馈')).toBeNull()
  })

  test('v1.3.0 三态：待反馈 = 五者任一非空且 fankui 空；已反馈 = fankui 非空；待占断 = 五者全空', async () => {
    await addGuashi(rec({ title: '待反馈卦例', jixiong: '吉' })) // 有内容无反馈
    await addGuashi(rec({ title: '待反馈-取数', quShu: '三' }))
    await addGuashi(rec({ title: '待占断卦例' })) // 五者全空
    await addGuashi(rec({ title: '已反馈卦例', fankui: 'x' }))
    await addGuashi(rec({ title: '旧脏数据', status: '已反馈', jixiong: '吉' })) // status 已反馈但无 fankui → 归待反馈
    renderPage('/lib?status=unfed')
    expect(await screen.findByText('待反馈卦例')).toBeTruthy()
    expect(screen.getByText('待反馈-取数')).toBeTruthy()
    expect(screen.getByText('旧脏数据')).toBeTruthy()
    expect(screen.queryByText('待占断卦例')).toBeNull()
    expect(screen.queryByText('已反馈卦例')).toBeNull()
    // 待占断视角
    cleanup()
    renderPage('/lib?status=pending')
    expect(await screen.findByText('待占断卦例')).toBeTruthy()
    expect(screen.queryByText('待反馈卦例')).toBeNull()
    // 已反馈视角（fankui 非空才命中）
    cleanup()
    renderPage('/lib?status=fed')
    expect(await screen.findByText('已反馈卦例')).toBeTruthy()
    expect(screen.queryByText('旧脏数据')).toBeNull() // status 已反馈但 fankui 空 → 不算已反馈
    expect(screen.queryByText('待反馈卦例')).toBeNull()
  })

  test('互斥：点击「待反馈」自动取消「待占断」；「全部」清除筛选', async () => {
    await addGuashi(rec({ title: '待占断卦例' }))
    await addGuashi(rec({ title: '待反馈卦例', jixiong: '吉' }))
    renderPage('/lib?status=pending')
    expect(await screen.findByText('待占断卦例')).toBeTruthy()
    expect(screen.queryByText('待反馈卦例')).toBeNull()
    // 点「待反馈」→ status=pending 被取消，仅剩待反馈
    fireEvent.click(screen.getByText('待反馈'))
    expect(await screen.findByText('待反馈卦例')).toBeTruthy()
    expect(screen.queryByText('待占断卦例')).toBeNull()
    // 点「全部」→ 清除筛选，两者都显示
    fireEvent.click(screen.getByText('全部'))
    expect(await screen.findByText('待占断卦例')).toBeTruthy()
    expect(screen.getByText('待反馈卦例')).toBeTruthy()
  })

  test('三态互斥不重叠：待占断/待反馈/已反馈 各只命中自己的记录', async () => {
    await addGuashi(rec({ title: 'A待占断' }))
    await addGuashi(rec({ title: 'B待反馈', jixiong: '吉' }))
    await addGuashi(rec({ title: 'C已反馈', fankui: 'x', jixiongOk: '对' }))
    renderPage('/lib?status=pending')
    expect(await screen.findByText('A待占断')).toBeTruthy()
    expect(screen.queryByText('B待反馈')).toBeNull()
    expect(screen.queryByText('C已反馈')).toBeNull()
    fireEvent.click(screen.getByText('待反馈'))
    expect(await screen.findByText('B待反馈')).toBeTruthy()
    expect(screen.queryByText('A待占断')).toBeNull()
    expect(screen.queryByText('C已反馈')).toBeNull()
    fireEvent.click(screen.getByText('已反馈'))
    expect(await screen.findByText('C已反馈')).toBeTruthy()
    expect(screen.queryByText('A待占断')).toBeNull()
    expect(screen.queryByText('B待反馈')).toBeNull()
  })

  test('v1.3.0 待反馈子筛选：quShu=1 只显示有取数文本的卦例', async () => {
    await addGuashi(rec({ title: '有取数', quShu: '三' }))
    await addGuashi(rec({ title: '无取数', jixiong: '吉' }))
    renderPage('/lib?status=unfed&quShu=1')
    expect(await screen.findByText('有取数')).toBeTruthy()
    expect(screen.queryByText('无取数')).toBeNull()
    // 清除取数子筛选（点击「取数」按钮）→ 两者都显示
    fireEvent.click(screen.getByText('取数'))
    expect(await screen.findByText('无取数')).toBeTruthy()
    expect(screen.getByText('有取数')).toBeTruthy()
  })
})

describe('GuashiLibPage 排序（v0.10 改进建8 #3）', () => {
  /** 卡片列表标题顺序（GuashiCard mock 渲染 <button>） */
  const cardTitles = () =>
    Array.from(document.querySelector('[class*="grid gap-3"]').querySelectorAll('button')).map(
      (b) => b.textContent,
    )

  test('默认创建时间新→旧；sort=created-asc 旧→新（URL 持久）', async () => {
    await addGuashi(rec({ title: '旧记录', createdAt: 1000, updatedAt: 1000 }))
    await addGuashi(rec({ title: '新记录', createdAt: 2000, updatedAt: 2000 }))
    renderPage()
    await screen.findByText('新记录')
    expect(cardTitles()).toEqual(['新记录', '旧记录'])
    // 切到旧→新（选择器 → URL sort=created-asc）
    fireEvent.change(screen.getByLabelText(/排序/), { target: { value: 'created-asc' } })
    await waitFor(() => expect(cardTitles()).toEqual(['旧记录', '新记录']))
    // URL 已带 sort 参数（刷新/分享保持）
    expect(screen.getByLabelText(/排序/).value).toBe('created-asc')
  })

  test('sort=updated-asc 最后编辑旧→新；updatedAt 缺失回退 createdAt', async () => {
    // 用 replaceAllGuashi 原样写入（不经 withDefaults 补 updatedAt），模拟旧记录缺 updatedAt 的形态
    await replaceAllGuashi([
      { id: 1, title: 'A最后编辑新', status: '未反馈', jixiong: '', createdAt: 1000, updatedAt: 3000 },
      { id: 2, title: 'B最后编辑旧', status: '未反馈', jixiong: '', createdAt: 2000, updatedAt: 1000 },
      { id: 3, title: 'C无updatedAt', status: '未反馈', jixiong: '', createdAt: 1500 }, // 回退 createdAt=1500
    ])
    renderPage('/lib?sort=updated-asc')
    await screen.findByText('A最后编辑新')
    await waitFor(() =>
      expect(cardTitles()).toEqual(['B最后编辑旧', 'C无updatedAt', 'A最后编辑新']),
    )
  })

  test('排序与筛选共存：先筛选后排序（status=pending + sort=created-asc）', async () => {
    await addGuashi(rec({ title: '旧待占断', jixiong: '', createdAt: 1000 }))
    await addGuashi(rec({ title: '新待占断', jixiong: '', createdAt: 3000 }))
    await addGuashi(rec({ title: '有吉凶', jixiong: '吉', createdAt: 2000 }))
    renderPage('/lib?status=pending&sort=created-asc')
    await screen.findByText('旧待占断')
    expect(cardTitles()).toEqual(['旧待占断', '新待占断'])
    expect(screen.queryByText('有吉凶')).toBeNull()
  })

  test('sort=tag-match：命中已选标签数多的排前面（最符合标签，平局按创建时间新→旧）', async () => {
    await addTag({ name: '占病', color: '#e74c3c' })
    await addTag({ name: '工作', color: '#3498db' })
    await addTag({ name: '出行', color: '#2ecc71' })
    await addGuashi(rec({ title: '命中三个', tags: ['占病', '工作', '出行'], createdAt: 1000 }))
    await addGuashi(rec({ title: '命中两个旧', tags: ['占病', '工作'], createdAt: 1500 }))
    await addGuashi(rec({ title: '命中两个新', tags: ['工作', '出行'], createdAt: 2000 }))
    await addGuashi(rec({ title: '命中一个', tags: ['占病'], createdAt: 3000 }))
    renderPage('/lib?tags=占病&tags=工作&tags=出行&sort=tag-match')
    await screen.findByText('命中三个')
    await waitFor(() => expect(cardTitles()).toEqual(['命中三个', '命中两个新', '命中两个旧', '命中一个']))
  })

  test('sort=tag-match 只选 1 个标签时：选项禁用且自动跳回创建时间新→旧', async () => {
    await addTag({ name: '占病', color: '#e74c3c' })
    await addGuashi(rec({ title: '单标签', tags: ['占病'] }))
    renderPage('/lib?tags=占病&sort=tag-match')
    await screen.findByText('单标签')
    expect(screen.getByRole('option', { name: '最符合标签' }).disabled).toBe(true)
    expect(screen.getByLabelText(/排序/).value).toBe('created-desc') // 归一化自动跳回
  })

  test('取消标签到只剩 1 个时「最符合标签」自动跳回创建时间新→旧', async () => {
    await addTag({ name: '占病', color: '#e74c3c' })
    await addTag({ name: '工作', color: '#3498db' })
    await addGuashi(rec({ title: '双标签', tags: ['占病', '工作'] }))
    renderPage('/lib?tags=占病&tags=工作&sort=tag-match')
    await screen.findByText('双标签')
    expect(screen.getByLabelText(/排序/).value).toBe('tag-match')
    // 等标签加载完成（选中态 title=取消筛选）再取消；getAllByTitle 不加等待会因 listTags 异步而 flaky
    fireEvent.click((await waitFor(() => screen.getAllByTitle('取消筛选')))[0])
    await waitFor(() => expect(screen.getByLabelText(/排序/).value).toBe('created-desc'))
    expect(screen.getByRole('option', { name: '最符合标签' }).disabled).toBe(true)
  })
})

describe('GuashiLibPage URL 标签参数（v0.2 功能 J）', () => {
  test('tags= 重复参数预选标签（统计页跳转联动）', async () => {
    await addTag({ name: '占病', color: '#e74c3c' })
    await addTag({ name: '工作', color: '#3498db' })
    await addGuashi(rec({ title: '带标签卦例', tags: ['占病', '工作'] }))
    renderPage('/lib?tags=占病&tags=工作')
    // 两个标签均被选中（选中态 title=取消筛选）
    await waitFor(() => expect(screen.getAllByTitle('取消筛选')).toHaveLength(2))
  })

  test('tags= 与 pending=1 共存：只显示命中标签且待占断的卦例', async () => {
    await addTag({ name: '占病', color: '#e74c3c' })
    await addGuashi(rec({ title: '命中且待占断', jixiong: '', tags: ['占病'] }))
    await addGuashi(rec({ title: '命中但有吉凶', jixiong: '吉', tags: ['占病'] }))
    await addGuashi(rec({ title: '未命中待占断', jixiong: '', tags: [] }))
    renderPage('/lib?tags=占病&pending=1')
    expect(await screen.findByText('命中且待占断')).toBeTruthy()
    expect(screen.queryByText('命中但有吉凶')).toBeNull()
    expect(screen.queryByText('未命中待占断')).toBeNull()
  })

  test('手动取消标签同步移除 URL tags：重挂载后不复活（bug 回归）', async () => {
    await addTag({ name: '占病', color: '#e74c3c' })
    await addTag({ name: '工作', color: '#3498db' })
    await addGuashi(rec({ title: '带标签卦例', tags: ['占病', '工作'] }))
    renderPage('/lib?tags=占病&tags=工作')
    await waitFor(() => expect(screen.getAllByTitle('取消筛选')).toHaveLength(2))
    // 手动取消「占病」→ 只剩「工作」选中（URL tags=占病 同步移除）
    fireEvent.click(screen.getAllByTitle('取消筛选')[0])
    await waitFor(() => expect(screen.getAllByTitle('取消筛选')).toHaveLength(1))
    // 重挂载（切走再回来，URL 回到 /lib 无 query）：「占病」不得复活，「工作」保持
    cleanup()
    renderPage('/lib')
    await waitFor(() => expect(screen.getAllByTitle('取消筛选')).toHaveLength(1))
    expect(screen.getByText('占病').closest('button')?.title).toBe('按此标签筛选')
    expect(screen.getByText('工作').closest('button')?.title).toBe('取消筛选')
  })

  test('全部取消标签后重挂载：不再恢复任何标签', async () => {
    await addTag({ name: '占病', color: '#e74c3c' })
    await addGuashi(rec({ title: '带标签卦例', tags: ['占病'] }))
    renderPage('/lib?tags=占病')
    await waitFor(() => expect(screen.getAllByTitle('取消筛选')).toHaveLength(1))
    fireEvent.click(screen.getAllByTitle('取消筛选')[0])
    await waitFor(() => expect(screen.queryAllByTitle('取消筛选')).toHaveLength(0))
    cleanup()
    renderPage('/lib')
    await waitFor(() => expect(screen.queryAllByTitle('取消筛选')).toHaveLength(0))
  })

  test('「清空筛选」按钮一键清除全部筛选（状态/对错/标签/时间/排序）', async () => {
    await addTag({ name: '占病', color: '#e74c3c' })
    await addGuashi(rec({ title: '全部可见', tags: ['占病'], fankui: 'x', jixiong: '吉', jixiongOk: '对', createdAt: new Date(2026, 7, 15, 12).getTime() })) // createdAt 固定 8/15，避免落当前时间被 to=2026-08-31 排除（时间脆弱）
    renderPage('/lib?status=fed&tags=占病&jixiongOk=对&from=2026-08-01&to=2026-08-31&sort=created-asc')
    await screen.findByText('全部可见')
    fireEvent.click(screen.getByText('清空筛选'))
    await waitFor(() => {
      expect(screen.queryAllByTitle('取消筛选')).toHaveLength(0)
      expect(screen.getByLabelText(/排序/).value).toBe('created-desc') // 排序回归默认
    })
    expect(screen.getByText('全部可见')).toBeTruthy()
  })
})

describe('GuashiLibPage 严格筛选（全部命中标签，v0.10 追加）', () => {
  test('strict=1：只显示命中全部所选标签的卦例（任一命中的被排除）', async () => {
    await addTag({ name: '占病', color: '#e74c3c' })
    await addTag({ name: '工作', color: '#3498db' })
    await addGuashi(rec({ title: '全命中', tags: ['占病', '工作'] }))
    await addGuashi(rec({ title: '单命中', tags: ['占病'] }))
    await addGuashi(rec({ title: '未命中', tags: [] }))
    renderPage('/lib?tags=占病&tags=工作&strict=1')
    expect(await screen.findByText('全命中')).toBeTruthy()
    expect(screen.queryByText('单命中')).toBeNull()
    expect(screen.queryByText('未命中')).toBeNull()
  })

  test('未选/只选 1 个标签时严格勾选禁用', async () => {
    await addTag({ name: '占病', color: '#e74c3c' })
    await addGuashi(rec({ title: '单标签', tags: ['占病'] }))
    renderPage('/lib?tags=占病')
    await screen.findByText('单标签')
    expect(screen.getByLabelText(/严格筛选/).disabled).toBe(true)
  })

  test('开启严格时若已启用「最符合标签」自动切回创建时间新→旧', async () => {
    await addTag({ name: '占病', color: '#e74c3c' })
    await addTag({ name: '工作', color: '#3498db' })
    await addGuashi(rec({ title: '双标签', tags: ['占病', '工作'] }))
    renderPage('/lib?tags=占病&tags=工作&sort=tag-match')
    await screen.findByText('双标签')
    expect(screen.getByLabelText(/排序/).value).toBe('tag-match')
    const cb = screen.getByLabelText(/严格筛选/)
    expect(cb.disabled).toBe(false)
    fireEvent.click(cb)
    await waitFor(() => expect(screen.getByLabelText(/排序/).value).toBe('created-desc'))
  })
})

describe('GuashiLibPage 编辑视图自定用神（v0.2 功能 I）', () => {
  test('快照用神回显，换用神后保存落库（panSnapshot.yongShen + 顶层 yongShen）', async () => {
    const snap = paipan({
      method: 'qian',
      params: { lines: '111111', dong: [0, 2] },
      date: new Date(2026, 7, 4, 10, 30),
      yongShen: { type: 'liuqin', value: '财' },
    })
    await addGuashi(rec({ title: '用神卦例', panSnapshot: snap, yongShen: { type: 'liuqin', value: '财' } }))
    renderPage()
    fireEvent.click(await screen.findByText('用神卦例'))
    await screen.findByText('编辑卦例')
    // 回显：快照烘焙用神 → 财（编辑态用神由异步 effect 回填，用 waitFor 等待）
    await waitFor(() => {
      expect(screen.getByTestId('pan-view').getAttribute('data-yongshen')).toBe('财')
      expect(screen.getByTestId('yong-shen').getAttribute('data-value')).toBe('liuqin:财')
    })
    // 换用神 → 重排盘带新用神
    fireEvent.click(screen.getByText('选官'))
    expect(screen.getByTestId('pan-view').getAttribute('data-yongshen')).toBe('官')
    // 保存 → 落库（页面有顶栏+占断区两个「保存修改」，取任一）
    fireEvent.click(screen.getAllByText('保存修改')[0])
    // 保存成功提示（顶栏与占断区各渲染一处 msg）
    await waitFor(() => expect(screen.getAllByText('已保存修改').length).toBeGreaterThan(0))
    const recs = await listGuashi()
    expect(recs).toHaveLength(1)
    expect(recs[0].panSnapshot.yongShen).toEqual({ type: 'liuqin', value: '官' })
    expect(recs[0].yongShen).toEqual({ type: 'liuqin', value: '官' })
  })

  test('用神未变化时保存不改变快照（快照优先，向后兼容）', async () => {
    const snap = paipan({
      method: 'qian',
      params: { lines: '111111', dong: [0, 2] },
      date: new Date(2026, 7, 4, 10, 30),
    })
    await addGuashi(rec({ title: '无快照用神', panSnapshot: snap }))
    renderPage()
    fireEvent.click(await screen.findByText('无快照用神'))
    await screen.findByText('编辑卦例')
    fireEvent.click(screen.getAllByText('保存修改')[0])
    await waitFor(() => expect(screen.getAllByText('已保存修改').length).toBeGreaterThan(0))
    const recs = await listGuashi()
    // 快照内容不变（IndexedDB 读回为深拷贝，用深比较；用神未变化 → 未烘焙新用神）
    expect(recs[0].panSnapshot).toEqual(snap)
    expect(recs[0].panSnapshot.yongShen ?? null).toBeNull()
    expect(recs[0].yongShen).toBeNull()
  })

  test('md 导入记录（无快照、顶层 yongShen）编辑时重排恢复用神', async () => {
    await addGuashi({
      title: '导入卦例',
      date: '2026-08-04 10:30',
      method: 'qian',
      params: { lines: '111111', dong: [0, 2] },
      panSnapshot: null, // md 导入恒无快照
      yongShen: { type: 'liuqin', value: '财' }, // 从 md 盘面「用神」行解析
      jixiong: '',
      status: '未反馈',
    })
    renderPage()
    fireEvent.click(await screen.findByText('导入卦例'))
    await screen.findByText('编辑卦例')
    // 重排盘后盘面带用神高亮 + 选择器回显（编辑态用神由异步 effect 回填，用 waitFor 等待）
    await waitFor(() => {
      expect(screen.getByTestId('pan-view').getAttribute('data-yongshen')).toBe('财')
      expect(screen.getByTestId('yong-shen').getAttribute('data-value')).toBe('liuqin:财')
    })
  })
})

describe('GuashiLibPage 编辑视图画板（v0.10 #1/#16）', () => {
  test('编辑视图盘面区提供画板：record.doodle 回填显示且默认联动开启（v0.10 改进建7 #1）', async () => {
    const doodle = { version: 1, width: 600, height: 400, elements: [{ type: 'pen', color: '#e74c3c', width: 4, points: [{ x: 1, y: 2 }] }] }
    await addGuashi(rec({
      title: '带涂鸦卦例',
      panSnapshot: paipan({ method: 'qian', params: { lines: '111111', dong: [0, 2] }, date: new Date(2026, 7, 4, 10, 30) }),
      doodle,
    }))
    renderPage()
    fireEvent.click(await screen.findByText('带涂鸦卦例'))
    await screen.findByText('编辑卦例')
    // 画板数据回填 + 默认开启（record.doodle 非空 → doodleOn ?? true；编辑态由异步 effect 回填）
    await waitFor(() => {
      expect(screen.getByTestId('pan-view').getAttribute('data-doodle')).toBe('yes')
      expect(screen.getByTestId('pan-view').getAttribute('data-doodle-enabled')).toBe('yes')
    })
  })

  test('编辑视图画板默认开启状态随 record.doodleOn（旧记录无 doodle 默认关）', async () => {
    await addGuashi(rec({
      title: '无涂鸦卦例',
      panSnapshot: paipan({ method: 'qian', params: { lines: '111111', dong: [0, 2] }, date: new Date(2026, 7, 4, 10, 30) }),
    }))
    renderPage()
    fireEvent.click(await screen.findByText('无涂鸦卦例'))
    await screen.findByText('编辑卦例')
    await waitFor(() => {
      expect(screen.getByTestId('pan-view').getAttribute('data-doodle-enabled')).toBe('no')
    })
  })

  test('保存修改时 record.doodle 落库（空涂鸦不落库）', async () => {
    const snap = paipan({ method: 'qian', params: { lines: '111111', dong: [0, 2] }, date: new Date(2026, 7, 4, 10, 30) })
    await addGuashi(rec({ title: '画板保存', panSnapshot: snap }))
    renderPage()
    fireEvent.click(await screen.findByText('画板保存'))
    await screen.findByText('编辑卦例')
    // 无 doodle → 保存后仍无 doodle 字段
    fireEvent.click(screen.getAllByText('保存修改')[0])
    await waitFor(() => expect(screen.getAllByText('已保存修改').length).toBeGreaterThan(0))
    const recs = await listGuashi()
    expect(recs[0].doodle ?? null).toBeNull()
  })
})

describe('GuashiLibPage 创建时间范围筛选（from=/to=，新历含起止当天）', () => {
  const D = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime()

  test('URL from= 只显示创建于该天及之后的卦例（含当天）', async () => {
    await addGuashi(rec({ title: '8月1日卦例', createdAt: D(2026, 8, 1) }))
    await addGuashi(rec({ title: '8月8日卦例', createdAt: D(2026, 8, 8) }))
    await addGuashi(rec({ title: '8月15日卦例', createdAt: D(2026, 8, 15) }))
    renderPage('/lib?from=2026-08-08')
    expect(await screen.findByText('8月8日卦例')).toBeTruthy()
    expect(screen.getByText('8月15日卦例')).toBeTruthy()
    expect(screen.queryByText('8月1日卦例')).toBeNull()
  })

  test('URL to= 只显示创建于该天及之前的卦例（含当天）', async () => {
    await addGuashi(rec({ title: '8月1日卦例', createdAt: D(2026, 8, 1) }))
    await addGuashi(rec({ title: '8月8日卦例', createdAt: D(2026, 8, 8, 23, 30) })) // 当天 23:30 仍算当天
    await addGuashi(rec({ title: '8月9日卦例', createdAt: D(2026, 8, 9) }))
    renderPage('/lib?to=2026-08-08')
    expect(await screen.findByText('8月1日卦例')).toBeTruthy()
    expect(screen.getByText('8月8日卦例')).toBeTruthy()
    expect(screen.queryByText('8月9日卦例')).toBeNull()
  })

  test('from + to 组合：只显示区间内创建的卦例', async () => {
    await addGuashi(rec({ title: '区间外早', createdAt: D(2026, 8, 1) }))
    await addGuashi(rec({ title: '区间内A', createdAt: D(2026, 8, 5) }))
    await addGuashi(rec({ title: '区间内B', createdAt: D(2026, 8, 12, 23, 59) }))
    await addGuashi(rec({ title: '区间外晚', createdAt: D(2026, 8, 20) }))
    renderPage('/lib?from=2026-08-05&to=2026-08-12')
    expect(await screen.findByText('区间内A')).toBeTruthy()
    expect(screen.getByText('区间内B')).toBeTruthy()
    expect(screen.queryByText('区间外早')).toBeNull()
    expect(screen.queryByText('区间外晚')).toBeNull()
  })

  test('筛选栏日期输入：填写开始/结束日期 → URL 参数生效并过滤', async () => {
    await addGuashi(rec({ title: '早卦例', createdAt: D(2026, 8, 1) }))
    await addGuashi(rec({ title: '晚卦例', createdAt: D(2026, 8, 20) }))
    renderPage()
    expect(await screen.findByText('早卦例')).toBeTruthy()
    // 填开始日期 2026-08-10
    const fromInput = screen.getByTitle('创建时间范围：开始日期')
    fireEvent.change(fromInput, { target: { value: '2026-08-10' } })
    await waitFor(() => expect(screen.queryByText('早卦例')).toBeNull())
    expect(screen.getByText('晚卦例')).toBeTruthy()
    // 「清除时间」按钮恢复全部
    fireEvent.click(screen.getByTitle('清除时间筛选'))
    await waitFor(() => expect(screen.getByText('早卦例')).toBeTruthy())
  })

  test('createdAt 缺失的记录回退 id 参与过滤（不因缺时间戳而被排除在 to= 之外）', async () => {
    await addGuashi(rec({ title: '无时间戳卦例' })) // createdAt 由 addGuashi 自动生成（现在时刻）
    renderPage('/lib?from=2026-01-01')
    expect(await screen.findByText('无时间戳卦例')).toBeTruthy()
  })
})

describe('GuashiLibPage v1.3.0 Bug1：fed 取数反馈多选', () => {
  test('URL quShuFb 重复参数（神准+相近 同时命中=同维度或），错 被排除', async () => {
    await addGuashi(rec({ title: '神准卦', fankui: 'x', quShu: '三', quShuFb: '神准' }))
    await addGuashi(rec({ title: '相近卦', fankui: 'x', quShu: '五', quShuFb: '相近' }))
    await addGuashi(rec({ title: '错卦', fankui: 'x', quShu: '七', quShuFb: '错' }))
    renderPage('/lib?status=fed&quShuFb=神准&quShuFb=相近')
    expect(await screen.findByText('神准卦')).toBeTruthy()
    expect(screen.getByText('相近卦')).toBeTruthy()
    expect(screen.queryByText('错卦')).toBeNull()
  })

  test('UI 点击叠加：取数神准+相近 可同时选中；再点取消单项', async () => {
    await addGuashi(rec({ title: '神准卦', fankui: 'x', quShu: '三', quShuFb: '神准' }))
    await addGuashi(rec({ title: '相近卦', fankui: 'x', quShu: '五', quShuFb: '相近' }))
    await addGuashi(rec({ title: '错卦', fankui: 'x', quShu: '七', quShuFb: '错' }))
    renderPage('/lib?status=fed')
    await screen.findByText('神准卦')
    // 点「取数神准」→ 只剩神准
    fireEvent.click(screen.getByText('取数神准'))
    expect(await screen.findByText('神准卦')).toBeTruthy()
    expect(screen.queryByText('相近卦')).toBeNull()
    // 再点「取数相近」→ 神准+相近 同时命中（多选叠加，同维度或）
    fireEvent.click(screen.getByText('取数相近'))
    expect(await screen.findByText('相近卦')).toBeTruthy()
    expect(screen.getByText('神准卦')).toBeTruthy()
    expect(screen.queryByText('错卦')).toBeNull()
    // 取消「取数神准」→ 只剩相近
    fireEvent.click(screen.getByText('取数神准'))
    expect(await screen.findByText('相近卦')).toBeTruthy()
    expect(screen.queryByText('神准卦')).toBeNull()
  })

  test('v1.3.0 fed 吉凶/应期/方位对错也支持多选（对+错同时选中=同维度或）', async () => {
    await addGuashi(rec({ title: '对卦', fankui: 'x', jixiong: '吉', jixiongOk: '对' }))
    await addGuashi(rec({ title: '错卦', fankui: 'x', jixiong: '凶', jixiongOk: '错' }))
    await addGuashi(rec({ title: '空卦', fankui: 'x' })) // jixiongOk 未填
    // URL 多值：对+错 同选 → 两条都显示，空 被排除
    renderPage('/lib?status=fed&jixiongOk=对&jixiongOk=错')
    expect(await screen.findByText('对卦')).toBeTruthy()
    expect(screen.getByText('错卦')).toBeTruthy()
    expect(screen.queryByText('空卦')).toBeNull()
    // UI 叠加：点「吉凶对」→ 再点「吉凶错」→ 都命中（按钮与卡片标题不同名，无冲突）
    cleanup()
    renderPage('/lib?status=fed')
    await screen.findByText('对卦')
    fireEvent.click(screen.getByText('吉凶对'))
    fireEvent.click(screen.getByText('吉凶错'))
    await waitFor(() => {
      expect(screen.getByText('对卦')).toBeTruthy()
      expect(screen.getByText('错卦')).toBeTruthy()
      expect(screen.queryByText('空卦')).toBeNull()
    })
  })

  test('v1.3.0 待反馈吉/凶 可同选（同维度或）', async () => {
    await addGuashi(rec({ title: '吉卦', jixiong: '吉' }))
    await addGuashi(rec({ title: '凶卦', jixiong: '凶' }))
    renderPage('/lib?status=unfed&jixiong=吉&jixiong=凶')
    expect(await screen.findByText('吉卦')).toBeTruthy()
    expect(screen.getByText('凶卦')).toBeTruthy()
  })
})

describe('GuashiLibPage v1.3.0 Bug2：未保存修改返回提示', () => {
  test('编辑后点返回弹窗；取消留在编辑页；不保存返回 → 库中未变', async () => {
    await addGuashi(rec({ title: '待编辑卦例', fankui: 'x', jixiongOk: '对' }))
    renderPage()
    fireEvent.click(await screen.findByText('待编辑卦例'))
    await screen.findByText('编辑卦例')
    // 修改标题（触发 markDirty）
    fireEvent.change(screen.getByPlaceholderText('占问内容'), { target: { value: '修改后标题' } })
    // 点返回列表 → 弹窗出现
    fireEvent.click(screen.getByText('← 返回列表'))
    expect(screen.getByText('有未保存的修改')).toBeTruthy()
    // 取消 → 留在编辑页（弹窗关闭）
    fireEvent.click(screen.getByText('取消'))
    expect(screen.queryByText('有未保存的修改')).toBeNull()
    expect(screen.getByText('编辑卦例')).toBeTruthy()
    // 再返回 → 不保存返回 → 回列表，库中未被修改
    fireEvent.click(screen.getByText('← 返回列表'))
    fireEvent.click(screen.getByText('不保存返回'))
    await waitFor(() => expect(screen.queryByText('编辑卦例')).toBeNull())
    const list = await listGuashi()
    expect(list[0].title).toBe('待编辑卦例')
  })

  test('保存并返回 → 修改落库 + 回列表 + 草稿清除（重开为库值）', async () => {
    await addGuashi(rec({ title: '待编辑卦例', fankui: 'x', jixiongOk: '对' }))
    renderPage()
    fireEvent.click(await screen.findByText('待编辑卦例'))
    await screen.findByText('编辑卦例')
    fireEvent.change(screen.getByPlaceholderText('占问内容'), { target: { value: '保存后标题' } })
    fireEvent.click(screen.getByText('← 返回列表'))
    expect(screen.getByText('有未保存的修改')).toBeTruthy()
    fireEvent.click(screen.getByText('保存并返回'))
    await waitFor(() => expect(screen.queryByText('编辑卦例')).toBeNull())
    const list = await listGuashi()
    expect(list[0].title).toBe('保存后标题')
    // 草稿已清：重开卡片显示库值（无残留恢复）
    fireEvent.click(await screen.findByText('保存后标题'))
    await screen.findByText('编辑卦例')
    expect(screen.getByPlaceholderText('占问内容').value).toBe('保存后标题')
  })

  test('无修改直接返回：不弹窗，直接回列表', async () => {
    await addGuashi(rec({ title: '未改动卦例', fankui: 'x', jixiongOk: '对' }))
    renderPage()
    fireEvent.click(await screen.findByText('未改动卦例'))
    await screen.findByText('编辑卦例')
    fireEvent.click(screen.getByText('← 返回列表'))
    await waitFor(() => expect(screen.queryByText('编辑卦例')).toBeNull())
    expect(screen.queryByText('有未保存的修改')).toBeNull()
  })
})

describe('GuashiLibPage v1.3.0 Bug3：编辑草稿惰性（切页不丢）', () => {
  test('未保存修改 → 卸载重挂载（切页返回）→ 内容恢复', async () => {
    await addGuashi(rec({ title: '草稿卦例', fankui: 'x', jixiongOk: '对' }))
    const first = renderPage()
    fireEvent.click(await screen.findByText('草稿卦例'))
    await screen.findByText('编辑卦例')
    fireEvent.change(screen.getByPlaceholderText('占问内容'), { target: { value: '未保存的标题' } })
    // 切页：卸载（模拟导航到其他路由）
    first.unmount()
    // 返回：重新挂载 → 编辑会话 + 草稿恢复
    renderPage()
    await screen.findByText('编辑卦例')
    expect(screen.getByPlaceholderText('占问内容').value).toBe('未保存的标题')
  })

  test('保存后草稿清除：切页返回显示库值（非草稿）', async () => {
    await addGuashi(rec({ title: '已存卦例', fankui: 'x', jixiongOk: '对' }))
    const first = renderPage()
    fireEvent.click(await screen.findByText('已存卦例'))
    await screen.findByText('编辑卦例')
    fireEvent.change(screen.getByPlaceholderText('占问内容'), { target: { value: '已保存标题' } })
    fireEvent.click(screen.getAllByText('保存修改')[0])
    await waitFor(() => expect(screen.getAllByText('已保存修改').length).toBeGreaterThan(0))
    first.unmount()
    renderPage()
    await screen.findByText('编辑卦例')
    expect(screen.getByPlaceholderText('占问内容').value).toBe('已保存标题')
  })

  test('v1.3.1 草稿含涂鸦 → 切页返回 applyDraft 生效（草稿保留+dirty 弹窗；修复漏合并 doodle，涂鸦 UI 恢复由用户实测）', async () => {
    await addGuashi(rec({ title: '涂鸦卦例', fankui: 'x', jixiongOk: '对' }))
    const first = renderPage()
    fireEvent.click(await screen.findByText('涂鸦卦例'))
    await screen.findByText('编辑卦例')
    // 触发 dirty（改标题）→ 写草稿；再往草稿塞涂鸦（模拟画板变化后 onDoodleChange 已写入）
    fireEvent.change(screen.getByPlaceholderText('占问内容'), { target: { value: '涂鸦未保存' } })
    const draftKey = Object.keys(sessionStorage).find((k) => k.startsWith('liuyao-edit-draft-'))
    expect(draftKey).toBeTruthy()
    const draft = JSON.parse(sessionStorage.getItem(draftKey))
    draft.doodle = [{ type: 'pen', color: '#f5c518', width: 4, points: [{ x: 10, y: 10 }, { x: 50, y: 50 }] }]
    draft.doodleOn = true
    sessionStorage.setItem(draftKey, JSON.stringify(draft))
    sessionStorage.setItem('liuyao-doodle-on', '1')
    // 切页返回（重挂载）
    first.unmount()
    renderPage()
    await screen.findByText('编辑卦例')
    // applyDraft 生效：草稿未被删（返回 true 不走 else clearDraftFor）+ dirty=true（点返回列表弹三选框）
    expect(sessionStorage.getItem(draftKey)).toBeTruthy()
    fireEvent.click(screen.getByText('← 返回列表'))
    await waitFor(() => expect(screen.getByText(/保存并返回/)).toBeTruthy())
  })
})

describe('GuashiLibPage v1.3.0 严格反馈（strictFb）', () => {
  test('strictFb=1：只看反馈维度恰好等于勾选维度的卦例（未勾选维度有反馈被排除）', async () => {
    await addGuashi(rec({ title: '纯吉凶', fankui: 'x', jixiong: '吉', jixiongOk: '对' }))
    await addGuashi(rec({ title: '吉凶加应期', fankui: 'x', jixiong: '凶', jixiongOk: '错', yingqiOk: '对' }))
    await addGuashi(rec({ title: '纯应期', fankui: 'x', yingqiOk: '错' }))
    renderPage('/lib?status=fed&jixiongOk=对&jixiongOk=错&strictFb=1')
    expect(await screen.findByText('纯吉凶')).toBeTruthy()
    expect(screen.queryByText('吉凶加应期')).toBeNull() // 应期有反馈 → 严格排除
    expect(screen.queryByText('纯应期')).toBeNull() // 无吉凶反馈 → 对+错均不命中
    // UI 关闭严格 → 吉凶加应期 恢复（纯应期仍被对+错排除）
    fireEvent.click(screen.getByLabelText(/严格反馈/))
    await waitFor(() => expect(screen.getByText('吉凶加应期')).toBeTruthy())
    expect(screen.queryByText('纯应期')).toBeNull()
  })

  test('无对错勾选时严格反馈开关禁用', async () => {
    await addGuashi(rec({ title: '已反馈', fankui: 'x', jixiongOk: '对' }))
    renderPage('/lib?status=fed')
    await screen.findByText('已反馈')
    expect(screen.getByLabelText(/严格反馈/).disabled).toBe(true)
  })
})

describe('GuashiLibPage 标签排除（exTags= 三态并存：未选/包含/排除）', () => {
  /** 取标签 chip 外层（rounded-full span）；异步等 chips 渲染（挂载 effect 串行 ensurePresetTags 后才出 chips，放宽超时） */
  const chipOf = async (name) => {
    const inner = await screen.findByText(name, {}, { timeout: 3000 })
    const chip = inner.closest('span[class*="rounded-full"]')
    expect(chip).toBeTruthy()
    return chip
  }
  /** 取某标签 chip 内的 ⊘ 排除按钮（accessible name 用通用文案，避免干扰 role 查询） */
  const excBtnOf = async (name) => within(await chipOf(name)).getByTitle('排除此标签')
  /** 取某标签 chip 主体（包含切换；未含态 title=按此标签筛选） */
  const mainBtnOf = async (name) => within(await chipOf(name)).getByTitle('按此标签筛选')

  test('exTags= 剔除命中排除标签的卦；可与 tags= 包含并存（结果=包含命中∩不含排除）', async () => {
    await addGuashi(rec({ title: '仅工作', tags: ['工作'] }))
    await addGuashi(rec({ title: '仅占病', tags: ['占病'] }))
    await addGuashi(rec({ title: '占病加工作', tags: ['占病', '工作'] }))
    await addGuashi(rec({ title: '无标签' }))
    // 只排除工作：仅工作、占病加工作 被剔除
    renderPage('/lib?exTags=工作')
    await screen.findByText('仅占病')
    expect(screen.queryByText('仅工作')).toBeNull()
    expect(screen.queryByText('占病加工作')).toBeNull()
    expect(screen.getByText('无标签')).toBeTruthy()
    // 包含占病 + 排除工作 → 交集：仅占病 留下（占病加工作 带工作被剔除）
    cleanup()
    sessionStorage.clear()
    renderPage('/lib?tags=占病&exTags=工作')
    expect(await screen.findByText('仅占病')).toBeTruthy()
    expect(screen.queryByText('占病加工作')).toBeNull()
    expect(screen.queryByText('无标签')).toBeNull()
  })

  test('点 ⊘ 排除 → 过滤生效并写 URL exTags；再点取消恢复', async () => {
    await addTag({ name: '占病', color: '#e74c3c' })
    await addTag({ name: '工作', color: '#3498db' })
    await addGuashi(rec({ title: '工作卦', tags: ['工作'] }))
    await addGuashi(rec({ title: '占病卦', tags: ['占病'] }))
    renderPage()
    await screen.findByText('工作卦')
    expect(screen.queryAllByTitle('取消排除')).toHaveLength(0)
    // 排除「工作」→ 工作卦消失、chip 进入排除态
    fireEvent.click(await excBtnOf('工作'))
    await waitFor(() => expect(screen.queryByText('工作卦')).toBeNull())
    expect(screen.getByTitle('取消排除')).toBeTruthy()
    // URL 单一真相源：会话备份 q 已含 exTags=工作（URL 编码中文需 decode）
    expect(decodeURIComponent(sessionStorage.getItem('liuyao-lib-filter'))).toContain('exTags=工作')
    // 再点 ⊘ 取消排除 → 工作卦恢复
    fireEvent.click(screen.getByTitle('取消排除'))
    await waitFor(() => expect(screen.getByText('工作卦')).toBeTruthy())
    expect(screen.queryAllByTitle('取消排除')).toHaveLength(0)
  })

  test('互斥：排除中的标签点主体=回收为包含；严格勾选只数包含组（排除不计）', async () => {
    await addTag({ name: '占病', color: '#e74c3c' })
    await addTag({ name: '工作', color: '#3498db' })
    await addGuashi(rec({ title: 'AB卦', tags: ['占病', '工作'] }))
    renderPage('/lib?exTags=占病')
    await screen.findByTitle('取消排除', {}, { timeout: 3000 })
    expect(screen.queryByText('AB卦')).toBeNull() // 占病被排除 → 隐藏
    // 点占病 chip 主体（改判包含）→ 回收排除、AB卦 恢复、URL 不再含 exTags
    fireEvent.click(await mainBtnOf('占病'))
    await waitFor(() => expect(screen.getByText('AB卦')).toBeTruthy())
    expect(screen.queryAllByTitle('取消排除')).toHaveLength(0)
    expect(screen.getByTitle('取消筛选')).toBeTruthy() // 占病已转包含
    expect(sessionStorage.getItem('liuyao-lib-filter')).not.toContain('exTags=')
    // 再把工作设为排除 → AB卦 又被剔除（不同标签包含+排除可并存）
    fireEvent.click(await excBtnOf('工作'))
    await waitFor(() => expect(screen.getByTitle('取消排除')).toBeTruthy())
    expect(screen.queryByText('AB卦')).toBeNull()
    // 严格只数包含组：当前仅 1 个包含标签 → 禁用（排除组不计入 ≥2 判定）
    expect(screen.getByLabelText(/严格筛选/).disabled).toBe(true)
  })
})
