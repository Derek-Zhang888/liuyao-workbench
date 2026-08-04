/**
 * 起卦方式选择器（Task 9）
 *
 * 9 种起卦方式 Tab + 各自输入区；点「起卦」按钮后：
 *   校验输入 → 调对应 qiguaFromXxx → onStart({method, params, date, lines, dong})
 *
 * params 与 md 导出序列化规则（exportMd 的 PARAMS_SERIALIZER）对齐，直接存对象形态：
 *   qian/computer : { lines: 6位1/2爻画, dong: 动爻索引 }（随机结果一次性生成，避免重排盘时二次随机）
 *   yaoming       : { lines: 6位1-4字符串 }（1阳 2阴 3老阳 4老阴，动爻由引擎推导）
 *   guaname       : { input: 卦名 } 或 { lines: 6位1/2爻画 }
 *   number        : { n1, n2, n3, method: 1|2 }
 *   baoshu        : { digits }
 *   time / shike  : { date: Date }（起卦时刻）
 *   fenmiao       : { ms, ss }
 *
 * date 说明：time/shike 用用户所选起卦时刻；其余方法用点击「起卦」时刻 new Date()。
 */
import { useState } from 'react'
import {
  QIGUA_METHODS,
  qiguaFromQian,
  qiguaFromCoin,
  qiguaFromGuaName,
  qiguaFromNumber,
  qiguaFromBaoshu,
  qiguaFromTime,
  qiguaFromRandom,
  qiguaFromMinuteSecond,
  qiguaFromShike,
} from '../engine/qigua.js'

const METHOD_MAP = Object.fromEntries(QIGUA_METHODS.map((m) => [m.id, m]))

/** 爻位名（初爻→上爻） */
const LINE_NAMES = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻']

/** 钱币卦爻型 → 正面枚数（2正=少阳 1正=少阴 3正=老阳 0正=老阴） */
const QIAN_TYPES = [
  { v: '少阳', heads: 2 },
  { v: '少阴', heads: 1 },
  { v: '老阳', heads: 3 },
  { v: '老阴', heads: 0 },
]

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

const tabCls = (active) =>
  `rounded-md px-3 py-1.5 text-sm transition-colors ${
    active ? 'bg-goldSoft text-gold' : 'text-muted hover:bg-bg hover:text-text'
  }`

const modeCls = (active) =>
  `rounded-md px-3 py-1 text-sm transition-colors ${active ? 'bg-goldSoft text-gold' : 'text-muted hover:text-text'}`

