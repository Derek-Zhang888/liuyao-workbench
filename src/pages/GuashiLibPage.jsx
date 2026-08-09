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
import DuanInput from '../components/DuanInput.jsx'
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
    duanyu: rec.duanyu ?? '',
    yingqi: rec.yingqi ?? '',
    beizhu: rec.beizhu ?? '',
    fankui: rec.fankui ?? '',
    fangwei: rec.fangwei ?? '',
    jixiong: rec.jixiong ?? '',
    status: rec.status ?? '未反馈',
    jixiongOk: rec.jixiongOk ?? '',
    yingqiOk: rec.yingqiOk ?? '',
    fangweiOk: rec.fangweiOk ?? '',
  }
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
  // 已反馈展开后的六项对错筛选（仅 fed 模式生效）
  const jixiongOkFilter = searchParams.get('jixiongOk') || ''
  const yingqiOkFilter = searchParams.get('yingqiOk') || ''
  const fangweiOkFilter = searchParams.get('fangweiOk') || ''
  // 未反馈展开后的子筛选（仅 unfed 模式生效）：jixiong=吉/凶、yingqi=1（有应期）、fangwei=1（有方位）
  const jixiongFilter = searchParams.get('jixiong') || ''
  const yingqiHasFilter = searchParams.get('yingqi') === '1'
  const fangweiHasFilter = searchParams.get('fangwei') === '1'
  // v0.10 改进建8 #3 排序：URL sort= 参数（created-desc 默认 / created-asc / updated-desc / updated-asc）
  const sortMode = searchParams.get('sort') || 'created-desc'
  // 创建时间范围筛选（YYYY-MM-DD，from/to 均含起止当天；URL 参数，统计页跳转可携带）
  const fromDate = searchParams.get('from') || ''
  const toDate = searchParams.get('to') || ''
  // URL 标签参数（v0.2 功能 J）：统计页跳转带 tags= 重复参数（tag 名可含逗号，故不用逗号拼接）
  const urlTags = useMemo(() => searchParams.getAll('tags').filter(Boolean), [searchParams])
  /** 设置单个 URL 参数（空值移除，保持 URL 干净） */
  const setFilter = (key, value) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next, { replace: true })
  }
  /** v0.10 改进建8 #2：主筛选单选组切换。选中一个自动取消其他（互斥）；
   *  切换时清空子筛选（对错/子项），避免跨组残留；「全部」清除筛选。 */
  const setStatusMode = (mode) => {
    const next = new URLSearchParams(searchParams)
    next.delete('pending') // 旧参数一并清理
    if (mode === 'all') {
      for (const k of ['status', 'jixiongOk', 'yingqiOk', 'fangweiOk', 'jixiong', 'yingqi', 'fangwei']) next.delete(k)
    } else {
      next.set('status', mode)
      for (const k of ['jixiongOk', 'yingqiOk', 'fangweiOk', 'jixiong', 'yingqi', 'fangwei']) next.delete(k)
    }
    setSearchParams(next, { replace: true })
  }

  const [records, setRecords] = useState([])
  const [allTags, setAllTags] = useState([])
  const [selTags, setSelTags] = useState([])
  const [keyword, setKeyword] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [editing, setEditing] = useState(null) // 详情/编辑中的卦例记录（null = 列表态）
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [importResult, setImportResult] = useState(null) // {ok, fail:[{name,error}]}
  const [pendingDeleteTag, setPendingDeleteTag] = useState(null) // 待确认删除的标签

  // —— 会话级状态保留（v0.10 建议5 #2 + 追加修复）：
  //    筛选（URL query + 标签 selTags）与编辑中卦例 id 存 sessionStorage，
  //    切到统计/其他页再回来时恢复；统计页跳转带 query 时以 query 为准（标签不恢复，遵循统计页规则）。
  //    会话格式 JSON：{ q: <url query string>, tags: <string[]> }
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
      if (!cur && saved) {
        if (saved.q) setSearchParams(saved.q, { replace: true })
        if (Array.isArray(saved.tags) && saved.tags.length) setSelTags(saved.tags)
        return // 恢复本帧不保存（等恢复触发的下一帧再保存）
      }
      // URL 有 query（统计页跳转/直达）：标签不恢复，仅保存当前 query
      try { sessionStorage.setItem(LIB_FILTER_KEY, JSON.stringify({ q: cur, tags: [] })) } catch (_) { /* 静默 */ }
      return
    }
    // 首次之后：每次筛选变化都保存（含用户点「全部」清空 query）
    try { sessionStorage.setItem(LIB_FILTER_KEY, JSON.stringify({ q: searchParams.toString(), tags: selTags })) } catch (_) { /* 静默 */ }
  }, [searchParams, selTags])
  // 编辑中卦例 id 持久化（v0.10 建议5 #2）：
  // - mount 时从会话恢复（异步 getGuashi）
  // - editing 非空时保存 id
  // - 用户显式返回列表（setEditing(null)）时由下方 backToList 清理会话
  useEffect(() => {
    const saved = sessionStorage.getItem(LIB_EDITING_KEY)
    if (!saved) return
    getGuashi(Number(saved))
      .then((rec) => { if (rec && !rec.deleted) setEditing(rec) })
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

  // —— v0.2 功能 J：URL tags= 参数 → 预选标签（统计页跳转联动；手动点标签不走 URL，不受影响）——
  useEffect(() => {
    if (urlTags.length > 0) setSelTags(urlTags)
  }, [urlTags])

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
  const DOODLE_ON_KEY = 'liuyao-doodle-on'
  const [editDoodle, setEditDoodle] = useState(null)
  const [editDoodleEnabled, setEditDoodleEnabled] = useState(false)
  useEffect(() => {
    const rec = editing
    setEditDoodle(rec?.doodle ?? null) // md 导入还原的涂鸦在此回填显示（可编辑）
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
    // 仅在切换卦例时重置
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id])
  /** 编辑视图画板开关：同步 state + sessionStorage（独立于排盘页） */
  const handleEditDoodleToggle = (v) => {
    setEditDoodleEnabled(v)
    try { sessionStorage.setItem(DOODLE_ON_KEY, v ? '1' : '0') } catch (_) { /* 静默 */ }
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
      setSelTags((s) => s.filter((n) => n !== tag.name))
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

  /** 筛选后的展示列表（v0.10 建议3 #7 + 建议4 #5 #8 + 建议5 #4 + 改进建8 #2 #3）；
 *  - tag 多选为「任一命中」；用户排序优先，标签命中数作为次级排序
 *  - v0.10 改进建8 #2 新口径互斥单组：
 *      待占断 = jixiong 未选（'' 或缺失）；未反馈 = jixiong 非空 且 status 未反馈；
 *      已反馈 = status 已反馈；三者互斥（选中一个自动取消其他）
 *  - fed 模式：jixiongOk/yingqiOk/fangweiOk 六项对错筛选
 *  - unfed 模式：jixiong(吉/凶)/yingqi(有应期)/fangwei(有方位) 四项子筛选
 *  - v0.10 改进建8 #3 排序：sort=created-desc/asc、updated-desc/asc（默认创建时间新→旧）；
 *    时间戳缺失回退（创建回退 id、最后编辑回退 createdAt），保证确定有序 */
  const filtered = useMemo(() => {
    const list = records.filter((r) => {
      if (selTags.length > 0 && !selTags.some((t) => (r.tags ?? []).includes(t))) return false
      if (statusMode === 'pending' && (r.jixiong ?? '') !== '') return false // 待占断 = jixiong 未选
      if (statusMode === 'unfed' && ((r.jixiong ?? '') === '' || r.status !== '未反馈')) return false // 未反馈 = jixiong 非空 且 status 未反馈
      if (statusMode === 'fed' && r.status !== '已反馈') return false // 已反馈 = status 已反馈
      if (statusMode === 'fed') {
        if (jixiongOkFilter && r.jixiongOk !== jixiongOkFilter) return false
        if (yingqiOkFilter && r.yingqiOk !== yingqiOkFilter) return false
        if (fangweiOkFilter && r.fangweiOk !== fangweiOkFilter) return false
      }
      if (statusMode === 'unfed') {
        if (jixiongFilter && r.jixiong !== jixiongFilter) return false
        if (yingqiHasFilter && !(r.yingqi ?? '').trim()) return false
        if (fangweiHasFilter && !(r.fangwei ?? '').trim()) return false
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
    // desc（新→旧）= 时间戳大在前（dir=1）；asc（旧→新）= 时间戳小在前（dir=-1）
    const dir = sortMode.endsWith('-asc') ? -1 : 1
    const sortKey = sortMode.startsWith('created') ? 'created' : 'updated'
    const cmp = (a, b) => (tsOf(b, sortKey) - tsOf(a, sortKey)) * dir || ((b.id ?? 0) - (a.id ?? 0)) * dir
    if (selTags.length > 0) {
      const hitCount = (r) => (r.tags ?? []).filter((t) => selTags.includes(t)).length
      return [...list].sort((a, b) => cmp(a, b) || hitCount(b) - hitCount(a))
    }
    return [...list].sort(cmp)
  }, [records, selTags, statusMode, keyword, jixiongOkFilter, yingqiOkFilter, fangweiOkFilter, jixiongFilter, yingqiHasFilter, fangweiHasFilter, sortMode, fromDate, toDate])

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
    const r = await downloadGuashiBatch(selectedRecords)
    if (r && r.ok) setMsg(r.message || `已导出 ${selectedRecords.length} 条 md 文件`)
    else setMsg((r && r.message) || `导出未完成（已取消或保存失败）`)
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
      setEditing(rec)
    } catch (e) {
      setError('打开卦例失败：' + e.message)
    }
  }

  const handleExportOne = async (g) => {
    const r = await downloadGuashiMd(g)
    if (r && r.ok) setMsg(r.message || `已导出「${g.title || '未命名卦例'}」`)
    else setMsg((r && r.message) || `导出未完成（已取消或保存失败）`)
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
    if (rec.status === '已反馈' && !rec.jixiongOk) {
      setError('已反馈时请选择吉凶对错（对/错/留空三选一）')
      return
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
      })
      setEditing(updated)
      setMsg('已保存修改')
      refresh()
    } catch (e) {
      setError('保存失败：' + e.message)
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
    setSelTags([])
    setKeyword('')
    // 清空 URL 全部筛选（status / 已反馈六项对错 / 未反馈四项子项），v0.10 建议5 #5
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

      {msg && <div className="text-sm text-gold">{msg}</div>}
      {error && <div className="text-sm text-red">{error}</div>}

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
                onClick={() => {
                  backToList()
                  setMsg('')
                  setError('')
                }}
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

          {/* v0.2 功能 G：编辑视图双栏——盘面左、占断右；≥lg 两栏，<lg 单列堆叠 */}
          <div className="grid gap-5 lg:grid-cols-2">
            {/* 左：盘面 + 自定用神（v0.2 功能 I；v0.10 编辑视图画板开关） */}
            <div className="space-y-4">
              {panRes?.ok ? (
                <PanView
                  pan={panRes.pan}
                  doodle={editDoodle}
                  doodleEnabled={editDoodleEnabled}
                  onDoodleChange={setEditDoodle}
                  onDoodleToggle={handleEditDoodleToggle}
                />
              ) : (
                panRes && (
                  <div className="rounded-xl border border-red/40 bg-red/10 p-3 text-sm text-red">
                    盘面加载失败：{panRes.error}（该卦例无盘面快照，且无法按起卦参数重新排盘）
                  </div>
                )
              )}
              <YongShenSelector value={editYongShen} onChange={setEditYongShen} />
            </div>

            {/* 右：占断编辑 */}
            <section className="card rounded-xl border border-border bg-panel p-4 sm:p-5">
              <h3 className="mb-4 text-base font-medium text-gold">占断</h3>

              <div className="mb-4">
                <div className="mb-1.5 text-sm text-muted">占问内容（卦题）</div>
                <input
                  value={editing.title ?? ''}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  placeholder="占问内容"
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none transition-colors focus:border-gold"
                />
              </div>

              <DuanInput
                value={duanOf(editing)}
                onChange={(d) => setEditing({ ...editing, ...d })}
              />

              <div className="mt-4">
                <div className="mb-1.5 text-sm text-muted">标签</div>
                <TagEditor
                  selected={Array.isArray(editing.tags) ? editing.tags : []}
                  onChange={(tags) => setEditing({ ...editing, tags })}
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
                { mode: 'unfed', label: '未反馈' },
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
                        ? '只显示未选吉凶（待占断）的卦例'
                        : mode === 'unfed'
                          ? '只显示已选吉凶且未反馈（已断未反馈）的卦例'
                          : mode === 'fed'
                            ? '只显示已反馈的卦例'
                            : '清除筛选'
                    }
                  >
                    {label}
                  </button>
                )
              })}
              {/* 已反馈展开后的六项对错筛选（v0.10 建议4 #8） */}
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
                    const active = searchParams.get(opt.dim) === opt.val
                    return (
                      <button
                        key={`${opt.dim}-${opt.val}`}
                        type="button"
                        onClick={() => setFilter(opt.dim, active ? '' : opt.val)}
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
              {/* 未反馈展开后的四项子筛选：吉/凶/应期/方位（v0.10 建议5 #4） */}
              {statusMode === 'unfed' && (
                <>
                  <span className="ml-2 w-10 shrink-0 text-xs text-muted">子项</span>
                  {[
                    { key: 'jixiong', val: '吉', label: '吉', color: 'gold' },
                    { key: 'jixiong', val: '凶', label: '凶', color: 'red' },
                    { key: 'yingqi', val: '1', label: '应期', color: 'gold' },
                    { key: 'fangwei', val: '1', label: '方位', color: 'gold' },
                  ].map((opt) => {
                    const active = searchParams.get(opt.key) === opt.val
                    return (
                      <button
                        key={`${opt.key}-${opt.val}`}
                        type="button"
                        onClick={() => setFilter(opt.key, active ? '' : opt.val)}
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
            </div>
            {/* 标签行（v0.10 建议5 #5：移到筛选行下面） */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-10 shrink-0 text-sm text-muted">标签</span>
              {allTags.map((t) => {
                const on = selTags.includes(t.name)
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
                        setSelTags((s) => (on ? s.filter((x) => x !== t.name) : [...s, t.name]))
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
                {/* 排序选择器（v0.10 改进建8 #3）：创建/最后编辑 新→旧/旧→新，URL sort= 持久 */}
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
                  </select>
                </label>
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
