/**
 * 统计页（v0.10 建议4 #4 #5 #7：去掉标签筛选与错题本，新增可点击数字跳转卦例库）
 *
 * v0.2 功能 H/J：
 *   - 总览卡新增「待占断」（jixiong 未选计数），点击跳 /lib?status=pending（v0.10 改进建8 #2）
 *   - 标签多选筛选（任一命中，数据源=共用 tags 表 listTags）；勾选后只统计命中标签的卦例
 *   - 点击数字跳 /lib 时带标签（tags= 重复参数）+ 对应状态筛选（status=fed/unfed/pending）
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listGuashi } from '../db/guashiRepo.js'
import { listTags } from '../db/tagsRepo.js'
import { computeStats, wrongDims, DIM_FIELDS } from './stats.js'

/** 统计页时间筛选惰性记忆 key（{from,to}；切页面返回保持上次筛选） */
const STATS_TIME_KEY = 'liuyao-stats-time'

/** 读惰性记忆的单个字段（无值/解析失败返回 ''） */
function readStatsTime(field) {
  try {
    const raw = sessionStorage.getItem(STATS_TIME_KEY)
    if (raw) {
      const v = JSON.parse(raw)
      if (v && typeof v[field] === 'string') return v[field]
    }
  } catch (_) { /* 解析失败按空 */ }
  return ''
}

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
  const [allTags, setAllTags] = useState([])
  const [selTags, setSelTags] = useState([]) // 选中的标签名（任一命中；空=全部）
  const [fromDate, setFromDate] = useState(() => readStatsTime('from')) // 惰性记忆恢复
  const [toDate, setToDate] = useState(() => readStatsTime('to'))
  // 变化即保存（惰性：仅用户操作更新，不做主动同步）
  useEffect(() => {
    try { sessionStorage.setItem(STATS_TIME_KEY, JSON.stringify({ from: fromDate, to: toDate })) } catch (_) { /* 静默 */ }
  }, [fromDate, toDate])
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

  // 标签筛选数据源 = 共用 tags 表（v0.2 功能 J，与卦例库/排盘页一致）
  useEffect(() => {
    ;(async () => {
      try {
        setAllTags(await listTags())
      } catch (_) {
        /* 标签加载失败不影响统计 */
      }
    })()
  }, [])

  // 命中任一选中标签 + 创建时间范围的卦例（v0.2 功能 J；时间范围与卦例库 from=/to= 同口径：
  // from 当天 00:00 起、to 当天 23:59:59.999 止，含起止当天；createdAt 缺失回退 id）
  const filtered = useMemo(() => {
    let list = records
    if (selTags.length > 0) list = list.filter((r) => selTags.some((t) => (r.tags ?? []).includes(t)))
    if (fromDate || toDate) {
      const fromMs = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null
      const toMs = toDate ? new Date(`${toDate}T23:59:59.999`).getTime() : null
      list = list.filter((r) => {
        const ts = typeof r.createdAt === 'number' && Number.isFinite(r.createdAt) ? r.createdAt : (r.id ?? 0)
        if (fromMs != null && Number.isFinite(fromMs) && ts < fromMs) return false
        if (toMs != null && Number.isFinite(toMs) && ts > toMs) return false
        return true
      })
    }
    return list
  }, [records, selTags, fromDate, toDate])

  const stats = useMemo(() => computeStats(filtered), [filtered])

  /**
   * 各数字点击 → 跳 /lib 带筛选 query（v0.10 建议4 #5；v0.2 功能 J 追加标签参数；
   * v0.10 改进建8 #2：主筛选用 status=pending/unfed/fed 互斥单组参数）
   * @param {string} qs 形如 'status=fed&jixiongOk=对'（可为空串）
   */
  const goLib = (qs) => {
    const params = new URLSearchParams(qs)
    for (const t of selTags) params.append('tags', t) // 标签用重复参数（tag 名可含逗号）
    if (fromDate) params.set('from', fromDate) // 时间范围随跳转携带，卦例库自动应用
    if (toDate) params.set('to', toDate)
    const s = params.toString()
    navigate(`/lib${s ? `?${s}` : ''}`)
  }

  /** 总览卡（v0.2 功能 H：新增待占断；v0.10 改进建8 #2：跳转 query 改用新互斥单组参数） */
  const OVERVIEW = [
    { label: '总卦例数', value: stats.total, qs: '', cls: 'text-text' },
    { label: '已反馈', value: stats.fed, qs: 'status=fed', cls: 'text-gold' },
    { label: '未反馈', value: stats.unfed, qs: 'status=unfed', cls: 'text-muted' },
    { label: '待占断', value: stats.pending, qs: 'status=pending', cls: 'text-muted' },
  ]

  return (
    <div className="space-y-5">
      {/* 顶栏 */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-medium text-gold">统计</h1>
        <span className="text-xs text-muted">仅统计已反馈卦例的正确率；选择标签可只看该标签的卦</span>
      </div>

      {error && <div className="text-sm text-red">{error}</div>}

      {/* 标签筛选（v0.2 功能 J：新增回来，多选任一命中；数据源=共用 tags 表） */}
      <section className="flex flex-wrap items-center gap-2 card rounded-xl border border-border bg-panel p-4">
        <span className="w-10 shrink-0 text-sm text-muted">标签</span>
        {allTags.length === 0 && <span className="text-xs text-muted">暂无标签，可在卦例库或排盘页新增</span>}
        {allTags.map((t) => {
          const on = selTags.includes(t.name)
          return (
            <button
              key={t.id ?? t.name}
              type="button"
              onClick={() => setSelTags((s) => (on ? s.filter((x) => x !== t.name) : [...s, t.name]))}
              className="flex items-center gap-1.5 rounded-full border py-1 pl-3 pr-2.5 text-sm transition-colors"
              style={{
                borderColor: on ? t.color : 'var(--border)',
                color: on ? t.color : 'var(--muted)',
                background: on ? t.color + '1f' : 'transparent',
              }}
              title={on ? '取消筛选' : '按此标签筛选（任一命中）'}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />
              {t.name}
              {on && <span className="text-xs">✓</span>}
            </button>
          )
        })}
        {selTags.length > 0 && (
          <button
            type="button"
            onClick={() => setSelTags([])}
            className="ml-auto rounded-md border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:text-text"
          >
            清除标签
          </button>
        )}
      </section>

      {/* 创建时间范围筛选（与卦例库 from=/to= 同口径；跳转时自动携带该范围） */}
      <section className="flex flex-wrap items-center gap-2 card rounded-xl border border-border bg-panel p-4">
        <span className="w-10 shrink-0 text-sm text-muted">时间</span>
        <input
          type="date"
          value={fromDate}
          max={toDate || undefined}
          onChange={(e) => setFromDate(e.target.value)}
          title="创建时间范围：开始日期"
          className="rounded-md border border-border bg-bg px-2 py-1 text-xs text-text outline-none transition-colors focus:border-gold"
        />
        <span className="text-xs text-muted">至</span>
        <input
          type="date"
          value={toDate}
          min={fromDate || undefined}
          onChange={(e) => setToDate(e.target.value)}
          title="创建时间范围：结束日期"
          className="rounded-md border border-border bg-bg px-2 py-1 text-xs text-text outline-none transition-colors focus:border-gold"
        />
        <span className="text-xs text-muted">统计创建于该时间段内的卦例</span>
        {(fromDate || toDate) && (
          <button
            type="button"
            onClick={() => { setFromDate(''); setToDate('') }}
            className="ml-auto rounded-md border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:text-text"
          >
            清除时间
          </button>
        )}
      </section>

      {/* 总览卡（v0.10 建议4 #4 #5：数字可点击跳转；v0.2 功能 H：四卡布局） */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {OVERVIEW.map((o) => (
          <button
            key={o.label}
            type="button"
            onClick={() => goLib(o.qs)}
            disabled={o.value === 0}
            className="cursor-pointer card rounded-xl border border-border bg-panel p-4 text-left transition-colors hover:border-gold/60 hover:bg-goldSoft30 disabled:cursor-not-allowed disabled:opacity-60"
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
            <div key={d.key} className="space-y-3 card rounded-xl border border-border bg-panel p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">{d.label}</span>
                <span className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    disabled={ok === 0}
                    onClick={() => goLib(`status=fed&${d.key}Ok=对`)}
                    className="cursor-pointer rounded border border-gold/60 px-2 py-0.5 text-gold transition-colors hover:bg-goldSoft disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    对 {ok}
                  </button>
                  <button
                    type="button"
                    disabled={bad === 0}
                    onClick={() => goLib(`status=fed&${d.key}Ok=错`)}
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
