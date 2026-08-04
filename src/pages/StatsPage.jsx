/**
 * 统计页 + 错题本（Task 11）
 *
 * 功能：
 *   - 总览卡：总数 / 已反馈 / 未反馈（数字 + 颜色区分）
 *   - 正确率卡 ×3：吉凶 / 应期 / 方位（对 X · 错 Y · 正确率 Z% + 金色进度条，仅统计已反馈）
 *   - tag 筛选：多选标签（任一命中），重算上方统计与错题本
 *   - 错题本：勾选错误维度（吉凶错/应期错/方位错）→ 列出任一选中维度为错的卦例
 *     → 点击行展开查看盘面（PanView，快照优先）+ 断语/应期/反馈（只读复盘）
 *   - 空态：无卦例 / 无已反馈 / 无错题 分别给引导文案
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listGuashi } from '../db/guashiRepo.js'
import { listTags } from '../db/tagsRepo.js'
import PanView from '../components/PanView.jsx'
import { resolvePan } from '../utils/panResolve.js'
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
  const [allTags, setAllTags] = useState([])
  const [selTags, setSelTags] = useState([])
  const [wrongOn, setWrongOn] = useState(() => new Set(DIM_FIELDS.map((d) => d.key)))
  const [expandedId, setExpandedId] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        setRecords(await listGuashi())
      } catch (e) {
        setError('加载卦例失败：' + e.message)
      }
      try {
        setAllTags(await listTags())
      } catch (e) {
        /* 标签加载失败不影响统计 */
      }
    })()
  }, [])

  /** tag 筛选后的范围（任一命中，与卦例库一致） */
  const scoped = useMemo(() => {
    return records.filter(
      (r) => selTags.length === 0 || selTags.some((t) => (r.tags ?? []).includes(t)),
    )
  }, [records, selTags])

  const stats = useMemo(() => computeStats(scoped), [scoped])

  /** 错题本：任一选中维度为错的卦例 */
  const wrongList = useMemo(() => {
    return scoped.filter((g) =>
      [...wrongOn].some((k) => wrongDims(g)[k]),
    )
  }, [scoped, wrongOn])

  /** 展开行记录（筛选后可能已不在列表，需防悬挂） */
  const expanded = useMemo(
    () => wrongList.find((r) => r.id === expandedId) ?? null,
    [wrongList, expandedId],
  )

  const toggleTag = (name) =>
    setSelTags((s) => (s.includes(name) ? s.filter((x) => x !== name) : [...s, name]))

  const toggleWrong = (key) =>
    setWrongOn((s) => {
      const n = new Set(s)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })

  const tagPill = (t) => {
    const on = selTags.includes(t.name)
    return (
      <button
        key={t.id}
        type="button"
        onClick={() => toggleTag(t.name)}
        className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors"
        style={{
          borderColor: on ? t.color : 'var(--border)',
          color: on ? t.color : 'var(--muted)',
          background: on ? t.color + '1f' : 'transparent',
        }}
      >
        <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />
        {t.name}
        {on && <span className="text-xs">✓</span>}
      </button>
    )
  }

  const wrongChip = (d) => {
    const on = wrongOn.has(d.key)
    return (
      <button
        key={d.key}
        type="button"
        onClick={() => toggleWrong(d.key)}
        className={`rounded-md border px-3 py-1 text-sm transition-colors ${
          on ? 'border-red/70 bg-red/10 text-red' : 'border-border text-muted hover:text-text'
        }`}
      >
        {d.label}错
        {on && <span className="ml-1 text-xs">✓</span>}
      </button>
    )
  }

  /** 总览卡 */
  const OVERVIEW = [
    { label: '总卦例数', value: stats.total, cls: 'text-text' },
    { label: '已反馈', value: stats.fed, cls: 'text-gold' },
    { label: '未反馈', value: stats.unfed, cls: 'text-muted' },
  ]

  return (
    <div className="space-y-5">
      {/* 顶栏 */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-medium text-gold">统计</h1>
        <span className="text-xs text-muted">仅统计已反馈卦例的正确率；选择标签可只看该标签的卦</span>
      </div>

      {error && <div className="text-sm text-red">{error}</div>}

      {/* tag 筛选 */}
      <section className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-panel p-4">
        <span className="w-10 shrink-0 text-sm text-muted">标签</span>
        {allTags.length === 0 ? (
          <span className="text-sm text-muted">暂无标签，可在卦例库编辑时为卦例添加</span>
        ) : (
          allTags.map(tagPill)
        )}
        {selTags.length > 0 && (
          <button
            type="button"
            onClick={() => setSelTags([])}
            className="ml-auto rounded-md border border-border px-3 py-1 text-sm text-muted transition-colors hover:text-text"
          >
            清除筛选
          </button>
        )}
      </section>

      {/* 总览卡 */}
      <section className="grid gap-3 sm:grid-cols-3">
        {OVERVIEW.map((o) => (
          <div key={o.label} className="rounded-xl border border-border bg-panel p-4">
            <div className="text-xs text-muted">{o.label}</div>
            <div className={`mt-1.5 text-3xl font-medium ${o.cls}`}>{o.value}</div>
          </div>
        ))}
      </section>

      {/* 正确率卡 ×3 */}
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
                <span className="text-xs text-muted">
                  对 <b className="text-gold">{ok}</b> · 错 <b className="text-red">{bad}</b>
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

      {/* 错题本 */}
      <section className="rounded-xl border border-border bg-panel p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-medium text-gold">错题本</h2>
          <span className="text-xs text-muted">任一维度为错的卦例，点击行展开复盘</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {DIM_FIELDS.map(wrongChip)}
          </div>
        </div>

        {/* 空态分支 */}
        {wrongList.length === 0 ? (
          <div className="mt-4 flex min-h-[24vh] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-bg/50 p-8 text-center">
            {wrongOn.size === 0 ? (
              <p className="text-sm text-muted">请至少勾选一个错误维度进行筛选</p>
            ) : records.length === 0 ? (
              <>
                <p className="text-sm text-muted">卦例库空空如也，先去排盘页起一卦并保存吧</p>
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="rounded-md border border-gold px-4 py-2 text-sm text-gold transition-colors hover:bg-goldSoft"
                >
                  去排盘
                </button>
              </>
            ) : stats.fed === 0 ? (
              <>
                <p className="text-sm text-muted">
                  {selTags.length > 0
                    ? '所选标签下还没有已反馈的卦例，可清除标签筛选'
                    : '还没有已反馈的卦例，先去排盘吧'}
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="rounded-md border border-gold px-4 py-2 text-sm text-gold transition-colors hover:bg-goldSoft"
                >
                  去排盘
                </button>
              </>
            ) : (
              <p className="text-sm text-muted">
                当前筛选下没有错题，再接再厉{selTags.length > 0 ? '（可清除标签筛选看全部）' : ''}
              </p>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {wrongList.map((g) => {
              const dims = wrongDims(g)
              const open = expanded?.id === g.id
              const panRes = open ? resolvePan(g) : null
              return (
                <div key={g.id} className="rounded-xl border border-border bg-bg">
                  {/* 行：点击展开/收起 */}
                  <button
                    type="button"
                    onClick={() => setExpandedId(open ? null : g.id)}
                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-4 py-3 text-left transition-colors hover:bg-goldSoft/40"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">
                      {g.title || '未命名卦例'}
                    </span>
                    <span className="text-xs text-muted">{g.date || '—'}</span>
                    <span className="flex flex-wrap gap-1.5">
                      {DIM_FIELDS.filter((d) => dims[d.key]).map((d) => (
                        <span
                          key={d.key}
                          className="rounded-full border border-red/60 bg-red/10 px-2 py-0.5 text-xs text-red"
                        >
                          {d.label}错
                        </span>
                      ))}
                    </span>
                    <span className="text-xs text-muted">{open ? '▾ 收起' : '▸ 展开'}</span>
                  </button>

                  {/* 展开：盘面 + 占断/反馈只读 */}
                  {open && (
                    <div className="space-y-3 border-t border-border p-4">
                      {panRes?.ok ? (
                        <PanView pan={panRes.pan} />
                      ) : (
                        <div className="rounded-xl border border-red/40 bg-red/10 p-3 text-sm text-red">
                          盘面加载失败：{panRes?.error}（该卦例无盘面快照，且无法按起卦参数重新排盘）
                        </div>
                      )}

                      <div className="space-y-3 rounded-xl border border-border bg-panel p-4 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-muted">吉凶</span>
                          <span
                            className={`rounded-md border px-2 py-0.5 text-xs font-medium ${
                              g.jixiong === '吉'
                                ? 'border-gold/60 bg-goldSoft text-gold'
                                : g.jixiong === '凶'
                                  ? 'border-red/60 bg-red/10 text-red'
                                  : 'border-border text-muted'
                            }`}
                          >
                            {g.jixiong || '未定'}
                          </span>
                          <span className="text-muted">反馈状态</span>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-xs ${
                              g.status === '已反馈'
                                ? 'border-[#34d399]/60 bg-[#34d399]/10 text-[#34d399]'
                                : 'border-border text-muted'
                            }`}
                          >
                            {g.status === '已反馈' ? '✓ 已反馈' : '未反馈'}
                          </span>
                        </div>
                        {[
                          { label: '断语', text: g.duanyu },
                          { label: '应期', text: g.yingqi },
                          { label: '反馈', text: g.fankui },
                        ].map((blk) => (
                          <div key={blk.label}>
                            <div className="mb-1 text-xs text-muted">{blk.label}</div>
                            <div className="whitespace-pre-wrap text-text">
                              {blk.text?.trim() ? blk.text : <span className="text-muted">—</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