const inputCls =
  'rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-text outline-none transition-colors focus:border-gold'

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

  // —— 钱币卦 ——
  const [qianMode, setQianMode] = useState('interact') // interact 交互摇 / direct 直接输入
  const [coinSeq, setCoinSeq] = useState([]) // 交互摇卦：正面枚数序列（0-3）
  const [qianSpins, setQianSpins] = useState(Array(6).fill('少阳')) // 直接输入

  // —— 爻名卦 ——
  const [yaoSpins, setYaoSpins] = useState(Array(6).fill('1'))

  // —— 卦名卦 ——
  const [guaInput, setGuaInput] = useState('')

  // —— 数字卦 ——
  const [num1, setNum1] = useState('')
  const [num2, setNum2] = useState('')
  const [num3, setNum3] = useState('')
  const [numMethod, setNumMethod] = useState(1)

  // —— 报数卦 ——
  const [digits, setDigits] = useState('')

  // —— 时间卦 / 时刻卦 ——
  const [dt, setDt] = useState(nowLocal())

  // —— 电脑卦 ——
  const [compMode, setCompMode] = useState('interact') // interact 逐爻随机 / direct 一键随机
  const [compSeq, setCompSeq] = useState([]) // 交互模式已生成的 [0,1) 随机数

  // —— 分秒卦 ——
  const [fens, setFens] = useState('')
  const [miao, setMiao] = useState('')

  const meta = METHOD_MAP[method]

  const switchMethod = (id) => {
    setMethod(id)
    setError('')
  }

  const setSpin = (arr, setArr, i) => (v) => setArr(arr.map((x, j) => (j === i ? v : x)))

  /** 摇一爻（钱币卦交互模式） */
  const rollCoin = () => {
    setCoinSeq((s) => (s.length >= 6 ? s : [...s, Math.floor(Math.random() * 4)]))
  }

  /** 随机一爻（电脑卦交互模式） */
  const rollComputer = () => {
    setCompSeq((s) => (s.length >= 6 ? s : [...s, Math.random()]))
  }

  /** 执行起卦：校验 → qiguaFromXxx → onStart */
  const doQiGua = () => {
    setError('')
    try {
      let params = {}
      let date = new Date() // 非时间类方法：起卦时刻
      let result
      switch (method) {
        case 'qian': {
          let heads
          if (qianMode === 'interact') {
            if (coinSeq.length !== 6) {
              throw new Error(`请先摇满 6 爻（已摇 ${coinSeq.length}/6）`)
            }
            heads = coinSeq
          } else {
            heads = qianSpins.map((s) => QIAN_TYPES.find((t) => t.v === s).heads)
          }
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
          const input = guaInput.trim()
          if (!input) throw new Error('请输入卦名（如「乾为天」）或 6 位爻画')
          result = qiguaFromGuaName(input)
          params = /^[12]{6}$/.test(input) ? { lines: input } : { input }
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
          if (!dt) throw new Error('请选择起卦日期时间')
          date = new Date(dt)
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
        case 'shike': {
          if (!dt) throw new Error('请选择起卦日期时间')
          date = new Date(dt)
          params = { date }
          result = qiguaFromShike(date)
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
        {/* 钱币卦 */}
        {method === 'qian' && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-muted">模式</span>
              <button type="button" onClick={() => { setQianMode('interact'); setError('') }} className={modeCls(qianMode === 'interact')}>
                交互摇卦
              </button>
              <button type="button" onClick={() => { setQianMode('direct'); setError('') }} className={modeCls(qianMode === 'direct')}>
                直接输入
              </button>
            </div>
            {qianMode === 'interact' ? (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <button
                  type="button"
                  onClick={rollCoin}
                  disabled={coinSeq.length >= 6}
                  className="rounded-md border border-gold px-4 py-1.5 text-gold transition-colors hover:bg-goldSoft disabled:cursor-not-allowed disabled:opacity-40"
                >
                  摇一爻
                </button>
                <span className="text-muted">
                  已摇 <span className="text-gold">{coinSeq.length}</span>/6 次
                </span>
                {coinSeq.length > 0 && (
                  <>
                    <span className="flex flex-wrap items-center gap-1">
                      {coinSeq.map((h, i) => (
                        <span key={i} className="rounded border border-border bg-bg px-1.5 py-0.5 text-xs text-gold" title={`第 ${i + 1} 爻`}>
                          {QIAN_TYPES.find((t) => t.heads === h).v}
                        </span>
                      ))}
                    </span>
                    <button type="button" onClick={() => setCoinSeq([])} className="text-xs text-muted hover:text-red">
                      重摇
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {qianSpins.map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="text-xs text-muted">{LINE_NAMES[i]}</span>
                    <Select
                      name={`qian-${i}`}
                      value={s}
                      onChange={setSpin(qianSpins, setQianSpins, i)}
                      options={QIAN_TYPES.map((t) => ({ v: t.v, label: t.v }))}
                      className="w-20"
                    />
                  </div>
                ))}
              </div>
            )}
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

        {/* 卦名卦 */}
        {method === 'guaname' && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <input
              value={guaInput}
              onChange={(e) => setGuaInput(e.target.value)}
              placeholder="如：乾为天 / 天风姤 / 211111"
              className={`${inputCls} w-full max-w-xs`}
            />
            <span className="text-xs text-muted">支持 64 卦名、八纯卦单字（如「坎」）或 6 位爻画（1阳 2阴），无动爻</span>
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

        {/* 时间卦 / 时刻卦 */}
        {(method === 'time' || method === 'shike') && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <input
              type="datetime-local"
              value={dt}
              onChange={(e) => setDt(e.target.value)}
              className={`${inputCls} w-full max-w-xs [color-scheme:dark]`}
            />
            <span className="text-xs text-muted">
              {method === 'time'
                ? '以农历年支、月、日、时辰序起卦（年月日时法）'
                : '以农历月、日、时辰序、刻序起卦（一时辰 8 刻，每刻 15 分钟）'}
            </span>
          </div>
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
