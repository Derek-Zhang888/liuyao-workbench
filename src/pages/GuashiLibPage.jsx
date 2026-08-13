/**
 * 卦例库页（Task 10）
 *
 * 功能：
 *   - 筛选栏：tag 多选（任一命中，每个 tag 带 × 删除键：只删标签本身，已保存卦例不受影响）
 *     / 反馈状态单选（全部/未反馈/已反馈）/ 关键字搜索（标题/断语）
 *   - 卡片列表（GuashiCard，多选批量操作）：点击打开详情/编辑
 *   - 详情/编辑：复用 PanView/DuanInput/TagEditor；v0.2 功能 G 双栏布局（盘面左、占断右，≥lg 两栏）；
 *     盘面用 panSnapshot 优先，无快照按 method/params 重新排盘；v0.2 功能 I 编辑视图可自定用神
 *     （YongShenSelector，快照用神回显，变化时重排盘并随保存落库）；保存用 updateGuashi（按 id 覆盖，不新建记录）
 *   - 单条：导出 md（下载）/ 删除（softDelete 进回收站）
 *   - 批量：勾选后「批量导出 md」（逐条下载）/「批量删除」（进回收站）
 *   - 导入：input type=file 多选 .md → mdToGuashi → addGuashi，成功/失败清单提示（含失败原因）；
 *     md 里的标签若库中不存在，导入时用 ensureTags 自动新建（筛选栏与占断界面随即可用）
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { QIGUA_METHODS } from '../engine/qigua.js'
import { isEmptyDoodle } from '../engine/doodleSvg.js'
import { MARKER_KEYS } from '../engine/panMarkers.js'
import { addGuashi, getGuashi, listGuashi, softDelete, updateGuashi } from '../db/guashiRepo.js'
import { addTag, deleteTag, ensurePresetTags, ensureTags, listTags } from '../db/tagsRepo.js'
import { getSetting } from '../db/settingsRepo.js'
import { paletteColor } from '../config/presetTags.js'
import { mdToGuashi } from '../md/importMd.js'
import PanView from '../components/PanView.jsx'
import DuanInput, { validateDuanSave } from '../components/DuanInput.jsx'
import TagEditor from '../components/TagEditor.jsx'
import YongShenSelector from '../components/YongShenSelector.jsx'
import GuashiCard from '../components/GuashiCard.jsx'
import ConfirmDialog, { isNoRemind } from '../components/ConfirmDialog.jsx'
import { downloadGuashiBatch, downloadGuashiMd } from '../utils/exportBatch.js'
import { resolvePan } from '../utils/panResolve.js'

const METHOD_NAME = Object.fromEntries(QIGUA_METHODS.map((m) => [m.id, m.name]))

/** 卦例库筛选/编辑状态的会话级持久化 key（v0.10 建议5 #2：切到统计页再回来保持原状态） */
const LIB_FILTER_KEY = 'liuyao-lib-filter'
const LIB_EDITING_KEY = 'liuyao-lib-editing-id'

/** 卦例库筛选栏内嵌的新增标签输入：与排盘占断页 TagEditor 共用 tags 表（v0.10 建议4 #3） */
function AddTagInline({ onAdded }) {
  const [name, setName] = useState('')
  const [err, setErr] = useState('')
  const submit = async () => {
    const n = name.trim()
    if (!n) return
    try {
      const rec = await addTag({ name: n, color: paletteColor(Math.random() * 1000 | 0) })
      setName('')
      setErr('')
      onAdded?.(rec)
    } catch (e) {
      setErr(e.message || '新增失败')
    }
  }
  return (
    <span className="flex items-center gap-1.5 text-sm">
      <input
        value={name}
        onChange={(e) => { setName(e.target.value); setErr('') }}
        onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
        placeholder="新增标签名"
        className="w-32 rounded-md border border-border bg-bg px-2 py-1 text-sm text-text outline-none focus:border-gold"
      />
      <button
        type="button"
        onClick={submit}
        className="rounded-md border border-gold px-2 py-1 text-xs text-gold transition-colors hover:bg-goldSoft"
      >
        新增
      </button>
      {err && <span className="text-xs text-red">{err}</span>}
    </span>
  )
}

/** 从记录中提取占断字段（DuanInput 的 value 结构） */
function duanOf(rec) {
  return {
    background: rec.background ?? '', // v0.2 功能 D：编辑页背景回填（曾缺失→背景显示空/输入被吞/保存丢失）
    duanyu: rec.duanyu ?? '',
    yingqi: rec.yingqi ?? '',
    beizhu: rec.beizhu ?? '',
    fankui: rec.fankui ?? '',
    fangwei: rec.fangwei ?? '',
    quShu: rec.quShu ?? '', // v1.3.0：取数文本框回填（旧卦例无此字段默认空）
    jixiong: rec.jixiong ?? '',
    status: rec.status ?? '未反馈',
    jixiongOk: rec.jixiongOk ?? '',
    yingqiOk: rec.yingqiOk ?? '',
    fangweiOk: rec.fangweiOk ?? '',
    quShuFb: rec.quShuFb ?? '', // v1.3.0：取数反馈回填
  }
}

/**
 * v1.3.0 三态口径辅助：五者（断语/应期/方位/取数/吉凶）任一非空 = 已有占断内容
 * （与 stats.js 的 hasDuanContent 同口径；待反馈 = 有内容 且 无反馈文本；待占断 = 无内容）
 */
function hasDuanContent(r) {
  return !!(
    (r?.duanyu ?? '').trim() ||
    (r?.yingqi ?? '').trim() ||
    (r?.fangwei ?? '').trim() ||
    (r?.quShu ?? '').trim() ||
    (r?.jixiong ?? '')
  )
}

