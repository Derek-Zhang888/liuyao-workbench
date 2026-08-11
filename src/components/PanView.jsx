/* eslint-disable react/prop-types */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { WUXING_COLOR, yongShenHit, yongShenHitFushen, liuqinWuxing, GONG_WUXING } from '../engine/paipan.js'
import { WUXING_ZHI } from '../engine/ganzhi.js'
import {
  MARKER_WANGSHUAI_COLOR,
  markerBadgesFor,
  markerBadgesForBian,
  markerBadgesForFushen,
  wangshuaiAt,
} from '../engine/panMarkers.js'
import DoodleBoard from './DoodleBoard.jsx'

/** 爻位名（初爻→上爻） */
const LINE_NAMES = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻']

/** 单爻爻画渲染：lines[i] 为 '1'(阳) 或 '2'(阴)；动爻标记 ○(阳动) / ✕(阴动)。
 *  v0.10 改进建7 #6：阴阳爻画长度统一（5 显示单元：阳 '━━━━━'、阴 '━━ ━━'），
 *  老阴 ✕ / 老阳 ○ 放爻画末端且隔一个空格（不与爻相连） */
function LineGlyph({ v, dong = false, active = true }) {
  if (v === 1) return <span className={active ? 'text-gold' : 'text-muted'}>{dong ? '━━━━━ ○' : '━━━━━'}</span>
  return <span className={active ? 'text-gold' : 'text-muted'}>{dong ? '━━ ━━ ✕' : '━━ ━━'}</span>
}

/** 六神 → 五行对应色（青龙木 朱雀火 勾陈/螣蛇土 白虎金 玄武水） */
const LIUSHEN_COLOR = {
  青龙: 'var(--wuxing-mu)',
  朱雀: 'var(--wuxing-huo)',
  勾陈: 'var(--wuxing-tu)',
  螣蛇: 'var(--wuxing-tu)',
  白虎: 'var(--wuxing-jin)',
  玄武: 'var(--wuxing-shui)',
}

/** 解析 '父戌土' → {liuqin, zhi, wuxing}（与 paipan.js 内部解析规则一致） */
function parseLiqin(s) {
  const m = /^([父兄官财孙])([子丑寅卯辰巳午未申酉戌亥])([木火土金水])$/.exec(s ?? '')
  return m ? { liuqin: m[1], zhi: m[2], wuxing: m[3] } : null
}

/** 神煞值显示：日干/日支/月支系均单值显示（zhi ?? gan） */
function shenshaValue(s) {
  return s.zhi ?? s.gan ?? ''
}

/**
 * 六亲+纳干+地支（地支按五行配色，后缀五行字如「戌土」）。
 * highlight=true 时整组金色高亮（功能二：自定用神命中爻位）。
 * gan 非空时显示「甲戌土」（功能三：纳干）。
 */
