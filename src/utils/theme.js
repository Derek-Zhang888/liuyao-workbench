/**
 * 主题工具（玄穹方案 · 界面主题三选：浅色 / 跟随系统 / 深色）
 * 选择持久化到 localStorage（同步读取，渲染前应用避免闪屏）
 */
export const THEME_KEY = 'liuyao-theme'
export const THEMES = [
  { value: 'light', label: '浅色' },
  { value: 'system', label: '跟随系统' },
  { value: 'dark', label: '深色' },
]

/** 系统是否偏好深色 */
export function systemDark() {
  return typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false
}

/** 读取已保存的主题选择（默认跟随系统） */
export function getTheme() {
  try {
    return localStorage.getItem(THEME_KEY) || 'system'
  } catch (_) {
    return 'system'
  }
}

/** 应用主题：设置 html.dark 类；返回是否暗色 */
export function applyTheme(saved = getTheme()) {
  const dark = saved === 'dark' || (saved === 'system' && systemDark())
  document.documentElement.classList.toggle('dark', dark)
  return dark
}

/** 保存主题选择并立即应用 */
export function setTheme(saved) {
  try {
    localStorage.setItem(THEME_KEY, saved)
  } catch (_) { /* 隐私模式等场景忽略 */ }
  return applyTheme(saved)
}
