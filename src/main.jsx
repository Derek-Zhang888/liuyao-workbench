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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
