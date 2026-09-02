/**
 * 统计页（v0.10 建议4 #4 #5 #7 / v1.3.0 取数反馈统计大改）
 *
 * v0.2 功能 H/J：
 *   - 总览卡新增「待占断」计数，点击跳 /lib?status=pending
 *   - 标签多选筛选（任一命中）；勾选后只统计命中标签的卦例
 *   - 点击数字跳 /lib 时带标签（tags= 重复参数）+ 对应状态筛选（status=fed/unfed/pending）
 *
 * v1.3.0（拍板 2026-08-13/14）：
 *   - 三态口径：已反馈=fankui 非空；待反馈=五者任一非空且 fankui 空；待占断=五者全空
 *     （四卡文案「未反馈」→「待反馈」，URL status=unfed 保留）
 *   - 正确率卡 ×3 + 取数卡（三档 神准/相近/错 + 双口径 神准率/神准+相近率）
 *   - 反馈结果筛选组合：跨维度与、同维度或（取数可多选 神准+相近），无严格筛选开关；
 *     选中维度对应卡片金边框高亮 + 放大 1.03、未选中缩小 0.97（纯视觉 transform，不破坏布局）
 *   - 原生 SVG 图表（无新依赖）：取数三档饼图 + 正确率趋势折线（4 色线：吉凶绿/应期蓝/方位金/取数紫=神准率，
 *     月度/年度粒度 + 起止年份下拉；受标签+时间筛选影响、不受反馈筛选影响；样本<3 空心点不连线）
 *     （柱状图 2026-08-14 已砍：与正确率卡信息重复）
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listGuashi } from '../db/guashiRepo.js'
import { listTags } from '../db/tagsRepo.js'
import { tagActiveStyle } from '../config/presetTags.js'
import { computeStats, QSHU_LEVELS, DIM_FIELDS } from './stats.js'

/** 统计页时间筛选惰性记忆 key（{from,to}；切页面返回保持上次筛选） */
const STATS_TIME_KEY = 'liuyao-stats-time'
/** 统计页标签+严格筛选惰性记忆 key（{tags:[],strict:bool}；切页面返回保持，两页独立记忆） */
const STATS_TAGS_KEY = 'liuyao-stats-tags'
/** v1.3.0 反馈结果筛选组合惰性记忆 key（{jixiong:[],yingqi:[],fangwei:[],qushu:[]}） */
const STATS_DIMS_KEY = 'liuyao-stats-dims'
/** v1.3.0 趋势折线惰性记忆 key（{gran:'month'|'year', from, to}） */
const STATS_TREND_KEY = 'liuyao-stats-trend'

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

/** 读标签+严格筛选惰性记忆（无值/解析失败返回默认：无标签、非严格、无排除） */
function readStatsTags() {
  try {
    const raw = sessionStorage.getItem(STATS_TAGS_KEY)
    if (raw) {
      const v = JSON.parse(raw)
      if (Array.isArray(v.tags)) return { tags: v.tags, strict: !!v.strict, exTags: Array.isArray(v.exTags) ? v.exTags : [] }
      if (Array.isArray(v)) return { tags: v, strict: false, exTags: [] } // 兼容纯数组旧格式
    }
  } catch (_) { /* 解析失败按默认 */ }
  return { tags: [], strict: false, exTags: [] }
}

/** 读反馈结果筛选组合惰性记忆（{key: string[]} → {key: Set}；含 strictFb 严格反馈开关；
 * 无值/旧格式：返回空 Set + strictFb=false） */
function readStatsDims() {
  const empty = { jixiong: new Set(), yingqi: new Set(), fangwei: new Set(), qushu: new Set() }
  let strictFb = false
  try {
    const raw = sessionStorage.getItem(STATS_DIMS_KEY)
    if (raw) {
      const v = JSON.parse(raw)
      if (v && typeof v === 'object') {
        for (const k of Object.keys(empty)) {
          if (Array.isArray(v[k])) empty[k] = new Set(v[k].filter(Boolean))
        }
        if (v.strictFb) strictFb = true
      }
    }
  } catch (_) { /* 解析失败按默认 */ }
  return { dims: empty, strictFb }
}

/** 读趋势折线惰性记忆（{gran, from, to, lines, cum}；无值返回月粒度 + 全范围 + 全维度显示 + 当月采样；
 * 兼容旧格式（无 lines/cum 字段 → 默认全选 + 当月）） */
function readStatsTrend() {
  try {
    const raw = sessionStorage.getItem(STATS_TREND_KEY)
    if (raw) {
      const v = JSON.parse(raw)
      if (v && typeof v === 'object') {
        return {
          gran: v.gran === 'year' ? 'year' : 'month',
          from: v.from || '',
          to: v.to || '',
          lines: Array.isArray(v.lines) && v.lines.length ? v.lines : TREND_LINES.map((l) => l.key),
          cum: !!v.cum,
        }
      }
    }
  } catch (_) { /* 解析失败按默认 */ }
  return { gran: 'month', from: '', to: '', lines: TREND_LINES.map((l) => l.key), cum: false }
}

/** 维度 key → computeStats 返回字段名（正确率卡 ×3 用） */
const RATE_MAP = {
  jixiong: { ok: 'jxOk', bad: 'jxBad', rate: 'jxRate' },
  yingqi: { ok: 'yqOk', bad: 'yqBad', rate: 'yqRate' },
  fangwei: { ok: 'fwOk', bad: 'fwBad', rate: 'fwRate' },
}

/** 正确率展示文本：null → '暂无数据' */
function pctText(rate) {
  return rate == null ? '暂无数据' : `${Math.round(rate * 100)}%`
}

