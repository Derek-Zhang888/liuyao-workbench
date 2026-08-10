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

// 2026-08-11 0:05 修正 ErrorBoundary/全局错误处理的 UX 污染：之前版本把错误
// 显示到 DOM 红框——但 Tauri ACL 拒绝（如 window.confirm → plugin:dialog|confirm
// 未声明权限）也会触发 unhandledrejection，结果正常点删除卦例就被黑窗挡住。
// 改为只 console.error 记日志（不污染 UI）；ErrorBoundary 仍阻止子树 unmount
// 但不再弹红框，让上层 UI 干净。
window.addEventListener('error', (e) => {
  // eslint-disable-next-line no-console
  console.error('[window.error]', e.message, e.error?.stack ?? '')
})
window.addEventListener('unhandledrejection', (e) => {
  // eslint-disable-next-line no-console
  console.warn('[unhandledrejection]', e.reason?.message ?? e.reason, e.reason?.stack ?? '')
})
class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  componentDidCatch(err, info) {
    // eslint-disable-next-line no-console
    console.error('[React ErrorBoundary]', err, '\nComponent stack:\n', info?.componentStack ?? '')
  }
  render() {
    // 即使出过错，仍渲染 children——避免子树的正常 UI 被黑屏替换；
    // ErrorBoundary 的价值是阻止 React 18 把整个根 unmount（保留页面结构）
    if (this.state.err) return this.props.children
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