function LiqinText({ liuqin, zhi, wuxing, gan = null, highlight = false }) {
  return (
    <>
      <span className={highlight ? 'mr-0.5 text-gold' : 'mr-0.5 text-text'}>{liuqin}</span>
      <span
        className={highlight ? 'font-medium text-gold' : 'font-medium'}
        style={highlight ? undefined : { color: WUXING_COLOR[wuxing] ?? 'var(--text)' }}
      >
        {gan ?? ''}
        {zhi}
        {wuxing ?? ''}
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

/** 地支分析区行：label + 若干条目（it.pre 为爻位前缀，如「二爻」） */
function AnalysisRow({ label, items }) {
  if (!items || items.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <span className="w-9 shrink-0 text-muted">{label}</span>
      {items.map((it, k) => (
        <span key={k} className="text-muted">
          {it.pre ? <b className="mr-0.5 text-gold">{it.pre}</b> : null}
          {it.text}
        </span>
      ))}
    </div>
  )
}

export default function PanView({
  pan,
  // PC 画板（电脑端/宽屏/鼠标）
  doodle = null, doodleEnabled = false, onDoodleChange = null, onDoodleToggle = null,
  // 手机画板（触屏/窄屏）——v1.2.0 拆分：两套涂鸦独立保存，各端只显示自己的画板
  doodleMobile = null, mobileDoodleEnabled = false, onMobileDoodleChange = null, onMobileDoodleToggle = null,
}) {
  const navigate = useNavigate()

  // ---- 画板端类型判定（v1.2.0 拍板）：触摸/窄屏 → 手机画板；鼠标/宽屏 → 电脑画板。
  // 电脑端只显示「画板（电脑）」勾选项 + PC 涂鸦；手机端只显示「画板（手机）」+ 手机涂鸦；
  // 关闭 = 隐藏（涂鸦数据保留，不清空）。----
  const isMobilePan = useMemo(() => {
    try {
      if (window.matchMedia?.('(pointer: coarse)')?.matches) return true
    } catch (_) { /* 无 matchMedia 时按宽度 */ }
    return (window.innerWidth || 0) < 768
  }, [])
  const panDoodle = isMobilePan ? doodleMobile : doodle
  const panDoodleEnabled = isMobilePan ? mobileDoodleEnabled : doodleEnabled
  const panOnChange = isMobilePan ? onMobileDoodleChange : onDoodleChange
  const panOnToggle = isMobilePan ? onMobileDoodleToggle : onDoodleToggle

  // ---- 地支分析折叠区展开状态（功能一）：受控组件 + sessionStorage 会话内保持 ----
  // 仅存「展开/收起」布尔（'1'/'0'），绝不缓存 pan.dizhiAnalysis 内容：
  // 重新起卦后内容随新 pan 重新渲染；刷新页面后 sessionStorage 清空 → 恢复默认收起。
  const [dzOpen, setDzOpen] = useState(() => sessionStorage.getItem('liuyao-dz-open') === '1')

  if (!pan) return null

  const { ben, bian, yao, liushen } = pan
  const ts = pan.trueSolarInfo ?? null // 真太阳时校准展示信息（未开启为 null）
  const order = [5, 4, 3, 2, 1, 0] // 上爻 → 初爻
  const goGuaci = (name) => () => navigate(`/help/guaci?gua=${name}`)
  const goYaoci = (i) => () => navigate(`/help/yaoci?gua=${ben.name}&line=${i}`)

  // ---- 自定用神高亮（功能二）----
  const ys = pan.yongShen ?? null
  const hitYao = (y) => yongShenHit(y, ys)
  // 伏神命中判定：与本卦爻命中相互独立（本卦六亲为兄但伏神为财时，仅伏神高亮）
  const hitFushen = (y) => yongShenHitFushen(y, ys)
  // 六亲在日月上：月建/日建地支五行 == 该六亲对应五行 → 高亮「月建」「日建」字样
  const gongWx = ben?.gong ? GONG_WUXING[ben.gong] : null
  const ysWx = ys && ys.type === 'liuqin' && gongWx ? liuqinWuxing(gongWx, ys.value) : null
  const yueHit = ysWx && pan.monthGZ ? WUXING_ZHI[pan.monthGZ[1]] === ysWx : false
  const riHit = ysWx && pan.dayGZ ? WUXING_ZHI[pan.dayGZ[1]] === ysWx : false

  // ---- 纳干（功能三，v0.10 改进建7 #5）：旧快照无 gan 时向后兼容不显示；
  // 本卦读 yao[i].gan，变卦读 bian.gan[i]（开启纳干后变卦也显示天干，按变卦上下经卦纳甲）----
  const benGan = (i) => yao[i]?.gan ?? null
  const bianGan = (i) => bian?.gan?.[i] ?? null

  // ---- 盘面标记（v0.2 功能 B；v0.10 扩展变爻/伏神）：旧快照无 pan.markers 时全部跳过 ----
  const markers = pan.markers ?? null
  const wsMark = (i) => wangshuaiAt(markers, i, 'ben')
  const bianWsMark = (i) => wangshuaiAt(markers, i, 'bian') // v0.10：变爻旺相休囚死
  const fushenWsMark = (i) => wangshuaiAt(markers, i, 'fushen') // v0.10：伏神旺相休囚死
  const badgeList = (i) => markerBadgesFor(markers, i)
  const bianBadgeList = (i) => markerBadgesForBian(markers, i) // v0.10：回头生克冲合放变爻处
  const fushenBadgeList = (i) => markerBadgesForFushen(markers, i) // v0.10：伏神破合
  const ryLiqin = markers?.riyueLiqin ?? null

  // ---- 卦身/香闺/床帐（v0.2 功能 C；v0.10 改进建7 #4 全地支数组只显示地支、空格分隔，旧快照对象兼容）----
  const guashenShown = pan.guashenPrecise ?? pan.guashen ?? null
  /** 香闺/床帐 → 展示文本：新数组 [{zhi}] 只显示地支（空格分隔），旧对象 {zhi,wuxing} 兼容；空返回 null */
  const bedroomText = (v) => {
    if (!v) return null
    if (Array.isArray(v)) return v.length ? v.map((x) => x.zhi ?? '').join(' ') : null
    return `${v.zhi ?? ''}${v.wuxing ?? ''}`
  }
  const xgText = bedroomText(pan.xianggui)
  const czText = bedroomText(pan.chuangzhang)

  /** 画板开关切换（v1.2.0）：开启直接开；关闭仅隐藏（涂鸦数据保留，不清空） */
  const handleDoodleToggle = (checked) => {
    panOnToggle?.(checked)
  }

  // ---- 地支分析折叠区（功能一）----
  const da = pan.dizhiAnalysis ?? null
  const analysisSections = da
    ? [
        {
          label: '本变',
          items: da.benBian.map((e) => ({ pre: LINE_NAMES[e.yaoIndex], text: e.text })),
        },
        {
          label: '月建',
          items: da.yueJian.map((e) => ({ pre: LINE_NAMES[e.yaoIndex], text: e.text })),
        },
        {
          label: '日辰',
          items: da.riChen.map((e) => ({ pre: LINE_NAMES[e.yaoIndex], text: e.text })),
        },
        {
          label: '动爻',
          items: da.dongYao.map((e) => ({ pre: LINE_NAMES[e.yaoIndex], text: e.text })),
        },
        {
          label: '三合',
          items: da.sanHe.map((e) => ({ pre: null, text: e.text })),
        },
        {
          label: '入墓',
          items: da.ruMu.map((e) => ({ pre: LINE_NAMES[e.yaoIndex], text: e.text })),
        },
        {
          label: '真空',
          items: da.zhenKong.map((e) => ({ pre: LINE_NAMES[e.yaoIndex], text: '真空' })),
        },
        {
          label: '用神',
          items: da.yongShenJi.map((e) => ({ pre: LINE_NAMES[e.yaoIndex], text: e.text })),
        },
      ]
    : []

  return (
    <section className="card mx-auto w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-panel">
      {/* 画板覆盖层作用域（v0.2 功能 A，2026-08-09 扩展至盘面全覆盖）：时间栏 + 神煞栏 + 卦名行 + 表头 + 爻行 */}
      <div className="relative">
      {/* 干支行（月建/日建可被六亲用神高亮） */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-border px-4 py-2 text-sm">
        <span className="text-muted">
          年建 <b className="ml-0.5 text-gold">{pan.yearGZ}</b>
        </span>
        <span className="text-muted">
          月建{' '}
          <b className={`ml-0.5 ${yueHit ? 'rounded bg-goldSoft px-1 text-gold' : 'text-gold'}`}>{pan.monthGZ}</b>
          {ryLiqin ? (
            <span className="ml-0.5 text-[10px] text-muted" title={`${ryLiqin.yue.zhi}${ryLiqin.yue.wuxing} → ${ryLiqin.yue.liuqin}`}>
              {ryLiqin.yue.liuqin}
            </span>
          ) : null}
        </span>
        <span className="text-muted">
          日建{' '}
          <b className={`ml-0.5 ${riHit ? 'rounded bg-goldSoft px-1 text-gold' : 'text-gold'}`}>{pan.dayGZ}</b>
          {ryLiqin ? (
            <span className="ml-0.5 text-[10px] text-muted" title={`${ryLiqin.ri.zhi}${ryLiqin.ri.wuxing} → ${ryLiqin.ri.liuqin}`}>
              {ryLiqin.ri.liuqin}
            </span>
          ) : null}
          {ts && ts.refDayGZ !== pan.dayGZ ? (
            <span className="ml-1 text-xs text-muted">（真太阳时换日则为 {ts.refDayGZ}）</span>
          ) : null}
        </span>
        <span className="text-muted">
          时建 <b className="ml-0.5 text-gold">{pan.hourGZ}</b>
          {ts ? (
            <span className="ml-1 text-xs text-muted">（真太阳时 {ts.trueSolarShichen}）</span>
          ) : null}
        </span>
        <span className="text-muted">
          旬空 <b className="ml-0.5 text-red">{pan.xunkong.join('、')}</b>
        </span>
        <span className="text-muted">
          卦身 <b className="ml-0.5 text-gold">{guashenShown ?? '—'}</b>
          {xgText ? (
            <span className="ml-2 text-xs text-muted">
              香闺：<b className="text-gold">{xgText}</b>
            </span>
          ) : null}
          {czText ? (
            <span className="ml-2 text-xs text-muted">
              床帐：<b className="text-gold">{czText}</b>
            </span>
          ) : null}
        </span>
        <span className="text-muted">
          新历 <b className="ml-0.5 text-gold">{pan.solarDate}</b>
        </span>
        <span className="text-muted">
          农历 <b className="ml-0.5 text-gold">{pan.lunarDate}</b>
        </span>
        {pan.solarTime ? (
          <span className="text-muted">
            时刻 <b className="ml-0.5 text-gold">{pan.solarTime}</b>
            {ts ? (
              <span className="ml-1 text-xs text-muted">
                （真太阳时 {ts.trueSolarTime}，{ts.cityName}）
              </span>
            ) : null}
          </span>
        ) : null}
      </div>

      {/* 神煞行（卦级整体列表，跟随年月日干支变化） */}
      {pan.shenshaList?.length ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-2 text-sm">
          <span className="text-muted">神煞</span>
          {pan.shenshaList.map((s) => (
            <span key={s.name} className="text-muted">
              {s.name} <b className="ml-0.5 text-gold">{shenshaValue(s)}</b>
            </span>
          ))}
        </div>
      ) : null}

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
          {ben.liuhe ? '·六合' : ''}
          {ben.liuchong ? '·六冲' : ''}
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
            <span className="text-xs text-muted">
              {bian.gong}宫{bian.youhun ? '·游魂' : ''}
              {bian.guihun ? '·归魂' : ''}
              {bian.liuhe ? '·六合' : ''}
              {bian.liuchong ? '·六冲' : ''}
            </span>
          </>
        ) : (
          <span className="ml-2 text-xs text-muted">（无动爻，故无变卦）</span>
        )}
      </div>

      {/* 表头（v0.10 建议5 #6：删「爻画」「世应」字样，爻位旁的世应角标保留） */}
      <div
        className={`${rowGridCls} border-b border-border bg-black/20 py-1.5 px-3 text-xs text-muted`}
      >
        <span>六神</span>
        <span>本卦</span>
        <span>变卦</span>
      </div>

      {/* 爻行（上爻 → 初爻） */}
      <div>
        {order.map((i) => {
          const y = yao[i]
          const b = bian ? parseLiqin(bian.liuqin[5 - i]) : null
          const isHit = hitYao(y)
          const isFuHit = hitFushen(y)
          return (
            <button
              key={i}
              type="button"
              onClick={goYaoci(i)}
              title={`查看第 ${LINE_NAMES[i]} 爻辞`}
              className={`${rowGridCls} cursor-pointer border-b border-border px-3 py-2 text-left transition-colors last:border-0 hover:bg-goldSoft ${
                isHit ? 'bg-goldSoft' : ''
              }`}
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

              {/* 本卦六亲 + 世应 + 标记角标 + 爻画 + 伏神（v0.10 建议5 #6：神煞如华盖/驿马不再上盘） */}
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <LiqinText
                    liuqin={y.liuqin}
                    zhi={y.zhi}
                    wuxing={y.wuxing}
                    gan={benGan(i)}
                    highlight={isHit}
                  />
                  <ShiYingBadge y={y} />
                  {/* 旺相休囚死：地支右上角小字（五行配色，v0.2） */}
                  {wsMark(i) ? (
                    <span
                      className="align-super text-[9px] leading-none"
                      style={{ color: MARKER_WANGSHUAI_COLOR[wsMark(i).ws] ?? 'var(--muted)' }}
                      title={`旺衰：${wsMark(i).ws}`}
                    >
                      {wsMark(i).ws}
                    </span>
                  ) : null}
                  {/* 紧凑角标：破/合/回头/进退/反伏吟（与世应并排，v0.2） */}
                  {badgeList(i).length > 0 ? (
                    <span className="flex flex-wrap items-center gap-0.5">
                      {badgeList(i).map((b, k) => (
                        <span
                          key={k}
                          className="rounded-sm border border-border px-0.5 text-[9px] leading-3 text-muted"
                          title={b.t}
                        >
                          {b.g}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 flex items-center gap-1 whitespace-nowrap text-sm leading-none">
                  <span className={y.dong ? 'text-gold' : 'text-text'}>
                    {y.line === 1
                      ? y.dong ? '━━━━━ ○' : '━━━━━'
                      : y.dong ? '━━ ━━ ✕' : '━━ ━━'}
                  </span>
                </span>
                {y.fushen ? (
                  <span className={`mt-1 flex flex-wrap items-center gap-1 truncate text-xs ${isFuHit ? 'text-gold' : 'text-muted'}`}>
                    伏{' '}
                    <LiqinText
                      liuqin={y.fushen.liuqin}
                      zhi={y.fushen.zhi}
                      wuxing={y.fushen.wuxing}
                      highlight={isFuHit}
                    />
                    {/* 伏神旺相休囚死 + 月破日破月合日合（v0.10） */}
                    {fushenWsMark(i) ? (
                      <span
                        className="align-super text-[9px] leading-none"
                        style={{ color: MARKER_WANGSHUAI_COLOR[fushenWsMark(i).ws] ?? 'var(--muted)' }}
                        title={`伏神旺衰：${fushenWsMark(i).ws}`}
                      >
                        {fushenWsMark(i).ws}
                      </span>
                    ) : null}
                    {fushenBadgeList(i).length > 0 ? (
                      <span className="flex flex-wrap items-center gap-0.5">
                        {fushenBadgeList(i).map((b, k) => (
                          <span
                            key={k}
                            className="rounded-sm border border-border px-0.5 text-[9px] leading-3 text-muted"
                            title={b.t}
                          >
                            {b.g}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </span>

              {/* 变卦六亲 + 天干（v0.10 改进建7 #5：开启纳干后变卦也显示天干）+ 爻画
                  （回头生克冲合/变爻旺衰/变爻破合标志放变爻处） */}
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5">
                  {b ? (
                    <LiqinText
                      liuqin={b.liuqin}
                      zhi={b.zhi}
                      wuxing={b.wuxing}
                      gan={bianGan(i)}
                    />
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                  {/* 变爻旺相休囚死（v0.10）：变爻五行 vs 月建 */}
                  {b && bianWsMark(i) ? (
                    <span
                      className="align-super text-[9px] leading-none"
                      style={{ color: MARKER_WANGSHUAI_COLOR[bianWsMark(i).ws] ?? 'var(--muted)' }}
                      title={`变爻旺衰：${bianWsMark(i).ws}`}
                    >
                      {bianWsMark(i).ws}
                    </span>
                  ) : null}
                  {/* 变爻角标：回头生克冲合（v0.10 箭头指向左）+ 变爻月破日破月合日合 */}
                  {b && bianBadgeList(i).length > 0 ? (
                    <span className="flex flex-wrap items-center gap-0.5">
                      {bianBadgeList(i).map((bd, k) => (
                        <span
                          key={k}
                          className="rounded-sm border border-border px-0.5 text-[9px] leading-3 text-muted"
                          title={bd.t}
                        >
                          {bd.g}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </span>
                {bian?.lines ? (
                  <span className="mt-1 flex items-center gap-1 whitespace-nowrap text-sm leading-none">
                    <LineGlyph
                      v={Number(bian.lines[i])}
                      dong={false}
                      active={!!b}
                    />
                  </span>
                ) : null}
              </span>
            </button>
          )
        })}
      </div>

        {/* 画板覆盖层（v0.2 功能 A）：仅当开启且提供 onChange 时渲染；onClick 已拦截爻位跳转。
            v1.2.0：按端类型渲染对应画板（电脑/手机两套独立涂鸦） */}
        {panOnChange && panDoodleEnabled ? (
          <DoodleBoard enabled={panDoodleEnabled} doodle={panDoodle} onChange={panOnChange} />
        ) : null}
      </div>

      {/* 画板开关（v0.2 功能 A；v1.2.0 拆分：按端类型显示「画板（电脑）/画板（手机）」，关闭仅隐藏不清空） */}
      {panOnToggle ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2 text-sm">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={!!panDoodleEnabled}
              onChange={(e) => handleDoodleToggle(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-gold"
            />
            <span className="text-muted">画板（{isMobilePan ? '手机' : '电脑'}）</span>
          </label>
          {panDoodleEnabled ? (
            <span className="text-xs text-muted">
              开启时可在盘面上自由涂鸦，点击爻位不会跳转；关闭时涂鸦保留，重新勾选即可恢复
            </span>
          ) : null}
        </div>
      ) : null}

      {/* 地支分析折叠区（功能一，默认收起；卦形六合/六冲已在卦名行展示，此处不重复） */}
      {da ? (
        <details
          className="group border-t border-border"
          open={dzOpen}
          onToggle={(e) => {
            setDzOpen(e.currentTarget.open)
            sessionStorage.setItem('liuyao-dz-open', e.currentTarget.open ? '1' : '0')
          }}
        >
          <summary className="flex cursor-pointer select-none items-center gap-1.5 px-4 py-2 text-sm text-muted transition-colors hover:text-gold">
            <span className="text-[10px] text-gold transition-transform group-open:rotate-90">▶</span>
            地支分析
            <span className="text-[10px] text-muted">（仅供参考）</span>
          </summary>
          <div className="space-y-2 border-t border-border px-4 py-2.5 text-sm">
            {analysisSections.map((s) => (
              <AnalysisRow key={s.label} label={s.label} items={s.items} />
            ))}
            {analysisSections.every((s) => s.items.length === 0) ? (
              <p className="text-xs text-muted">本卦无特殊地支关系（可选用神查看元神/忌神判定）。</p>
            ) : null}
          </div>
        </details>
      ) : null}
    </section>
  )
}
