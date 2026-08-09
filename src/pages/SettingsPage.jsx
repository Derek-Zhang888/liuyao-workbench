/**
 * 设置页（Task 13）
 *
 * 功能：
 *   - 回收站设置：保留天数（1-365，默认 30）→ setSetting('recycleDays')，
 *     保存时提示：回收站中删除超过该天数的卦例将在下次进入回收站时自动清理
 *   - 清空回收站：遍历彻底删除全部已删除卦例（确认弹窗）
 *   - 数据备份：
 *       · 导出：全部卦例（含回收站，保留 deleted 标记）+ 标签表 + 设置表
 *         → 打包 JSON 下载（liuyao-backup-YYYYMMDD.json）
 *       · 导入：校验格式（version + guashi 数组）→ 确认弹窗 → 覆盖导入：
 *         清空卦例表后批量写入；标签按 name 去重合并；设置覆盖
 *   - 关于：应用名 / 版本 / 说明
 */
import { useEffect, useRef, useState } from 'react'
import { openDB, reqToPromise } from '../db/index.js'
import { getSetting, setSetting } from '../db/settingsRepo.js'
import { listGuashi, purgeGuashi, replaceAllGuashi } from '../db/guashiRepo.js'
import { addTag, listTags } from '../db/tagsRepo.js'
import { MARKER_KEYS } from '../engine/panMarkers.js'
import { getTheme, setTheme } from '../utils/theme.js'
import { saveExport, JSON_FILTERS } from '../utils/exportHelper.js'
import { isDesktop, isAndroid, pickDirectory, setCloseBehavior, openExportDir } from '../utils/tauriBridge.js'
import { getDisplayMode, setDisplayMode } from '../utils/displayMode.js'

/** 与 package.json 保持一致 */
const APP_VERSION = '1.0.0'

/** 盘面标记 11 开关定义（v0.2 功能 B）：key 与 settings 表一致，默认全关 */
const MARKER_DEFS = [
  { key: 'marker-wangshuai', label: '旺相休囚死', desc: '每个爻位地支五行右上角显示小字（旺/相/休/囚/死），直读引擎旺衰，五行配色区分。' },
  { key: 'marker-yuepo', label: '显示月破', desc: '爻被月建所冲时在爻行显示「破」。' },
  { key: 'marker-ripo', label: '显示日破', desc: '爻被日建所冲（静爻休囚细分按引擎口径）时在爻行显示「破·暗」。' },
  { key: 'marker-yuehe', label: '显示月合', desc: '爻与月建六合时在爻行显示「合」。' },
  { key: 'marker-rihe', label: '显示日合', desc: '爻与日建六合时在爻行显示「合」。' },
  { key: 'marker-huitou-sheng', label: '显示动爻回头生', desc: '动爻化回头生时在爻行显示「↳生」。' },
  { key: 'marker-huitou-ke', label: '显示动爻回头克', desc: '动爻化回头克时在爻行显示「↳克」。' },
  { key: 'marker-huitou-chong', label: '显示动爻回头冲', desc: '动爻化回头冲时在爻行显示「↳冲」（本变同爻位地支相冲）。' },
  { key: 'marker-huitou-he', label: '显示动爻回头合', desc: '动爻化回头合时在爻行显示「↳合」（本变同爻位地支六合）。' },
  { key: 'marker-jintui-fanfuyin', label: '显示化进退和反伏吟', desc: '动爻化进/化退显示「进/退」；反伏吟（本变地支相冲/相同）显示「伏/反」。' },
  { key: 'marker-riyue-liuqin', label: '日月建显示六亲', desc: '月建/日建旁显示其地支五行对应卦宫六亲（按卦宫五行推算）。' },
]

/** 时间戳 → 'YYYYMMDD'（备份文件名用） */
function ymd(ts) {
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}

/** 读取设置表全部记录 [{key, value}]（settingsRepo 仅提供 get/set，此处直接走 openDB） */
async function listSettings() {
  const db = await openDB()
  return reqToPromise(db.transaction('settings').objectStore('settings').getAll())
}

