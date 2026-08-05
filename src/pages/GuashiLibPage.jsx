/**
 * 卦例库页（Task 10）
 *
 * 功能：
 *   - 筛选栏：tag 多选（任一命中，每个 tag 带 × 删除键：只删标签本身，已保存卦例不受影响）
 *     / 反馈状态单选（全部/未反馈/已反馈）/ 关键字搜索（标题/断语）
 *   - 卡片列表（GuashiCard，多选批量操作）：点击打开详情/编辑
 *   - 详情/编辑：复用 PanView/DuanInput/TagEditor；盘面用 panSnapshot 优先，无快照按
 *     method/params 重新排盘；保存用 updateGuashi（按 id 覆盖，不新建记录）
 *   - 单条：导出 md（下载）/ 删除（softDelete 进回收站）
 *   - 批量：勾选后「批量导出 md」（逐条下载）/「批量删除」（进回收站）
 *   - 导入：input type=file 多选 .md → mdToGuashi → addGuashi，成功/失败清单提示（含失败原因）；
 *     md 里的标签若库中不存在，导入时用 ensureTags 自动新建（筛选栏与占断界面随即可用）
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QIGUA_METHODS } from '../engine/qigua.js'
import { addGuashi, getGuashi, listGuashi, softDelete, updateGuashi } from '../db/guashiRepo.js'
import { deleteTag, ensurePresetTags, ensureTags, listTags } from '../db/tagsRepo.js'
import { mdToGuashi } from '../md/importMd.js'
import PanView from '../components/PanView.jsx'
import DuanInput from '../components/DuanInput.jsx'
import TagEditor from '../components/TagEditor.jsx'
import GuashiCard from '../components/GuashiCard.jsx'
import ConfirmDialog, { isNoRemind } from '../components/ConfirmDialog.jsx'
import { downloadGuashiBatch, downloadGuashiMd } from '../utils/exportBatch.js'
import { resolvePan } from '../utils/panResolve.js'

const METHOD_NAME = Object.fromEntries(QIGUA_METHODS.map((m) => [m.id, m.name]))
const STATUS_OPTIONS = ['全部', '未反馈', '已反馈']

/** 从记录中提取占断字段（DuanInput 的 value 结构） */
function duanOf(rec) {
  return {
    duanyu: rec.duanyu ?? '',
    yingqi: rec.yingqi ?? '',
    beizhu: rec.beizhu ?? '',
    fankui: rec.fankui ?? '',
    jixiong: rec.jixiong ?? '',
    status: rec.status ?? '未反馈',
    jixiongOk: rec.jixiongOk ?? '',
    yingqiOk: rec.yingqiOk ?? '',
    fangweiOk: rec.fangweiOk ?? '',
  }
}

export default function GuashiLibPage() {
  const navigate = useNavigate()
  const fileRef = useRef(null)

  const [records, setRecords] = useState([])
  const [allTags, setAllTags] = useState([])
  const [selTags, setSelTags] = useState([])
  const [statusFilter, setStatusFilter] = useState('全部')
  const [keyword, setKeyword] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [editing, setEditing] = useState(null) // 详情/编辑中的卦例记录（null = 列表态）
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [importResult, setImportResult] = useState(null) // {ok, fail:[{name,error}]}
  const [pendingDeleteTag, setPendingDeleteTag] = useState(null) // 待确认删除的标签

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

  /** 筛选后的展示列表（tag 多选为「任一命中」）；
 *  有标签筛选时，命中标签数越多的卦例排越前（v0.10 建议3 #7），命中数相同保持原序（新→旧） */
  const filtered = useMemo(() => {
    const list = records.filter((r) => {
      if (selTags.length > 0 && !selTags.some((t) => (r.tags ?? []).includes(t))) return false
      if (statusFilter !== '全部' && r.status !== statusFilter) return false
      const kw = keyword.trim()
      if (kw && !(r.title ?? '').includes(kw) && !(r.duanyu ?? '').includes(kw)) return false
      return true
    })
    if (selTags.length > 0) {
      const hitCount = (r) => (r.tags ?? []).filter((t) => selTags.includes(t)).length
      return [...list].sort((a, b) => hitCount(b) - hitCount(a))
    }
    return list
  }, [records, selTags, statusFilter, keyword])

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
    setMsg(`开始逐条导出 ${selectedRecords.length} 个 md 文件…（若浏览器拦截后续下载，请在下载提示中允许本站下载多个文件）`)
    await downloadGuashiBatch(selectedRecords)
    setMsg(`已导出 ${selectedRecords.length} 条 md 文件（如个别文件未下载，请允许本站下载多个文件后重试）`)
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

  const handleExportOne = (g) => {
    downloadGuashiMd(g)
    setMsg(`已导出「${g.title || '未命名卦例'}」`)
  }

  const handleDeleteOne = async (g) => {
    if (!window.confirm(`确定将「${g.title || '未命名卦例'}」移入回收站吗？`)) return
    await softDelete(g.id)
    setMsg('已移入回收站')
    if (editing?.id === g.id) setEditing(null)
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
      const updated = await updateGuashi({
        ...rec,
        title: (rec.title ?? '').trim() || '未命名卦例',
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
    setStatusFilter('全部')
    setKeyword('')
  }

  const panRes = editing ? resolvePan(editing) : null

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
                  setEditing(null)
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

          {/* 盘面：快照优先，无快照按参数重排 */}
          {panRes?.ok ? (
            <PanView pan={panRes.pan} />
          ) : (
            panRes && (
              <div className="rounded-xl border border-red/40 bg-red/10 p-3 text-sm text-red">
                盘面加载失败：{panRes.error}（该卦例无盘面快照，且无法按起卦参数重新排盘）
              </div>
            )
          )}

          {/* 占断编辑 */}
          <section className="rounded-xl border border-border bg-panel p-4 sm:p-5">
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
        </section>
      ) : (
        /* ============ 列表视图 ============ */
        <>
          {/* 筛选栏 */}
          <section className="space-y-3 rounded-xl border border-border bg-panel p-4">
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
                      title={`删除标签「${t.name}」（不影响已保存的卦例）`}
                      aria-label={`删除标签 ${t.name}`}
                    >
                      ×
                    </button>
                  </span>
                )
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-10 shrink-0 text-sm text-muted">反馈</span>
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={`rounded-md border px-3 py-1 text-sm transition-colors ${
                    statusFilter === s
                      ? 'border-gold bg-goldSoft text-gold'
                      : 'border-border text-muted hover:text-text'
                  }`}
                >
                  {s}
                </button>
              ))}
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索标题或断语…"
                className="ml-auto w-full max-w-xs rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-text outline-none transition-colors focus:border-gold"
              />
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
            <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-panel/50 p-8 text-center">
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
            <section className="rounded-xl border border-border bg-panel p-4 text-sm">
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
