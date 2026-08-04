/**
 * 排盘页（Task 9）
 *
 * 流程：选起卦方式 → 填输入 → 「起卦」→ qigua → paipan（起卦时刻）→ PanView 显示
 *       → 填占断/选标签 → 「保存卦例」（addGuashi，panSnapshot 存盘面，date 用起卦时刻）
 *       → 「导出 md」（guashiToMd → Blob 下载）｜「重新起卦」清空
 *       → 排盘历史：最近 20 条已保存卦例，点击回填查看
 *
 * 响应式（Task 14）：≥1024px 三栏（起卦 | 盘面 | 占断），
 *   ≥768px 两栏（起卦+盘面并排、占断在下），<768px 单列纵向滚动。
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { paipan } from '../engine/paipan.js'
import { QIGUA_METHODS } from '../engine/qigua.js'
import { addGuashi, listGuashi } from '../db/guashiRepo.js'
import { guashiToMd } from '../md/exportMd.js'
import QiguaSelector from '../components/QiguaSelector.jsx'
import PanView from '../components/PanView.jsx'
import DuanInput from '../components/DuanInput.jsx'
import TagEditor from '../components/TagEditor.jsx'

const METHOD_NAME = Object.fromEntries(QIGUA_METHODS.map((m) => [m.id, m.name]))

const EMPTY_DUAN = {
  duanyu: '',
  yingqi: '',
  beizhu: '',
  fankui: '',
  jixiong: '',
  status: '未反馈',
  jixiongOk: '',
  yingqiOk: '',
  fangweiOk: '',
}

/** Date → 'YYYY-MM-DD HH:mm' */
function fmtDateTime(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 解析 'YYYY-MM-DD HH:mm' / 'YYYY-MM-DD' → Date，失败返回 null */
function parseDate(s) {
  if (!s) return null
  const d = new Date(String(s).replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? null : d
}

export default function PaipanPage() {
  const navigate = useNavigate()

  // 起卦结果
  const [method, setMethod] = useState('')
  const [params, setParams] = useState(null)
  const [qiguaDate, setQiguaDate] = useState(null) // 起卦时刻
  const [pan, setPan] = useState(null)
  // 起卦区重置计数：重新起卦时 key 自增强制 QiguaSelector 重挂载（输入区状态一并清空）
  const [qiguaResetKey, setQiguaResetKey] = useState(0)

  // 占断 / 保存
  const [title, setTitle] = useState('')
  const [duan, setDuan] = useState({ ...EMPTY_DUAN })
  const [tags, setTags] = useState([])
  const [saved, setSaved] = useState(null) // 最近一次保存的记录（供导出）
  const [history, setHistory] = useState([])
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const refreshHistory = async () => {
    try {
      const list = await listGuashi()
      setHistory(list.slice(0, 20))
    } catch (e) {
      /* 历史列表失败不阻断主流程 */
    }
  }

  useEffect(() => {
    refreshHistory()
  }, [])

  /** QiguaSelector 回调：排盘并重置占断区 */
  const handleStart = (r) => {
    try {
      const p = paipan({ method: r.method, params: r.params, date: r.date })
      setPan(p)
      setMethod(r.method)
      setParams(r.params)
      setQiguaDate(r.date)
      setTitle('')
      setDuan({ ...EMPTY_DUAN })
      setTags([])
      setSaved(null)
      setMsg('')
      setError('')
    } catch (e) {
      setError('排盘失败：' + e.message)
    }
  }

  const handleSave = async () => {
    if (!pan || !qiguaDate) {
      setError('请先起卦')
      return
    }
    if (duan.status === '已反馈' && !duan.jixiongOk) {
      setError('已反馈时请选择吉凶对错（对/错/留空三选一）')
      return
    }
    setError('')
    const record = {
      title: title.trim() || '未命名卦例',
      date: fmtDateTime(qiguaDate),
      method,
      params,
      panSnapshot: pan,
      ...duan,
      tags,
    }
    try {
      const savedRec = await addGuashi(record)
      setSaved(savedRec)
      setMsg('保存成功，可导出 md 或前往卦例库')
      refreshHistory()
    } catch (e) {
      setError('保存失败：' + e.message)
    }
  }

  const handleExport = () => {
    if (!saved) {
      setMsg('请先保存卦例再导出')
      return
    }
    const md = guashiToMd(saved)
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(saved.title || '卦例').replace(/[\\/:*?"<>|]/g, '_')}.md`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    setMsg('已导出 md 文件')
  }

  /** 重新起卦：清空盘面、占断与起卦区输入 */
  const handleReset = () => {
    setPan(null)
    setMethod('')
    setParams(null)
    setQiguaDate(null)
    setTitle('')
    setDuan({ ...EMPTY_DUAN })
    setTags([])
    setSaved(null)
    setMsg('')
    setError('')
    setQiguaResetKey((k) => k + 1) // 起卦区输入一并清空
  }

  /** 历史回填查看 */
  const handleLoadHistory = (rec) => {
    setError('')
    setMsg('')
    if (!rec.panSnapshot) {
      setError('该卦例无盘面快照，无法回填')
      return
    }
    setPan(rec.panSnapshot)
    setMethod(rec.method ?? '')
    setParams(rec.params ?? null)
    setQiguaDate(parseDate(rec.date) ?? new Date())
    setTitle(rec.title ?? '')
    setDuan({
      duanyu: rec.duanyu ?? '',
      yingqi: rec.yingqi ?? '',
      beizhu: rec.beizhu ?? '',
      fankui: rec.fankui ?? '',
      jixiong: rec.jixiong ?? '',
      status: rec.status ?? '未反馈',
      jixiongOk: rec.jixiongOk ?? '',
      yingqiOk: rec.yingqiOk ?? '',
      fangweiOk: rec.fangweiOk ?? '',
    })
    setTags(Array.isArray(rec.tags) ? rec.tags : [])
    setSaved(rec)
    setMsg('已回填历史卦例（保存将新建一条卦例）')
  }

  return (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {/* 起卦区（key 变化时重挂载，重新起卦后输入区复位） */}
      <QiguaSelector key={qiguaResetKey} onStart={handleStart} />

      {/* 盘面区：md 起卦+盘面并排；lg 起卦|盘面|占断 三栏 */}
      {pan && (
        <div className="md:col-span-1 lg:col-span-1">
          <PanView pan={pan} />
        </div>
      )}

      {/* 占断区：md 横跨两列（占断在下）；lg 第三列 */}
      {pan && (
        <section className="rounded-xl border border-border bg-panel p-4 sm:p-5 md:col-span-2 lg:col-span-1">
          <h2 className="mb-4 text-base font-medium text-gold">占断</h2>

          {/* 卦题 */}
          <div className="mb-4">
            <div className="mb-1.5 text-sm text-muted">占问内容（卦题）</div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="如：占测今日出行是否顺利（留空保存为「未命名卦例」）"
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors focus:border-gold"
            />
          </div>

          {/* 占断输入 */}
          <DuanInput value={duan} onChange={setDuan} />

          {/* 标签 */}
          <div className="mt-4">
            <div className="mb-1.5 text-sm text-muted">标签</div>
            <TagEditor selected={tags} onChange={setTags} />
          </div>

          {/* 操作按钮 */}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              className="rounded-md bg-gold px-5 py-2 text-sm font-medium text-black transition-colors hover:opacity-90"
            >
              保存卦例
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="rounded-md border border-gold px-5 py-2 text-sm text-gold transition-colors hover:bg-goldSoft"
            >
              导出 md
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-md border border-border px-5 py-2 text-sm text-muted transition-colors hover:text-text"
            >
              重新起卦
            </button>
            {saved && (
              <button
                type="button"
                onClick={() => navigate('/lib')}
                className="rounded-md border border-border px-5 py-2 text-sm text-muted transition-colors hover:text-gold"
              >
                前往卦例库 →
              </button>
            )}
          </div>

          {error && <div className="mt-3 text-sm text-red">{error}</div>}
          {msg && <div className="mt-3 text-sm text-gold">{msg}</div>}
        </section>
      )}

      {/* 排盘历史 */}
      <section className="rounded-xl border border-border bg-panel p-4 sm:p-5 md:col-span-2 lg:col-span-3">
        <h2 className="mb-3 text-base font-medium text-gold">排盘历史（最近 20 条）</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted">暂无已保存的卦例</p>
        ) : (
          <ul className="max-h-72 divide-y divide-border overflow-y-auto">
            {history.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => handleLoadHistory(h)}
                  className="flex w-full items-center gap-3 px-2 py-2 text-left transition-colors hover:bg-goldSoft"
                  title="点击回填查看"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-text">{h.title || '未命名卦例'}</span>
                  <span className="shrink-0 text-xs text-gold">{h.panSnapshot?.ben?.name ?? ''}</span>
                  <span className="shrink-0 text-xs text-muted">{METHOD_NAME[h.method] ?? h.method}</span>
                  <span className="shrink-0 text-xs text-muted">{h.date ?? ''}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
