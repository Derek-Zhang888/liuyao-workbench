import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { applyTheme } from './utils/theme.js'
import { applyDisplayMode } from './utils/displayMode.js'
import { initCloseBehavior } from './utils/tauriBridge.js'
import './styles/theme.css'
import './index.css'

// 主题初始化：渲染前同步应用（防闪屏），跟随系统时按当前系统偏好
applyTheme()

// 2026-08-09：屏幕适配模式（刘海屏安全区）渲染前应用，避免闪跳
applyDisplayMode()

// v1.0.1：启动时把持久化的关闭窗口行为通知 Rust（托盘/退出），失败静默
initCloseBehavior()

// 2026-08-10：PWA Service Worker（仅生产构建注册；离线缓存静态资源，数据仍在 IndexedDB）
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => { /* 静默 */ })
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
