/**
 * 起卦方式选择器（Task 9）
 *
 * 8 种起卦方式 Tab + 各自输入区；点「起卦」按钮后：
 *   校验输入 → 调对应 qiguaFromXxx → onStart({method, params, date, lines, dong})
 *
 * params 与 md 导出序列化规则（exportMd 的 PARAMS_SERIALIZER）对齐，直接存对象形态：
 *   qian/computer : { lines: 6位1/2爻画, dong: 动爻索引 }（随机结果一次性生成，避免重排盘时二次随机）
 *   yaoming       : { lines: 6位1-4字符串 }（1阳 2阴 3老阳 4老阴，动爻由引擎推导）
 *   guaname       : { input: 本卦名 } 或 { input: 本卦名, bian: 变卦名 }（相异爻位为动爻）
 *   number        : { n1, n2, n3, method: 1|2 }
 *   baoshu        : { digits }
 *   time          : { date: Date }（起卦时刻）
 *   fenmiao       : { ms, ss }
 *
 * date 说明：所有起卦方式共用顶部「起卦时间」（新历 datetime-local / 农历年月日+时分），
 *   默认为当前时刻；该时间同时用于排盘的干支历法与卦例记录的时间。
 */
import { useState } from 'react'
import {
  QIGUA_METHODS,
  findGuaByName,
  searchGuaByName,
  qiguaFromQian,
  qiguaFromCoin,
  qiguaFromGuaName,
  qiguaFromNumber,
  qiguaFromBaoshu,
  qiguaFromTime,
  qiguaFromRandom,
  qiguaFromMinuteSecond,
} from '../engine/qigua.js'
import { toLunar, fromLunar } from '../engine/ganzhi.js'

const METHOD_MAP = Object.fromEntries(QIGUA_METHODS.map((m) => [m.id, m]))

/** 爻位名（初爻→上爻） */
const LINE_NAMES = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻']

/** 钱币卦默认面值（每爻三枚，正面枚数决定爻型；两正=少阳） */
const defaultCoinFaces = () => Array.from({ length: 6 }, () => ['正', '正', '背'])

/** 正面枚数 → 爻型名（与 qiguaFromCoin 的 HEADS_TO_VALUE 一致） */
const HEADS_LABEL = ['老阴', '少阴', '少阳', '老阳']

/** 爻名卦爻型：1阳 2阴 3老阳 4老阴 */
const YAO_TYPES = [
  { v: '1', label: '阳' },
  { v: '2', label: '阴' },
  { v: '3', label: '老阳' },
  { v: '4', label: '老阴' },
]

/** 电脑卦交互：随机数 [0,1) → 爻型（与 qiguaFromRandom 分段一致） */
function compTypeLabel(r) {
  return r < 0.25 ? '静阳' : r < 0.5 ? '静阴' : r < 0.75 ? '老阳' : '老阴'
}

/** 当前时刻 → 'YYYY-MM-DDTHH:mm'（datetime-local 取值） */
function nowLocal() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 当前时刻 → 农历输入初值 { year, month, day, isLeap, hm } */
function nowLunar() {
  const d = new Date()
  const l = toLunar(d)
  const p = (n) => String(n).padStart(2, '0')
  return {
    year: String(l.year),
    month: String(l.month),
    day: String(l.day),
    isLeap: l.isLeap,
    hm: `${p(d.getHours())}:${p(d.getMinutes())}`,
  }
}

const tabCls = (active) =>
  `rounded-md px-3 py-1.5 text-sm transition-colors ${
    active ? 'bg-goldSoft text-gold' : 'text-muted hover:bg-bg hover:text-text'
  }`

const modeCls = (active) =>
  `rounded-md px-3 py-1 text-sm transition-colors ${active ? 'bg-goldSoft text-gold' : 'text-muted hover:text-text'}`

const inputCls =
  'rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-text outline-none transition-colors focus:border-gold'

