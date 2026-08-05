/**
 * 卦辞爻辞页（Task 12）
 *
 * 三形态：
 *   /help/guaci                → 64 卦列表（按八宫分组，点击选卦）
 *   /help/guaci?gua=卦名        → 卦象爻画 + 卦辞 + 全部爻辞（解析占位）
 *   /help/yaoci?gua=卦名&line=i → 同上，并聚焦第 i 爻（0-5；乾/坤 6=用九/用六）
 *
 * 排盘页跳转约定（PanView）：点卦名 → /help/guaci?gua=卦名；点爻行 → /help/yaoci?gua=卦名&line=索引
 */
import { Fragment } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { GUA_64 } from '../../engine/guaTable.js'
import { GUA_CI, findGuaci, findYaoci, JIEXI_PLACEHOLDER, yaoName } from '../../data/helpData.js'

const GONG_ORDER = ['乾', '兑', '离', '震', '巽', '坎', '艮', '坤']
const POS_NAME = ['初', '二', '三', '四', '五', '上']

/** 卦名 → 卦辞 速查表（列表模式用） */
const CI_MAP = Object.fromEntries(GUA_CI.map((g) => [g.name, g.guaci]))

/** 爻条目：索引 0-5 → 六爻；6 → 用九/用六（仅乾/坤有，其余返回 null） */
function yaoEntry(gua, yc, i) {
  if (!yc) return null
  if (i === 6) {
    if (!yc.yong) return null
    return { title: gua.name === '乾为天' ? '用九' : '用六', text: yc.yong }
  }
  return { title: yaoName(gua.lines, i), text: yc.yaoci[i] }
}

