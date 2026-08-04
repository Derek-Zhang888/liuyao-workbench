/**
 * 盘面展示组件（Task 9 / Task 14 响应式改造）
 *
 * 输入 paipan() 输出的盘面对象，暗色专业风渲染：
 *   干支行：年建/月建/日建/时建/旬空/卦身/煞神
 *   卦名行：本卦名 | 变卦名（点击跳卦辞页 /help/guaci?gua=卦名）
 *   6 爻行（上→初，每爻三格）：
 *     六神+爻位 | 本卦六亲+世应+爻画 | 变卦六亲+旺衰+伏神
 *           点击爻行跳爻辞页 /help/yaoci?gua=卦名&line=爻索引
 * 五行配色：地支文字按五行用 --wuxing-* 变量（WUXING_COLOR）。
 *
 * 响应式：盘面改为「每爻一格」的紧凑结构（无固定最小列宽），
 *   320px 手机到宽屏桌面均自适应，无需横向滚动。
 */
import { useNavigate } from 'react-router-dom'
import { WUXING_COLOR } from '../engine/paipan.js'

/** 爻位名（初爻→上爻） */
const LINE_NAMES = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻']

/** 六神 → 五行对应色（青龙木 朱雀火 勾陈/螣蛇土 白虎金 玄武水） */
const LIUSHEN_COLOR = {
  青龙: 'var(--wuxing-mu)',
  朱雀: 'var(--wuxing-huo)',
  勾陈: 'var(--wuxing-tu)',
  螣蛇: 'var(--wuxing-tu)',
  白虎: 'var(--wuxing-jin)',
  玄武: 'var(--wuxing-shui)',
}

/** 旺衰配色：旺金色，死红色，其余弱化 */
const WANG_COLOR = {
  旺: 'var(--gold)',
  相: 'var(--text)',
  休: 'var(--muted)',
  囚: 'var(--muted)',
  死: 'var(--red)',
}

/** 解析 '父戌土' → {liuqin, zhi, wuxing}（与 paipan.js 内部解析规则一致） */
function parseLiqin(s) {
  const m = /^([父兄官财孙])([子丑寅卯辰巳午未申酉戌亥])([木火土金水])$/.exec(s ?? '')
  return m ? { liuqin: m[1], zhi: m[2], wuxing: m[3] } : null
}

/** 六亲+地支（地支按五行配色） */
function LiqinText({ liuqin, zhi, wuxing }) {
  return (
    <>
      <span className="mr-0.5 text-text">{liuqin}</span>
      <span className="font-medium" style={{ color: WUXING_COLOR[wuxing] ?? 'var(--text)' }}>
        {zhi}
      </span>
    </>
  )
}

/** 爻行三格布局：六神+爻位 | 本卦 | 变卦 */
const rowGridCls = 'grid w-full grid-cols-[3.25rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-3'

/** 世/应角标 */
function ShiYingBadge({ y }) {
  return (
    <>
      {y.shi ? (
        <span className="rounded-sm border border-gold px-1 text-[10px] leading-4 text-gold">世</span>
      ) : null}
      {y.ying ? (
        <span className="rounded-sm border border-red px-1 text-[10px] leading-4 text-red">应</span>
      ) : null}
    </>
  )
}

