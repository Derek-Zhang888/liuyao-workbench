/**
 * 回收站页（Task 10）
 *
 * 入口：卦例库页右上角「回收站」按钮。
 * 功能：
 *   - 进入页面时自动调用 purgeExpired() 清理过期卦例
 *   - 列表展示已删除卦例，剩余天数 = recycleDays - (now - delAt)/86400000（settings 读取，默认 30）
 *   - 操作：恢复（restoreGuashi）/ 彻底删除（purgeGuashi，确认弹窗）/ 清空回收站（遍历 purge，确认弹窗）
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listGuashi, purgeGuashi, purgeExpired, restoreGuashi } from '../db/guashiRepo.js'
import { getSetting } from '../db/settingsRepo.js'

const DAY_MS = 86400000

/** 时间戳 → 'YYYY-MM-DD HH:mm' */
function fmtDateTime(ts) {
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function RecyclePage() {
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [days, setDays] = useState(30)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

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

  return (
    <div className="space-y-5">
      {/* 顶栏 */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-medium text-gold">回收站</h1>
        <span className="text-xs text-muted">卦例删除后保留 {days} 天，到期自动彻底清理</span>
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
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-panel/50 p-8 text-center">
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
            const remain = Math.max(0, days - (Date.now() - (r.delAt ?? 0)) / DAY_MS)
            const expired = remain <= 0
            return (
              <article
                key={r.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-panel p-4 transition-colors hover:border-gold/60"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-medium text-text">
                    {r.title || '未命名卦例'}
                  </h3>
                  <p className="mt-1 text-xs text-muted">
                    {r.date || '无日期'} · 删除于 {r.delAt ? fmtDateTime(r.delAt) : '—'}
                  </p>
                </div>
                <span className={`text-xs ${expired ? 'text-red' : 'text-gold'}`}>
                  {expired ? '已过期，即将清理' : `剩余约 ${Math.ceil(remain)} 天`}
                </span>
                <div className="flex items-center gap-2">
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
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