export default function GuashiLibPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const fileRef = useRef(null)

  // 筛选状态全部走 URL searchParams（v0.10 建议4 #5：统计页跳转带 query；避免同步循环）
  // v0.10 改进建8 #2：主筛选改为单一互斥组（全部/待占断/未反馈/已反馈），query 用
  //   status=all|pending|unfed|fed；旧参数（status=未反馈/已反馈、pending=1）兼容过渡解析。
  const statusMode = (() => {
    const s = searchParams.get('status')
    if (s === 'all' || s === 'pending' || s === 'unfed' || s === 'fed') return s
    if (s === '未反馈') return 'unfed' // 旧 query 兼容
    if (s === '已反馈') return 'fed' // 旧 query 兼容
    if (searchParams.get('pending') === '1') return 'pending' // 旧 query 兼容
    return 'all'
  })()
  // 已反馈展开后的对错筛选（仅 fed 模式生效；v1.3.0 全部改为多选=重复参数，同维度=或）：
  //   jixiongOk/yingqiOk/fangweiOk 对+错可同时选；quShuFb 神准+相近+错可多选
  const jixiongOkFilter = searchParams.getAll('jixiongOk').filter(Boolean)
  const yingqiOkFilter = searchParams.getAll('yingqiOk').filter(Boolean)
  const fangweiOkFilter = searchParams.getAll('fangweiOk').filter(Boolean)
  const quShuFbFilter = searchParams.getAll('quShuFb').filter(Boolean)
  // v1.3.0 严格反馈开关（仅 fed 模式生效）：已反馈维度集合恰好等于勾选维度集合（未勾选维度反馈值须全空）；
  //   URL strictFb=1（与标签严格筛选 strict=1 区分）
  const strictFbMode = searchParams.get('strictFb') === '1'
  // 待反馈展开后的子筛选（仅 unfed 模式生效）：jixiong=吉/凶（可同选=或）、yingqi=1（有应期）、fangwei=1（有方位）、quShu=1（有取数）
  const jixiongFilter = searchParams.getAll('jixiong').filter(Boolean)
  const yingqiHasFilter = searchParams.get('yingqi') === '1'
  const fangweiHasFilter = searchParams.get('fangwei') === '1'
  const quShuHasFilter = searchParams.get('quShu') === '1' // v1.3.0 取数子筛选
  // 严格筛选（全部命中标签）：strict=1 时标签须全部命中（v0.10 追加）
  const strictMode = searchParams.get('strict') === '1'
  // URL 标签参数（v0.2 功能 J）：统计页跳转带 tags= 重复参数（tag 名可含逗号，故不用逗号拼接）
  const urlTags = useMemo(() => searchParams.getAll('tags').filter(Boolean), [searchParams])
  // v0.10 改进建8 #3 排序：URL sort= 参数（created-desc 默认 / created-asc / updated-desc / updated-asc / tag-match 最符合标签）
  // tag-match 无区分度时（严格筛选开启 或 标签不足 2 个）→ 归一化为 created-desc（仅解析层，不改 URL）
  const sortMode = (() => {
    const s = searchParams.get('sort') || 'created-desc'
    if ((strictMode || urlTags.length < 2) && s === 'tag-match') return 'created-desc'
    return s
  })()
  // 创建时间范围筛选（YYYY-MM-DD，from/to 均含起止当天；URL 参数，统计页跳转可携带）
  const fromDate = searchParams.get('from') || ''
  const toDate = searchParams.get('to') || ''
  /** 设置单个 URL 参数（空值移除，保持 URL 干净） */
  const setFilter = (key, value) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }
  /** v1.3.0 多值筛选切换（重复参数，如 quShuFb=神准&quShuFb=相近；同维度多选=或）：已有则移除，无则追加 */
  const toggleMultiFilter = (key, val) => {
    const next = new URLSearchParams(searchParams)
    const vals = next.getAll(key)
    if (vals.includes(val)) {
      next.delete(key)
      for (const v of vals.filter((x) => x !== val)) next.append(key, v)
    } else {
      next.append(key, val)
    }
    setSearchParams(next, { replace: true })
  }
  /** 设置 URL tags= 重复参数（标签名可含逗号，用重复参数而非逗号拼接；标签走 URL 单一真相源） */
  const setUrlTags = (tags) => {
    const next = new URLSearchParams(searchParams)
    next.delete('tags')
    for (const t of tags) next.append('tags', t)
    // 标签不足 2 个时「最符合标签」无意义 → 自动切回创建时间新→旧（URL 一并改写，刷新/分享不残留）
    if (tags.length < 2 && (next.get('sort') || 'created-desc') === 'tag-match') next.set('sort', 'created-desc')
    setSearchParams(next, { replace: true })
  }
  /** 严格筛选开关（全部命中）：开启时若已启用「最符合标签」排序则自动切回创建时间新→旧 */
  const setStrict = (on) => {
    const next = new URLSearchParams(searchParams)
    if (on) {
      next.set('strict', '1')
      if ((next.get('sort') || 'created-desc') === 'tag-match') next.set('sort', 'created-desc')
    } else {
      next.delete('strict')
    }
    setSearchParams(next, { replace: true })
  }
  /** v0.10 改进建8 #2：主筛选单选组切换。选中一个自动取消其他（互斥）；
   *  切换时清空子筛选（对错/子项），避免跨组残留；「全部」清除筛选。 */
  const setStatusMode = (mode) => {
    const next = new URLSearchParams(searchParams)
    next.delete('pending') // 旧参数一并清理
    // v1.3.0：fed 对错筛选新增 quShuFb（取数反馈三档）；unfed 子项新增 quShu（有取数）；严格反馈 strictFb
    if (mode === 'all') {
      for (const k of ['status', 'jixiongOk', 'yingqiOk', 'fangweiOk', 'quShuFb', 'strictFb', 'jixiong', 'yingqi', 'fangwei', 'quShu']) next.delete(k)
    } else {
      next.set('status', mode)
      for (const k of ['jixiongOk', 'yingqiOk', 'fangweiOk', 'quShuFb', 'strictFb', 'jixiong', 'yingqi', 'fangwei', 'quShu']) next.delete(k)
    }
    setSearchParams(next, { replace: true })
  }

  const [records, setRecords] = useState([])
  const [allTags, setAllTags] = useState([])
  const [keyword, setKeyword] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [editing, setEditing] = useState(null) // 详情/编辑中的卦例记录（null = 列表态）
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [exportPath, setExportPath] = useState('') // v1.0.0：最近一次导出的完整路径（提示分行显示）
  const [importResult, setImportResult] = useState(null) // {ok, fail:[{name,error}]}
  const [pendingDeleteTag, setPendingDeleteTag] = useState(null) // 待确认删除的标签

  // —— 会话级状态保留（v0.10 建议5 #2 + 追加修复）：
  //    筛选状态存 sessionStorage，切到统计/其他页再回来时恢复；统计页跳转带 query 时以 query 为准。
  //    标签/严格筛选已走 URL（q 内含 tags=、strict=），会话格式 JSON：{ q: <url query string> }
  //    旧会话格式 { q, tags } 兼容：恢复时若 q 无 tags= 而旧 tags 数组有值，则并入 URL（标签曾只存 state 的残留）
  //    恢复只在「首次挂载」执行一次（filterInitializedRef 标记）：
  //    之后用户点「全部」等主动清空时不再被会话旧值拉回（修复「全部」无法选中）。
  const filterInitializedRef = useRef(false)
  useEffect(() => {
    if (!filterInitializedRef.current) {
      filterInitializedRef.current = true
      const cur = searchParams.toString()
      const raw = sessionStorage.getItem(LIB_FILTER_KEY)
      let saved = null
      if (raw) {
        try { saved = JSON.parse(raw) } catch (_) { saved = { q: raw, tags: [] } } // 兼容旧纯字符串格式
      }
      if (!cur && saved && saved.q) {
        const next = new URLSearchParams(saved.q)
        // 旧会话兼容：q 无 tags 而旧 tags 数组有值 → 并入 URL（标签走 URL 后不再单独存）
        if (!next.has('tags') && Array.isArray(saved.tags) && saved.tags.length) {
          for (const t of saved.tags) next.append('tags', t)
        }
        setSearchParams(next.toString(), { replace: true })
        return // 恢复本帧不保存（等恢复触发的下一帧再保存）
      }
      // URL 有 query（统计页跳转/直达）：直接保存当前 query（标签已在其中）
      try { sessionStorage.setItem(LIB_FILTER_KEY, JSON.stringify({ q: cur })) } catch (_) { /* 静默 */ }
      return
    }
    // 首次之后：每次筛选变化都保存（含用户点「全部」清空 query）
    try { sessionStorage.setItem(LIB_FILTER_KEY, JSON.stringify({ q: searchParams.toString() })) } catch (_) { /* 静默 */ }
  }, [searchParams])
  // 编辑中卦例 id 持久化（v0.10 建议5 #2）：
  // - mount 时从会话恢复（异步 getGuashi）
  // - editing 非空时保存 id
  // - 用户显式返回列表（setEditing(null)）时由下方 backToList 清理会话
  useEffect(() => {
    const saved = sessionStorage.getItem(LIB_EDITING_KEY)
    if (!saved) return
    getGuashi(Number(saved))
      .then((rec) => {
        if (rec && !rec.deleted) {
          // v1.3.0 Bug3：有草稿（上次未保存修改）→ 恢复未保存内容（dirty=true）；否则正常打开并清残留草稿
          if (!applyDraft(rec)) {
            setEditing(rec)
            setDirty(false)
            clearDraftFor(rec.id)
          }
        }
      })
      .catch(() => { /* 卦例已不存在则忽略 */ })
  }, [])
  useEffect(() => {
    if (!editing) return
    try { sessionStorage.setItem(LIB_EDITING_KEY, String(editing.id)) } catch (_) { /* 静默 */ }
  }, [editing])
  /** 返回列表：清除编辑会话（避免下次挂载误恢复） */
  const backToList = () => {
    setEditing(null)
    try { sessionStorage.removeItem(LIB_EDITING_KEY) } catch (_) { /* 静默 */ }
  }

  // —— v0.2 功能 J：标签已由 URL tags= 参数直接派生（urlTags），统计页跳转/手动点标签统一走 URL ——

  // —— v0.2 功能 I：编辑视图自定用神（编辑中卦例变化时重置）——
  // 初始回显：快照烘焙的用神优先，顶层字段兜底（md 导入卦例 panSnapshot 恒 null，用神从 md 解析）
  const [editYongShen, setEditYongShen] = useState(null)
  useEffect(() => {
    const rec = editing
    setEditYongShen(rec ? (rec.panSnapshot?.yongShen ?? rec.yongShen ?? null) : null)
    // 仅在切换卦例时重置（editing 内容随输入变化，id 不变）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id])

  // —— v0.10 #1/#16：编辑视图盘面画板（独立 state，不挂 pan；随卦例切换重置）——
  // v0.10 改进建7 #1：画板开启状态会话持久化（切页面后返回保留；与排盘页 state key 独立）
  // v1.2.0 拆分：editDoodle/editDoodleEnabled=电脑画板，editDoodleMobile/editMobileDoodleEnabled=手机画板
  const DOODLE_ON_KEY = 'liuyao-doodle-on'
  const MOBILE_DOODLE_ON_KEY = 'liuyao-mobile-doodle-on'
  const [editDoodle, setEditDoodle] = useState(null)
  const [editDoodleEnabled, setEditDoodleEnabled] = useState(false)
  const [editDoodleMobile, setEditDoodleMobile] = useState(null)
  const [editMobileDoodleEnabled, setEditMobileDoodleEnabled] = useState(false)
  useEffect(() => {
    const rec = editing
    setEditDoodle(rec?.doodle ?? null) // md 导入还原的涂鸦在此回填显示（可编辑）
    setEditDoodleMobile(rec?.doodleMobile ?? null) // v1.2.0：手机涂鸦独立回填
    // 编辑页画板默认联动开启：record.doodleOn ?? (doodle 非空)；
    // 会话内开启状态优先（切页面后返回保留）
    let on = false
    try {
      const saved = sessionStorage.getItem(DOODLE_ON_KEY)
      if (saved === '1') on = true
      else if (saved === '0') on = false
      else on = !!(rec?.doodleOn ?? (rec?.doodle && !isEmptyDoodle(rec.doodle)))
    } catch (_) {
      on = !!(rec?.doodleOn ?? (rec?.doodle && !isEmptyDoodle(rec.doodle)))
    }
    setEditDoodleEnabled(on)
    let onM = false
    try {
      const saved = sessionStorage.getItem(MOBILE_DOODLE_ON_KEY)
      if (saved === '1') onM = true
      else if (saved === '0') onM = false
      else onM = !!(rec?.doodleMobileOn ?? (rec?.doodleMobile && !isEmptyDoodle(rec.doodleMobile)))
    } catch (_) {
      onM = !!(rec?.doodleMobileOn ?? (rec?.doodleMobile && !isEmptyDoodle(rec.doodleMobile)))
    }
    setEditMobileDoodleEnabled(onM)
    // 仅在切换卦例时重置
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id])
  /** 编辑视图画板开关：同步 state + sessionStorage（独立于排盘页） */
  const handleEditDoodleToggle = (v) => {
    setEditDoodleEnabled(v)
    markDirty()
    try { sessionStorage.setItem(DOODLE_ON_KEY, v ? '1' : '0') } catch (_) { /* 静默 */ }
  }
  /** 编辑视图手机画板开关（v1.2.0）：独立 state + sessionStorage */
  const handleEditMobileDoodleToggle = (v) => {
    setEditMobileDoodleEnabled(v)
    markDirty()
    try { sessionStorage.setItem(MOBILE_DOODLE_ON_KEY, v ? '1' : '0') } catch (_) { /* 静默 */ }
  }

  // —— v1.3.0 编辑脏检测 + 草稿惰性（Bug2 未保存返回提示 / Bug3 切页内容保留）——
  // dirty：编辑态与打开时不一致（未保存修改）；返回列表时弹窗提示是否保存
  // 草稿：编辑中任一字段变化 → 写 sessionStorage（liuyao-edit-draft-<id>，轻量字段不含 panSnapshot）；
  //   切到其他页面再返回（mount 恢复）或重开该卡片时恢复未保存内容；保存成功/返回列表清除
  const [dirty, setDirty] = useState(false)
  const markDirty = () => setDirty(true)
  const resetDirty = () => setDirty(false)
  const DRAFT_PREFIX = 'liuyao-edit-draft-'
  const draftKey = (id) => `${DRAFT_PREFIX}${id}`
  const clearDraftFor = (id) => {
    try { sessionStorage.removeItem(draftKey(id)) } catch (_) { /* 静默 */ }
  }
  const clearDraft = () => {
    if (editing) clearDraftFor(editing.id)
  }
  const writeDraft = () => {
    if (!editing || !dirty) return
    try {
      sessionStorage.setItem(draftKey(editing.id), JSON.stringify({
        id: editing.id,
        ts: Date.now(),
        fields: {
          title: editing.title ?? '',
          background: editing.background ?? '',
          duanyu: editing.duanyu ?? '',
          yingqi: editing.yingqi ?? '',
          fangwei: editing.fangwei ?? '',
          quShu: editing.quShu ?? '',
          beizhu: editing.beizhu ?? '',
          fankui: editing.fankui ?? '',
          jixiong: editing.jixiong ?? '',
          status: editing.status ?? '未反馈',
          jixiongOk: editing.jixiongOk ?? '',
          yingqiOk: editing.yingqiOk ?? '',
          fangweiOk: editing.fangweiOk ?? '',
          quShuFb: editing.quShuFb ?? '',
          tags: Array.isArray(editing.tags) ? editing.tags : [],
        },
        yongShen: editYongShen ?? null,
        doodle: editDoodle,
        doodleOn: editDoodleEnabled,
        doodleMobile: editDoodleMobile,
        doodleMobileOn: editMobileDoodleEnabled,
      }))
    } catch (_) { /* 容量不足静默 */ }
  }
  // 编辑态任一变化（且脏）→ 写草稿（轻量字段；dirty=false 直接跳过）
  useEffect(() => {
    writeDraft()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, editYongShen, editDoodle, editDoodleEnabled, editDoodleMobile, editMobileDoodleEnabled, dirty])
  /** 读草稿并恢复编辑态（editing 叠加草稿字段 + 用神/画板回填 source）；有未保存内容返回 true */
  const applyDraft = (rec) => {
    try {
      const raw = sessionStorage.getItem(draftKey(rec.id))
      if (!raw) return false
      const d = JSON.parse(raw)
      if (!d || d.id !== rec.id) return false
      setEditing({ ...rec, ...d.fields, yongShen: d.yongShen ?? rec.yongShen })
      // 画板开关回填 effect 读 sessionStorage 优先 → 同步写入保持一致（数据回填 effect 取 editing 叠加值）
      try { sessionStorage.setItem(DOODLE_ON_KEY, d.doodleOn ? '1' : '0') } catch (_) { /* 静默 */ }
      try { sessionStorage.setItem(MOBILE_DOODLE_ON_KEY, d.doodleMobileOn ? '1' : '0') } catch (_) { /* 静默 */ }
      setDirty(true)
      return true
    } catch (_) {
      return false
    }
  }
  /** 返回列表弹窗（v1.3.0 Bug2）：有未保存修改时三选（保存并返回/不保存返回/取消） */
  const [confirmBack, setConfirmBack] = useState(false)
  const doBack = () => {
    backToList()
    setMsg('')
    setError('')
    setConfirmBack(false)
    clearDraft()
  }
  const handleBackClick = () => {
    if (dirty) setConfirmBack(true)
    else doBack()
  }
  const handleBackSave = async () => {
    const ok = await handleSaveEdit()
    setConfirmBack(false)
    if (ok) doBack()
  }

  // —— v0.10 #16：导入/重排盘时携带当前盘面标记设置（markers 随设置重算，修复导入丢失增强显示）——
  const [markerSettings, setMarkerSettings] = useState(null)
  useEffect(() => {
    ;(async () => {
      const m = {}
      for (const k of MARKER_KEYS) {
        try {
          m[k] = !!(await getSetting(k))
        } catch (_) {
          m[k] = false
        }
      }
      setMarkerSettings(m)
    })()
  }, [])

  const tagColors = useMemo(
    () => Object.fromEntries(allTags.map((t) => [t.name, t.color])),
    [allTags],
  )

  const refresh = async () => {
    try {
      setRecords(await listGuashi())
    } catch (e) {
      setError('加载卦例失败：' + e.message)
    }
  }

  /** 重新加载标签表（删除标签 / 导入自动新建后调用） */
  const refreshTags = async () => {
    try {
      setAllTags(await listTags())
    } catch (e) {
      /* 标签加载失败不影响列表 */
    }
  }

  useEffect(() => {
    ;(async () => {
      await refresh()
      try {
        await ensurePresetTags()
      } catch (e) {
        /* 种子失败不影响列表 */
      }
      refreshTags()
    })()
  }, [])

  /** 删除标签：弹窗确认后统一从所有卦例的 tags 中移除该标签名（Bug #10）；
 *  勾选「不再提醒」后下次直接删除；也支持预设标签种子的再次提醒（清除记忆后再次弹窗）。 */
  const TAG_DELETE_KEY = 'tag-delete'
  const handleDeleteTag = (tag) => {
    if (isNoRemind(TAG_DELETE_KEY)) {
      doDeleteTag(tag)
    } else {
      setPendingDeleteTag(tag)
    }
  }
  const doDeleteTag = async (tag) => {
    try {
      const res = await deleteTag(tag.id)
      setUrlTags(urlTags.filter((n) => n !== tag.name))
      setMsg(`已删除标签「${tag.name}」${res.removedFromGuashi ? `，并从 ${res.removedFromGuashi} 条卦例中移除该标签` : '（无卦例使用）'}`)
      setError('')
      refreshTags()
      refresh()
    } catch (e) {
      setError('删除标签失败：' + e.message)
    }
  }
  const confirmDeleteTag = (remember) => {
    if (remember) {
      try { localStorage.setItem(`liuyao-noremind-${TAG_DELETE_KEY}`, '1') } catch (_) { /* 静默 */ }
    }
    const tag = pendingDeleteTag
    setPendingDeleteTag(null)
    if (tag) doDeleteTag(tag)
  }

  /** 筛选后的展示列表（v0.10 建议3 #7 + 建议4 #5 #8 + 建议5 #4 + 改进建8 #2 #3 + 追加修复）；
 *  - tag 多选：默认「任一命中」；严格筛选（strict=1）时须「全部命中」；用户排序优先，标签命中数作为次级排序
 *  - v0.10 改进建8 #2 新口径互斥单组：
 *      待占断 = jixiong 未选（'' 或缺失）；未反馈 = jixiong 非空 且 status 未反馈；
 *      已反馈 = status 已反馈；三者互斥（选中一个自动取消其他）
 *  - fed 模式：jixiongOk/yingqiOk/fangweiOk 六项对错筛选
 *  - unfed 模式：jixiong(吉/凶)/yingqi(有应期)/fangwei(有方位) 四项子筛选
 *  - v0.10 改进建8 #3 排序：sort=created-desc/asc、updated-desc/asc（默认创建时间新→旧）；
 *    时间戳缺失回退（创建回退 id、最后编辑回退 createdAt），保证确定有序；
 *    追加：sort=tag-match 最符合标签 = 命中已选标签数降序（命中全部自然最前），平局按创建时间新→旧
 *  - 严格筛选（strict=1）下 sort=tag-match 已在解析层归一化为 created-desc（命中数无区分度） */
  const filtered = useMemo(() => {
    const list = records.filter((r) => {
      if (urlTags.length > 0) {
        const own = r.tags ?? []
        if (strictMode) {
          if (!urlTags.every((t) => own.includes(t))) return false // 严格：全部命中
        } else if (!urlTags.some((t) => own.includes(t))) return false // 默认：任一命中
      }
      if (statusMode === 'pending' && (hasDuanContent(r) || !!((r.fankui ?? '').trim()))) return false // 待占断 = 五者全空 且 fankui 空（已反馈不落入）
      if (statusMode === 'unfed' && (hasDuanContent(r) ? !!((r.fankui ?? '').trim()) : true)) return false // 待反馈 = 五者任一非空 且 fankui 空
      if (statusMode === 'fed' && !(r.fankui ?? '').trim()) return false // 已反馈 = fankui 非空
      if (statusMode === 'fed') {
        // v1.3.0：对错筛选全部多选（重复参数，同维度=或）：选中项数组非空时，记录值须命中其一
        if (jixiongOkFilter.length && !jixiongOkFilter.includes(r.jixiongOk)) return false
        if (yingqiOkFilter.length && !yingqiOkFilter.includes(r.yingqiOk)) return false
        if (fangweiOkFilter.length && !fangweiOkFilter.includes(r.fangweiOk)) return false
        if (quShuFbFilter.length && !quShuFbFilter.includes(r.quShuFb)) return false
        // v1.3.0 严格反馈：未勾选维度的反馈值须全空（已反馈维度集合恰好等于勾选维度集合）
        if (strictFbMode) {
          const extraFilled =
            (!jixiongOkFilter.length && (r.jixiongOk ?? '') !== '') ||
            (!yingqiOkFilter.length && (r.yingqiOk ?? '') !== '') ||
            (!fangweiOkFilter.length && (r.fangweiOk ?? '') !== '') ||
            (!quShuFbFilter.length && (r.quShuFb ?? '') !== '')
          if (extraFilled) return false
        }
      }
      if (statusMode === 'unfed') {
        // v1.3.0：吉/凶 可同选=或；应期/方位/取数为「有无」开关
        if (jixiongFilter.length && !jixiongFilter.includes(r.jixiong)) return false
        if (yingqiHasFilter && !(r.yingqi ?? '').trim()) return false
        if (fangweiHasFilter && !(r.fangwei ?? '').trim()) return false
        if (quShuHasFilter && !(r.quShu ?? '').trim()) return false // v1.3.0 取数子筛选
      }
      const kw = keyword.trim()
      if (kw && !(r.title ?? '').includes(kw) && !(r.duanyu ?? '').includes(kw)) return false
      // 创建时间范围（from 当天 00:00 起、to 当天 23:59:59.999 止，含起止当天）；
      // createdAt 缺失时回退 id（与排序口径一致，保证确定有序）
      const createTs = typeof r.createdAt === 'number' && Number.isFinite(r.createdAt) ? r.createdAt : (r.id ?? 0)
      if (fromDate) {
        const fromMs = new Date(`${fromDate}T00:00:00`).getTime()
        if (Number.isFinite(fromMs) && createTs < fromMs) return false
      }
      if (toDate) {
        const toMs = new Date(`${toDate}T23:59:59.999`).getTime()
        if (Number.isFinite(toMs) && createTs > toMs) return false
      }
      return true
    })
    // 排序（v0.10 改进建8 #3）：created 回退 createdAt ?? id，updated 回退 updatedAt ?? createdAt
    const tsOf = (r, key) => {
      const v = key === 'created' ? (r.createdAt ?? r.id ?? 0) : (r.updatedAt ?? r.createdAt ?? 0)
      return typeof v === 'number' && Number.isFinite(v) ? v : 0
    }
    const hitCount = (r) => (r.tags ?? []).filter((t) => urlTags.includes(t)).length
    // 最符合标签：命中已选标签数降序（主），平局按创建时间新→旧 + id 兜底
    if (sortMode === 'tag-match') {
      return [...list].sort(
        (a, b) =>
          hitCount(b) - hitCount(a) ||
          tsOf(b, 'created') - tsOf(a, 'created') ||
          (b.id ?? 0) - (a.id ?? 0),
      )
    }
    // desc（新→旧）= 时间戳大在前（dir=1）；asc（旧→新）= 时间戳小在前（dir=-1）
    const dir = sortMode.endsWith('-asc') ? -1 : 1
    const sortKey = sortMode.startsWith('created') ? 'created' : 'updated'
    const cmp = (a, b) => (tsOf(b, sortKey) - tsOf(a, sortKey)) * dir || ((b.id ?? 0) - (a.id ?? 0)) * dir
    if (urlTags.length > 0) {
      return [...list].sort((a, b) => cmp(a, b) || hitCount(b) - hitCount(a))
    }
    return [...list].sort(cmp)
  }, [records, urlTags, strictMode, statusMode, keyword, jixiongOkFilter, yingqiOkFilter, fangweiOkFilter, quShuFbFilter, strictFbMode, jixiongFilter, yingqiHasFilter, fangweiHasFilter, quShuHasFilter, sortMode, fromDate, toDate])

  const selectedRecords = useMemo(
    () => records.filter((r) => selectedIds.includes(r.id)),
    [records, selectedIds],
  )

  /* ---------- 批量操作 ---------- */
  const toggleSelect = (id) =>
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  const toggleSelectAll = () =>
    setSelectedIds((ids) => (ids.length === filtered.length ? [] : filtered.map((r) => r.id)))

  const handleBatchExport = async () => {
    if (!selectedRecords.length) return
    setMsg(`开始导出 ${selectedRecords.length} 条卦例…`)
    setExportPath('')
    const r = await downloadGuashiBatch(selectedRecords)
    if (r && r.ok) {
      setMsg(r.message || `已导出 ${selectedRecords.length} 条 md 文件`)
      setExportPath(r.path || '')
    } else {
      setMsg((r && r.message) || `导出未完成（已取消或保存失败）`)
      setExportPath('')
    }
  }

  const handleBatchDelete = async () => {
    if (!selectedIds.length) return
    if (!window.confirm(`确定将选中的 ${selectedIds.length} 条卦例移入回收站吗？`)) return
    for (const id of selectedIds) await softDelete(id)
    setMsg(`已将 ${selectedIds.length} 条卦例移入回收站`)
    setSelectedIds([])
    refresh()
  }

  /* ---------- 单条操作 ---------- */
  const handleOpen = async (id) => {
    try {
      setError('')
      const rec = await getGuashi(id)
      if (!rec) {
        setError('该卦例不存在')
        return
      }
      // v1.3.0 Bug3：重开卡片时若有草稿（之前未保存的编辑）→ 恢复；否则正常打开
      if (!applyDraft(rec)) {
        setEditing(rec)
        setDirty(false)
        clearDraftFor(rec.id)
      }
    } catch (e) {
      setError('打开卦例失败：' + e.message)
    }
  }

  const handleExportOne = async (g) => {
    const r = await downloadGuashiMd(g)
    if (r && r.ok) {
      setMsg(r.message || `已导出「${g.title || '未命名卦例'}」`)
      setExportPath(r.path || '')
    } else {
      setMsg((r && r.message) || `导出未完成（已取消或保存失败）`)
      setExportPath('')
    }
  }

  const handleDeleteOne = async (g) => {
    if (!window.confirm(`确定将「${g.title || '未命名卦例'}」移入回收站吗？`)) return
    await softDelete(g.id)
    setMsg('已移入回收站')
    if (editing?.id === g.id) backToList()
    setSelectedIds((ids) => ids.filter((x) => x !== g.id))
    refresh()
  }

  /* ---------- 编辑保存（updateGuashi 覆盖，不新建） ---------- */
  const handleSaveEdit = async () => {
    const rec = editing
    // v1.3.0 保存校验（方案 a 唯一硬校验）：已反馈必须四者（吉凶/应期/方位/取数反馈）≥1，含存量拦截
    const fbErr = validateDuanSave(rec)
    if (fbErr) {
      setError(fbErr)
      return false
    }
    try {
      setError('')
      // v0.2 功能 I：用神变化时重排后的盘面一并落库（panRes 与展示一致；用神未变化时 panRes.pan 即原快照）
      // v0.10 #1：编辑视图涂鸦存/改 record.doodle（空涂鸦不落库）
      // v0.10 改进建7 #1：编辑视图保存画板开启状态（record.doodleOn）
      const updated = await updateGuashi({
        ...rec,
        panSnapshot: panRes?.ok ? panRes.pan : rec.panSnapshot,
        yongShen: editYongShen ?? null,
        title: (rec.title ?? '').trim() || '未命名卦例',
        doodle: editDoodle && !isEmptyDoodle(editDoodle) ? editDoodle : null,
        doodleOn: !!editDoodleEnabled,
        doodleMobile: editDoodleMobile && !isEmptyDoodle(editDoodleMobile) ? editDoodleMobile : null, // v1.2.0
        doodleMobileOn: !!editMobileDoodleEnabled,
      })
      setEditing(updated)
      setMsg('已保存修改')
      // v1.3.0：保存成功 → 清草稿 + 重置脏标记（未保存修改已落库）
      setDirty(false)
      clearDraft()
      refresh()
      return true
    } catch (e) {
      setError('保存失败：' + e.message)
      return false
    }
  }

  /* ---------- 导入 md ---------- */
  const handleImportFiles = async (e) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    const ok = []
    const fail = []
    const mdTags = [] // md 里出现过的标签名，导入后统一补建
    for (const f of files) {
      try {
        const text = await f.text()
        const res = mdToGuashi(text)
        if (!res.ok) {
          fail.push({ name: f.name, error: res.error })
          continue
        }
        await addGuashi(res.guashi)
        mdTags.push(...(Array.isArray(res.guashi.tags) ? res.guashi.tags : []))
        ok.push(f.name)
      } catch (err) {
        fail.push({ name: f.name, error: err.message })
      }
    }
    // md 里的标签若库中不存在则自动新建（卦例库筛选栏与占断界面随即可用）
    let created = []
    try {
      created = await ensureTags(mdTags)
      if (created.length) refreshTags()
    } catch (e) {
      /* 标签补建失败不影响卦例导入 */
    }
    setImportResult({ ok: ok.length, fail })
    setMsg(
      ok.length
        ? `成功导入 ${ok.length} 条卦例` +
            (created.length
              ? `，自动新建 ${created.length} 个标签：${created.map((t) => t.name).join('、')}`
              : '')
        : '',
    )
    setError('')
    e.target.value = '' // 允许重复选择同一文件
    refresh()
  }

  const clearFilters = () => {
    setKeyword('')
    // 清空 URL 全部筛选（status / 已反馈六项对错 / 未反馈四项子项 / 标签 tags / 严格 strict / 时间 from,to / 排序 sort），v0.10 建议5 #5 + 追加修复
    setSearchParams({}, { replace: true })
  }

  // 盘面解析（v0.2 功能 I）：快照优先；编辑视图中自定用神变化时按 method/params 重排
  // v0.10 #16：重排时携带当前盘面标记设置（markers 随设置重算，修复导入丢失增强显示）
  const panRes = useMemo(
    () => (editing ? resolvePan(editing, { yongShen: editYongShen, markers: markerSettings }) : null),
    [editing, editYongShen, markerSettings],
  )

  return (
    <div className="space-y-5">
      {/* 顶栏 */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-medium text-gold">卦例库</h1>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".md,text/markdown"
            multiple
            className="hidden"
            onChange={handleImportFiles}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-md border border-gold px-3 py-1.5 text-sm text-gold transition-colors hover:bg-goldSoft"
            title="导入 .md 卦例文件"
          >
            导入 md
          </button>
          <button
            type="button"
            onClick={() => navigate('/recycle')}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-gold/60 hover:text-gold"
          >
            回收站
          </button>
        </div>
      </div>

      {msg && <div className="break-words text-sm text-gold">{msg}</div>}
      {exportPath && <div className="mt-1 break-all text-xs text-muted">{exportPath}</div>}
      {error && <div className="break-words text-sm text-red">{error}</div>}

      {editing ? (
        /* ============ 详情 / 编辑视图 ============ */
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-base font-medium text-gold">编辑卦例</h2>
            <span className="text-xs text-muted">
              {METHOD_NAME[editing.method] ?? editing.method} · {editing.date || '—'}
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleBackClick} // v1.3.0 Bug2：有未保存修改时弹窗提示是否保存
                className="rounded-md border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:text-text"
              >
                ← 返回列表
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="rounded-md bg-gold px-4 py-1.5 text-sm font-medium text-black transition-colors hover:opacity-90"
              >
                保存修改
              </button>
            </div>
          </div>

          {/* v0.2 功能 G：编辑视图双栏——盘面左、占断右；≥lg 两栏，<lg 单列堆叠。
              2026-08-10：左列固定 672px（= PanView max-w-2xl，与排盘页容器等宽），
              否则 grid-cols-2 时左列 ≈ 595px，与排盘页 672 容器不同 → 画板内容相对盘面位置偏移。
              右列 min-w-0 占断面板自适应+内部滚动。 */}
          <div className="grid gap-5 lg:grid-cols-[672px_minmax(0,1fr)]">
            {/* 左：盘面 + 自定用神（v0.2 功能 I；v0.10 编辑视图画板开关） */}
            <div className="space-y-4">
              {panRes?.ok ? (
              <PanView
                pan={panRes.pan}
                doodle={editDoodle}
                doodleEnabled={editDoodleEnabled}
                onDoodleChange={(d) => { markDirty(); setEditDoodle(d) }}
                onDoodleToggle={handleEditDoodleToggle}
                doodleMobile={editDoodleMobile}
                mobileDoodleEnabled={editMobileDoodleEnabled}
                onMobileDoodleChange={(d) => { markDirty(); setEditDoodleMobile(d) }}
                onMobileDoodleToggle={handleEditMobileDoodleToggle}
              />
              ) : (
                panRes && (
                  <div className="rounded-xl border border-red/40 bg-red/10 p-3 text-sm text-red">
                    盘面加载失败：{panRes.error}（该卦例无盘面快照，且无法按起卦参数重新排盘）
                  </div>
                )
              )}
              <YongShenSelector value={editYongShen} onChange={(v) => { markDirty(); setEditYongShen(v) }} />
            </div>

            {/* 右：占断编辑 */}
            <section className="card rounded-xl border border-border bg-panel p-4 sm:p-5">
              <h3 className="mb-4 text-base font-medium text-gold">占断</h3>

              <div className="mb-4">
                <div className="mb-1.5 text-sm text-muted">占问内容（卦题）</div>
                <input
                  value={editing.title ?? ''}
                  onChange={(e) => { markDirty(); setEditing({ ...editing, title: e.target.value }) }}
                  placeholder="占问内容"
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors focus:border-gold"
                />
              </div>

              <DuanInput
                value={duanOf(editing)}
                onChange={(d) => { markDirty(); setEditing({ ...editing, ...d }) }}
              />

              <div className="mt-4">
                <div className="mb-1.5 text-sm text-muted">标签</div>
                <TagEditor
                  selected={Array.isArray(editing.tags) ? editing.tags : []}
                  onChange={(tags) => { markDirty(); setEditing({ ...editing, tags }) }}
                />
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="rounded-md bg-gold px-5 py-2 text-sm font-medium text-black transition-colors hover:opacity-90"
                >
                  保存修改
                </button>
                <button
                  type="button"
                  onClick={() => handleExportOne(editing)}
                  className="rounded-md border border-gold px-5 py-2 text-sm text-gold transition-colors hover:bg-goldSoft"
                >
                  导出 md
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteOne(editing)}
                  className="rounded-md border border-red/60 px-5 py-2 text-sm text-red transition-colors hover:bg-red/10"
                >
                  删除
                </button>
              </div>

              {error && <div className="mt-3 text-sm text-red">{error}</div>}
              {msg && <div className="mt-3 text-sm text-gold">{msg}</div>}
            </section>
          </div>

          {/* v1.3.0 Bug2：未保存修改返回提示（三选：保存并返回 / 不保存返回 / 取消） */}
          {confirmBack && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
              onClick={(e) => { if (e.target === e.currentTarget) setConfirmBack(false) }}
            >
              <div className="w-full max-w-sm rounded-xl border border-border bg-panel p-5 shadow-2xl">
                <h3 className="mb-3 text-base font-medium text-gold">有未保存的修改</h3>
                <p className="mb-4 whitespace-pre-line text-sm text-text">
                  卦例的修改尚未保存，返回列表将丢失这些修改。
                </p>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmBack(false)}
                    className="rounded-md border border-border px-4 py-1.5 text-sm text-muted transition-colors hover:text-text"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={doBack}
                    className="rounded-md border border-red/60 px-4 py-1.5 text-sm text-red transition-colors hover:bg-red/10"
                  >
                    不保存返回
                  </button>
                  <button
                    type="button"
                    onClick={handleBackSave}
                    className="rounded-md bg-gold px-4 py-1.5 text-sm font-medium text-black transition-colors hover:opacity-90"
                  >
                    保存并返回
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      ) : (
        /* ============ 列表视图 ============ */
        <>
          {/* 筛选栏（v0.10 建议5 #5：筛选行在标签行上面） */}
          <section className="space-y-3 card rounded-xl border border-border bg-panel p-4">
            {/* 筛选行：状态 + 已反馈六项对错 / 未反馈四项子筛选 + 搜索 */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-10 shrink-0 text-sm text-muted">筛选</span>
              {/* 主筛选单选组（v0.10 改进建8 #2：全部/待占断/未反馈/已反馈 互斥，选中一个自动取消其他） */}
              {[
                { mode: 'all', label: '全部' },
                { mode: 'pending', label: '待占断' },
                { mode: 'unfed', label: '待反馈' }, // v1.3.0 文案：未反馈→待反馈（只改展示，URL status=unfed 保留）
                { mode: 'fed', label: '已反馈' },
              ].map(({ mode, label }) => {
                const on = statusMode === mode
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setStatusMode(mode)}
                    className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                      on
                        ? 'border-gold bg-goldSoft text-gold'
                        : 'border-border text-muted hover:text-text'
                    }`}
                    title={
                      mode === 'pending'
                        ? '只显示尚无占断内容（断语/应期/方位/取数/吉凶 全空）的卦例'
                        : mode === 'unfed'
                          ? '只显示已断待反馈（有占断内容但未填写反馈）的卦例'
                          : mode === 'fed'
                            ? '只显示已反馈（反馈文本非空）的卦例'
                            : '清除筛选'
                    }
                  >
                    {label}
                  </button>
                )
              })}
              {/* 已反馈展开后的对错筛选（v0.10 建议4 #8；v1.3.0 全部多选=同维度或，对+错可同选） */}
              {statusMode === 'fed' && (
                <>
                  <span className="ml-2 w-10 shrink-0 text-xs text-muted">对错</span>
                  {[
                    { key: 'jixiongOk', label: '吉凶' },
                    { key: 'yingqiOk', label: '应期' },
                    { key: 'fangweiOk', label: '方位' },
                  ].flatMap((g) => [
                    { dim: g.key, val: '对', label: `${g.label}对`, color: 'gold' },
                    { dim: g.key, val: '错', label: `${g.label}错`, color: 'red' },
                  ]).map((opt) => {
                    const active = searchParams.getAll(opt.dim).includes(opt.val)
                    return (
                      <button
                        key={`${opt.dim}-${opt.val}`}
                        type="button"
                        onClick={() => toggleMultiFilter(opt.dim, opt.val)}
                        title={active ? '取消筛选' : '筛选（可与同维度其他项叠加）'}
                        className={`rounded-md border px-2 py-0.5 text-xs transition-colors ${
                          active
                            ? opt.color === 'gold'
                              ? 'border-gold bg-goldSoft text-gold'
                              : 'border-red bg-red/10 text-red'
                            : 'border-border text-muted hover:text-text'
                        }`}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                  {/* v1.3.0 取数反馈三档（神准/相近/错），与统计页取数卡跳转 /lib?status=fed&quShuFb= 配套；
                      支持多选（重复参数，同维度=或：神准+相近 可同时选中） */}
                  {[
                    { dim: 'quShuFb', val: '神准', label: '取数神准', color: 'gold' },
                    { dim: 'quShuFb', val: '相近', label: '取数相近', color: 'muted' },
                    { dim: 'quShuFb', val: '错', label: '取数错', color: 'red' },
                  ].map((opt) => {
                    const active = searchParams.getAll(opt.dim).includes(opt.val)
                    return (
                      <button
                        key={`${opt.dim}-${opt.val}`}
                        type="button"
                        onClick={() => toggleMultiFilter(opt.dim, opt.val)}
                        title={active ? '取消筛选' : '筛选（可与同维度其他项叠加）'}
                        className={`rounded-md border px-2 py-0.5 text-xs transition-colors ${
                          active
                            ? opt.color === 'gold'
                              ? 'border-gold bg-goldSoft text-gold'
                              : opt.color === 'red'
                                ? 'border-red bg-red/10 text-red'
                                : 'border-border bg-goldSoft text-gold'
                            : 'border-border text-muted hover:text-text'
                        }`}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                  {/* v1.3.0 严格反馈开关：只看反馈维度恰好等于所选维度的卦例（未勾选维度无反馈）；无对错勾选时禁用 */}
                  <label
                    className={`flex shrink-0 items-center gap-1.5 text-xs ${
                      jixiongOkFilter.length || yingqiOkFilter.length || fangweiOkFilter.length || quShuFbFilter.length
                        ? 'cursor-pointer text-muted hover:text-text'
                        : 'cursor-not-allowed text-muted opacity-50'
                    }`}
                    title={
                      jixiongOkFilter.length || yingqiOkFilter.length || fangweiOkFilter.length || quShuFbFilter.length
                        ? '勾选后只看反馈维度恰好等于所选维度的卦例（其他维度无反馈记录）'
                        : '需先勾选至少一个对错/取数反馈项'
                    }
                  >
                    <input
                      type="checkbox"
                      checked={strictFbMode}
                      disabled={!jixiongOkFilter.length && !yingqiOkFilter.length && !fangweiOkFilter.length && !quShuFbFilter.length}
                      onChange={(e) => setFilter('strictFb', e.target.checked ? '1' : '')}
                      className="h-3.5 w-3.5"
                      style={{ accentColor: 'var(--gold)' }}
                    />
                    严格反馈
                  </label>
                </>
              )}
              {/* 待反馈展开后的子筛选：吉/凶（可同选=或）/应期/方位/取数（v0.10 建议5 #4；v1.3.0 吉凶改多选、追加取数） */}
              {statusMode === 'unfed' && (
                <>
                  <span className="ml-2 w-10 shrink-0 text-xs text-muted">子项</span>
                  {[
                    { key: 'jixiong', val: '吉', label: '吉', color: 'gold' },
                    { key: 'jixiong', val: '凶', label: '凶', color: 'red' },
                    { key: 'yingqi', val: '1', label: '应期', color: 'gold' },
                    { key: 'fangwei', val: '1', label: '方位', color: 'gold' },
                    { key: 'quShu', val: '1', label: '取数', color: 'gold' }, // v1.3.0：有取数文本的待反馈卦例
                  ].map((opt) => {
                    // 吉/凶 多选（同维度=或）；应期/方位/取数 为「有无」开关（单值）
                    const isMulti = opt.key === 'jixiong'
                    const active = isMulti
                      ? searchParams.getAll(opt.key).includes(opt.val)
                      : searchParams.get(opt.key) === opt.val
                    return (
                      <button
                        key={`${opt.key}-${opt.val}`}
                        type="button"
                        onClick={() => (isMulti ? toggleMultiFilter(opt.key, opt.val) : setFilter(opt.key, active ? '' : opt.val))}
                        title={active ? '取消筛选' : isMulti ? '筛选（可与同维度其他项叠加）' : '筛选'}
                        className={`rounded-md border px-2 py-0.5 text-xs transition-colors ${
                          active
                            ? opt.color === 'gold'
                              ? 'border-gold bg-goldSoft text-gold'
                              : 'border-red bg-red/10 text-red'
                            : 'border-border text-muted hover:text-text'
                        }`}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </>
              )}
              {/* 创建时间范围（新历 起止日期，含当天；URL from=/to=，统计页跳转可携带） */}
              <span className="ml-2 w-10 shrink-0 text-xs text-muted">时间</span>
              <input
                type="date"
                value={fromDate}
                max={toDate || undefined}
                onChange={(e) => setFilter('from', e.target.value)}
                title="创建时间范围：开始日期"
                className="rounded-md border border-border bg-bg px-2 py-1 text-xs text-text outline-none transition-colors focus:border-gold"
              />
              <span className="text-xs text-muted">至</span>
              <input
                type="date"
                value={toDate}
                min={fromDate || undefined}
                onChange={(e) => setFilter('to', e.target.value)}
                title="创建时间范围：结束日期"
                className="rounded-md border border-border bg-bg px-2 py-1 text-xs text-text outline-none transition-colors focus:border-gold"
              />
              {(fromDate || toDate) && (
                <button
                  type="button"
                  onClick={() => {
                    // 一次调用同时删 from/to（两次 setFilter 会基于同一旧闭包，后一次把前一次覆盖回去）
                    const next = new URLSearchParams(searchParams)
                    next.delete('from')
                    next.delete('to')
                    setSearchParams(next, { replace: true })
                  }}
                  className="rounded-md border border-border px-2 py-0.5 text-xs text-muted transition-colors hover:text-text"
                  title="清除时间筛选"
                >
                  清除时间
                </button>
              )}
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索标题或断语…"
                className="ml-auto w-full max-w-xs rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-text outline-none transition-colors focus:border-gold"
              />
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-md border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-gold/60 hover:text-gold"
                title="清除全部筛选条件（状态/标签/严格/时间/搜索/排序）"
              >
                清空筛选
              </button>
            </div>
            {/* 标签行（v0.10 建议5 #5：移到筛选行下面）；标签走 URL 单一真相源，点选=增删 URL tags= 参数 */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-10 shrink-0 text-sm text-muted">标签</span>
              {allTags.map((t) => {
                const on = urlTags.includes(t.name)
                return (
                  <span
                    key={t.id}
                    className="flex items-center gap-1 rounded-full border py-1 pl-3 pr-1.5 text-sm transition-colors"
                    style={{
                      borderColor: on ? t.color : 'var(--border)',
                      color: on ? t.color : 'var(--muted)',
                      background: on ? t.color + '1f' : 'transparent',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setUrlTags(on ? urlTags.filter((x) => x !== t.name) : [...urlTags, t.name])
                      }
                      className="flex items-center gap-1.5"
                      style={{ color: 'inherit' }}
                      title={on ? '取消筛选' : '按此标签筛选'}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />
                      {t.name}
                      {on && <span className="text-xs">✓</span>}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTag(t)}
                      className="ml-0.5 rounded-full px-1 text-xs leading-none text-muted transition-colors hover:bg-red/10 hover:text-red"
                      title={`删除标签「${t.name}」（同时从卦例移除）`}
                      aria-label={`删除标签 ${t.name}`}
                    >
                      ×
                    </button>
                  </span>
                )
              })}
              {/* 严格筛选（全部命中）：<2 标签时禁用但状态保留（1 个标签时全部命中=任一命中，结果等价） */}
              <label
                className={`ml-auto flex shrink-0 items-center gap-1.5 text-xs ${
                  urlTags.length < 2
                    ? 'cursor-not-allowed text-muted opacity-50'
                    : 'cursor-pointer text-muted hover:text-text'
                }`}
                title={urlTags.length < 2 ? '严格筛选需选择两个或以上标签' : '勾选后只显示命中全部所选标签的卦例'}
              >
                <input
                  type="checkbox"
                  checked={strictMode}
                  disabled={urlTags.length < 2}
                  onChange={(e) => setStrict(e.target.checked)}
                  className="h-3.5 w-3.5"
                  style={{ accentColor: 'var(--gold)' }}
                />
                严格筛选
              </label>
              {/* 新增标签（v0.10 建议4 #3）：与排盘占断页 TagEditor 共用 tags 表 */}
              <AddTagInline onAdded={(t) => { refreshTags(); setMsg(`已新增标签「${t.name}」`); setError(''); }} />
            </div>
          </section>

          {/* 批量工具栏 */}
          {records.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <button
                type="button"
                onClick={toggleSelectAll}
                className="rounded-md border border-border px-3 py-1 text-muted transition-colors hover:text-text"
              >
                {selectedIds.length === filtered.length && filtered.length > 0 ? '取消全选' : '全选'}
              </button>
              <span className="text-xs text-muted">
                共 {filtered.length} 条，已选 {selectedIds.length} 条
              </span>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {/* 排序选择器（v0.10 改进建8 #3）：创建/最后编辑 新→旧/旧→新 + 最符合标签（命中数降序），URL sort= 持久 */}
                <label className="flex items-center gap-1.5 text-xs text-muted">
                  排序
                  <select
                    value={sortMode}
                    onChange={(e) => setFilter('sort', e.target.value)}
                    className="rounded-md border border-border bg-bg px-2 py-1 text-sm text-text outline-none focus:border-gold"
                  >
                    <option value="created-desc">创建时间 新→旧</option>
                    <option value="created-asc">创建时间 旧→新</option>
                    <option value="updated-desc">最后编辑 新→旧</option>
                    <option value="updated-asc">最后编辑 旧→新</option>
                    <option value="tag-match" disabled={urlTags.length < 2} title={urlTags.length < 2 ? '请选择两个或以上标签' : '命中已选标签数多的排前面'}>
                      最符合标签
                    </option>
                  </select>
                </label>
                {sortMode === 'tag-match' && urlTags.length < 2 && (
                  <span className="text-xs text-muted">「最符合标签」需选择两个或以上标签</span>
                )}
                <button
                  type="button"
                  onClick={handleBatchExport}
                  disabled={!selectedIds.length}
                  className={`rounded-md border px-3 py-1 transition-colors ${
                    selectedIds.length
                      ? 'border-gold text-gold hover:bg-goldSoft'
                      : 'cursor-not-allowed border-border text-muted opacity-50'
                  }`}
                >
                  批量导出 md
                </button>
                <button
                  type="button"
                  onClick={handleBatchDelete}
                  disabled={!selectedIds.length}
                  className={`rounded-md border px-3 py-1 transition-colors ${
                    selectedIds.length
                      ? 'border-red/60 text-red hover:bg-red/10'
                      : 'cursor-not-allowed border-border text-muted opacity-50'
                  }`}
                >
                  批量删除
                </button>
              </div>
            </div>
          )}

          {/* 卡片列表 / 空态 */}
          {filtered.length === 0 ? (
            <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-panelHalf p-8 text-center">
              <p className="text-sm text-muted">
                {records.length === 0
                  ? '卦例库空空如也，先去排盘页起一卦并保存吧'
                  : '没有符合当前筛选条件的卦例'}
              </p>
              {records.length === 0 ? (
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="rounded-md border border-gold px-4 py-2 text-sm text-gold transition-colors hover:bg-goldSoft"
                >
                  去排盘
                </button>
              ) : (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-md border border-border px-4 py-2 text-sm text-muted transition-colors hover:text-text"
                >
                  清除筛选
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((g) => (
                <GuashiCard
                  key={g.id}
                  guashi={g}
                  tagColors={tagColors}
                  selectable
                  selected={selectedIds.includes(g.id)}
                  onToggleSelect={toggleSelect}
                  onOpen={handleOpen}
                  onExport={handleExportOne}
                  onDelete={handleDeleteOne}
                />
              ))}
            </div>
          )}

          {/* 导入结果清单 */}
          {importResult && (
            <section className="card rounded-xl border border-border bg-panel p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gold">
                  导入完成：成功 {importResult.ok} 条，失败 {importResult.fail.length} 条
                </span>
                <button
                  type="button"
                  onClick={() => setImportResult(null)}
                  className="text-muted transition-colors hover:text-text"
                >
                  关闭
                </button>
              </div>
              {importResult.fail.length > 0 && (
                <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border bg-bg p-3 text-xs text-muted">
                  {importResult.fail.map((f, i) => (
                    <li key={i}>
                      「{f.name}」导入失败：{f.error}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}

      {/* 删除标签确认弹窗 */}
      <ConfirmDialog
        open={!!pendingDeleteTag}
        title="删除标签"
        message={
          pendingDeleteTag
            ? `删除标签「${pendingDeleteTag.name}」？\n将同时从所有卦例中移除该标签名（不可撤销）。`
            : ''
        }
        confirmLabel="删除"
        cancelLabel="取消"
        noRemindStorageKey="tag-delete"
        onConfirm={confirmDeleteTag}
        onCancel={() => setPendingDeleteTag(null)}
      />
    </div>
  )
}