export default function PanView({ pan }) {
  const navigate = useNavigate()
  if (!pan) return null

  const { ben, bian, yao, liushen } = pan
  const order = [5, 4, 3, 2, 1, 0] // 上爻 → 初爻
  const goGuaci = (name) => () => navigate(`/help/guaci?gua=${name}`)
  const goYaoci = (i) => () => navigate(`/help/yaoci?gua=${ben.name}&line=${i}`)

  return (
    <section className="mx-auto w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-panel">
      {/* 干支行 */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-border px-4 py-2 text-sm">
        <span className="text-muted">
          年建 <b className="ml-0.5 text-gold">{pan.yearGZ}</b>
        </span>
        <span className="text-muted">
          月建 <b className="ml-0.5 text-gold">{pan.monthGZ}</b>
        </span>
        <span className="text-muted">
          日建 <b className="ml-0.5 text-gold">{pan.dayGZ}</b>
        </span>
        <span className="text-muted">
          时建 <b className="ml-0.5 text-gold">{pan.hourGZ}</b>
        </span>
        <span className="text-muted">
          旬空 <b className="ml-0.5 text-red">{pan.xunkong.join('、')}</b>
        </span>
        <span className="text-muted">
          卦身 <b className="ml-0.5 text-gold">{pan.guashen ?? '—'}</b>
        </span>
        <span className="text-muted">
          煞神 <b className="ml-0.5 text-gold">{pan.shashen ?? '—'}</b>
        </span>
      </div>

      {/* 卦名行 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2.5 text-sm">
        <span className="text-muted">本卦</span>
        <button
          type="button"
          onClick={goGuaci(ben.name)}
          title="查看卦辞"
          className="cursor-pointer text-base font-medium text-gold hover:underline"
        >
          {ben.name}
        </button>
        <span className="text-xs text-muted">
          {ben.gong}宫{ben.youhun ? '·游魂' : ''}
          {ben.guihun ? '·归魂' : ''}
        </span>
        {bian ? (
          <>
            <span className="ml-3 text-muted">变卦</span>
            <button
              type="button"
              onClick={goGuaci(bian.name)}
              title="查看卦辞"
              className="cursor-pointer text-base font-medium text-gold hover:underline"
            >
              {bian.name}
            </button>
            <span className="text-xs text-muted">{bian.gong}宫</span>
          </>
        ) : (
          <span className="ml-2 text-xs text-muted">（无动爻，故无变卦）</span>
        )}
      </div>

      {/* 表头 */}
      <div
        className={`${rowGridCls} border-b border-border bg-black/20 py-1.5 px-3 text-xs text-muted`}
      >
        <span>六神</span>
        <span>本卦 · 爻画 · 世应</span>
        <span>变卦 · 旺衰 · 伏神</span>
      </div>

      {/* 爻行（上爻 → 初爻） */}
      <div>
        {order.map((i) => {
          const y = yao[i]
          const b = bian ? parseLiqin(bian.liuqin[5 - i]) : null
          return (
            <button
              key={i}
              type="button"
              onClick={goYaoci(i)}
              title={`查看第 ${LINE_NAMES[i]} 爻辞`}
              className={`${rowGridCls} cursor-pointer border-b border-border px-3 py-2 text-left transition-colors last:border-0 hover:bg-goldSoft`}
            >
              {/* 六神 + 爻位 */}
              <span className="min-w-0">
                <span
                  className="block truncate text-sm"
                  style={{ color: LIUSHEN_COLOR[liushen[i]] ?? 'var(--muted)' }}
                >
                  {liushen[i]}
                </span>
                <span className="mt-0.5 block text-[11px] text-muted">{LINE_NAMES[i]}</span>
              </span>

              {/* 本卦六亲 + 世应 + 爻画 */}
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <LiqinText liuqin={y.liuqin} zhi={y.zhi} wuxing={y.wuxing} />
                  <ShiYingBadge y={y} />
                </span>
                <span className="mt-1 flex items-center gap-1 whitespace-nowrap text-sm leading-none">
                  <span className={y.dong ? 'text-gold' : 'text-text'}>
                    {y.line === 1 ? '━━━' : '━━  ━━'}
                    {y.dong ? '○' : ''}
                  </span>
                </span>
              </span>

              {/* 变卦六亲 + 旺衰 + 伏神 */}
              <span className="min-w-0">
                <span className="block truncate text-sm">
                  {b ? (
                    <LiqinText liuqin={b.liuqin} zhi={b.zhi} wuxing={b.wuxing} />
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </span>
                <span className="mt-1 flex items-center gap-2 text-xs">
                  <span
                    className="shrink-0"
                    style={{ color: WANG_COLOR[y.wangshuai] ?? 'var(--muted)' }}
                  >
                    {y.wangshuai}
                  </span>
                  {y.fushen ? (
                    <span className="truncate text-muted">
                      伏 <LiqinText liuqin={y.fushen.liuqin} zhi={y.fushen.zhi} wuxing={y.fushen.wuxing} />
                    </span>
                  ) : null}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
