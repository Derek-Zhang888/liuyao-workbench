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

/** 与 package.json 保持一致 */
const APP_VERSION = '0.1.0'

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
  const [recycleCount, setRecycleCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [tagCount, setTagCount] = useState(0)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

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
      refresh()
    })()
  }, [])

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
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `liuyao-backup-${ymd(Date.now())}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setMsg(`已导出备份：${payload.guashi.length} 条卦例（含回收站 ${deleted.length} 条）、${tags.length} 个标签`)
      setError('')
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
        <span className="text-xs text-muted">回收站保留天数与数据备份</span>
      </div>

      {msg && <div className="text-sm text-gold">{msg}</div>}
      {error && <div className="text-sm text-red">{error}</div>}

      {/* 卡片 1：回收站设置 */}
      <section className="space-y-4 rounded-xl border border-border bg-panel p-5">
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

      {/* 卡片 2：数据备份 */}
      <section className="space-y-4 rounded-xl border border-border bg-panel p-5">
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
      </section>

      {/* 卡片 3：关于 */}
      <section className="space-y-3 rounded-xl border border-border bg-panel p-5">
        <h2 className="text-base font-medium text-gold">关于</h2>
        <div className="space-y-1 text-sm">
          <p>
            <span className="text-muted">应用：</span>
            <span className="text-text">六爻工作台</span>
          </p>
          <p>
            <span className="text-muted">版本：</span>
            <span className="text-text">{APP_VERSION}（测试版）</span>
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
