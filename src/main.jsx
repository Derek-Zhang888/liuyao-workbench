import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { applyTheme } from './utils/theme.js'
import { applyDisplayMode } from './utils/displayMode.js'
import { initCloseBehavior, isTauri } from './utils/tauriBridge.js'
import './styles/theme.css'
import './index.css'

// 主题初始化：渲染前同步应用（防闪屏），跟随系统时按当前系统偏好
applyTheme()

// 2026-08-09：屏幕适配模式（刘海屏安全区）渲染前应用，避免闪跳
applyDisplayMode()

// v1.0.1：启动时把持久化的关闭窗口行为通知 Rust（托盘/退出），失败静默
initCloseBehavior()

// 2026-08-10：PWA Service Worker（仅生产构建注册；离线缓存静态资源，数据仍在 IndexedDB）
// 2026-08-10 22:55 修复「便携版升级后白屏」：Tauri（桌面/安卓）不再注册 SW，
// 并显式卸载可能残留的旧 SW——旧 SW 会一直 serve 缓存的旧版资源，导致升级后页面被
// 劫持为空白（v1.0.0→v1.0.1 便携版实测复现，删 com.liuyao.workbench 缓存后恢复）。
// PWA 仅保留给 Web/Pages（浏览器离线 + 手机添加到主屏幕）。
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  if (isTauri()) {
    navigator.serviceWorker
      .getRegistrations()
      .then((rs) => rs.forEach((r) => r.unregister()))
      .catch(() => { /* 静默 */ })
  } else {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => { /* 静默 */ })
    })
  }
}

// 2026-08-10 23:30 诊断便携版黑屏：把 window.onerror + unhandledrejection 写到 DOM（之前
// React 18 渲染抛错会 unmount 整个根，画面只剩 body 黑底——用户看不到任何错误信息）。
// 同时包一个 ErrorBoundary 捕获子树渲染错误，把错误文本画到 body 让用户能直接读到。
function showFatal(msg) {
  const el = document.createElement('pre')
  el.id = 'fatal-overlay'
  el.style.cssText = 'position:fixed;left:12px;right:12px;top:56px;max-height:70vh;overflow:auto;padding:14px;border:2px solid #ef4444;border-radius:8px;background:#1a0a0a;color:#fca5a5;font:13px/1.5 ui-monospace,Consolas,monospace;white-space:pre-wrap;z-index:99999'
  el.textContent = msg
  document.body.appendChild(el)
}
window.addEventListener('error', (e) => {
  showFatal(`[window.error] ${e.message}\n  at ${e.filename}:${e.lineno}:${e.colno}\n  ${e.error?.stack ?? ''}`)
})
window.addEventListener('unhandledrejection', (e) => {
  showFatal(`[unhandledrejection] ${e.reason?.message ?? e.reason}\n  ${e.reason?.stack ?? ''}`)
})
class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  componentDidCatch(err, info) {
    showFatal(`[React ErrorBoundary] ${err.message}\n${err.stack ?? ''}\n\nComponent stack:\n${info?.componentStack ?? ''}`)
  }
  render() {
    if (this.state.err) {
      return React.createElement('pre', {
        id: 'fatal-overlay',
        style: { position: 'fixed', inset: '60px 12px 12px 12px', padding: 14, border: '2px solid #ef4444', borderRadius: 8, background: '#1a0a0a', color: '#fca5a5', font: '13px/1.5 ui-monospace,Consolas,monospace', whiteSpace: 'pre-wrap', zIndex: 99999 }
      }, `React 渲染失败：${this.state.err.message}\n\n${this.state.err.stack ?? ''}`)
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
