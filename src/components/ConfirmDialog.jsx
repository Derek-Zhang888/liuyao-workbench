/**
 * 自定义确认弹窗（替代 window.confirm 以支持「不再提醒」勾选）
 *
 * props:
 *   open: 是否打开
 *   title: 标题
 *   message: 正文（支持 \n 换行）
 *   confirmLabel / cancelLabel: 按钮文案（默认 '确定' / '取消'）
 *   noRemindStorageKey: 若提供，启用「不再提醒」checkbox；勾选确认后写入 localStorage[key]='1'
 *   noRemindDefaultChecked: 初始勾选状态（默认 false）
 *   onConfirm(remember): 用户点确定；remember 表示是否同时勾选了「不再提醒」
 *   onCancel: 用户点取消或按 Esc / 点遮罩
 */
import { useEffect, useState } from 'react'

const NO_REMIND_PREFIX = 'liuyao-noremind-'

/** 全局读取某 key 是否已被用户设为「不再提醒」 */
export function isNoRemind(storageKey) {
  try {
    return localStorage.getItem(NO_REMIND_PREFIX + storageKey) === '1'
  } catch (_) {
    return false
  }
}

/** 清除「不再提醒」记忆（恢复再次提醒） */
export function clearNoRemind(storageKey) {
  try {
    localStorage.removeItem(NO_REMIND_PREFIX + storageKey)
  } catch (_) { /* 静默 */ }
}

export default function ConfirmDialog({
  open,
  title = '请确认',
  message,
  confirmLabel = '确定',
  cancelLabel = '取消',
  noRemindStorageKey,
  noRemindDefaultChecked = false,
  onConfirm,
  onCancel,
}) {
  const [remember, setRemember] = useState(noRemindDefaultChecked)

  useEffect(() => {
    setRemember(noRemindDefaultChecked)
  }, [open, noRemindDefaultChecked])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel?.()
      else if (e.key === 'Enter') onConfirm?.(remember)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, remember, onConfirm, onCancel])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel?.() }}
    >
      <div className="w-full max-w-sm rounded-xl border border-border bg-panel p-5 shadow-2xl">
        <h3 className="mb-3 text-base font-medium text-gold">{title}</h3>
        {message ? (
          <p className="mb-4 whitespace-pre-line text-sm text-text">{message}</p>
        ) : null}
        {noRemindStorageKey ? (
          <label className="mb-4 flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="accent-gold"
            />
            不再提醒
          </label>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border px-4 py-1.5 text-sm text-muted transition-colors hover:text-text"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => onConfirm?.(remember)}
            className="rounded-md bg-red px-4 py-1.5 text-sm font-medium text-white transition-colors hover:opacity-90"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}