export default function GuaciPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const guaName = (params.get('gua') ?? '').trim()
  const lineRaw = (params.get('line') ?? '').trim()

  const gua = guaName ? (GUA_64.find((g) => g.name === guaName) ?? null) : null
  const ci = guaName ? findGuaci(guaName) : null
  const yc = guaName ? findYaoci(guaName) : null

  // 选中爻索引（0-6，6=用九/用六）；无效参数回退 null
  const selIdx = /^\d+$/.test(lineRaw) ? Number(lineRaw) : null
  const selIdxInRange = selIdx !== null && selIdx >= 0 && selIdx <= 6
  const selEntry = gua && yc && selIdxInRange ? yaoEntry(gua, yc, selIdx) : null
  const selIdxValid = selEntry ? selIdx : null

  /* ============ 列表模式（无 ?gua=） ============ */
  if (!gua) {
    return (
      <div className="space-y-4">
        <section className="rounded-xl border border-border bg-panel p-4 sm:p-5">
          <h2 className="mb-1 text-base font-medium text-gold">卦辞爻辞</h2>
          <p className="text-sm text-muted">
            收录 64 卦卦辞与 386 条爻辞（含用九、用六）。点击卦名查看卦象与卦辞，点击爻位查看单爻爻辞。
          </p>
        </section>

        {GONG_ORDER.map((gong) => {
          const list = GUA_64.filter((g) => g.gong === gong)
          return (
            <section key={gong} className="rounded-xl border border-border bg-panel p-4 sm:p-5">
              <h3 className="mb-3 text-sm font-medium text-gold">
                {gong}宫（{list.length} 卦）
              </h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {list.map((g) => (
                  <Link
                    key={g.name}
                    to={`/help/guaci?gua=${g.name}`}
                    className="rounded-lg border border-border px-3 py-2 transition-colors hover:border-gold hover:bg-goldSoft"
                  >
                    <div className="text-sm text-gold">{g.name}</div>
                    <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">
                      {CI_MAP[g.name] ?? ''}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    )
  }

  /* ============ 详情模式（?gua=卦名，可带 line） ============ */
  const order = [5, 4, 3, 2, 1, 0] // 上爻 → 初爻

  return (
    <div className="space-y-4">
      {/* 头部 */}
      <section className="rounded-xl border border-border bg-panel p-4 sm:p-5">
        <Link to="/help/guaci" className="text-xs text-muted transition-colors hover:text-gold">
          ← 全部卦辞
        </Link>
        <Link to="/" className="ml-4 text-xs text-muted transition-colors hover:text-gold">
          ← 返回排盘
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-bold text-gold">{gua.name}</h2>
          <span className="text-sm text-muted">{gua.gong}宫</span>
          {gua.youhun ? (
            <span className="rounded bg-goldSoft px-2 py-0.5 text-xs text-gold">游魂卦</span>
          ) : null}
          {gua.guihun ? (
            <span className="rounded bg-goldSoft px-2 py-0.5 text-xs text-gold">归魂卦</span>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-muted">点击爻位可查看单爻爻辞</p>
      </section>

      {/* 爻画（上→下） */}
      <section className="overflow-hidden rounded-xl border border-border bg-panel">
        {order.map((i) => {
          const e = yaoEntry(gua, yc, i)
          const active = selIdxValid === i
          return (
            <button
              key={i}
              type="button"
              onClick={() => navigate(`/help/yaoci?gua=${gua.name}&line=${i}`)}
              className={`flex w-full items-center gap-4 border-b border-border px-4 py-2.5 text-left transition-colors hover:bg-goldSoft ${
                active ? 'bg-goldSoft' : ''
              }`}
            >
              <span className="w-12 shrink-0 text-sm text-gold">{e?.title}</span>
              <span className="tracking-widest text-base text-text">
                {gua.lines[i] === '1' ? '━━━' : '━━  ━━'}
              </span>
              <span className="ml-auto text-xs text-muted">
                {gua.shi === i ? '世' : gua.ying === i ? '应' : ''}
              </span>
            </button>
          )
        })}
        {/* 用九 / 用六（乾/坤特有） */}
        {yc?.yong ? (
          <button
            type="button"
            onClick={() => navigate(`/help/yaoci?gua=${gua.name}&line=6`)}
            className={`flex w-full items-center gap-4 border-t border-dashed border-border px-4 py-2.5 text-left transition-colors hover:bg-goldSoft ${
              selIdxValid === 6 ? 'bg-goldSoft' : ''
            }`}
          >
            <span className="w-12 shrink-0 text-sm text-gold">{gua.name === '乾为天' ? '用九' : '用六'}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-muted">{yc.yong}</span>
          </button>
        ) : null}
      </section>

      {/* 选中的单爻爻辞 */}
      {selEntry ? (
        <section className="rounded-xl border border-gold bg-panel p-4 sm:p-5">
          <div className="mb-1 text-xs text-muted">
            {selIdx === 6 ? '附加爻（乾卦用九 / 坤卦用六）' : `${POS_NAME[selIdx]}爻（第 ${selIdx + 1} 位）`}
          </div>
          <div className="text-base font-medium text-gold">{selEntry.title}</div>
          <p className="mt-2 leading-relaxed text-text">{selEntry.text}</p>
          <p className="mt-3 text-sm text-muted">解析：{JIEXI_PLACEHOLDER}</p>
        </section>
      ) : null}

      {/* 卦辞 */}
      <section className="rounded-xl border border-border bg-panel p-4 sm:p-5">
        <h3 className="mb-2 text-sm font-medium text-gold">卦辞</h3>
        <p className="leading-relaxed text-text">{ci?.guaci ?? ''}</p>
        <p className="mt-3 text-sm text-muted">解析：{ci?.jiexi || JIEXI_PLACEHOLDER}</p>
      </section>

      {/* 全部爻辞 */}
      <section className="overflow-hidden rounded-xl border border-border bg-panel">
        <div className="border-b border-border bg-black/20 px-4 py-2 text-sm font-medium text-gold">
          爻辞（{gua.name}）
        </div>
        {order.map((i) => {
          const e = yaoEntry(gua, yc, i)
          if (!e) return null
          const active = selIdxValid === i
          return (
            <Fragment key={i}>
              <button
                type="button"
                onClick={() => navigate(`/help/yaoci?gua=${gua.name}&line=${i}`)}
                className={`flex w-full items-start gap-4 border-b border-border px-4 py-2.5 text-left transition-colors last:border-0 hover:bg-goldSoft ${
                  active ? 'bg-goldSoft' : ''
                }`}
              >
                <span
                  className="w-12 shrink-0 text-sm"
                  style={{ color: active ? 'var(--gold)' : 'var(--text)' }}
                >
                  {e.title}
                </span>
                <span className="min-w-0 flex-1 text-sm leading-relaxed text-muted">{e.text}</span>
              </button>
            </Fragment>
          )
        })}
      </section>
    </div>
  )
}
