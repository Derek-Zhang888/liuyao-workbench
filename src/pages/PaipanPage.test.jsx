/**
 * 排盘页全链路冒烟测试（v0.2 T05）
 *
 * 链路：起卦 → 画板开关 → 绘制涂鸦 → 填背景/吉凶 → 保存（record.doodle/background）
 *      → 导出 md（含涂鸦节）→ mdToGuashi 还原 → 历史回填还原 + 取消画板确认清除。
 *
 * 起卦子组件以 mock 驱动（onStart 直接触发 qian 起卦），避免 QiguaSelector 复杂交互；
 * 存储走 fake-indexeddb；URL.createObjectURL 以捕获 Blob 断言导出内容。
 */
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { openDB } from '../db/index.js'
import { addGuashi, listGuashi } from '../db/guashiRepo.js'
import { setSetting } from '../db/settingsRepo.js'
import { paipan } from '../engine/paipan.js'
import { mdToGuashi } from '../md/importMd.js'
import PaipanPage from './PaipanPage.jsx'

vi.mock('../components/QiguaSelector.jsx', () => ({
  default: ({ onStart }) => (
    <button
      type="button"
      onClick={() => onStart({
        method: 'qian',
        params: { lines: '111111', dong: [0, 2] },
        date: new Date(2026, 7, 4, 10, 30),
      })}
    >
      mock-起卦
    </button>
  ),
}))
// v0.2 功能 I：渲染用神 value 以便断言回填恢复
vi.mock('../components/YongShenSelector.jsx', () => ({
  default: ({ value }) => (
    <div data-testid="yong-shen">{value ? `${value.type}:${value.value}` : 'null'}</div>
  ),
}))
vi.mock('../components/TagEditor.jsx', () => ({ default: () => null }))

let capturedBlob = null

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  capturedBlob = null
  sessionStorage.clear()
})

beforeEach(async () => {
  const db = await openDB()
  await new Promise((resolve, reject) => {
    const tx = db.transaction('guashi', 'readwrite')
    tx.objectStore('guashi').clear()
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
})

/** 渲染排盘页（MemoryRouter 包裹） */
function renderPage() {
  return render(
    <MemoryRouter>
      <PaipanPage />
    </MemoryRouter>,
  )
}

/** 起卦 → 等待盘面出现 */
async function startQigua() {
  renderPage()
  fireEvent.click(screen.getByText('mock-起卦'))
  await screen.findByText('盘面画板（涂鸦）') // PanView 画板开关出现 = 盘面已渲染
}

/** 打开画板 → 取 svg 并 mock 测量矩形 */
function openBoard() {
  fireEvent.click(screen.getByText('盘面画板（涂鸦）'))
  const svg = document.querySelector('section svg')
  svg.getBoundingClientRect = () => ({
    left: 0, top: 0, width: 600, height: 400, right: 600, bottom: 400, x: 0, y: 0,
    toJSON: () => ({}),
  })
  return svg
}

/** 画一条画笔折线 */
function drawPen(svg) {
  const fire = (type, x, y) => {
    const evt = new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y })
    act(() => { svg.dispatchEvent(evt) })
  }
  fire('pointerdown', 10, 20)
  fire('pointermove', 50, 80)
  fire('pointerup', 50, 80)
}

