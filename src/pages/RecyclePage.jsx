/**
 * 回收站页（Task 10）
 *
 * 入口：卦例库页右上角「回收站」按钮。
 * 功能：
 *   - 进入页面时自动调用 purgeExpired() 清理过期卦例
 *   - 列表展示已删除卦例，剩余时间按 effectivePurgeAt 计算：
 *     自定义删除时间（purgeAt）优先，未自定义则 delAt + recycleDays（settings 读取，默认 30）
 *   - 每条可「自定义删除时间」：快捷保留 1/7/30 天，或指定具体日期时间，可恢复默认
 *   - 操作：恢复（restoreGuashi）/ 彻底删除（purgeGuashi，确认弹窗）/ 清空回收站（遍历 purge，确认弹窗）
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  effectivePurgeAt,
  listGuashi,
  purgeGuashi,
  purgeExpired,
  restoreGuashi,
  setPurgeAt,
} from '../db/guashiRepo.js'
import { getSetting } from '../db/settingsRepo.js'

const DAY_MS = 86400000
const HOUR_MS = 3600000
/** 快捷保留时长选项 */
const PRESETS = [
  { label: '1 天后', days: 1 },
  { label: '7 天后', days: 7 },
  { label: '30 天后', days: 30 },
]

const p2 = (n) => String(n).padStart(2, '0')

/** 时间戳 → 'YYYY-MM-DD HH:mm' */
function fmtDateTime(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`
}

/** 时间戳 → datetime-local 输入值 'YYYY-MM-DDTHH:mm' */
function toInputValue(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`
}

/** 剩余时长文案 */
function fmtRemain(ms) {
  if (ms <= 0) return '已过期，即将清理'
  if (ms >= DAY_MS) return `剩余约 ${Math.ceil(ms / DAY_MS)} 天`
  if (ms >= HOUR_MS) return `剩余约 ${Math.ceil(ms / HOUR_MS)} 小时`
  return '剩余不足 1 小时'
}

