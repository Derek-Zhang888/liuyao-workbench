/**
 * 标签编辑器（Task 9）
 *
 * 预置标签（src/config/presetTags.js）首次挂载时自动种子写入 tags 表，
 * 之后以 tags 表为准（合并去重展示）；点选/取消多选，支持自定义新增。
 * 受控：selected: string[]（标签名数组），onChange(next)。
 */
import { useEffect, useMemo, useState } from 'react'
import { listTags, addTag } from '../db/tagsRepo.js'
import { PRESET_TAGS } from '../config/presetTags.js'

/** 自定义标签默认色板（循环取色） */
const PALETTE = [
  '#22d3ee', '#f87171', '#facc15', '#34d399', '#60a5fa',
  '#f97316', '#e879f9', '#a78bfa', '#fbbf24', '#e5e7eb',
]

/**
 * 预置标签种子写入（模块级单例）：
 * React StrictMode 下组件会双挂载，effect 并发执行会导致重复入库；
 * 用共享 Promise 保证只执行一次种子逻辑。
 */
let seedPromise = null
function ensurePresetTags() {
  if (!seedPromise) {
    seedPromise = (async () => {
      const existing = await listTags()
      const names = new Set(existing.map((t) => t.name))
      for (const p of PRESET_TAGS) {
        if (!names.has(p.name)) await addTag({ name: p.name, color: p.color })
      }
    })()
  }
  return seedPromise
}

export default function TagEditor({ selected, onChange }) {
  const [dbTags, setDbTags] = useState([])
  const [newName, setNewName] = useState('')
  const [error, setError] = useState('')

  // 预置标签种子写入（单例防重复）+ 加载
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        await ensurePresetTags()
        if (!alive) return
        setDbTags(await listTags())
      } catch (e) {
        if (alive) setError('标签加载失败：' + e.message)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // 展示列表 = 预置（尚未入库的，防种子未完成时缺失） + 入库标签；按名去重
  const all = useMemo(() => {
    const seen = new Set()
    const rows = []
    for (const t of PRESET_TAGS) {
      if (!seen.has(t.name)) {
        seen.add(t.name)
        rows.push(t)
      }
    }
    for (const t of dbTags) {
      if (!seen.has(t.name)) {
        seen.add(t.name)
        rows.push(t)
      }
    }
    return rows
  }, [dbTags])

  const toggle = (name) => {
    onChange(selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name])
  }

  const addNew = async () => {
    const name = newName.trim()
    if (!name) return
    if (all.some((t) => t.name === name)) {
      setError(`标签「${name}」已存在`)
      return
    }
    try {
      const rec = await addTag({ name, color: PALETTE[all.length % PALETTE.length] })
      setDbTags(await listTags())
      if (!selected.includes(rec.name)) onChange([...selected, rec.name])
      setNewName('')
      setError('')
    } catch (e) {
      setError('新增标签失败：' + e.message)
    }
  }

  return (
    <div>
      {all.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {all.map((t) => {
            const on = selected.includes(t.name)
            return (
              <button
                key={t.id ?? t.name}
                type="button"
                onClick={() => toggle(t.name)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors ${
                  on ? '' : 'opacity-60 hover:opacity-90'
                }`}
                style={{
                  borderColor: on ? t.color : 'var(--border)',
                  color: on ? t.color : 'var(--muted)',
                  background: on ? t.color + '1f' : 'transparent',
                }}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />
                {t.name}
                {on && <span className="text-xs">✓</span>}
              </button>
            )
          })}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => {
            setNewName(e.target.value)
            setError('')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addNew()
          }}
          placeholder="自定义标签名"
          className="w-44 rounded-md border border-border bg-bg px-3 py-1.5 text-sm text-text outline-none transition-colors focus:border-gold"
        />
        <button
          type="button"
          onClick={addNew}
          className="rounded-md border border-gold px-3 py-1.5 text-sm text-gold transition-colors hover:bg-goldSoft"
        >
          新增
        </button>
        {error && <span className="text-xs text-red">{error}</span>}
      </div>
    </div>
  )
}