describe('PaipanPage v0.2 全链路', () => {
  test('起卦→画板绘制→保存→库中 record 含 doodle/background', async () => {
    await startQigua()
    const svg = openBoard()
    fireEvent.click(screen.getByText('画笔')) // 2026-08-09：默认鼠标工具，绘制前先切画笔
    drawPen(svg)

    // 占断：背景 + 吉凶（保存必选）
    fireEvent.change(screen.getByPlaceholderText('占问背景（事由、双方关系、环境等）…'), {
      target: { value: '占测今日出行' },
    })
    fireEvent.click(screen.getByRole('button', { name: '吉' }))

    fireEvent.click(screen.getByText('保存卦例'))
    await screen.findByText(/保存成功/)

    const recs = await listGuashi()
    expect(recs).toHaveLength(1)
    expect(recs[0].background).toBe('占测今日出行')
    expect(recs[0].doodle).not.toBeNull()
    expect(recs[0].doodle.elements).toHaveLength(1)
    expect(recs[0].doodle.elements[0]).toMatchObject({ type: 'pen', points: [{ x: 10, y: 20 }, { x: 50, y: 80 }] })
    // sessionStorage 持久化含 doodle
    const ss = JSON.parse(sessionStorage.getItem('liuyao-paipan-state'))
    expect(ss.doodle.elements).toHaveLength(1)
    expect(ss.doodleEnabled).toBe(true)
  })

  test('历史回填还原：背景与涂鸦回填，画板默认不自动开启', async () => {
    await startQigua()
    const svg = openBoard()
    fireEvent.click(screen.getByText('画笔')) // 2026-08-09：默认鼠标工具，绘制前先切画笔
    drawPen(svg)
    fireEvent.change(screen.getByPlaceholderText('占问背景（事由、双方关系、环境等）…'), {
      target: { value: '背景文本' },
    })
    fireEvent.click(screen.getByRole('button', { name: '吉' }))
    fireEvent.click(screen.getByText('保存卦例'))
    await screen.findByText(/保存成功/)

    // 点击历史条目回填（历史列表异步刷新，须用 findByText 等待，避免偶发竞态）
    fireEvent.click(await screen.findByText('未命名卦例'))
    await screen.findByText(/已回填历史卦例/)
    expect(screen.getByPlaceholderText('占问背景（事由、双方关系、环境等）…').value).toBe('背景文本')
    // 回填默认不自动开启画板；开启后涂鸦仍在（svg 含 path）
    expect(screen.getByText('盘面画板（涂鸦）')).toBeTruthy()
    const cb = screen.getByRole('checkbox')
    expect(cb.checked).toBe(false)
    fireEvent.click(screen.getByText('盘面画板（涂鸦）'))
    const svg2 = document.querySelector('section svg')
    expect(svg2.querySelector('path')).not.toBeNull()
  })

  test('导出 md：含涂鸦节图片行与 json 元数据，可 mdToGuashi 还原 doodle', async () => {
    URL.createObjectURL = vi.fn((blob) => {
      capturedBlob = blob
      return 'blob:mock'
    })
    URL.revokeObjectURL = vi.fn()

    await startQigua()
    const svg = openBoard()
    fireEvent.click(screen.getByText('画笔')) // 2026-08-09：默认鼠标工具，绘制前先切画笔
    drawPen(svg)
    fireEvent.click(screen.getByRole('button', { name: '吉' }))
    fireEvent.click(screen.getByText('保存卦例'))
    await screen.findByText(/保存成功/)

    fireEvent.click(screen.getByText('导出 md'))
    await waitFor(() => expect(capturedBlob).not.toBeNull())
    // jsdom Blob 无 text()，用 FileReader 读取
    const md = await new Promise((resolve, reject) => {
      const fr = new FileReader()
      fr.onload = () => resolve(String(fr.result))
      fr.onerror = () => reject(fr.error)
      fr.readAsText(capturedBlob)
    })
    expect(md).toContain('## 涂鸦')
    expect(md).toContain('![涂鸦](data:image/svg+xml;utf8,')
    expect(md).toContain('```json')
    // mdToGuashi 还原
    const r = mdToGuashi(md)
    expect(r.ok).toBe(true)
    expect(r.guashi.doodle).not.toBeNull()
    expect(r.guashi.doodle.elements[0].type).toBe('pen')
  })

  test('取消画板：涂鸦非空时弹确认，确认后清除涂鸦并关闭', async () => {
    await startQigua()
    const svg = openBoard()
    fireEvent.click(screen.getByText('画笔')) // 2026-08-09：默认鼠标工具，绘制前先切画笔
    drawPen(svg)
    // 取消勾选 → ConfirmDialog
    fireEvent.click(screen.getByText('盘面画板（涂鸦）'))
    expect(await screen.findByText('关闭盘面画板')).toBeTruthy()
    fireEvent.click(screen.getByText('清除并关闭'))
    await waitFor(() => {
      expect(screen.getByRole('checkbox').checked).toBe(false)
    })
    expect(document.querySelector('section svg')).toBeNull()
    // 涂鸦已清空：重新开启画板无 path
    fireEvent.click(screen.getByText('盘面画板（涂鸦）'))
    expect(document.querySelector('section svg path')).toBeNull()
  })

  test('吉凶非必选（v0.2 功能 H）：不选吉凶也能保存，记录 jixiong 为空', async () => {
    await startQigua()
    fireEvent.change(screen.getByPlaceholderText('占问背景（事由、双方关系、环境等）…'), {
      target: { value: '未选吉凶' },
    })
    fireEvent.click(screen.getByText('保存卦例'))
    await screen.findByText(/保存成功/)
    const recs = await listGuashi()
    expect(recs).toHaveLength(1)
    expect(recs[0].jixiong).toBe('')
    expect(recs[0].status).toBe('未反馈')
  })

  test('未选吉凶时「已反馈」按钮禁用，选中吉凶后启用（v0.2 功能 H）', async () => {
    await startQigua()
    const fedBtn = screen.getByRole('button', { name: '已反馈' })
    expect(fedBtn.disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '吉' }))
    expect(fedBtn.disabled).toBe(false)
  })

  test('历史回填恢复自定用神（v0.2 功能 I）', async () => {
    const pan = paipan({
      method: 'qian',
      params: { lines: '111111', dong: [0, 2] },
      date: new Date(2026, 7, 4, 10, 30),
      yongShen: { type: 'liuqin', value: '财' },
    })
    await addGuashi({
      title: '带用神卦例',
      date: '2026-08-04 10:30',
      method: 'qian',
      params: { lines: '111111', dong: [0, 2] },
      panSnapshot: pan,
      yongShen: { type: 'liuqin', value: '财' },
      jixiong: '吉',
      status: '未反馈',
    })
    renderPage()
    fireEvent.click(await screen.findByText('带用神卦例'))
    await screen.findByText(/已回填历史卦例/)
    expect(screen.getByTestId('yong-shen').textContent).toBe('liuqin:财')
  })
})