/** 原生 SVG 取数三档饼图（donut；无数据时展示占位文案） */
function PieChart({ stats, height = 250 }) {
  const W = 300
  const cx = W / 2
  const cy = height / 2
  const R = 86
  const total = (stats.qsSz ?? 0) + (stats.qsXj ?? 0) + (stats.qsCuo ?? 0)
  const data = [
    { label: '神准', value: stats.qsSz ?? 0, color: 'var(--gold)' },
    { label: '相近', value: stats.qsXj ?? 0, color: 'var(--muted)' },
    { label: '错', value: stats.qsCuo ?? 0, color: 'var(--red)' },
  ]
  if (total === 0) {
    return (
      <div className="space-y-3">
        <div className="py-10 text-center text-xs text-muted">暂无取数反馈数据，无法展示饼图</div>
        <div className="flex flex-wrap justify-center gap-3 text-xs text-muted">
          {data.map((d) => (
            <span key={d.label} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
              {d.label}
            </span>
          ))}
        </div>
      </div>
    )
  }
  // 扇区 path：从 -90° 起顺时针；arcFlag 扇区 >180° 用 1
  let acc = -Math.PI / 2
  const arcs = []
  for (const d of data) {
    if (d.value <= 0) continue
    const frac = d.value / total
    const a2 = acc + frac * Math.PI * 2
    const p1 = [cx + R * Math.cos(acc), cy + R * Math.sin(acc)]
    const p2 = [cx + R * Math.cos(a2), cy + R * Math.sin(a2)]
    const large = frac > 0.5 ? 1 : 0
    arcs.push({
      ...d,
      pct: Math.round(frac * 100),
      d: `M ${cx} ${cy} L ${p1[0].toFixed(2)} ${p1[1].toFixed(2)} A ${R} ${R} 0 ${large} 1 ${p2[0].toFixed(2)} ${p2[1].toFixed(2)} Z`,
    })
    acc = a2
  }
  return (
    <div className="flex flex-wrap items-center justify-center gap-4">
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full max-w-[300px]" role="img" aria-label="取数反馈三档饼图">
        {arcs.map((a) => (
          <path key={a.label} d={a.d} fill={a.color} opacity={0.9} />
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="20" fontWeight="600" fill="var(--text)">
          {total}
        </text>
        <text x={cx} y={cy + 18} textAnchor="middle" fontSize="11" fill="var(--muted)">
          取数反馈总数
        </text>
      </svg>
      <div className="min-w-[140px] space-y-1.5 text-sm">
        {data.map((d) => (
          <div key={d.label} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-muted">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
              {d.label}
            </span>
            <span className="text-text">
              {d.value}
              <span className="ml-1 text-muted">({d.pct ?? 0}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** v1.3.0 正确率趋势 4 条线定义（吉凶绿/应期蓝/方位金/取数紫=神准率；用户拍板配色） */
const TREND_LINES = [
  { key: 'jx', label: '吉凶', color: 'var(--ok)' },
  { key: 'yq', label: '应期', color: '#4a9eff' },
  { key: 'fw', label: '方位', color: 'var(--gold)' },
  { key: 'qs', label: '取数神准', color: '#b07cf0' },
]
/** 正确率样本阈值：当月该维度反馈样本 < 此数 → 空心点且不连线（防 1-2 条 0%/100% 误导） */
const MIN_SAMPLE = 3

/**
 * 原生 SVG 正确率趋势折线（4 色维度正确率线；Y 轴固定 0-100%）：
 *  - lines: 显示哪些维度（key 数组，默认全选；未选中的线不渲染）
 *  - rate 为 null（该月无该维度反馈）→ 断开不连线
 *  - 样本 < MIN_SAMPLE → 空心圆标记（不连线）
 *  - 节点点按 toggle 浮层：点节点显示正确率+样本（absolute 锚定节点、随卡片滚动），同节点再点关闭，点空白关闭
 *  - X 轴标签稀疏显示（step 最多 ~9 个）
 */
function LineChart({ data, lines = TREND_LINES.map((l) => l.key), height = 280 }) {
  // 点按浮层：absolute 相对【趋势卡片】（坐标 = 节点在卡片内的位置），随卡片滚动/缩放，
  // 永远正对节点、永不遮挡页面其他区域——彻底规避 fixed 视口定位的滚动/containing block 问题
  const [tip, setTip] = useState(null) // {x, y, text, cw}（x/y 卡片内坐标，cw=卡片宽）

  const W = 680
  const padL = 36
  const padR = 12
  const padT = 26
  const padB = 30
  const plotW = W - padL - padR
  const plotH = height - padT - padB
  const n = data.length
  const step = Math.max(Math.ceil(n / 8), 1)
  const xOf = (i) => (n <= 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW)
  const yOf = (rate) => padT + plotH - (rate ?? 0) * plotH // rate 0-1 → Y 0-100%
  const visLines = TREND_LINES.filter((l) => lines.includes(l.key))
  /** 某维度的连续线段（rate 有效且样本 ≥ MIN_SAMPLE 的点连段；否则断开） */
  const segsOf = (key) => {
    const segs = []
    let cur = null
    data.forEach((p, i) => {
      const d = p[key]
      if (d && d.rate != null && d.sample >= MIN_SAMPLE) {
        if (!cur) cur = { pts: [] }
        cur.pts.push([xOf(i), yOf(d.rate)])
      } else if (cur) {
        segs.push(cur)
        cur = null
      }
    })
    if (cur) segs.push(cur)
    return segs
  }
  /** 某维度全部有正确率的节点：{x,y,label,rate,sample,weak,title} */
  const nodesOf = (key) =>
    data.flatMap((p, i) => {
      const d = p[key]
      if (!d || d.rate == null) return []
      const weak = d.sample < MIN_SAMPLE
      const title = `${p.label} · ${TREND_LINES.find((l) => l.key === key)?.label ?? key}正确率 ${Math.round(d.rate * 100)}% · 样本 ${d.sample}${weak ? '（样本不足，仅供参考）' : ''}`
      return [{ x: xOf(i), y: yOf(d.rate), label: p.label, rate: d.rate, sample: d.sample, weak, title }]
    })
  const pathOf = (segs) =>
    segs
      .map((s) =>
        s.pts.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`).join(' '),
      )
      .join(' ')
  /**
   * 点按/触摸节点 → toggle 浮层（同节点再点关闭、异节点切换）。
   * 坐标 = 节点在【趋势卡片内】的位置（viewBox → 卡片内线性换算），与视口/滚动无关：
   * 浮层 absolute 相对卡片 → 页面滚动时浮层跟随卡片一起动，永远正对节点、不出卡片、不遮挡其他区域。
   */
  const handleNodePointer = (e, p) => {
    e.preventDefault()
    e.stopPropagation()
    const svgEl = e.currentTarget.ownerSVGElement
    if (!svgEl) return
    const svgR = svgEl.getBoundingClientRect()
    // 定位上下文 = 最近的 relative 卡片（浮层 absolute 相对它）
    const card = svgEl.closest('section.card') || svgEl.parentElement
    const cardR = card ? card.getBoundingClientRect() : { left: 0, top: 0, width: 680 }
    const x = svgR.left + (p.x / W) * svgR.width - cardR.left
    const y = svgR.top + (p.y / height) * svgR.height - cardR.top
    setTip((prev) => (prev && prev.text === p.title ? null : { x, y, text: p.title, cw: cardR.width }))
  }
  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${height}`}
        className="w-full"
        role="img"
        aria-label="维度正确率趋势折线图"
        onPointerDown={(e) => { if (e.target === e.currentTarget) setTip(null) }}
      >
        {/* Y 网格 + 刻度（0-100% 固定） */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const y = padT + plotH - f * plotH
          return (
            <g key={f}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="var(--border)" strokeWidth="1" strokeDasharray="3 3" />
              <text x={padL - 6} y={y + 3.5} textAnchor="end" fontSize="10" fill="var(--muted)">
                {Math.round(f * 100)}%
              </text>
            </g>
          )
        })}
        {/* 各维度线（仅渲染选中的维度；rate null / 样本不足处自动断开） */}
        {visLines.map((ln) => (
          <g key={ln.key}>
            <path d={pathOf(segsOf(ln.key))} fill="none" stroke={ln.color} strokeWidth="2" />
            {/* 样本不足的点：空心圆（描边色=线色，内部用背景色遮线） */}
            {nodesOf(ln.key)
              .filter((p) => p.weak)
              .map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r="3" fill="var(--bg)" stroke={ln.color} strokeWidth="1.5" />
              ))}
            {/* 节点热区（点按 toggle 浮层：同节点再点关闭；桌面与触屏一致，不依赖 hover） */}
            {nodesOf(ln.key).map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r="9"
                fill="transparent"
                onPointerDown={(e) => handleNodePointer(e, p)}
              />
            ))}
          </g>
        ))}
        {/* X 轴标签（稀疏） */}
        {data.map((p, i) =>
          i % step === 0 ? (
            <text key={p.label} x={xOf(i)} y={height - 8} textAnchor="middle" fontSize="10" fill="var(--muted)">
              {p.label}
            </text>
          ) : null,
        )}
        {/* 图例（跟随显示维度） */}
        <g transform={`translate(${padL}, 6)`}>
          {visLines.map((ln, i) => (
            <g key={ln.key} transform={`translate(${i * 108}, 0)`}>
              <line x1="0" y1="6" x2="18" y2="6" stroke={ln.color} strokeWidth="2" />
              <text x="24" y="10" fontSize="11" fill="var(--muted)">{ln.label}</text>
            </g>
          ))}
          <text x={padL + 435} y="10" fontSize="10" fill="var(--muted)">空心点=当月样本&lt;{MIN_SAMPLE}</text>
        </g>
      </svg>
      {/* 点按浮层：absolute 相对【趋势卡片】（最近 relative 祖先即 section.card），坐标=节点卡片内坐标。
          随卡片滚动/缩放，永远正对节点、不出卡片、不遮挡页面其他区域；toggle：同节点再点关闭，点图表空白关闭 */}
      {tip && (
        <div
          data-testid="trend-tip"
          style={{
            position: 'absolute',
            left: Math.max(8, Math.min(tip.x, (tip.cw ?? 680) - 112)), // 卡片内钳制（估算半宽 ~110）
            top: Math.max(4, tip.y - 36), // 节点上方；顶部节点压图例区但仍可见
            transform: 'translateX(-50%)',
            pointerEvents: 'none',
            zIndex: 50,
            maxWidth: 200, // 限制宽度防溢出；内容更长自动换行
          }}
          className="rounded-md border border-border bg-panel px-2 py-1 text-xs text-text shadow-lg"
        >
          {tip.text}
        </div>
      )}
    </>
  )
}

export default function StatsPage() {
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [allTags, setAllTags] = useState([])
  const [selTags, setSelTags] = useState(() => readStatsTags().tags) // 选中的标签名（任一/全部命中；空=全部）
  const [strictMode, setStrictMode] = useState(() => readStatsTags().strict) // 严格筛选：全部命中（只管 selTags 包含组）
  const [selExTags, setSelExTags] = useState(() => readStatsTags().exTags) // 排除的标签名（命中任一即剔除；天然 AND，无 strict 概念）
  const [fromDate, setFromDate] = useState(() => readStatsTime('from')) // 惰性记忆恢复
  const [toDate, setToDate] = useState(() => readStatsTime('to'))
  // v1.3.0 反馈结果筛选组合（跨维度与、同维度或）：{key: Set}
  const [dimSel, setDimSel] = useState(() => readStatsDims().dims)
  // v1.3.0 严格反馈开关：已反馈维度集合恰好等于勾选维度集合（未勾选维度反馈值须全空）
  const [strictFb, setStrictFb] = useState(() => readStatsDims().strictFb)
  // v1.3.0 趋势折线：粒度 + 起止年份 + 显示维度（惰性记忆）
  const [trendGran, setTrendGran] = useState(() => readStatsTrend().gran)
  const [trendFrom, setTrendFrom] = useState(() => readStatsTrend().from)
  const [trendTo, setTrendTo] = useState(() => readStatsTrend().to)
  const [trendLines, setTrendLines] = useState(() => readStatsTrend().lines) // 显示的维度 key 数组（默认全选）
  const [trendCum, setTrendCum] = useState(() => readStatsTrend().cum) // 采样：false=当月 / true=累计（逐月累加样本）
  // 变化即保存（惰性：仅用户操作更新，不做主动同步）
  useEffect(() => {
    try { sessionStorage.setItem(STATS_TIME_KEY, JSON.stringify({ from: fromDate, to: toDate })) } catch (_) { /* 静默 */ }
  }, [fromDate, toDate])
  // 标签+严格筛选惰性记忆（两页独立：卦例库的取消/清空不影响统计页选择；含排除标签 exTags）
  useEffect(() => {
    try { sessionStorage.setItem(STATS_TAGS_KEY, JSON.stringify({ tags: selTags, strict: strictMode, exTags: selExTags })) } catch (_) { /* 静默 */ }
  }, [selTags, strictMode, selExTags])
  // 反馈结果筛选组合 + 严格反馈惰性记忆
  useEffect(() => {
    const v = {}
    for (const [k, s] of Object.entries(dimSel)) v[k] = [...s]
    v.strictFb = !!strictFb
    try { sessionStorage.setItem(STATS_DIMS_KEY, JSON.stringify(v)) } catch (_) { /* 静默 */ }
  }, [dimSel, strictFb])
  // 趋势折线惰性记忆（粒度/年份/显示维度/采样方式）
  useEffect(() => {
    try { sessionStorage.setItem(STATS_TREND_KEY, JSON.stringify({ gran: trendGran, from: trendFrom, to: trendTo, lines: trendLines, cum: trendCum })) } catch (_) { /* 静默 */ }
  }, [trendGran, trendFrom, trendTo, trendLines, trendCum])
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

  // 趋势折线起止年份下拉选项（全部记录的实际年份范围）
  const yearOptions = useMemo(() => {
    let min = Infinity
    let max = -Infinity
    for (const r of records) {
      const ts = typeof r.createdAt === 'number' && Number.isFinite(r.createdAt) ? r.createdAt : (r.id ?? 0)
      const d = new Date(ts)
      if (Number.isNaN(d.getTime())) continue
      const y = d.getFullYear()
      if (y < min) min = y
      if (y > max) max = y
    }
    if (!Number.isFinite(min)) return []
    const out = []
    for (let y = min; y <= max; y++) out.push(y)
    return out
  }, [records])

  // v1.3.0 基础样本 = 标签（含排除）+ 时间筛选（不含反馈筛选）；
  //   正确率趋势受标签/时间影响、不受反馈筛选影响（反馈筛选是「结果明细」筛选，趋势是「水平基线」）
  // 标签三态切换（chip 主体=包含 inc / ⊘ 钮=排除 exc）：包含与排除互斥，同态再点=取消
  const toggleTag = (name, mode) => {
    const inInc = selTags.includes(name)
    const inExc = selExTags.includes(name)
    const turnOn = mode === 'inc' ? !inInc : !inExc
    setSelTags((s) => (mode === 'inc'
      ? (turnOn ? [...s.filter((x) => x !== name), name] : s.filter((x) => x !== name))
      : s.filter((x) => x !== name))) // 切排除时从包含组回收该标签
    setSelExTags((s) => (mode === 'exc'
      ? (turnOn ? [...s.filter((x) => x !== name), name] : s.filter((x) => x !== name))
      : s.filter((x) => x !== name))) // 切包含时从排除组回收该标签
  }
  const baseList = useMemo(() => {
    let list = records
    if (selTags.length > 0) {
      list = strictMode
        ? list.filter((r) => selTags.every((t) => (r.tags ?? []).includes(t))) // 严格：全部命中
        : list.filter((r) => selTags.some((t) => (r.tags ?? []).includes(t))) // 默认：任一命中
    }
    // 排除标签：命中任一排除标签即剔除（排除天然 AND，与 strict 无关；可只排除不包含）
    if (selExTags.length > 0) {
      list = list.filter((r) => !selExTags.some((t) => (r.tags ?? []).includes(t)))
    }
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
  }, [records, selTags, selExTags, strictMode, fromDate, toDate])

  // 反馈筛选后（四卡 / 正确率卡 / 饼图用）：跨维度与、同维度或（取数可多选 神准+相近）
  const filtered = useMemo(() => {
    let list = baseList
    const hasAny = Object.values(dimSel).some((s) => s.size > 0)
    if (hasAny) {
      list = list.filter((r) => {
        const checks = []
        if (dimSel.jixiong.size) checks.push(dimSel.jixiong.has(r.jixiongOk))
        if (dimSel.yingqi.size) checks.push(dimSel.yingqi.has(r.yingqiOk))
        if (dimSel.fangwei.size) checks.push(dimSel.fangwei.has(r.fangweiOk))
        if (dimSel.qushu.size) checks.push(dimSel.qushu.has(r.quShuFb))
        return checks.every(Boolean)
      })
      // v1.3.0 严格反馈：已反馈维度集合恰好等于勾选维度集合——
      //   未勾选维度的反馈值（jixiongOk/yingqiOk/fangweiOk/quShuFb）须全部为空
      if (strictFb) {
        list = list.filter((r) => {
          const extraFilled =
            (!dimSel.jixiong.size && (r.jixiongOk ?? '') !== '') ||
            (!dimSel.yingqi.size && (r.yingqiOk ?? '') !== '') ||
            (!dimSel.fangwei.size && (r.fangweiOk ?? '') !== '') ||
            (!dimSel.qushu.size && (r.quShuFb ?? '') !== '')
          return !extraFilled
        })
      }
    }
    return list
  }, [baseList, dimSel, strictFb])

  const stats = useMemo(() => computeStats(filtered), [filtered])

  // v1.3.0 正确率趋势数据：按 createdAt 创建月/年分组（与卡片/时间筛选同口径；起卦时间 date 不参与），
  //   每维度正确率（基于 baseList，不受反馈筛选影响）；
  //   jx/yq/fw = 对/(对+错)；qs = 神准率（神准/三档总数）；sample = 该维度当月反馈样本数（<3 不连线）
  const trendData = useMemo(() => {
    const from = trendFrom ? Number(trendFrom) : yearOptions[0]
    const to = trendTo ? Number(trendTo) : yearOptions[yearOptions.length - 1]
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) return []
    const emptyDim = () => ({ ok: 0, bad: 0, rate: null, sample: 0 })
    const emptyQs = () => ({ sz: 0, xj: 0, cuo: 0, rate: null, sample: 0 })
    const pts = new Map()
    for (const r of baseList) {
      const ts = typeof r.createdAt === 'number' && Number.isFinite(r.createdAt) ? r.createdAt : (r.id ?? 0)
      const d = new Date(ts)
      if (Number.isNaN(d.getTime())) continue
      const y = d.getFullYear()
      if (y < from || y > to) continue
      const key = trendGran === 'year' ? String(y) : `${y}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const p = pts.get(key) ?? { label: key, jx: emptyDim(), yq: emptyDim(), fw: emptyDim(), qs: emptyQs() }
      if (r.jixiongOk === '对') { p.jx.ok++; p.jx.sample++ }
      else if (r.jixiongOk === '错') { p.jx.bad++; p.jx.sample++ }
      if (r.yingqiOk === '对') { p.yq.ok++; p.yq.sample++ }
      else if (r.yingqiOk === '错') { p.yq.bad++; p.yq.sample++ }
      if (r.fangweiOk === '对') { p.fw.ok++; p.fw.sample++ }
      else if (r.fangweiOk === '错') { p.fw.bad++; p.fw.sample++ }
      if (r.quShuFb === '神准') { p.qs.sz++; p.qs.sample++ }
      else if (r.quShuFb === '相近') { p.qs.xj++; p.qs.sample++ }
      else if (r.quShuFb === '错') { p.qs.cuo++; p.qs.sample++ }
      pts.set(key, p)
    }
    for (const p of pts.values()) {
      for (const dim of ['jx', 'yq', 'fw']) {
        if (p[dim].sample > 0) p[dim].rate = p[dim].ok / (p[dim].ok + p[dim].bad)
      }
      if (p.qs.sample > 0) p.qs.rate = p.qs.sz / p.qs.sample
    }
    // 补齐范围内缺失的月份/年份（rate=null，线断开；不造假 0）
    if (trendGran === 'year') {
      for (let y = from; y <= to; y++) {
        const k = String(y)
        if (!pts.has(k)) pts.set(k, { label: k, jx: emptyDim(), yq: emptyDim(), fw: emptyDim(), qs: emptyQs() })
      }
    } else {
      for (let y = from; y <= to; y++) {
        for (let m = 1; m <= 12; m++) {
          const k = `${y}-${String(m).padStart(2, '0')}`
          if (!pts.has(k)) pts.set(k, { label: k, jx: emptyDim(), yq: emptyDim(), fw: emptyDim(), qs: emptyQs() })
        }
      }
    }
    return [...pts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v)
  }, [baseList, trendGran, trendFrom, trendTo, yearOptions])

  // v1.3.0 采样方式：当月（默认）= 各月独立正确率；累计 = 按时间顺序把之前月份样本累加到当月（看整体水平轨迹）
  const trendFinal = useMemo(() => {
    if (!trendCum) return trendData
    const acc = { jx: { ok: 0, bad: 0 }, yq: { ok: 0, bad: 0 }, fw: { ok: 0, bad: 0 }, qs: { sz: 0, xj: 0, cuo: 0 } }
    return trendData.map((p) => {
      const np = { label: p.label, jx: { ...p.jx }, yq: { ...p.yq }, fw: { ...p.fw }, qs: { ...p.qs } }
      for (const dim of ['jx', 'yq', 'fw']) {
        acc[dim].ok += np[dim].ok
        acc[dim].bad += np[dim].bad
        const s = acc[dim].ok + acc[dim].bad
        np[dim].rate = s > 0 ? acc[dim].ok / s : null
        np[dim].sample = s
      }
      acc.qs.sz += np.qs.sz
      acc.qs.xj += np.qs.xj
      acc.qs.cuo += np.qs.cuo
      const qsS = acc.qs.sz + acc.qs.xj + acc.qs.cuo
      np.qs.rate = qsS > 0 ? acc.qs.sz / qsS : null
      np.qs.sample = qsS
      return np
    })
  }, [trendData, trendCum])

  /**
   * 各数字点击 → 跳 /lib 带筛选 query（v0.10 建议4 #5；v0.2 功能 J 追加标签参数；
   * v0.10 改进建8 #2：主筛选用 status=pending/unfed/fed 互斥单组参数；v1.3.0 取数跳转 quShuFb=）
   * v1.3.0：统计页反馈筛选组合随跳转携带（与卦例库同语义：跨维度与、同维度或）；
   *   有反馈筛选时强制 status=fed（反馈结果只存在于已反馈卦例，避免跳到其他视图筛选静默失效）
   * @param {string} qs 形如 'status=fed&jixiongOk=对'（可为空串）
   */
  const DIM_SEL_URL_KEY = { jixiong: 'jixiongOk', yingqi: 'yingqiOk', fangwei: 'fangweiOk', qushu: 'quShuFb' }
  const goLib = (qs) => {
    const params = new URLSearchParams(qs)
    // 反馈筛选组合 → URL（与 qs 中单值参数合并去重，重复参数=同维度多选）
    let hasDimSel = false
    for (const [dim, set] of Object.entries(dimSel)) {
      if (set.size === 0) continue
      hasDimSel = true
      const urlKey = DIM_SEL_URL_KEY[dim]
      const merged = [...new Set([...params.getAll(urlKey), ...set])]
      params.delete(urlKey)
      for (const v of merged) params.append(urlKey, v)
    }
    if (hasDimSel) params.set('status', 'fed') // 反馈筛选仅在已反馈视图生效 → 强制 fed
    if (hasDimSel && strictFb) params.set('strictFb', '1') // v1.3.0 严格反馈随跳转携带（与标签 strict=1 区分）
    for (const t of selTags) params.append('tags', t) // 标签用重复参数（tag 名可含逗号）
    for (const t of selExTags) params.append('exTags', t) // 排除标签同样携带（卦例库同步应用）
    if (strictMode) params.set('strict', '1') // 严格筛选随跳转携带，卦例库同步应用（只管 tags 包含组）
    if (fromDate) params.set('from', fromDate) // 时间范围随跳转携带，卦例库自动应用
    if (toDate) params.set('to', toDate)
    const s = params.toString()
    navigate(`/lib${s ? `?${s}` : ''}`)
  }

  /** 总览卡（v1.3.0：四卡保留，文案「未反馈」→「待反馈」，URL status=unfed 不变） */
  const OVERVIEW = [
    { label: '总卦例数', value: stats.total, qs: '', cls: 'text-text' },
    { label: '已反馈', value: stats.fed, qs: 'status=fed', cls: 'text-gold' },
    { label: '待反馈', value: stats.unfed, qs: 'status=unfed', cls: 'text-muted' },
    { label: '待占断', value: stats.pending, qs: 'status=pending', cls: 'text-muted' },
  ]

  /** v1.3.0 反馈结果筛选维度定义（跨维度与、同维度或；取数可多选 神准+相近） */
  const DIM_SEL_DEF = [
    { key: 'jixiong', label: '吉凶', field: 'jixiongOk', options: ['对', '错'] },
    { key: 'yingqi', label: '应期', field: 'yingqiOk', options: ['对', '错'] },
    { key: 'fangwei', label: '方位', field: 'fangweiOk', options: ['对', '错'] },
    { key: 'qushu', label: '取数', field: 'quShuFb', options: QSHU_LEVELS },
  ]

  /** 维度筛选切换：同维度多选 = 或（点已选中取消） */
  const toggleDim = (key, val) => {
    setDimSel((prev) => {
      const next = { ...prev, [key]: new Set(prev[key]) }
      if (next[key].has(val)) next[key].delete(val)
      else next[key].add(val)
      return next
    })
  }

  // v1.3.0 视觉联动：存在反馈筛选时，选中维度卡金边框+放大 1.03、未选中缩小 0.97（纯视觉，不破坏布局）
  const anyDimSel = Object.values(dimSel).some((s) => s.size > 0)
  const dimCardCls = (active) =>
    `space-y-3 card rounded-xl border bg-panel p-4 transition-all duration-200 ${
      anyDimSel ? (active ? 'border-gold shadow-lg' : 'border-border opacity-70') : 'border-border'
    }`
  const dimCardStyle = (active) => (anyDimSel ? { transform: `scale(${active ? 1.03 : 0.97})` } : undefined)

  return (
    <div className="space-y-5">
      {/* 顶栏 */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-medium text-gold">统计</h1>
        <span className="text-xs text-muted">
          仅统计已反馈卦例的正确率；选择标签 / 时间 / 反馈结果可缩小统计范围
        </span>
      </div>

      {error && <div className="text-sm text-red">{error}</div>}

      {/* 标签筛选（多选包含/排除三态；严格筛选=全部命中只作用于包含；数据源=共用 tags 表） */}
      <section className="flex flex-wrap items-center gap-2 card rounded-xl border border-border bg-panel p-4">
        <span className="w-10 shrink-0 text-sm text-muted">标签</span>
        {allTags.length === 0 && <span className="text-xs text-muted">暂无标签，可在卦例库或排盘页新增</span>}
        {allTags.map((t) => {
          const inc = selTags.includes(t.name)
          const exc = selExTags.includes(t.name)
          // 状态配色：包含=彩色/灰标签 fallback 品牌紫蓝；排除=红系（固定，不随标签色褪色）；未选=灰
          const chipStyle = inc
            ? tagActiveStyle(t.color)
            : exc
              ? { borderColor: 'rgb(var(--red-rgb))', color: 'rgb(var(--red-rgb))', background: 'rgb(var(--red-rgb) / 0.10)' }
              : { borderColor: 'var(--border)', color: 'var(--muted)', background: 'transparent' }
          return (
            <span
              key={t.id ?? t.name}
              className={`flex items-center rounded-full border py-1 pl-3 pr-1.5 text-sm transition-colors ${
                inc || exc ? '' : 'opacity-60 hover:opacity-90'
              }`}
              style={chipStyle}
            >
              <button
                type="button"
                onClick={() => toggleTag(t.name, 'inc')}
                className="flex items-center gap-1.5"
                style={{ color: 'inherit' }}
                title={inc ? '取消筛选' : '按此标签筛选'}
              >
                <span className={`h-2 w-2 rounded-full ${exc ? 'opacity-60' : ''}`} style={{ background: t.color }} />
                <span className={exc ? 'line-through decoration-double decoration-2' : ''}>{t.name}</span>
                {inc && <span className="text-xs">✓</span>}
              </button>
              <button
                type="button"
                onClick={() => toggleTag(t.name, 'exc')}
                className={`ml-1 rounded-full px-1 text-xs leading-none transition-colors ${exc ? '' : 'opacity-60 hover:opacity-100'}`}
                style={{ color: 'inherit' }}
                title={exc ? '取消排除' : '排除此标签'}
                aria-label={exc ? '取消排除' : '排除此标签'}
              >
                ⊘
              </button>
            </span>
          )
        })}
        {/* 严格筛选（全部命中，只管包含组）：<2 包含标签时禁用但状态保留（1 个标签时全部命中=任一命中，结果等价） */}
        <label
          className={`ml-auto flex shrink-0 items-center gap-1.5 text-xs ${
            selTags.length < 2
              ? 'cursor-not-allowed text-muted opacity-50'
              : 'cursor-pointer text-muted hover:text-text'
          }`}
          title={selTags.length < 2 ? '严格筛选需选择两个或以上「含」标签' : '勾选后只统计命中全部所选含标签的卦例（排除标签不受此开关影响）'}
        >
          <input
            type="checkbox"
            checked={strictMode}
            disabled={selTags.length < 2}
            onChange={(e) => setStrictMode(e.target.checked)}
            className="h-3.5 w-3.5"
            style={{ accentColor: 'var(--gold)' }}
          />
          严格筛选
        </label>
        {(selTags.length > 0 || selExTags.length > 0) && (
          <button
            type="button"
            onClick={() => { setSelTags([]); setSelExTags([]); setStrictMode(false) }} // 清除标签连带清严格/排除（拍板：一步回默认全量）
            className="rounded-md border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:text-text"
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

      {/* v1.3.0 反馈结果筛选组合：跨维度与、同维度或（取数可多选 神准+相近），无严格筛选开关 */}
      <section className="space-y-2.5 card rounded-xl border border-border bg-panel p-4">
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          <span className="w-10 shrink-0 text-muted">反馈</span>
          {DIM_SEL_DEF.map((d) => (
            <span key={d.key} className="flex flex-wrap items-center gap-1">
              <span className="text-xs text-muted">{d.label}</span>
              {d.options.map((o) => {
                const on = dimSel[d.key].has(o)
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() => toggleDim(d.key, o)}
                    title={`${d.label}反馈${o}`}
                    className={`rounded-md border px-2 py-0.5 text-xs transition-colors ${
                      on ? 'border-gold bg-goldSoft text-gold' : 'border-border text-muted hover:text-text'
                    }`}
                  >
                    {o}
                  </button>
                )
              })}
            </span>
          ))}
          <span className="text-xs text-muted">同维度多选=或，跨维度=与</span>
          {/* v1.3.0 严格反馈开关：已反馈维度集合恰好等于勾选维度集合（未勾选维度无反馈）；无维度勾选时禁用 */}
          <label
            className={`ml-auto flex shrink-0 items-center gap-1.5 text-xs ${
              Object.values(dimSel).some((s) => s.size > 0)
                ? 'cursor-pointer text-muted hover:text-text'
                : 'cursor-not-allowed text-muted opacity-50'
            }`}
            title={
              Object.values(dimSel).some((s) => s.size > 0)
                ? '勾选后只看反馈维度恰好等于所选维度的卦例（其他维度无反馈记录）'
                : '需先勾选至少一个反馈维度'
            }
          >
            <input
              type="checkbox"
              checked={strictFb}
              disabled={!Object.values(dimSel).some((s) => s.size > 0)}
              onChange={(e) => setStrictFb(e.target.checked)}
              className="h-3.5 w-3.5"
              style={{ accentColor: 'var(--gold)' }}
            />
            严格反馈
          </label>
        </div>
        {Object.values(dimSel).some((s) => s.size > 0) && (
          <div className="flex items-center gap-2">
            <span className="w-10 shrink-0" />
            <button
              type="button"
              onClick={() => { setDimSel({ jixiong: new Set(), yingqi: new Set(), fangwei: new Set(), qushu: new Set() }); setStrictFb(false) }} // 清除反馈筛选连带清严格
              className="rounded-md border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:text-text"
            >
              清除反馈筛选
            </button>
            <span className="text-xs text-muted">卡片与饼图将仅包含所选反馈结果；正确率趋势不受影响</span>
          </div>
        )}
      </section>

      {/* 总览卡（v1.3.0：文案「待反馈」；四卡保留） */}
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

      {/* 正确率卡 ×3 + 取数卡（v1.3.0：取数卡三档+双口径 神准率/神准+相近率；
          视觉联动：反馈筛选选中维度 → 对应卡金边框高亮+放大，未选中缩小） */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {DIM_FIELDS.map((d) => {
          const f = RATE_MAP[d.key]
          const ok = stats[f.ok]
          const bad = stats[f.bad]
          const rate = stats[f.rate]
          const dimActive = dimSel[d.key].size > 0
          return (
            <div key={d.key} data-dim={d.key} className={dimCardCls(dimActive)} style={dimCardStyle(dimActive)}>
              <div className="flex items-center justify-between">
                {/* 维度名 + 总数（用户拍板：总放在维度名右侧，不放在「错」右边） */}
                <span className="flex items-center gap-2 text-sm">
                  <span className="text-muted">{d.label}</span>
                  <span
                    className="rounded border border-border px-1.5 py-0.5 text-xs text-muted"
                    title={`该维度反馈总数（对+错）`}
                  >
                    总 {ok + bad}
                  </span>
                </span>
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

        {/* v1.3.0 取数卡：三档计数（可点击跳转）+ 双口径 神准率 / 神准+相近率；分母=三档已勾选总数 */}
        <div data-dim="qushu" className={dimCardCls(dimSel.qushu.size > 0)} style={dimCardStyle(dimSel.qushu.size > 0)}>
          <div className="flex items-center justify-between">
            {/* 维度名 + 总数（三档合计，放维度名右侧） */}
            <span className="flex items-center gap-2 text-sm">
              <span className="text-muted">取数</span>
              <span
                className="rounded border border-border px-1.5 py-0.5 text-xs text-muted"
                title={`取数反馈总数（神准+相近+错）`}
              >
                总 {stats.qsSz + stats.qsXj + stats.qsCuo}
              </span>
            </span>
            <span className="flex items-center gap-2 text-xs">
              {QSHU_LEVELS.map((lv) => {
                const cnt = lv === '神准' ? stats.qsSz : lv === '相近' ? stats.qsXj : stats.qsCuo
                const color = lv === '神准' ? 'gold' : lv === '相近' ? 'muted' : 'red'
                return (
                  <button
                    key={lv}
                    type="button"
                    disabled={cnt === 0}
                    onClick={() => goLib(`status=fed&quShuFb=${encodeURIComponent(lv)}`)}
                    className={`cursor-pointer rounded border px-2 py-0.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      color === 'gold'
                        ? 'border-gold/60 text-gold hover:bg-goldSoft'
                        : color === 'red'
                          ? 'border-red/60 text-red hover:bg-red/10'
                          : 'border-border text-muted hover:text-text'
                    }`}
                    title={`取数反馈${lv}：${cnt}`}
                  >
                    {lv} {cnt}
                  </button>
                )
              })}
            </span>
          </div>
          <div className="flex items-baseline gap-3">
            <span className={`text-2xl font-medium ${stats.qsRate == null ? 'text-muted' : 'text-gold'}`}>
              {pctText(stats.qsRate)}
            </span>
            <span className="text-xs text-muted">神准率</span>
          </div>
          <div className="flex items-baseline gap-3">
            <span className={`text-lg font-medium ${stats.qsRate2 == null ? 'text-muted' : 'text-text'}`}>
              {pctText(stats.qsRate2)}
            </span>
            <span className="text-xs text-muted">神准+相近率</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-black/30">
            <div
              className="h-full rounded-full bg-gold transition-all"
              style={{ width: stats.qsRate == null ? '0%' : `${Math.min(stats.qsRate * 100, 100)}%` }}
            />
          </div>
          {stats.qsRate == null && <div className="text-xs text-muted">暂无取数反馈记录</div>}
        </div>
      </section>

      {/* v1.3.0 图表区：取数饼图 + 正确率趋势（原生 SVG，无新依赖；柱状图 2026-08-14 已砍） */}
      <section className="card rounded-xl border border-border bg-panel p-4">
        <div className="mb-2 text-sm text-muted">取数反馈三档占比（当前反馈筛选范围内）</div>
        <PieChart stats={stats} />
      </section>

      {/* v1.3.0 正确率趋势：4 色维度正确率线（受标签+时间筛选影响、不受反馈筛选影响）；
          可勾选显示维度（默认全选）；月/年粒度 + 起止年份下拉；节点悬浮显示正确率 */}
      <section className="card rounded-xl border border-border bg-panel p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">维度正确率趋势（按创建时间分组）</span>
          <span className="ml-2 text-xs text-muted">显示</span>
          {TREND_LINES.map((ln) => {
            const on = trendLines.includes(ln.key)
            return (
              <label
                key={ln.key}
                className="flex cursor-pointer items-center gap-1 text-xs text-muted hover:text-text"
                aria-label={`${on ? '隐藏' : '显示'}${ln.label}正确率线`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() =>
                    setTrendLines((prev) => (prev.includes(ln.key) ? prev.filter((x) => x !== ln.key) : [...prev, ln.key]))
                  }
                  className="h-3 w-3"
                  style={{ accentColor: ln.color }}
                />
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: ln.color }} />
                {ln.label}
              </label>
            )
          })}
          <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted">采样</span>
            {[{ key: false, label: '当月' }, { key: true, label: '累计' }].map((c) => (
              <button
                key={String(c.key)}
                type="button"
                onClick={() => setTrendCum(c.key)}
                aria-label={c.key ? '累计模式：把之前月份的样本逐月累加，看整体水平轨迹（曲线更平滑）' : '当月模式：每月独立统计正确率（看短期波动）'}
                className={`rounded-md border px-2 py-0.5 transition-colors ${
                  trendCum === c.key ? 'border-gold bg-goldSoft text-gold' : 'border-border text-muted hover:text-text'
                }`}
              >
                {c.label}
              </button>
            ))}
            <span className="ml-2 text-muted">粒度</span>
            {['month', 'year'].map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setTrendGran(g)}
                className={`rounded-md border px-2 py-0.5 transition-colors ${
                  trendGran === g ? 'border-gold bg-goldSoft text-gold' : 'border-border text-muted hover:text-text'
                }`}
              >
                {g === 'month' ? '月度' : '年度'}
              </button>
            ))}
            <span className="ml-2 text-muted">年份</span>
            <select
              value={trendFrom || yearOptions[0] || ''}
              onChange={(e) => setTrendFrom(e.target.value)}
              className="rounded-md border border-border bg-bg px-2 py-1 text-xs text-text outline-none focus:border-gold"
              aria-label="趋势起始年份"
            >
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <span className="text-muted">至</span>
            <select
              value={trendTo || yearOptions[yearOptions.length - 1] || ''}
              onChange={(e) => setTrendTo(e.target.value)}
              className="rounded-md border border-border bg-bg px-2 py-1 text-xs text-text outline-none focus:border-gold"
              aria-label="趋势结束年份"
            >
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        {trendFinal.length === 0 ? (
          <div className="py-10 text-center text-xs text-muted">暂无卦例数据</div>
        ) : (
          <LineChart data={trendFinal} lines={trendLines} />
        )}
      </section>
    </div>
  )
}
