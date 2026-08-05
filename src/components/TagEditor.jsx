/**
 * 标签编辑器（Task 9）
 *
 * 预置标签（src/config/presetTags.js）首次使用时种子写入 tags 表（仅一次），
 * 之后一律以 tags 表为准；点选/取消多选，支持自定义新增与删除（× 按钮）。
 * 删除只删标签本身，已保存卦例的 tags 字段不受影响（Bug #14）。
 * 受控：selected: string[]（标签名数组），onChange(next)。
 */
import { useEffect, useState } from 'react'
import { listTags, addTag, deleteTag, ensurePresetTags } from '../db/tagsRepo.js'
import { paletteColor } from '../config/presetTags.js'

export default function TagEditor({ selected, onChange }) {
  const [all, setAll] = useState([])
  const [newName, setNewName] = useState('')
  const [error, setError] = useState('')

  // 预置标签种子写入（单例防重复）+ 加载
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        await ensurePresetTags()
        if (!alive) return
        setAll(await listTags())
      } catch (e) {
        if (alive) setError('标签加载失败：' + e.message)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

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
      const rec = await addTag({ name, color: paletteColor(all.length) })
      setAll(await listTags())
      if (!selected.includes(rec.name)) onChange([...selected, rec.name])
      setNewName('')
      setError('')
    } catch (e) {
      setError('新增标签失败：' + e.message)
    }
  }

  /** 删除标签：只删标签本身，已保存卦例不受影响；同时从当前选中项移除 */
  const remove = async (tag) => {
    if (
      !window.confirm(
        `确定删除标签「${tag.name}」吗？\n只删除标签本身，已保存的卦例不会受影响。`,
      )
    )
      return
    try {
      await deleteTag(tag.id)
      setAll(await listTags())
      if (selected.includes(tag.name)) onChange(selected.filter((n) => n !== tag.name))
      setError('')
    } catch (e) {
      setError('删除标签失败：' + e.message)
    }
  }

  return (
    <div>
      {all.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {all.map((t) => {
            const on = selected.includes(t.name)
            return (
              <span
                key={t.id ?? t.name}
                className={`flex items-center gap-1 rounded-full border py-1 pl-3 pr-1.5 text-sm transition-colors ${
                  on ? '' : 'opacity-60 hover:opacity-90'
                }`}
                style={{
                  borderColor: on ? t.color : 'var(--border)',
                  color: on ? t.color : 'var(--muted)',
                  background: on ? t.color + '1f' : 'transparent',
                }}
              >
                <button
                  type="button"
                  onClick={() => toggle(t.name)}
                  className="flex items-center gap-1.5"
                  style={{ color: 'inherit' }}
                  title={on ? '取消选择' : '选择'}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />
                  {t.name}
                  {on && <span className="text-xs">✓</span>}
                </button>
                <button
                  type="button"
                  onClick={() => remove(t)}
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