/** 钱币正/背切换按钮 */
const faceCls = (face) =>
  `w-8 rounded border px-0 py-0.5 text-xs transition-colors ${
    face === '正' ? 'border-gold bg-goldSoft text-gold' : 'border-border bg-bg text-muted hover:text-text'
  }`

/**
 * 关键词 → 唯一卦：先精确匹配（全名 / 八纯卦单字 / 去「为」简称），
 * 再退化为模糊匹配且仅命中一条时采用；否则返回 null（需用户从候选中点选）
 */
function resolveGua(keyword) {
  const k = keyword.trim()
  if (!k) return null
  const exact = findGuaByName(k)
  if (exact) return exact
  const list = searchGuaByName(k, 0)
  return list.length === 1 ? list[0] : null
}

/** 卦名模糊搜索输入框：输入关键词 → 候选下拉 → 点选填入 */
function GuaNameSearch({ label, value, onChange, placeholder }) {
  const [open, setOpen] = useState(false)
  const kw = value.trim()
  const hit = resolveGua(kw)
  const list = searchGuaByName(kw, 8)
  const showList = open && kw !== '' && !(hit && hit.name === kw)
  return (
    <div className="relative w-full max-w-[15rem]">
      <div className="mb-1.5 text-xs text-muted">{label}</div>
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        placeholder={placeholder}
        className={`${inputCls} w-full`}
      />
      {showList && (
        <ul className="absolute left-0 right-0 z-20 mt-1 max-h-56 overflow-y-auto rounded-md border border-border bg-panel py-1">
          {list.length === 0 ? (
            <li className="px-3 py-1.5 text-xs text-muted">无匹配卦名</li>
          ) : (
            list.map((g) => (
              <li key={g.name}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()} // 保持焦点，避免 blur 早于 click
                  onClick={() => { onChange(g.name); setOpen(false) }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm text-text transition-colors hover:bg-goldSoft hover:text-gold"
                >
                  <span>{g.name}</span>
                  <span className="text-xs text-muted">{g.gong}宫</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
      <div className="mt-1 h-4 text-xs">
        {kw === '' ? (
          <span className="text-muted">&nbsp;</span>
        ) : hit ? (
          <span className="text-gold">✓ {hit.name}</span>
        ) : (
          <span className="text-muted">共 {list.length} 条候选，请点选</span>
        )}
      </div>
    </div>
  )
}

/** 暗色下拉选择器；options: [{v, label}] */
function Select({ name, value, onChange, options, className = 'w-24' }) {
  return (
    <select
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputCls} ${className}`}
    >
      {options.map((o) => (
        <option key={o.v} value={o.v}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export default function QiguaSelector({ onStart }) {
  const [method, setMethod] = useState('qian')
  const [error, setError] = useState('')

  // —— 起卦时间（所有起卦方式共用）——
  const [dateMode, setDateMode] = useState('solar') // solar 新历 / lunar 农历
  const [dt, setDt] = useState(nowLocal())
  const [lunar, setLunar] = useState(nowLunar())

  // —— 钱币卦：六爻各三枚钱币的正/背面（如初爻「背正正」）——
  const [coinFaces, setCoinFaces] = useState(defaultCoinFaces)

  // —— 爻名卦 ——
  const [yaoSpins, setYaoSpins] = useState(Array(6).fill('1'))

  // —— 卦名卦：本卦 / 变卦 分开模糊搜索（变卦选填，相异爻位即动爻）——
  const [guaBen, setGuaBen] = useState('')
  const [guaBian, setGuaBian] = useState('')

  // —— 数字卦 ——
  const [num1, setNum1] = useState('')
  const [num2, setNum2] = useState('')
  const [num3, setNum3] = useState('')
  const [numMethod, setNumMethod] = useState(1)

  // —— 报数卦 ——
  const [digits, setDigits] = useState('')

  // —— 电脑卦 ——
  const [compMode, setCompMode] = useState('interact') // interact 逐爻随机 / direct 一键随机
  const [compSeq, setCompSeq] = useState([]) // 交互模式已生成的 [0,1) 随机数

  // —— 分秒卦 ——
  const [fens, setFens] = useState('')
  const [miao, setMiao] = useState('')

  const meta = METHOD_MAP[method]

  /** 卦名卦：本卦与变卦均已确定时预览动爻（爻画相异的爻位），未确定返回 null */
  const guaDongPreview = (() => {
    const ben = resolveGua(guaBen)
    const bian = guaBian.trim() ? resolveGua(guaBian) : null
    if (!ben || !bian) return null
    const idx = []
    for (let i = 0; i < 6; i++) {
      if (ben.lines[i] !== bian.lines[i]) idx.push(i)
    }
    return idx.length === 0
      ? '本卦与变卦相同，无动爻。'
      : `动爻：${idx.map((i) => LINE_NAMES[i]).join('、')}。`
  })()

  const switchMethod = (id) => {
    setMethod(id)
    setError('')
  }

  const setSpin = (arr, setArr, i) => (v) => setArr(arr.map((x, j) => (j === i ? v : x)))

  /** 切换第 i 爻第 j 枚钱币的正/背 */
  const toggleFace = (i, j) =>
    setCoinFaces((fs) =>
      fs.map((row, ri) => (ri === i ? row.map((f, fi) => (fi === j ? (f === '正' ? '背' : '正') : f)) : row)),
    )

  /** 随机一爻（电脑卦交互模式） */
  const rollComputer = () => {
    setCompSeq((s) => (s.length >= 6 ? s : [...s, Math.random()]))
  }

  /** 起卦时间输入 → Date（新历 / 农历两种模式），非法时抛错 */
  const resolveDate = () => {
    if (dateMode === 'solar') {
      if (!dt) throw new Error('请选择起卦日期时间')
      const d = new Date(dt)
      if (Number.isNaN(d.getTime())) throw new Error('起卦日期时间格式不正确')
      return d
    }
    const y = Number(lunar.year)
    const m = Number(lunar.month)
    const dd = Number(lunar.day)
    if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(dd)) {
      throw new Error('请输入完整的农历年、月、日')
    }
    const [hh, mm] = String(lunar.hm || '00:00').split(':').map(Number)
    if (!Number.isInteger(hh) || !Number.isInteger(mm)) throw new Error('请输入正确的时刻（时:分）')
    const s = fromLunar(y, m, dd, lunar.isLeap) // 非法农历日期由 fromLunar 抛 RangeError
    return new Date(s.year, s.month - 1, s.day, hh, mm)
  }

  /** 执行起卦：校验 → qiguaFromXxx → onStart */
  const doQiGua = () => {
    setError('')
    try {
      const date = resolveDate() // 所有起卦方式共用所选起卦时间
      let params = {}
      let result
      switch (method) {
        case 'qian': {
          const heads = coinFaces.map((row) => row.filter((f) => f === '正').length)
          let i = 0
          result = qiguaFromCoin(() => heads[i++])
          params = { lines: result.lines, dong: result.dong }
          break
        }
        case 'yaoming': {
          params = { lines: yaoSpins.join('') }
          result = qiguaFromQian(params.lines)
          break
        }
        case 'guaname': {
          if (!guaBen.trim()) throw new Error('请搜索并选择本卦卦名（如「乾为天」）')
          const ben = resolveGua(guaBen)
          if (!ben) throw new Error(`本卦「${guaBen.trim()}」匹配到多个或无匹配，请从候选中点选`)
          let bian = null
          if (guaBian.trim()) {
            bian = resolveGua(guaBian)
            if (!bian) throw new Error(`变卦「${guaBian.trim()}」匹配到多个或无匹配，请从候选中点选`)
          }
          result = qiguaFromGuaName(ben.name, bian?.name)
          params = bian ? { input: ben.name, bian: bian.name } : { input: ben.name }
          break
        }
        case 'number': {
          const n1 = Number(num1)
          const n2 = Number(num2)
          const n3 = Number(num3)
          if (
            !num1 || !num2 || !num3 ||
            !Number.isInteger(n1) || !Number.isInteger(n2) || !Number.isInteger(n3) ||
            n1 <= 0 || n2 <= 0 || n3 <= 0
          ) {
            throw new Error('请输入三个正整数')
          }
          params = { n1, n2, n3, method: numMethod }
          result = qiguaFromNumber(n1, n2, n3, numMethod)
          break
        }
        case 'baoshu': {
          const d = digits.trim()
          if (!d) throw new Error('请输入 2-8 位数字')
          params = { digits: d }
          result = qiguaFromBaoshu(d)
          break
        }
        case 'time': {
          params = { date }
          result = qiguaFromTime(date)
          break
        }
        case 'computer': {
          if (compMode === 'interact') {
            if (compSeq.length !== 6) {
              throw new Error(`请先完成 6 次随机（已生成 ${compSeq.length}/6）`)
            }
            let i = 0
            result = qiguaFromRandom(() => compSeq[i++])
          } else {
            result = qiguaFromRandom()
          }
          params = { lines: result.lines, dong: result.dong }
          break
        }
        case 'fenmiao': {
          const ms = Number(fens)
          const ss = Number(miao)
          if (
            fens === '' || miao === '' ||
            !Number.isInteger(ms) || !Number.isInteger(ss) ||
            ms < 0 || ss < 0
          ) {
            throw new Error('请输入非负整数的分与秒')
          }
          params = { ms, ss }
          result = qiguaFromMinuteSecond(ms, ss)
          break
        }
        default:
          throw new Error(`未知起卦方式：${method}`)
      }
      onStart({ method, params, date, lines: result.lines, dong: result.dong })
    } catch (e) {
      setError(e.message || '起卦失败')
    }
  }

  return (
    <section className="rounded-xl border border-border bg-panel p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-medium text-gold">起卦</h2>
        <p className="text-xs text-muted">{meta.desc}</p>
      </div>

      {/* 起卦时间（所有起卦方式共用） */}
      <div className="mb-4 space-y-2 rounded-lg border border-border bg-bg p-3">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted">起卦时间</span>
          <button type="button" onClick={() => { setDateMode('solar'); setError('') }} className={modeCls(dateMode === 'solar')}>
            新历
          </button>
          <button type="button" onClick={() => { setDateMode('lunar'); setError('') }} className={modeCls(dateMode === 'lunar')}>
            农历
          </button>
          <button
            type="button"
            onClick={() => { setDt(nowLocal()); setLunar(nowLunar()); setError('') }}
            className="text-xs text-muted hover:text-gold"
          >
            用当前时间
          </button>
        </div>
        {dateMode === 'solar' ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <input
              type="datetime-local"
              value={dt}
              onChange={(e) => setDt(e.target.value)}
              className={`${inputCls} w-full max-w-xs [color-scheme:dark]`}
            />
            <span className="text-xs text-muted">默认当前时刻，可指定任意公历日期时间</span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-1.5 text-muted">
              <input
                type="number"
                value={lunar.year}
                onChange={(e) => setLunar({ ...lunar, year: e.target.value })}
                className={`${inputCls} w-24`}
              />
              年
            </label>
            <label className="flex items-center gap-1.5 text-muted">
              <input
                type="number"
                min="1"
                max="12"
                value={lunar.month}
                onChange={(e) => setLunar({ ...lunar, month: e.target.value })}
                className={`${inputCls} w-16`}
              />
              月
            </label>
            <label className="flex items-center gap-1.5 text-muted">
              <input
                type="number"
                min="1"
                max="30"
                value={lunar.day}
                onChange={(e) => setLunar({ ...lunar, day: e.target.value })}
                className={`${inputCls} w-16`}
              />
              日
            </label>
            <label className="flex items-center gap-1.5 text-muted">
              <input
                type="checkbox"
                checked={lunar.isLeap}
                onChange={(e) => setLunar({ ...lunar, isLeap: e.target.checked })}
                className="accent-gold"
              />
              闰月
            </label>
            <input
              type="time"
              value={lunar.hm}
              onChange={(e) => setLunar({ ...lunar, hm: e.target.value })}
              className={`${inputCls} w-28 [color-scheme:dark]`}
            />
            <span className="w-full text-xs text-muted">农历日期将换算为公历后排盘（1900-2100 年）</span>
          </div>
        )}
      </div>

      {/* 方式 Tab */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {QIGUA_METHODS.map((m) => (
          <button key={m.id} type="button" onClick={() => switchMethod(m.id)} className={tabCls(method === m.id)}>
            {m.name}
          </button>
        ))}
      </div>

      {/* 各方式输入区 */}
      <div className="space-y-4">
        {/* 钱币卦：逐爻输入三枚钱币的正/背面 */}
        {method === 'qian' && (
          <div className="space-y-2">
            <p className="text-xs text-muted">
              点击切换每枚钱币的正/背面（如初爻「背正正」）：三正=老阳（动）、两正=少阳、一正=少阴、零正=老阴（动）
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {coinFaces.map((row, i) => {
                const heads = row.filter((f) => f === '正').length
                return (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="text-xs text-muted">{LINE_NAMES[i]}</span>
                    {row.map((f, j) => (
                      <button
                        key={j}
                        type="button"
                        name={`coin-${i}-${j}`}
                        onClick={() => toggleFace(i, j)}
                        className={faceCls(f)}
                        title={`第 ${i + 1} 爻第 ${j + 1} 枚：${f}面`}
                      >
                        {f}
                      </button>
                    ))}
                    <span className="text-xs text-gold">{HEADS_LABEL[heads]}</span>
                  </div>
                )
              })}
            </div>
            <button
              type="button"
              onClick={() => setCoinFaces(defaultCoinFaces())}
              className="text-xs text-muted hover:text-red"
            >
              重置
            </button>
          </div>
        )}

        {/* 爻名卦 */}
        {method === 'yaoming' && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {yaoSpins.map((s, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="text-xs text-muted">{LINE_NAMES[i]}</span>
                <Select name={`yao-${i}`} value={s} onChange={setSpin(yaoSpins, setYaoSpins, i)} options={YAO_TYPES} className="w-20" />
              </div>
            ))}
          </div>
        )}

        {/* 卦名卦：本卦 / 变卦 分开模糊搜索 */}
        {method === 'guaname' && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-start gap-3 text-sm">
              <GuaNameSearch label="本卦" value={guaBen} onChange={setGuaBen} placeholder="输入关键词，如「天」「同人」" />
              <GuaNameSearch label="变卦（选填）" value={guaBian} onChange={setGuaBian} placeholder="留空则无动爻" />
            </div>
            <p className="text-xs text-muted">
              输入部分卦名即可模糊匹配（如「天」匹配天风姤、天火同人…），也可输入八纯卦单字（如「坎」）；
              {guaDongPreview ?? '选定变卦后，与本卦爻画相异的爻位自动记为动爻。'}
            </p>
          </div>
        )}

        {/* 数字卦 */}
        {method === 'number' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-muted">三个数字</span>
              <input type="number" min="1" value={num1} onChange={(e) => setNum1(e.target.value)} placeholder="第 1 数" className={`${inputCls} w-28`} />
              <input type="number" min="1" value={num2} onChange={(e) => setNum2(e.target.value)} placeholder="第 2 数" className={`${inputCls} w-28`} />
              <input type="number" min="1" value={num3} onChange={(e) => setNum3(e.target.value)} placeholder="第 3 数" className={`${inputCls} w-28`} />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-muted">算法</span>
              <button type="button" onClick={() => setNumMethod(1)} className={modeCls(numMethod === 1)}>算法一</button>
              <button type="button" onClick={() => setNumMethod(2)} className={modeCls(numMethod === 2)}>算法二</button>
              <span className="text-xs text-muted">
                算法一：上卦=第1数÷8，下卦=(第2+第3数)÷8，动爻=三数和÷6；算法二：上卦=第1数÷8，下卦=第2数÷8，动爻=第3数÷6（余 0 记 8 / 第 6 爻动）
              </span>
            </div>
          </div>
        )}

        {/* 报数卦 */}
        {method === 'baoshu' && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <input
              value={digits}
              onChange={(e) => setDigits(e.target.value)}
              placeholder="如：1234"
              className={`${inputCls} w-40`}
            />
            <span className="text-xs text-muted">报 2-8 位数字：前两位为卦数（1-8，先上后下），其余各位为动爻编号（1-6，可多动爻）</span>
          </div>
        )}

        {/* 时间卦：直接取上方所选起卦时间 */}
        {method === 'time' && (
          <p className="text-sm text-muted">以上方所选起卦时间的农历年支、月、日、时辰序起卦（年月日时法）</p>
        )}

        {/* 电脑卦 */}
        {method === 'computer' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-muted">模式</span>
              <button type="button" onClick={() => { setCompMode('interact'); setError('') }} className={modeCls(compMode === 'interact')}>
                交互（逐爻随机）
              </button>
              <button type="button" onClick={() => { setCompMode('direct'); setError('') }} className={modeCls(compMode === 'direct')}>
                直接（一键随机）
              </button>
            </div>
            {compMode === 'interact' ? (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <button
                  type="button"
                  onClick={rollComputer}
                  disabled={compSeq.length >= 6}
                  className="rounded-md border border-gold px-4 py-1.5 text-gold transition-colors hover:bg-goldSoft disabled:cursor-not-allowed disabled:opacity-40"
                >
                  随机一爻
                </button>
                <span className="text-muted">
                  已生成 <span className="text-gold">{compSeq.length}</span>/6
                </span>
                {compSeq.length > 0 && (
                  <>
                    <span className="flex flex-wrap items-center gap-1">
                      {compSeq.map((r, i) => (
                        <span key={i} className="rounded border border-border bg-bg px-1.5 py-0.5 text-xs text-gold" title={`第 ${i + 1} 爻`}>
                          {compTypeLabel(r)}
                        </span>
                      ))}
                    </span>
                    <button type="button" onClick={() => setCompSeq([])} className="text-xs text-muted hover:text-red">
                      重来
                    </button>
                  </>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted">点击下方「起卦」将直接随机生成完整六爻（含动爻）</p>
            )}
          </div>
        )}

        {/* 分秒卦 */}
        {method === 'fenmiao' && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2 text-muted">
              分
              <input type="number" min="0" max="99" value={fens} onChange={(e) => setFens(e.target.value)} placeholder="如 23" className={`${inputCls} w-24`} />
            </label>
            <label className="flex items-center gap-2 text-muted">
              秒
              <input type="number" min="0" max="99" value={miao} onChange={(e) => setMiao(e.target.value)} placeholder="如 45" className={`${inputCls} w-24`} />
            </label>
            <span className="text-xs text-muted">以分钟、秒钟各位数字之和起卦</span>
          </div>
        )}
      </div>

      {/* 起卦按钮 + 错误提示 */}
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={doQiGua}
          className="rounded-md bg-gold px-7 py-2 text-sm font-medium text-black transition-colors hover:opacity-90"
        >
          起卦
        </button>
        {error && <span className="text-sm text-red">{error}</span>}
      </div>
    </section>
  )
}