export default function SettingsPage() {
  const fileRef = useRef(null)
  const [days, setDays] = useState('') // 输入框文本
  const [currentDays, setCurrentDays] = useState(30) // 已保存的值
  const [nagan, setNagan] = useState(false) // 纳干开关（功能三）
  const [markers, setMarkers] = useState({}) // 盘面标记 11 开关（v0.2 功能 B）：{key:bool}
  const [remindDup, setRemindDup] = useState(true) // v0.10 #6：重名保存提醒开关（默认开）
  const [recycleCount, setRecycleCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [tagCount, setTagCount] = useState(0)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [theme, setThemeSel] = useState(getTheme()) // 界面主题三选：light / system / dark
  const [mdExportPath, setMdExportPath] = useState('') // v1.0.1：md 导出自定义路径（Tauri）
  const [backupExportPath, setBackupExportPath] = useState('') // v1.0.1：备份导出自定义路径（Tauri）
  const [closeBehavior, setCloseBehaviorState] = useState('tray') // v1.0.1：关闭窗口行为 tray/quit（默认托盘）
  const [isDesktopEnv, setIsDesktopEnv] = useState(false) // 是否 Tauri 桌面端（Windows/macOS/Linux，不含 Android）
  const [isAndroidEnv, setIsAndroidEnv] = useState(false) // 是否 Android 端（2026-08-09：屏幕适配选项）
  const [displayMode, setDisplayModeSel] = useState(() => getDisplayMode()) // 屏幕适配：full 全面屏 / notch 刘海屏（仅 Android）
  const [lastBackup, setLastBackup] = useState(null) // v1.0.1：最近一次备份结果 {fileName, path, at, usedDefault, count, tagsCount}
  const [pathMsg, setPathMsg] = useState(null) // v1.0.1：自定义导出路径卡片内反馈 {type:'ok'|'err', text}

  /** 刷新数据概况（卦例 / 回收站 / 标签数量） */
  const refresh = async () => {
    try {
      const [normal, deleted, tags] = await Promise.all([
        listGuashi(),
        listGuashi({ deleted: true }),
        listTags(),
      ])
      setTotalCount(normal.length)
      setRecycleCount(deleted.length)
      setTagCount(tags.length)
    } catch (e) {
      setError('加载数据概况失败：' + e.message)
    }
  }

  useEffect(() => {
    ;(async () => {
      try {
        const d = (await getSetting('recycleDays')) ?? 30
        setCurrentDays(d)
        setDays(String(d))
      } catch (e) {
        setError('读取设置失败：' + e.message)
      }
      try {
        setNagan(!!(await getSetting('nagan')))
      } catch (_) { /* 纳干开关读取失败按关闭处理 */ }
      // 盘面标记 11 开关（v0.2 功能 B）：逐键读取，失败按关闭处理
      const m = {}
      for (const k of MARKER_KEYS) {
        try {
          m[k] = !!(await getSetting(k))
        } catch (_) {
          m[k] = false
        }
      }
      setMarkers(m)
      // v0.10 #6：重名保存提醒（默认开）
      try {
        setRemindDup((await getSetting('remind-duplicate-title')) ?? true)
      } catch (_) {
        setRemindDup(true)
      }
      // v1.0.1：自定义导出路径 + 关闭窗口行为（仅 Tauri 桌面端展示；Android 无目录选择/托盘能力）
      const desktop = isDesktop()
      setIsDesktopEnv(desktop)
      setIsAndroidEnv(isAndroid())
      if (desktop) {
        try {
          const md = await getSetting('export-path-md')
          if (md) setMdExportPath(md)
        } catch (_) {}
        try {
          const bk = await getSetting('export-path-backup')
          if (bk) setBackupExportPath(bk)
        } catch (_) {}
        try {
          const cb = await getSetting('close-behavior')
          setCloseBehaviorState(cb === 'quit' ? 'quit' : 'tray')
        } catch (_) {}
      }
      refresh()
    })()
  }, [])

  /* ---------- 界面主题三选（玄穹方案） ---------- */
  const handleTheme = (v) => {
    setThemeSel(v)
    setTheme(v)
    setMsg(v === 'system' ? '已切换为跟随系统：界面将随系统深浅色自动切换' : `已切换为${v === 'dark' ? '深色' : '浅色'}主题`)
    setError('')
  }

  /* ---------- 回收站保留天数 ---------- */
  const handleSaveDays = async () => {
    const n = Number(days)
    if (!Number.isInteger(n) || n < 1 || n > 365) {
      setError('保留天数须为 1-365 的整数')
      setMsg('')
      return
    }
    try {
      await setSetting('recycleDays', n)
      setCurrentDays(n)
      setMsg(`已保存：回收站中删除超过 ${n} 天的卦例将在下次进入回收站时自动清理`)
      setError('')
    } catch (e) {
      setError('保存失败：' + e.message)
    }
  }

  /* ---------- 纳干开关（功能三） ---------- */
  const handleNagan = async (v) => {
    setNagan(v)
    try {
      await setSetting('nagan', v)
      setMsg(v ? '已开启纳干：新起卦盘面将在爻地支前显示天干（如「甲寅木」）' : '已关闭纳干：盘面不再显示天干')
      setError('')
    } catch (e) {
      setError('保存失败：' + e.message)
      setNagan(!v) // 保存失败回滚开关
    }
  }

  /* ---------- 盘面标记 11 开关（v0.2 功能 B） ---------- */
  const handleMarkerToggle = async (key, v) => {
    setMarkers((m) => ({ ...m, [key]: v }))
    try {
      await setSetting(key, v)
      setMsg(v ? `已开启「${MARKER_DEFS.find((d) => d.key === key)?.label ?? key}」：返回排盘页重新起卦/恢复后即时展示` : '已关闭该盘面标记')
      setError('')
    } catch (e) {
      setError('保存失败：' + e.message)
      setMarkers((m) => ({ ...m, [key]: !v })) // 保存失败回滚开关
    }
  }

  /* ---------- 重名保存提醒（v0.10 #6） ---------- */
  const handleRemindDup = async (v) => {
    setRemindDup(v)
    try {
      await setSetting('remind-duplicate-title', v)
      setMsg(v ? '已开启重名保存提醒：卦题重名时保存前会弹窗确认' : '已关闭重名保存提醒：卦题重名时直接保存（同名覆盖不弹窗）')
      setError('')
    } catch (e) {
      setError('保存失败：' + e.message)
      setRemindDup(!v) // 保存失败回滚开关
    }
  }

  /* ---------- v1.0.1：自定义导出路径（Tauri） ---------- */
  const handlePickDir = async (kind) => {
    const dir = await pickDirectory(kind === 'md' ? '选择 md 导出目录' : '选择数据备份导出目录')
    if (!dir) return
    const key = kind === 'md' ? 'export-path-md' : 'export-path-backup'
    try {
      await setSetting(key, dir)
      if (kind === 'md') setMdExportPath(dir)
      else setBackupExportPath(dir)
      setPathMsg({ type: 'ok', text: kind === 'md' ? `md 导出目录已设置：${dir}` : `数据备份导出目录已设置：${dir}` })
      setError('')
    } catch (e) {
      setPathMsg({ type: 'err', text: '保存导出目录失败：' + e.message })
    }
  }

  /* ---------- v1.0.1：打开导出目录（Rust command） ---------- */
  const handleOpenDir = async (kind) => {
    const dir = kind === 'md' ? mdExportPath : backupExportPath
    if (!dir) {
      setPathMsg({ type: 'err', text: '请先选择导出目录' })
      return
    }
    const ok = await openExportDir(dir)
    if (!ok) setPathMsg({ type: 'err', text: '打开目录失败：目录可能不存在或已被移动' })
  }

  /* ---------- v1.0.1：清除导出路径 ---------- */
  const handleClearDir = async (kind) => {
    try {
      await setSetting(kind === 'md' ? 'export-path-md' : 'export-path-backup', null)
      if (kind === 'md') setMdExportPath('')
      else setBackupExportPath('')
      setPathMsg({ type: 'ok', text: kind === 'md' ? 'md 导出目录已清除，导出时使用默认目录' : '数据备份导出目录已清除，导出时使用默认目录' })
      setError('')
    } catch (e) {
      setPathMsg({ type: 'err', text: '清除导出目录失败：' + e.message })
    }
  }

  /* ---------- v1.0.1：关闭窗口行为（Tauri 桌面端） ---------- */
  const handleCloseBehavior = async (v) => {
    setCloseBehaviorState(v)
    try {
      await setSetting('close-behavior', v)
      await setCloseBehavior(v === 'tray')
      setMsg(v === 'tray' ? '已设为最小化到托盘：关闭窗口后应用在系统托盘继续运行' : '已设为直接退出：关闭窗口即退出应用')
      setError('')
    } catch (e) {
      setError('保存关闭行为失败：' + e.message)
    }
  }

  /* ---------- 2026-08-09：屏幕适配（仅 Android）全面屏/刘海屏 ---------- */
  const handleDisplayMode = (mode) => {
    setDisplayModeSel(mode)
    setDisplayMode(mode)
    setMsg(mode === 'notch' ? '已切换为刘海屏模式：应用界面避开状态栏（刘海）区域' : '已切换为全面屏模式：应用界面延伸至屏幕边缘（当前模式）')
    setError('')
  }

  /* ---------- 导出全部数据 ---------- */
  const handleExport = async () => {
    try {
      const [normal, deleted, tags, settings] = await Promise.all([
        listGuashi(),
        listGuashi({ deleted: true }),
        listTags(),
        listSettings(),
      ])
      const payload = {
        version: 1,
        app: '六爻工作台',
        exportedAt: new Date().toISOString(),
        guashi: [...normal, ...deleted],
        tags,
        settings,
      }
      const fileName = `liuyao-backup-${ymd(Date.now())}.json`
      const r = await saveExport('backup', fileName, JSON.stringify(payload, null, 2), 'application/json', JSON_FILTERS)
      if (r.ok) {
        // 导出成功：在「数据备份」卡片内显示，不顶置提示
        setLastBackup({
          fileName,
          path: r.path || '',
          dir: r.dir || '',
          at: Date.now(),
          usedDefault: !!r.usedDefault,
          count: payload.guashi.length,
          tagsCount: tags.length,
        })
        setMsg('')
        setError('')
      } else {
        setError(r.message)
        setMsg('')
        setLastBackup(null)
      }
    } catch (e) {
      setError('导出失败：' + e.message)
    }
  }

  /* ---------- 导入备份 ---------- */
  const handleImportFile = async (ev) => {
    const file = ev.target.files?.[0]
    ev.target.value = '' // 允许重复选择同一文件
    if (!file) return

    let data
    try {
      data = JSON.parse(await file.text())
    } catch (e) {
      setError('备份文件解析失败：不是有效的 JSON 文件')
      setMsg('')
      return
    }
    // 格式校验：必须有 version 与 guashi 数组
    if (!data || typeof data !== 'object' || data.version == null || !Array.isArray(data.guashi)) {
      setError('备份文件格式不正确：缺少 version 或 guashi 数组，无法导入')
      setMsg('')
      return
    }

    const records = data.guashi.filter((g) => g && typeof g === 'object')
    if (!window.confirm(
      `导入将覆盖现有数据：卦例库现有 ${totalCount} 条，将替换为备份中的 ${records.length} 条（回收站状态一并恢复）。标签与设置将合并/覆盖。确定继续吗？`,
    )) return

    try {
      // 1. 覆盖卦例：单事务 clear+put（replaceAllGuashi 失败自动回滚，原数据保留）
      const importedCount = await replaceAllGuashi(records)
      // 2. 标签按 name 去重合并
      const existing = new Set((await listTags()).map((t) => t.name))
      let addedTags = 0
      for (const t of Array.isArray(data.tags) ? data.tags : []) {
        if (!t || typeof t !== 'object' || !t.name) continue
        if (existing.has(t.name)) continue
        await addTag({ name: t.name, color: t.color })
        existing.add(t.name)
        addedTags++
      }
      // 3. 设置覆盖
      for (const s of Array.isArray(data.settings) ? data.settings : []) {
        if (s && typeof s === 'object' && s.key != null) await setSetting(s.key, s.value)
      }

      // 同步界面上的保留天数显示
      const d = (await getSetting('recycleDays')) ?? 30
      setCurrentDays(d)
      setDays(String(d))
      setMsg(`导入成功：${importedCount} 条卦例、${addedTags} 个新标签；设置已覆盖`)
      setError('')
      refresh()
    } catch (e) {
      setError('导入失败：' + e.message)
      refresh() // 失败后同步界面数据概况与实际库一致
    }
  }

  /* ---------- 清空回收站 ---------- */
  const handleClearRecycle = async () => {
    if (!recycleCount) return
    if (!window.confirm(`确定清空回收站吗？共 ${recycleCount} 条卦例将被彻底删除，无法恢复。`)) return
    try {
      const deleted = await listGuashi({ deleted: true })
      for (const r of deleted) await purgeGuashi(r.id)
      setMsg('回收站已清空')
      setError('')
      refresh()
    } catch (e) {
      setError('清空回收站失败：' + e.message)
    }
  }

  return (
    <div className="space-y-5">
      {/* 顶栏 */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-medium text-gold">设置</h1>
        <span className="text-xs text-muted">回收站保留天数、纳干开关与数据备份</span>
      </div>

      {msg && <div className="text-sm text-gold">{msg}</div>}
      {error && <div className="text-sm text-red">{error}</div>}

      {/* 卡片 0：界面主题（玄穹方案：浅色 / 跟随系统 / 深色） */}
      <section className="card space-y-3 rounded-xl border border-border bg-panel p-5">
        <h2 className="text-base font-medium text-gold">界面主题</h2>
        <p className="text-sm text-muted">
          玄穹深空风格，支持浅色 / 深色双模式。选择立即生效并记忆，下次打开保持。
        </p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="界面主题">
          {[
            {
              value: 'light',
              label: '浅色',
              desc: '云白纸面',
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-4 w-4">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                </svg>
              ),
            },
            {
              value: 'system',
              label: '跟随系统',
              desc: '自动深浅切换',
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <rect x="3" y="4" width="18" height="12" rx="2" />
                  <path d="M8 20h8M12 16v4" />
                </svg>
              ),
            },
            {
              value: 'dark',
              label: '深色',
              desc: '深空极光',
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
                </svg>
              ),
            },
          ].map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={theme === t.value}
              onClick={() => handleTheme(t.value)}
              className={`flex min-w-[120px] flex-1 items-center gap-2.5 rounded-lg border px-4 py-2.5 text-left text-sm transition-all ${
                theme === t.value
                  ? 'border-primary bg-primarySoft text-primary shadow-card1'
                  : 'border-border bg-panel2 text-muted hover:border-muted hover:text-text'
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${
                  theme === t.value ? 'border-primary bg-primary text-white' : 'border-border bg-panel text-muted'
                }`}
              >
                {t.icon}
              </span>
              <span>
                <span className="block font-medium">{t.label}</span>
                <span className="block text-xs opacity-75">{t.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* 卡片 1：回收站设置 */}
      <section className="card space-y-4 rounded-xl border border-border bg-panel p-5">
        <h2 className="text-base font-medium text-gold">回收站设置</h2>
        <p className="text-sm text-muted">
          卦例从卦例库删除后进入回收站，超过保留天数将在下次进入回收站时自动彻底清理。
          当前已保存：<span className="text-gold">{currentDays}</span> 天。
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="recycleDays" className="text-sm text-muted">
            保留天数
          </label>
          <input
            id="recycleDays"
            type="number"
            min="1"
            max="365"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="w-28 rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-text outline-none transition-colors focus:border-gold"
          />
          <button
            type="button"
            onClick={handleSaveDays}
            className="rounded-md border border-gold px-4 py-1.5 text-sm text-gold transition-colors hover:bg-goldSoft"
          >
            保存
          </button>
          <span className="text-xs text-muted">范围 1-365 天，默认 30 天</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <span className="text-sm text-muted">
            回收站现有 <b className="text-gold">{recycleCount}</b> 条卦例
          </span>
          <button
            type="button"
            onClick={handleClearRecycle}
            className="ml-auto rounded-md border border-red/60 px-3 py-1.5 text-sm text-red transition-colors hover:bg-red/10"
          >
            清空回收站
          </button>
        </div>
      </section>

      {/* 卡片 2：盘面选项（功能三：纳干；v0.2 功能 B：盘面标记 11 开关） */}
      <section className="card space-y-3 rounded-xl border border-border bg-panel p-5">
        <h2 className="text-base font-medium text-gold">盘面选项</h2>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={nagan}
            onChange={(e) => handleNagan(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-gold"
          />
          <span className="text-sm">
            <span className="text-text">纳干显示</span>
            <span className="mt-0.5 block text-xs text-muted">
              开启后，新起卦的盘面在爻地支前显示天干（八宫纳甲，如「甲寅木」）。不影响已保存卦例（旧快照无天干字段）。
            </span>
          </span>
        </label>

        {/* 盘面标记（v0.2 功能 B）：默认全关；开启后返回排盘页重新起卦/恢复即时展示 */}
        <div className="space-y-3 border-t border-border pt-3">
          <div className="text-sm">
            <span className="text-text">盘面标记</span>
            <span className="mt-0.5 block text-xs text-muted">
              开启后，返回排盘页重新起卦或恢复会话时，盘面爻行即时展示对应标记（旧卦例快照无标记字段时自动跳过）。全部默认关闭。
            </span>
          </div>
          {MARKER_DEFS.map((d) => (
            <label key={d.key} className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={!!markers[d.key]}
                onChange={(e) => handleMarkerToggle(d.key, e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-gold"
              />
              <span className="text-sm">
                <span className="text-text">{d.label}</span>
                <span className="mt-0.5 block text-xs text-muted">{d.desc}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      {/* 卡片 2.5：保存设置（v0.10 #6：重名保存提醒开关） */}
      <section className="card space-y-3 rounded-xl border border-border bg-panel p-5">
        <h2 className="text-base font-medium text-gold">保存设置</h2>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={remindDup}
            onChange={(e) => handleRemindDup(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-gold"
          />
          <span className="text-sm">
            <span className="text-text">重名保存提醒</span>
            <span className="mt-0.5 block text-xs text-muted">
              开启后，在排盘页保存卦例时若卦题与既有卦例重名，会弹窗确认（可改为直接保存）；关闭后总是直接保存，不再提醒。
            </span>
          </span>
        </label>
      </section>

      {/* 卡片 2.6：自定义导出路径（v1.0.1，仅 Tauri 端） */}
      {isDesktopEnv && (
        <section className="card space-y-4 rounded-xl border border-border bg-panel p-5">
          <h2 className="text-base font-medium text-gold">自定义导出路径</h2>
          <p className="text-sm text-muted">
            导出 md 文件与数据备份时保存到指定目录，导出后会提示完整路径。未设置时自动保存到默认目录（文档/六爻工作台导出），确保导出成功。
          </p>

          {/* 卡片内操作反馈（v1.0.1：就近显示，不顶置） */}
          {pathMsg && (
            <div className={`text-sm ${pathMsg.type === 'ok' ? 'text-gold' : 'text-red'}`}>{pathMsg.text}</div>
          )}

          {/* md 导出路径 */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-sm text-text">md 文件导出路径</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  mdExportPath ? 'bg-goldSoft text-gold' : 'bg-panel2 text-muted'
                }`}
              >
                {mdExportPath ? '自定义' : '默认'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                readOnly
                value={mdExportPath}
                placeholder="未设置 → 使用默认目录（文档/六爻工作台导出）"
                className="min-w-0 flex-1 rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-text outline-none"
              />
              <button
                type="button"
                onClick={() => handlePickDir('md')}
                className="rounded-md border border-gold px-4 py-1.5 text-sm text-gold transition-colors hover:bg-goldSoft"
              >
                {mdExportPath ? '更换目录' : '选择目录'}
              </button>
              {mdExportPath && (
                <button
                  type="button"
                  onClick={() => handleOpenDir('md')}
                  className="rounded-md border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:text-text"
                >
                  打开目录
                </button>
              )}
              {mdExportPath && (
                <button
                  type="button"
                  onClick={() => handleClearDir('md')}
                  className="rounded-md border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:text-text"
                >
                  清除
                </button>
              )}
            </div>
          </div>
          {/* 备份导出路径 */}
          <div className="space-y-1.5 border-t border-border pt-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-text">数据备份导出路径</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  backupExportPath ? 'bg-goldSoft text-gold' : 'bg-panel2 text-muted'
                }`}
              >
                {backupExportPath ? '自定义' : '默认'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                readOnly
                value={backupExportPath}
                placeholder="未设置 → 使用默认目录（文档/六爻工作台导出）"
                className="min-w-0 flex-1 rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-text outline-none"
              />
              <button
                type="button"
                onClick={() => handlePickDir('backup')}
                className="rounded-md border border-gold px-4 py-1.5 text-sm text-gold transition-colors hover:bg-goldSoft"
              >
                {backupExportPath ? '更换目录' : '选择目录'}
              </button>
              {backupExportPath && (
                <button
                  type="button"
                  onClick={() => handleOpenDir('backup')}
                  className="rounded-md border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:text-text"
                >
                  打开目录
                </button>
              )}
              {backupExportPath && (
                <button
                  type="button"
                  onClick={() => handleClearDir('backup')}
                  className="rounded-md border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:text-text"
                >
                  清除
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* 卡片 2.7：关闭窗口行为（v1.0.1，仅 Tauri 桌面端） */}
      {isDesktopEnv && (
        <section className="card space-y-3 rounded-xl border border-border bg-panel p-5">
          <h2 className="text-base font-medium text-gold">关闭窗口行为</h2>
          <p className="text-sm text-muted">
            点击窗口关闭按钮时的行为。最小化到托盘后，可从系统托盘图标或右键菜单恢复。
          </p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="关闭窗口行为">
            {[
              { value: 'tray', label: '最小化到托盘', desc: '默认：关闭后应用在后台继续运行' },
              { value: 'quit', label: '直接退出', desc: '关闭窗口即退出应用' },
            ].map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={closeBehavior === o.value}
                onClick={() => handleCloseBehavior(o.value)}
                className={`flex min-w-[160px] flex-1 items-center gap-2.5 rounded-lg border px-4 py-2.5 text-left text-sm transition-all ${
                  closeBehavior === o.value
                    ? 'border-primary bg-primarySoft text-primary shadow-card1'
                    : 'border-border bg-panel2 text-muted hover:border-muted hover:text-text'
                }`}
              >
                <span>
                  <span className="block font-medium">{o.label}</span>
                  <span className="block text-xs opacity-75">{o.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 卡片 2.8：屏幕适配（2026-08-09，仅 Android：全面屏 / 刘海屏） */}
      {isAndroidEnv && (
        <section className="card space-y-3 rounded-xl border border-border bg-panel p-5">
          <h2 className="text-base font-medium text-gold">屏幕适配</h2>
          <p className="text-sm text-muted">
            全面屏模式：应用界面延伸至屏幕边缘（当前默认）；刘海屏模式：应用界面与手机状态栏（刘海）区域分开，避免状态栏遮挡应用顶部内容。
          </p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="屏幕适配">
            {[
              { value: 'full', label: '适应全面屏', desc: '当前模式：界面延伸至屏幕边缘' },
              { value: 'notch', label: '适应刘海屏', desc: '界面避开状态栏，顶部内容不被遮挡' },
            ].map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={displayMode === o.value}
                onClick={() => handleDisplayMode(o.value)}
                className={`flex min-w-[160px] flex-1 items-center gap-2.5 rounded-lg border px-4 py-2.5 text-left text-sm transition-all ${
                  displayMode === o.value
                    ? 'border-primary bg-primarySoft text-primary shadow-card1'
                    : 'border-border bg-panel2 text-muted hover:border-muted hover:text-text'
                }`}
              >
                <span>
                  <span className="block font-medium">{o.label}</span>
                  <span className="block text-xs opacity-75">{o.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 卡片 3：数据备份 */}
      <section className="card space-y-4 rounded-xl border border-border bg-panel p-5">
        <h2 className="text-base font-medium text-gold">数据备份</h2>
        <p className="text-sm text-muted">
          备份包含全部卦例（含回收站中的，保留删除标记）、标签与设置，保存为 JSON 文件，可随时导入恢复。
          当前数据：卦例 <b className="text-gold">{totalCount}</b> 条（回收站 {recycleCount} 条）· 标签{' '}
          <b className="text-gold">{tagCount}</b> 个。
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExport}
            className="rounded-md border border-gold px-4 py-1.5 text-sm text-gold transition-colors hover:bg-goldSoft"
          >
            导出全部数据
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-md border border-border px-4 py-1.5 text-sm text-muted transition-colors hover:text-text"
          >
            导入备份
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleImportFile}
          />
          <span className="text-xs text-muted">导入会覆盖现有卦例库，请先导出备份</span>
        </div>

        {/* 最近导出（v1.0.1）：就近显示导出结果，不顶置 */}
        {lastBackup && (
          <div className="rounded-lg border border-border bg-panel2 p-3">
            <div className="flex items-start gap-3">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-5 w-5 shrink-0 text-gold">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="9" y1="13" x2="15" y2="13" />
                <line x1="9" y1="17" x2="13" y2="17" />
              </svg>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-text">已导出到：</span>
                  <span className="font-medium text-gold">{lastBackup.fileName}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      lastBackup.usedDefault ? 'bg-panel text-muted' : 'bg-goldSoft text-gold'
                    }`}
                  >
                    {lastBackup.usedDefault ? '默认目录' : '自定义'}
                  </span>
                </div>
                <div className="break-all text-xs text-muted">{lastBackup.path}</div>
                <div className="text-xs text-muted">
                  包含 {lastBackup.count} 条卦例 · {lastBackup.tagsCount} 个标签 · {new Date(lastBackup.at).toLocaleString('zh-CN')}
                </div>
              </div>
              {isDesktopEnv && lastBackup.dir && (
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await openExportDir(lastBackup.dir)
                    if (!ok) setError('打开目录失败：路径可能不存在或已被移动')
                  }}
                  className="shrink-0 rounded-md border border-gold px-3 py-1.5 text-sm text-gold transition-colors hover:bg-goldSoft"
                >
                  打开目录
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* 卡片 3：关于 */}
      <section className="card space-y-3 rounded-xl border border-border bg-panel p-5">
        <h2 className="text-base font-medium text-gold">关于</h2>
        <div className="space-y-1 text-sm">
          <p>
            <span className="text-muted">应用：</span>
            <span className="text-text">六爻工作台</span>
          </p>
          <p>
            <span className="text-muted">版本：</span>
            <span className="text-text">v{APP_VERSION} 正式版</span>
          </p>
          <p className="text-xs text-muted">
            本地排盘与卦例管理工具：9 种起卦方式、自占断记录、统计复盘与错题本、Markdown 与 JSON
            导入导出。数据保存在浏览器 IndexedDB 中，清理浏览器数据前请先导出备份。
          </p>
        </div>
      </section>
    </div>
  )
}