describe('PaipanPage v0.10 改进', () => {
  test('吉凶点击已选中项再次点击取消选中（#3）', async () => {
    await startQigua()
    const jiBtn = screen.getByRole('button', { name: '吉' })
    fireEvent.click(jiBtn)
    expect(screen.getByText('大吉之象')).toBeTruthy() // 选中态提示
    fireEvent.click(jiBtn)
    expect(screen.queryByText('大吉之象')).toBeNull() // 取消选中
    // 取消后保存为待占断（jixiong 空）
    fireEvent.click(screen.getByText('保存卦例'))
    await screen.findByText(/保存成功/)
    const recs = await listGuashi()
    expect(recs[0].jixiong).toBe('')
  })

  test('用神 sessionStorage 恢复 + 重新起卦清除（#4）', async () => {
    sessionStorage.setItem('liuyao-yongshen', JSON.stringify({ type: 'liuqin', value: '财' }))
    await startQigua()
    // 挂载时从 sessionStorage 回填
    expect(screen.getByTestId('yong-shen').textContent).toBe('liuqin:财')
    expect(sessionStorage.getItem('liuyao-yongshen')).toBeTruthy()
    // 重新起卦 → 清除 sessionStorage 与 state
    fireEvent.click(screen.getByText('重新起卦'))
    expect(sessionStorage.getItem('liuyao-yongshen')).toBeNull()
    expect(screen.getByTestId('yong-shen').textContent).toBe('null')
  })

  test('重名保存提醒：同名卦题保存前弹窗，仍要保存则落库（#6）', async () => {
    await addGuashi({ title: '同名卦例', date: '2026-08-04', method: 'qian', params: { lines: '111111' }, jixiong: '', status: '未反馈' })
    await startQigua()
    fireEvent.change(screen.getByPlaceholderText('如：占测今日出行是否顺利（留空保存为「未命名卦例」）'), {
      target: { value: '同名卦例' },
    })
    fireEvent.click(screen.getByText('保存卦例'))
    expect(await screen.findByText('卦题重名')).toBeTruthy()
    fireEvent.click(screen.getByText('仍要保存'))
    await screen.findByText(/保存成功/)
    const recs = await listGuashi()
    expect(recs).toHaveLength(2) // 同名第二条落库
  })

  test('重名保存提醒：去改名不落库并聚焦卦题输入框（#6）', async () => {
    await addGuashi({ title: '同名卦例', date: '2026-08-04', method: 'qian', params: { lines: '111111' }, jixiong: '', status: '未反馈' })
    await startQigua()
    fireEvent.change(screen.getByPlaceholderText('如：占测今日出行是否顺利（留空保存为「未命名卦例」）'), {
      target: { value: '同名卦例' },
    })
    fireEvent.click(screen.getByText('保存卦例'))
    expect(await screen.findByText('卦题重名')).toBeTruthy()
    fireEvent.click(screen.getByText('去改名'))
    expect(screen.queryByText('卦题重名')).toBeNull() // 弹窗关闭
    const recs = await listGuashi()
    expect(recs).toHaveLength(1) // 未新增
  })

  test('关闭重名保存提醒后同名直接保存不弹窗（#6）', async () => {
    await setSetting('remind-duplicate-title', false)
    await addGuashi({ title: '同名卦例', date: '2026-08-04', method: 'qian', params: { lines: '111111' }, jixiong: '', status: '未反馈' })
    await startQigua()
    fireEvent.change(screen.getByPlaceholderText('如：占测今日出行是否顺利（留空保存为「未命名卦例」）'), {
      target: { value: '同名卦例' },
    })
    fireEvent.click(screen.getByText('保存卦例'))
    await screen.findByText(/保存成功/)
    expect(screen.queryByText('卦题重名')).toBeNull()
    const recs = await listGuashi()
    expect(recs).toHaveLength(2)
  })

  test('保存卦例写 updatedAt（#2）', async () => {
    await startQigua()
    fireEvent.click(screen.getByRole('button', { name: '吉' }))
    fireEvent.click(screen.getByText('保存卦例'))
    await screen.findByText(/保存成功/)
    const recs = await listGuashi()
    expect(recs).toHaveLength(1)
    expect(recs[0].updatedAt).toBeTypeOf('number')
  })

  test('保存卦例写画板开启状态 doodleOn（v0.10 改进建7 #1，编辑页联动依据）', async () => {
    await startQigua()
    fireEvent.click(screen.getByRole('button', { name: '吉' }))
    fireEvent.click(screen.getByText('保存卦例'))
    await screen.findByText(/保存成功/)
    let recs = await listGuashi()
    expect(recs[0].doodleOn).toBe(false) // 未开启画板 → false

    // 换卦题后开启画板绘制再保存
    fireEvent.change(screen.getByPlaceholderText('如：占测今日出行是否顺利（留空保存为「未命名卦例」）'), {
      target: { value: '开画板卦' },
    })
    const svg = openBoard()
    fireEvent.click(screen.getByText('画笔')) // 2026-08-09：默认鼠标工具，绘制前先切画笔
    drawPen(svg)
    fireEvent.click(screen.getByText('保存卦例'))
    await screen.findByText(/保存成功/)
    recs = await listGuashi()
    const withBoard = recs.find((r) => r.title === '开画板卦')
    expect(withBoard.doodleOn).toBe(true)
    expect(withBoard.doodle).not.toBeNull()
  })

  test('吉凶取消联动反馈（v0.10 改进建7 #2）：已反馈下取消吉凶 → status 回未反馈、清空对错', async () => {
    await startQigua()
    // 选吉凶 → 已反馈 → 选吉凶对错（对错行有 3 组，取第一组「吉凶对错」的「对」）
    fireEvent.click(screen.getByRole('button', { name: '吉' }))
    fireEvent.click(screen.getByText('已反馈'))
    fireEvent.click(screen.getAllByText('对')[0])
    // 取消吉凶（再次点击吉）
    fireEvent.click(screen.getByRole('button', { name: '吉' }))
    expect(screen.queryByText('大吉之象')).toBeNull()
    // 已反馈自动取消（按钮回未反馈文案），对错记录收起
    expect(screen.getByText('已反馈')).toBeTruthy() // 未勾选态文案
    expect(screen.queryByText('吉凶对错')).toBeNull()
    fireEvent.click(screen.getByText('保存卦例'))
    await screen.findByText(/保存成功/)
    const recs = await listGuashi()
    expect(recs[0].jixiong).toBe('')
    expect(recs[0].status).toBe('未反馈')
    expect(recs[0].jixiongOk).toBe('')
    expect(recs[0].yingqiOk).toBe('')
    expect(recs[0].fangweiOk).toBe('')
  })

  test('历史回填 md 导入记录（无快照）：重新排盘 + 涂鸦回填（#16）', async () => {
    // 模拟 md 导入产生的记录：无 panSnapshot，但有 doodle
    const doodle = { version: 1, width: 600, height: 400, elements: [{ type: 'pen', color: '#e74c3c', width: 4, points: [{ x: 1, y: 2 }] }] }
    await addGuashi({
      title: '导入记录',
      date: '2026-08-04 10:30',
      method: 'qian',
      params: { lines: '111111', dong: [0, 2] },
      panSnapshot: null,
      doodle,
      jixiong: '',
      status: '未反馈',
    })
    renderPage()
    fireEvent.click(await screen.findByText('导入记录'))
    await screen.findByText(/已回填历史卦例/)
    // 盘面已重排（乾为天）
    expect(screen.getByText('乾为天')).toBeTruthy()
    // 涂鸦回填：开启画板后 svg 含 path
    fireEvent.click(screen.getByText('盘面画板（涂鸦）'))
    const svg = document.querySelector('section svg')
    expect(svg.querySelector('path')).not.toBeNull()
  })
})
