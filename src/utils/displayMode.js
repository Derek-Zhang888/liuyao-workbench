/**
 * 屏幕适配模式（2026-08-09，仅 Android 生效；Web/桌面端无状态栏概念，不受影响）
 *
 * - 'full'（默认）：全面屏模式，界面延伸至屏幕边缘（当前默认行为）
 * - 'notch'：刘海屏模式，界面避开状态栏（html 加 .display-notch class，CSS 用 env(safe-area-inset-top) 让出安全区）
 *
 * 存储：localStorage 'liuyao-display-mode'
 */
const KEY = 'liuyao-display-mode'

/** 读取当前模式（'full' | 'notch'），异常/未设置时返回 'full' */
export function getDisplayMode() {
  try {
    return localStorage.getItem(KEY) === 'notch' ? 'notch' : 'full'
  } catch {
    return 'full'
  }
}

/** 把当前模式应用到 <html> 根元素 class（启动时与切换时调用） */
export function applyDisplayMode() {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('display-notch', getDisplayMode() === 'notch')
}

/** 切换模式并持久化 + 立即应用 */
export function setDisplayMode(mode) {
  const m = mode === 'notch' ? 'notch' : 'full'
  try {
    localStorage.setItem(KEY, m)
  } catch (_) {
    /* 存储不可用时仅本次会话生效 */
  }
  applyDisplayMode()
}
