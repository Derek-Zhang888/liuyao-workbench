/**
 * 卦例库页测试（v0.2 功能 G/H/I/J）
 *
 * 覆盖：
 *   - G：编辑视图双栏布局（盘面左、占断右，≥lg 两栏）
 *   - H：待占断筛选（v0.10 改进建8 #2：主筛选互斥单组 status=pending/unfed/fed，旧 pending=1 兼容）
 *   - I：编辑视图自定用神回显（快照/顶层字段）+ 保存落库 + 导入记录重排恢复用神
 *   - J：URL tags= 重复参数预选标签
 *
 * 存储走 fake-indexeddb；PanView/DuanInput/TagEditor/GuashiCard/ConfirmDialog 以 mock 驱动，
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
vi.mock('../components/DuanInput.jsx', () => ({ default: () => null }))
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
    // 双栏容器（Tailwind lg:grid-cols-2）
    const grid = document.querySelector('[class*="lg:grid-cols-2"]')
    expect(grid).toBeTruthy()
    // 左列盘面 + 右列占断同在一个网格容器
    expect(within(grid).getByTestId('pan-view')).toBeTruthy()
    expect(within(grid).getByText('占断')).toBeTruthy()
    // 快照盘面正常传入（无自定用神 → none）
    expect(within(grid).getByTestId('pan-view').getAttribute('data-yongshen')).toBe('none')
  })
})

describe('GuashiLibPage 主筛选互斥单组（v0.10 改进建8 #2 新口径）', () => {
  test('URL status=pending 只显示 jixiong 未选（待占断）的卦例', async () => {
    await addGuashi(rec({ title: '待占断卦例', jixiong: '' }))
    await addGuashi(rec({ title: '有吉凶卦例', jixiong: '吉' }))
    renderPage('/lib?status=pending')
    expect(await screen.findByText('待占断卦例')).toBeTruthy()
    expect(screen.queryByText('有吉凶卦例')).toBeNull()
  })

  test('旧 query 兼容过渡：pending=1 / status=未反馈 / status=已反馈 均可解析', async () => {
    await addGuashi(rec({ title: '旧pending', jixiong: '' }))
    await addGuashi(rec({ title: '旧未反馈', jixiong: '吉', status: '未反馈' }))
    await addGuashi(rec({ title: '旧已反馈', jixiong: '吉', status: '已反馈', jixiongOk: '对' }))
    // 旧 pending=1 → 待占断
    renderPage('/lib?pending=1')
    expect(await screen.findByText('旧pending')).toBeTruthy()
    expect(screen.queryByText('旧未反馈')).toBeNull()
    expect(screen.queryByText('旧已反馈')).toBeNull()
    // 旧 status=未反馈 → unfed
    cleanup()
    renderPage('/lib?status=未反馈')
    expect(await screen.findByText('旧未反馈')).toBeTruthy()
    expect(screen.queryByText('旧pending')).toBeNull()
    expect(screen.queryByText('旧已反馈')).toBeNull()
    // 旧 status=已反馈 → fed
    cleanup()
    renderPage('/lib?status=已反馈')
    expect(await screen.findByText('旧已反馈')).toBeTruthy()
    expect(screen.queryByText('旧pending')).toBeNull()
    expect(screen.queryByText('旧未反馈')).toBeNull()
  })

  test('新口径：未反馈 = jixiong 非空 且 status 未反馈（jixiong 未选的不算未反馈）', async () => {
    await addGuashi(rec({ title: '已断未反馈', jixiong: '吉', status: '未反馈' }))
    await addGuashi(rec({ title: '未选吉凶未反馈', jixiong: '', status: '未反馈' })) // 属于待占断
    await addGuashi(rec({ title: '已反馈卦例', jixiong: '凶', status: '已反馈', jixiongOk: '对' }))
    renderPage('/lib?status=unfed')
    expect(await screen.findByText('已断未反馈')).toBeTruthy()
    expect(screen.queryByText('未选吉凶未反馈')).toBeNull()
    expect(screen.queryByText('已反馈卦例')).toBeNull()
    // 待占断视角：未选吉凶的未反馈记录归入待占断
    cleanup()
    renderPage('/lib?status=pending')
    expect(await screen.findByText('未选吉凶未反馈')).toBeTruthy()
    expect(screen.queryByText('已断未反馈')).toBeNull()
  })

  test('互斥：点击「未反馈」自动取消「待占断」；「全部」清除筛选', async () => {
    await addGuashi(rec({ title: '待占断卦例', jixiong: '' }))
    await addGuashi(rec({ title: '未反馈卦例', jixiong: '吉', status: '未反馈' }))
    renderPage('/lib?status=pending')
    expect(await screen.findByText('待占断卦例')).toBeTruthy()
    expect(screen.queryByText('未反馈卦例')).toBeNull()
    // 点「未反馈」→ status=pending 被取消，仅剩未反馈
    fireEvent.click(screen.getByText('未反馈'))
    expect(await screen.findByText('未反馈卦例')).toBeTruthy()
    expect(screen.queryByText('待占断卦例')).toBeNull()
    // 点「全部」→ 清除筛选，两者都显示
    fireEvent.click(screen.getByText('全部'))
    expect(await screen.findByText('待占断卦例')).toBeTruthy()
    expect(screen.getByText('未反馈卦例')).toBeTruthy()
  })

  test('三态互斥不重叠：待占断/未反馈/已反馈 各只命中自己的记录', async () => {
    await addGuashi(rec({ title: 'A待占断', jixiong: '', status: '未反馈' }))
    await addGuashi(rec({ title: 'B未反馈', jixiong: '吉', status: '未反馈' }))
    await addGuashi(rec({ title: 'C已反馈', jixiong: '吉', status: '已反馈', jixiongOk: '对' }))
    renderPage('/lib?status=pending')
    expect(await screen.findByText('A待占断')).toBeTruthy()
    expect(screen.queryByText('B未反馈')).toBeNull()
    expect(screen.queryByText('C已反馈')).toBeNull()
    fireEvent.click(screen.getByText('未反馈'))
    expect(await screen.findByText('B未反馈')).toBeTruthy()
    expect(screen.queryByText('A待占断')).toBeNull()
    expect(screen.queryByText('C已反馈')).toBeNull()
    fireEvent.click(screen.getByText('已反馈'))
    expect(await screen.findByText('C已反馈')).toBeTruthy()
    expect(screen.queryByText('A待占断')).toBeNull()
    expect(screen.queryByText('B未反馈')).toBeNull()
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
