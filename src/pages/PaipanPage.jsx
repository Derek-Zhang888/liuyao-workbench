/**
 * 排盘页（Task 9）
 *
 * 流程：选起卦方式 → 填输入 → 「起卦」→ qigua → paipan（起卦时刻）→ PanView 显示
 *       → 填占断/选标签 → 「保存卦例」（addGuashi，panSnapshot 存盘面，date 用起卦时刻）
 *       → 「导出 md」（guashiToMd → Blob 下载）｜「重新起卦」清空
 *       → 排盘历史：最近 20 条已保存卦例，点击回填查看
 *
 * 响应式（Task 14）：≥1024px 三栏（起卦 | 盘面 | 占断），
 *   ≥768px 两栏（起卦+盘面并排、占断在下），<768px 单列纵向滚动。
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { paipan } from '../engine/paipan.js'
import { QIGUA_METHODS } from '../engine/qigua.js'
import { isEmptyDoodle } from '../engine/doodleSvg.js'
import { MARKER_KEYS } from '../engine/panMarkers.js'
import { addGuashi, listGuashi } from '../db/guashiRepo.js'
import { getSetting } from '../db/settingsRepo.js'
import { loadTrueSolarSettings, trueSolarParam } from '../db/trueSolarSettings.js'
import { guashiToMd } from '../md/exportMd.js'
import { saveExport, MD_FILTERS } from '../utils/exportHelper.js'
import QiguaSelector from '../components/QiguaSelector.jsx'
import YongShenSelector from '../components/YongShenSelector.jsx'
import PanView from '../components/PanView.jsx'
import DuanInput from '../components/DuanInput.jsx'
import TagEditor from '../components/TagEditor.jsx'
import ConfirmDialog from '../components/ConfirmDialog.jsx'

const METHOD_NAME = Object.fromEntries(QIGUA_METHODS.map((m) => [m.id, m.name]))

const EMPTY_DUAN = {
  duanyu: '',
  yingqi: '',
  fangwei: '',
  beizhu: '',
  fankui: '',
  jixiong: '',
  status: '未反馈',
  jixiongOk: '',
  yingqiOk: '',
  fangweiOk: '',
  background: '', // v0.2 功能 D：占断背景（旧卦例无此字段时默认空）
}

/** Date → 'YYYY-MM-DD HH:mm' */
function fmtDateTime(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 解析 'YYYY-MM-DD HH:mm' / 'YYYY-MM-DD' → Date，失败返回 null */
function parseDate(s) {
  if (!s) return null
  const d = new Date(String(s).replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? null : d
}

export default function PaipanPage() {
  const navigate = useNavigate()

  // 起卦结果
  const [method, setMethod] = useState('')
  const [params, setParams] = useState(null)
  const [qiguaDate, setQiguaDate] = useState(null) // 起卦时刻
  const [pan, setPan] = useState(null)
  // 起卦区重置计数：重新起卦时 key 自增强制 QiguaSelector 重挂载（输入区状态一并清空）
  const [qiguaResetKey, setQiguaResetKey] = useState(0)

  // 自定用神（功能二，v0.10 惰性持久化）：切页面保留，重新起卦/刷新清空；改变后重排盘以更新高亮与元神/忌神判定
  const YONGSHEN_KEY = 'liuyao-yongshen' // v0.10：用神会话持久化（参照 liuyao-paipan-state 模式）
  const [yongShen, setYongShen] = useState(() => {
    try {
      const raw = sessionStorage.getItem(YONGSHEN_KEY)
      if (!raw) return null
      const v = JSON.parse(raw)
      return v && typeof v === 'object' ? v : null
    } catch (_) {
      return null
    }
  })
  /** 用神变更统一入口：同步 state 与 sessionStorage（null 清除） */
  const handleYongShenChange = (v) => {
    setYongShen(v)
    try {
      if (v) sessionStorage.setItem(YONGSHEN_KEY, JSON.stringify(v))
      else sessionStorage.removeItem(YONGSHEN_KEY)
    } catch (_) { /* 容量不足时静默 */ }
  }
  // 本次排盘实际采用的真太阳时配置（重排盘时沿用，避免与起卦时刻不一致）
  const [tsUsed, setTsUsed] = useState(null)

  // 占断 / 保存
  const [title, setTitle] = useState('')
  const [duan, setDuan] = useState({ ...EMPTY_DUAN })
  const [tags, setTags] = useState([])
  const [saved, setSaved] = useState(null) // 最近一次保存的记录（供导出）
  const [history, setHistory] = useState([])
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [exportPath, setExportPath] = useState('') // v1.0.0：最近一次导出的完整路径（提示分行显示）

  // 盘面画板（v0.2 功能 A）：独立 state，绝不挂 pan（用神重排盘 setPan 会冲掉）
  // v1.2.0 拆分：doodle/doodleEnabled=电脑画板，doodleMobile/mobileDoodleEnabled=手机画板（两套独立）
  const [doodle, setDoodle] = useState(null)
  const [doodleEnabled, setDoodleEnabled] = useState(false)
  const [doodleMobile, setDoodleMobile] = useState(null)
  const [mobileDoodleEnabled, setMobileDoodleEnabled] = useState(false)

  // v0.10 #6：重名保存提醒弹窗（pendingRecord 待确认记录；去改名 → 聚焦卦题输入框）
  const [confirmDup, setConfirmDup] = useState(false)
  const [pendingRecord, setPendingRecord] = useState(null)
  const titleInputRef = useRef(null)
  // 2026-08-10：盘面容器 ref——起卦后自动滚动定位（移动端单列布局，不滚会误以为没起卦）
  const panRef = useRef(null)

  // ---- 状态持久化：跨导航保留起盘结果 ----
  const SESSION_KEY = 'liuyao-paipan-state'
  const QIGUA_INPUT_KEY = 'liuyao-qigua-input-state'

  /** 将当前状态存入 sessionStorage（pan 变化时自动触发） */
  useEffect(() => {
    if (pan) {
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({
          method, params, qiguaDate: qiguaDate?.toISOString(),
          title, duan, tags, saved,
          doodle, doodleEnabled, // v0.2 功能 A：画板跨页/刷新保留
          doodleMobile, mobileDoodleEnabled, // v1.2.0：手机画板独立
        }))
      } catch (_) { /* 容量不足时静默失败 */ }
    }
  }, [pan, method, params, qiguaDate, title, duan, tags, saved, doodle, doodleEnabled, doodleMobile, mobileDoodleEnabled])

  /** 组件挂载时恢复状态（先读真太阳时设置，再按当前设置重排盘） */
  useEffect(() => {
    ;(async () => {
      // 真太阳时校准设置：默认关闭；开启且有城市配置时恢复的盘面一并按真太阳时排
      let ts = null
      try {
        ts = trueSolarParam(await loadTrueSolarSettings())
      } catch (_) { /* 设置读取失败按关闭处理 */ }
      try {
        const raw = sessionStorage.getItem(SESSION_KEY)
        if (!raw) return
        const s = JSON.parse(raw)
        // 仅恢复状态标记，不重新计算 pan（pan 需要重新调用 paipan）
        if (s.method && s.params) {
          try {
            // 盘面标记 11 开关（v0.2 功能 B）：随设置，恢复的盘面一并按设置排
            let naganOn = false
            try {
              naganOn = !!(await getSetting('nagan'))
            } catch (_) { /* 设置读取失败按关闭处理 */ }
            const restoredPan = paipan({
              method: s.method,
              params: s.params,
              date: s.qiguaDate ? new Date(s.qiguaDate) : new Date(),
              trueSolar: ts,
              yongShen, // v0.10：用神惰性持久化（useState 初始值来自 sessionStorage）
              nagan: naganOn,
              dizhi: true,
              markers: await readMarkers(), // v0.2 功能 B：盘面标记
            })
            setPan(restoredPan)
            setTsUsed(ts)
            setMethod(s.method)
            setParams(s.params)
            setQiguaDate(s.qiguaDate ? new Date(s.qiguaDate) : new Date())
          } catch (_) { /* 恢复失败时静默，用户可重新起卦 */ }
        }
        setTitle(s.title ?? '')
        setDuan(s.duan ? { ...EMPTY_DUAN, ...s.duan } : { ...EMPTY_DUAN })
        setTags(Array.isArray(s.tags) ? s.tags : [])
        setSaved(s.saved ?? null)
        setDoodle(s.doodle ?? null) // v0.2 功能 A：画板跨页/刷新恢复
        setDoodleEnabled(!!s.doodleEnabled)
        setDoodleMobile(s.doodleMobile ?? null) // v1.2.0：手机画板独立恢复
        setMobileDoodleEnabled(!!s.mobileDoodleEnabled)
      } catch (_) { /* 解析失败时静默 */ }
    })()
  }, []) // 仅挂载时执行一次

  /** 恢复默认（清除持久化状态并重置所有字段） */
  const handleRestoreDefault = () => {
    sessionStorage.removeItem(SESSION_KEY)
    handleReset()
  }

  const refreshHistory = async () => {
    try {
      const list = await listGuashi()
      setHistory(list.slice(0, 20))
    } catch (e) {
      /* 历史列表失败不阻断主流程 */
    }
  }

  useEffect(() => {
    refreshHistory()
  }, [])

  /** 读取纳干开关（功能三）：设置页关闭/读取失败均按关闭处理 */
  const readNagan = async () => {
    try {
      return !!(await getSetting('nagan'))
    } catch (_) {
      return false
    }
  }

  /** 读取盘面标记 11 开关（v0.2 功能 B）：设置页关闭/读取失败均按关闭处理 */
  const readMarkers = async () => {
    const out = {}
    for (const k of MARKER_KEYS) {
      try {
        out[k] = !!(await getSetting(k))
      } catch (_) {
        out[k] = false
      }
    }
    return out
  }

  /** QiguaSelector 回调：读取真太阳时设置 → 排盘并重置占断区 */
  const handleStart = async (r) => {
    try {
      // 真太阳时校准：开启且有城市配置时传 trueSolar；开启但未配置时提示并退回北京时间
      let ts = null
      let tsHint = ''
      try {
        const s = await loadTrueSolarSettings()
        ts = trueSolarParam(s)
        if (s.enabled && !ts) {
          tsHint = '真太阳时校准已开启但未配置城市，本次按北京时间排盘（请在起卦区下方配置城市或经度）'
        }
      } catch (_) { /* 设置读取失败按关闭处理 */ }
      const p = paipan({
        method: r.method,
        params: r.params,
        date: r.date,
        trueSolar: ts,
        yongShen, // 自定用神（功能二）
        nagan: await readNagan(), // 纳干开关（功能三）
        dizhi: true, // 地支分析（功能一）
        markers: await readMarkers(), // 盘面标记 11 开关（v0.2 功能 B）
      })
      setPan(p)
      // 2026-08-10：起卦后自动滚动定位到盘面（移动端起卦区在盘面上方，不滚看不到卦盘，误以为没起卦）
      setTimeout(() => {
        panRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
      }, 60)
      setTsUsed(ts)
      setMethod(r.method)
      setParams(r.params)
      setQiguaDate(r.date)
      setTitle('')
      setDuan({ ...EMPTY_DUAN })
      setTags([])
      setSaved(null)
      setDoodle(null) // v0.2 功能 A：新起卦清空画板
      setDoodleEnabled(false)
      setDoodleMobile(null) // v1.2.0：手机画板独立，新起卦一并清空（曾漏 → 新盘面残留旧涂鸦）
      setMobileDoodleEnabled(false)
      setMsg(tsHint)
      setError('')
    } catch (e) {
      setError('排盘失败：' + e.message)
    }
  }

  /** 用神变化 → 以相同起卦参数重排盘（同参数结果确定，不改变卦象），更新高亮与元神/忌神判定 */
  useEffect(() => {
    if (!pan || !method || !params || !qiguaDate) return
    ;(async () => {
      try {
        const p = paipan({
          method,
          params,
          date: qiguaDate,
          trueSolar: tsUsed,
          yongShen,
          nagan: await readNagan(),
          dizhi: true,
          markers: await readMarkers(), // v0.2 功能 B：盘面标记随设置重排
        })
        setPan(p)
      } catch (_) { /* 重排盘失败时保留原盘面 */ }
    })()
    // 仅在用神变化时重排盘（tsUsed/method/params 由起卦流程固定，读取最新闭包值）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yongShen])

  /** 实际落库（重复名确认后的继续保存也走这里） */
  const doSave = async (record) => {
    try {
      const savedRec = await addGuashi(record)
      setSaved(savedRec)
      setMsg('保存成功，可导出 md 或前往卦例库')
      refreshHistory()
    } catch (e) {
      setError('保存失败：' + e.message)
    }
  }

  /** 保存前查重（v0.10 #6）：设置「重名保存提醒」开启且同名存在时弹窗二选一 */
  const checkDuplicate = async (title) => {
    let remind = true
    try {
      remind = (await getSetting('remind-duplicate-title')) ?? true
    } catch (_) {
      remind = true
    }
    if (!remind || !title) return false
    try {
      const list = await listGuashi()
      return list.some((r) => (r.title ?? '').trim() === title)
    } catch (_) {
      return false // 查重失败不阻断保存
    }
  }

  const handleSave = async () => {
    if (!pan || !qiguaDate) {
      setError('请先起卦')
      return
    }
    // v0.2 功能 H：吉凶改为非必选（未选吉凶也允许保存为「待占断」）
    if (duan.status === '已反馈' && !duan.jixiongOk) {
      setError('已反馈时请选择吉凶对错（对/错必选）')
      return
    }
    setError('')
    const record = {
      title: title.trim() || '未命名卦例',
      date: fmtDateTime(qiguaDate),
      method,
      params,
      panSnapshot: pan,
      yongShen: yongShen ?? null, // v0.2 功能 I：顶层记录用神（与快照烘焙一致；旧卦例无此字段）
      ...duan,
      tags,
      doodle: doodle && !isEmptyDoodle(doodle) ? doodle : null, // v0.2 功能 A：空涂鸦不落库
      doodleOn: !!doodleEnabled, // v0.10 改进建7 #1：保存画板开启状态（编辑页默认联动开启）
      doodleMobile: doodleMobile && !isEmptyDoodle(doodleMobile) ? doodleMobile : null, // v1.2.0：手机画板独立保存
      doodleMobileOn: !!mobileDoodleEnabled,
      updatedAt: Date.now(), // v0.10 #2：保存/编辑时写更新时间（卡片/统计按此排序显示）
    }
    if (await checkDuplicate(record.title)) {
      setPendingRecord(record)
      setConfirmDup(true)
      return
    }
    await doSave(record)
  }

  const handleExport = async () => {
    if (!saved) {
      setMsg('请先保存卦例再导出')
      setExportPath('')
      return
    }
    const md = guashiToMd(saved)
    const fileName = `${(saved.title || '卦例').replace(/[\\/:*?"<>|]/g, '_')}.md`
    const r = await saveExport('md', fileName, md, 'text/markdown;charset=utf-8', MD_FILTERS)
    if (r.ok) {
      setMsg(r.message)
      setExportPath(r.path || '') // 长路径单独放下一行 break-all 小字
      setError('')
    } else {
      setError(r.message)
      setExportPath('')
    }
  }

  /** 重新起卦：清空盘面、占断与起卦区输入；v0.10 一并清除用神会话持久化 */
  const handleReset = () => {
    setPan(null)
    setMethod('')
    setParams(null)
    setQiguaDate(null)
    handleYongShenChange(null) // v0.10：新起卦清除用神（state + sessionStorage）
    setTsUsed(null)
    setTitle('')
    setDuan({ ...EMPTY_DUAN })
    setTags([])
    setSaved(null)
    setDoodle(null) // v0.2 功能 A：画板一并清空
    setDoodleEnabled(false)
    setDoodleMobile(null) // v1.2.0：手机画板独立，重置一并清空
    setMobileDoodleEnabled(false)
    setMsg('')
    setError('')
    setExportPath('')
    setQiguaResetKey((k) => k + 1) // 起卦区输入一并清空
    try {
      sessionStorage.removeItem(SESSION_KEY)
      sessionStorage.removeItem(QIGUA_INPUT_KEY) // 同时清掉起卦区输入持久化
    } catch (_) { /* 静默 */ }
  }

  /** 清空占断：清空占断区文字内容（duan + title），保留 pan/tags/saved/记忆（Bug #12） */
  const handleClearDuan = () => {
    setTitle('')
    setDuan({ ...EMPTY_DUAN })
    setMsg('已清空占断文字（保留盘面与标签）')
    setError('')
  }

  /** 历史回填查看（v0.10 #16：无快照的导入记录按 method/params 重新排盘，携带当前设置标记） */
  const handleLoadHistory = async (rec) => {
    setError('')
    setMsg('')
    let pan = rec.panSnapshot ?? null
    if (!pan) {
      // md 导入记录无盘面快照：重新排盘（含标记/纳干/用神设置），失败则报错不阻断
      try {
        pan = paipan({
          method: rec.method,
          params: rec.params ?? {},
          date: parseDate(rec.date) ?? new Date(),
          trueSolar: tsUsed,
          yongShen: rec.panSnapshot?.yongShen ?? rec.yongShen ?? null,
          nagan: await readNagan(),
          dizhi: true,
          markers: await readMarkers(),
        })
      } catch (e) {
        setError('该卦例无盘面快照，且无法按起卦参数重新排盘：' + e.message)
        return
      }
    }
    setPan(pan)
    setMethod(rec.method ?? '')
    setParams(rec.params ?? null)
    setQiguaDate(parseDate(rec.date) ?? new Date())
    // v0.2 功能 I：回填历史时恢复自定用神（快照烘焙优先，顶层字段兜底；旧卦例无则清空）
    handleYongShenChange(rec.panSnapshot?.yongShen ?? rec.yongShen ?? null)
    setTitle(rec.title ?? '')
    setDuan({
      duanyu: rec.duanyu ?? '',
      yingqi: rec.yingqi ?? '',
      beizhu: rec.beizhu ?? '',
      fankui: rec.fankui ?? '',
      jixiong: rec.jixiong ?? '',
      status: rec.status ?? '未反馈',
      jixiongOk: rec.jixiongOk ?? '',
      yingqiOk: rec.yingqiOk ?? '',
      fangweiOk: rec.fangweiOk ?? '',
      fangwei: rec.fangwei ?? '',
      background: rec.background ?? '', // v0.2 功能 D：旧卦例无背景字段时默认空
    })
    setTags(Array.isArray(rec.tags) ? rec.tags : [])
    setSaved(rec)
    setDoodle(rec.doodle ?? null) // v0.2 功能 A：回填历史涂鸦（含 md 导入还原）
    setDoodleEnabled(false) // 回填历史默认不自动开启画板（避免覆盖层意外遮挡；编辑页按 record.doodleOn 联动见卦例库）
    setDoodleMobile(rec.doodleMobile ?? null) // v1.2.0：手机画板独立回填
    setMobileDoodleEnabled(false)
    setMsg('已回填历史卦例（保存将新建一条卦例）')
  }

  return (
    // v0.10 #15：排盘页宽度以盘面为主——lg 起卦:盘面:占断 = 5:7:5（盘面更宽），响应式不破坏移动端单列
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-[minmax(0,5fr)_minmax(0,672px)_minmax(0,5fr)]">
      {/* 起卦区（key 变化时重挂载，重新起卦后输入区复位）+ 用神选择器（功能二） */}
      <div className="space-y-5">
        <QiguaSelector key={qiguaResetKey} onStart={handleStart} />
        <YongShenSelector value={yongShen} onChange={handleYongShenChange} />
      </div>

      {/* 盘面区：md 起卦+盘面并排；lg 起卦|盘面|占断 三栏 */}
      {pan && (
        <div ref={panRef} className="scroll-mt-20 md:col-span-1 lg:col-span-1">
          <PanView
            pan={pan}
            doodle={doodle}
            doodleEnabled={doodleEnabled}
            onDoodleChange={setDoodle}
            onDoodleToggle={setDoodleEnabled}
            doodleMobile={doodleMobile}
            mobileDoodleEnabled={mobileDoodleEnabled}
            onMobileDoodleChange={setDoodleMobile}
            onMobileDoodleToggle={setMobileDoodleEnabled}
          />
        </div>
      )}

      {/* 占断区：md 横跨两列（占断在下）；lg 第三列 */}
      {pan && (
        <section className="card rounded-xl border border-border bg-panel p-4 sm:p-5 md:col-span-2 lg:col-span-1">
          <h2 className="mb-4 text-base font-medium text-gold">占断</h2>

          {/* 卦题 */}
          <div className="mb-4">
            <div className="mb-1.5 text-sm text-muted">占问内容（卦题）</div>
            <input
              ref={titleInputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="如：占测今日出行是否顺利（留空保存为「未命名卦例」）"
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors focus:border-gold"
            />
          </div>

          {/* 占断输入 */}
          <DuanInput value={duan} onChange={setDuan} />

          {/* 标签 */}
          <div className="mt-4">
            <div className="mb-1.5 text-sm text-muted">标签</div>
            <TagEditor selected={tags} onChange={setTags} />
          </div>

          {/* 操作按钮 */}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              className="btn-shimmer rounded-md px-5 py-2 text-sm font-medium transition-colors"
            >
              保存卦例
            </button>
            <button
              type="button"
              onClick={handleExport}
              className="rounded-md border border-gold px-5 py-2 text-sm text-gold transition-colors hover:bg-goldSoft"
            >
              导出 md
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-md border border-border px-5 py-2 text-sm text-muted transition-colors hover:text-text"
            >
              重新起卦
            </button>
            <button
              type="button"
              onClick={handleClearDuan}
              title="清空占断文字（保留盘面与标签）"
              className="rounded-md border border-border px-5 py-2 text-sm text-muted transition-colors hover:text-text"
            >
              清空
            </button>
            {saved && (
              <button
                type="button"
                onClick={() => navigate('/lib')}
                className="rounded-md border border-border px-5 py-2 text-sm text-muted transition-colors hover:text-gold"
              >
                前往卦例库 →
              </button>
            )}
          </div>

          {error && <div className="mt-3 break-words text-sm text-red">{error}</div>}
          {msg && <div className="mt-3 break-words text-sm text-gold">{msg}</div>}
          {exportPath && <div className="mt-1 break-all text-xs text-muted">{exportPath}</div>}
        </section>
      )}

      {/* 排盘历史 */}
      <section className="card rounded-xl border border-border bg-panel p-4 sm:p-5 md:col-span-2 lg:col-span-full">
        <h2 className="mb-3 text-base font-medium text-gold">排盘历史（最近 20 条）</h2>
        {history.length === 0 ? (
          <p className="text-sm text-muted">暂无已保存的卦例</p>
        ) : (
          <ul className="max-h-72 divide-y divide-border overflow-y-auto">
            {history.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => handleLoadHistory(h)}
                  className="flex w-full items-center gap-3 px-2 py-2 text-left transition-colors hover:bg-goldSoft"
                  title="点击回填查看"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-text">{h.title || '未命名卦例'}</span>
                  <span className="shrink-0 text-xs text-gold">{h.panSnapshot?.ben?.name ?? ''}</span>
                  <span className="shrink-0 text-xs text-muted">{METHOD_NAME[h.method] ?? h.method}</span>
                  <span className="shrink-0 text-xs text-muted">{h.date ?? ''}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* v0.10 #6：重名保存提醒——① 仍要保存 ② 去改名（聚焦卦题输入框） */}
      <ConfirmDialog
        open={confirmDup}
        title="卦题重名"
        message={`已有卦例使用卦题「${pendingRecord?.title ?? ''}」。\n仍要保存将产生同名卦例；选择「去改名」回到占断区修改卦题后再保存。`}
        confirmLabel="仍要保存"
        cancelLabel="去改名"
        onCancel={() => {
          setConfirmDup(false)
          titleInputRef.current?.focus()
        }}
        onConfirm={() => {
          setConfirmDup(false)
          const rec = pendingRecord
          if (rec) doSave(rec)
        }}
      />
    </div>
  )
}