export default function RecyclePage() {
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [days, setDays] = useState(30)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  // 正在编辑自定义删除时间的卦例 id 与输入值
  const [editingId, setEditingId] = useState(null)
  const [editValue, setEditValue] = useState('')

  const refresh = async () => {
    try {
      setRecords(await listGuashi({ deleted: true }))
    } catch (e) {
      setError('加载回收站失败：' + e.message)
    }
  }

  useEffect(() => {
    ;(async () => {
      // 进入页面先自动清理过期卦例
      try {
        const cleaned = await purgeExpired()
        if (cleaned > 0) setMsg(`已自动清理 ${cleaned} 条过期卦例`)
      } catch (e) {
        setError('自动清理过期卦例失败：' + e.message)
      }
      // 读取保留天数（设置页可改，默认 30）
      try {
        setDays((await getSetting('recycleDays')) ?? 30)
      } catch (e) {
        /* 读取失败用默认 30 */
      }
      refresh()
    })()
  }, [])

  const handleRestore = async (rec) => {
    try {
      await restoreGuashi(rec.id)
      setMsg(`已恢复「${rec.title || '未命名卦例'}」`)
      refresh()
    } catch (e) {
      setError('恢复失败：' + e.message)
    }
  }

  const handlePurge = async (rec) => {
    if (!window.confirm(`彻底删除「${rec.title || '未命名卦例'}」将无法恢复，确定吗？`)) return
    try {
      await purgeGuashi(rec.id)
      setMsg('已彻底删除')
      refresh()
    } catch (e) {
      setError('删除失败：' + e.message)
    }
  }

  const handleClearAll = async () => {
    if (!records.length) return
    if (!window.confirm(`确定清空回收站吗？共 ${records.length} 条卦例将被彻底删除，无法恢复。`)) return
    try {
      for (const r of records) await purgeGuashi(r.id)
      setMsg('回收站已清空')
      refresh()
    } catch (e) {
      setError('清空失败：' + e.message)
    }
  }

  /** 打开/关闭某条的自定义删除时间面板 */
  const toggleEditor = (rec) => {
    setError('')
    if (editingId === rec.id) {
      setEditingId(null)
      return
    }
    setEditingId(rec.id)
    setEditValue(toInputValue(effectivePurgeAt(rec, days) || Date.now() + days * DAY_MS))
  }

  /**
   * 写入自定义删除时间（at=0 表示恢复默认保留天数）。
   * 若设定时间已过，立即执行清理，实现「到点后真正删除」。
   */
  const applyPurgeAt = async (rec, at, tip) => {
    try {
      await setPurgeAt(rec.id, at)
      setEditingId(null)
      setError('')
      if (at > 0 && at <= Date.now()) {
        await purgeExpired()
        setMsg(`「${rec.title || '未命名卦例'}」已到设定时间，已彻底删除`)
      } else {
        setMsg(tip)
      }
      refresh()
    } catch (e) {
      setError('设置删除时间失败：' + e.message)
    }
  }

  const handleSaveCustom = async (rec) => {
    const ts = new Date(editValue).getTime()
    if (!editValue || Number.isNaN(ts)) {
      setError('请填写有效的删除时间')
      return
    }
    await applyPurgeAt(rec, ts, `已设定「${rec.title || '未命名卦例'}」于 ${fmtDateTime(ts)} 彻底删除`)
  }

  return (
    <div className="space-y-5">
      {/* 顶栏 */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-medium text-gold">回收站</h1>
        <span className="text-xs text-muted">
          卦例删除后默认保留 {days} 天，到期自动彻底清理；可为单条设置自定义删除时间
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleClearAll}
            className="rounded-md border border-red/60 px-3 py-1.5 text-sm text-red transition-colors hover:bg-red/10"
          >
            清空回收站
          </button>
          <button
            type="button"
            onClick={() => navigate('/lib')}
            className="rounded-md border border-gold px-3 py-1.5 text-sm text-gold transition-colors hover:bg-goldSoft"
          >
            返回卦例库
          </button>
        </div>
      </div>

      {msg && <div className="text-sm text-gold">{msg}</div>}
      {error && <div className="text-sm text-red">{error}</div>}

      {/* 列表 / 空态 */}
      {records.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-panelHalf p-8 text-center">
          <p className="text-sm text-muted">
            回收站空空如也，卦例库中删除的卦例会出现在这里
          </p>
          <button
            type="button"
            onClick={() => navigate('/lib')}
            className="rounded-md border border-gold px-4 py-2 text-sm text-gold transition-colors hover:bg-goldSoft"
          >
            返回卦例库
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((r) => {
            const purgeAt = effectivePurgeAt(r, days)
            const custom = Number(r.purgeAt) > 0
            const remain = purgeAt - Date.now()
            const expired = remain <= 0
            return (
              <article
                key={r.id}
                className="card rounded-xl border border-border bg-panel p-4 transition-colors hover:border-gold/60"
              >
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-medium text-text">
                      {r.title || '未命名卦例'}
                    </h3>
                    <p className="mt-1 text-xs text-muted">
                      {r.date || '无日期'} · 删除于 {r.delAt ? fmtDateTime(r.delAt) : '—'} ·{' '}
                      {custom ? '自定义' : '默认'}清理时间 {purgeAt ? fmtDateTime(purgeAt) : '—'}
                    </p>
                  </div>
                  <span className={`text-xs ${expired ? 'text-red' : 'text-gold'}`}>
                    {fmtRemain(remain)}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleEditor(r)}
                      className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                        custom
                          ? 'border-gold bg-goldSoft text-gold'
                          : 'border-border text-muted hover:border-gold hover:text-gold'
                      }`}
                    >
                      自定义删除时间
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRestore(r)}
                      className="rounded-md border border-gold px-3 py-1.5 text-sm text-gold transition-colors hover:bg-goldSoft"
                    >
                      恢复
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePurge(r)}
                      className="rounded-md border border-red/60 px-3 py-1.5 text-sm text-red transition-colors hover:bg-red/10"
                    >
                      彻底删除
                    </button>
                  </div>
                </div>

                {/* 自定义删除时间面板 */}
                {editingId === r.id && (
                  <div className="mt-3 space-y-3 rounded-lg border border-border bg-bg p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted">快捷设置：</span>
                      {PRESETS.map((p) => (
                        <button
                          key={p.days}
                          type="button"
                          onClick={() =>
                            applyPurgeAt(
                              r,
                              Date.now() + p.days * DAY_MS,
                              `已设定「${r.title || '未命名卦例'}」${p.days} 天后彻底删除`,
                            )
                          }
                          className="rounded-md border border-border px-2.5 py-1 text-xs text-text transition-colors hover:border-gold hover:text-gold"
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label htmlFor={`purgeAt-${r.id}`} className="text-xs text-muted">
                        指定删除时间：
                      </label>
                      <input
                        id={`purgeAt-${r.id}`}
                        type="datetime-local"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="rounded-md border border-border bg-panel px-2 py-1 text-sm text-text focus:border-gold focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveCustom(r)}
                        className="rounded-md border border-gold px-3 py-1 text-sm text-gold transition-colors hover:bg-goldSoft"
                      >
                        保存
                      </button>
                      {custom && (
                        <button
                          type="button"
                          onClick={() =>
                            applyPurgeAt(r, 0, `已恢复默认保留 ${days} 天`)
                          }
                          className="rounded-md border border-border px-3 py-1 text-sm text-muted transition-colors hover:border-gold hover:text-gold"
                        >
                          恢复默认
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-md border border-border px-3 py-1 text-sm text-muted transition-colors hover:border-gold hover:text-gold"
                      >
                        取消
                      </button>
                    </div>
                    <p className="text-xs text-muted">
                      到达设定时间后，该卦例将在下次进入回收站时被彻底删除；设为过去的时间会立即删除。
                    </p>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
