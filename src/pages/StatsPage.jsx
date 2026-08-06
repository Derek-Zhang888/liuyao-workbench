/**
 * 统计页（v0.10 建议4 #4 #5 #7：去掉标签筛选与错题本，新增可点击数字跳转卦例库）
 *
 * 功能：
 *   - 总览卡：总数 / 已反馈 / 未反馈（数字 + 颜色区分）— 可点击跳转卦例库带筛选
 *   - 正确率卡 ×3：吉凶 / 应期 / 方位（对 X · 错 Y · 正确率 Z% + 金色进度条，仅统计已反馈）— 可点击
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listGuashi } from '../db/guashiRepo.js'
import { computeStats, wrongDims, DIM_FIELDS } from './stats.js'

/** 维度 key → computeStats 返回字段名 */
const RATE_MAP = {
  jixiong: { ok: 'jxOk', bad: 'jxBad', rate: 'jxRate' },
  yingqi: { ok: 'yqOk', bad: 'yqBad', rate: 'yqRate' },
  fangwei: { ok: 'fwOk', bad: 'fwBad', rate: 'fwRate' },
}

/** 正确率展示文本：null → '暂无数据' */
function pctText(rate) {
  return rate == null ? '暂无数据' : `${Math.round(rate * 100)}%`
}

export default function StatsPage() {
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        setRecords(await listGuashi())
      } catch (e) {
        setError('加载卦例失败：' + e.message)
      }
    })()
  }, [])

  const stats = useMemo(() => computeStats(records), [records])

  /**
   * 各数字点击 → 跳 /lib 带筛选 query（v0.10 建议4 #5）
   * @param {string} qs 形如 'status=已反馈&jixiongOk=对'
   */
  const goLib = (qs) => navigate(`/lib${qs ? `?${qs}` : ''}`)

  /** 总览卡 */
  const OVERVIEW = [
    { label: '总卦例数', value: stats.total, qs: '', cls: 'text-text' },
    { label: '已反馈', value: stats.fed, qs: 'status=已反馈', cls: 'text-gold' },
    { label: '未反馈', value: stats.unfed, qs: 'status=未反馈', cls: 'text-muted' },
  ]

  return (
    <div className="space-y-5">
      {/* 顶栏 */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-medium text-gold">统计</h1>
        <span className="text-xs text-muted">仅统计已反馈卦例的正确率；选择标签可只看该标签的卦</span>
      </div>

      {error && <div className="text-sm text-red">{error}</div>}

      {/* 总览卡（v0.10 建议4 #4 #5：去标签筛选 + 数字可点击跳转） */}
      <section className="grid gap-3 sm:grid-cols-3">
        {OVERVIEW.map((o) => (
          <button
            key={o.label}
            type="button"
            onClick={() => goLib(o.qs)}
            disabled={o.value === 0}
            className="cursor-pointer rounded-xl border border-border bg-panel p-4 text-left transition-colors hover:border-gold/60 hover:bg-goldSoft/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="text-xs text-muted">{o.label}</div>
            <div className={`mt-1.5 text-3xl font-medium ${o.cls}`}>{o.value}</div>
          </button>
        ))}
      </section>

      {/* 正确率卡 ×3（v0.10 建议4 #5：数字可点击跳转） */}
      <section className="grid gap-3 sm:grid-cols-3">
        {DIM_FIELDS.map((d) => {
          const f = RATE_MAP[d.key]
          const ok = stats[f.ok]
          const bad = stats[f.bad]
          const rate = stats[f.rate]
          return (
            <div key={d.key} className="space-y-3 rounded-xl border border-border bg-panel p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">{d.label}</span>
                <span className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    disabled={ok === 0}
                    onClick={() => goLib(`status=已反馈&${d.key}Ok=对`)}
                    className="cursor-pointer rounded border border-gold/60 px-2 py-0.5 text-gold transition-colors hover:bg-goldSoft disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    对 {ok}
                  </button>
                  <button
                    type="button"
                    disabled={bad === 0}
                    onClick={() => goLib(`status=已反馈&${d.key}Ok=错`)}
                    className="cursor-pointer rounded border border-red/60 px-2 py-0.5 text-red transition-colors hover:bg-red/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    错 {bad}
                  </button>
                </span>
              </div>
              <div className={`text-2xl font-medium ${rate == null ? 'text-muted' : 'text-gold'}`}>
                {pctText(rate)}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-black/30">
                <div
                  className="h-full rounded-full bg-gold transition-all"
                  style={{ width: rate == null ? '0%' : `${Math.min(rate * 100, 100)}%` }}
                />
              </div>
              {rate == null && <div className="text-xs text-muted">该维度暂无对错记录</div>}
            </div>
          )
        })}
      </section>
    </div>
  )
}
