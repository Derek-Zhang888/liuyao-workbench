import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { applyTheme } from './utils/theme.js'
import './styles/theme.css'
import './index.css'

// 主题初始化：渲染前同步应用（防闪屏），跟随系统时按当前系统偏好
applyTheme()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
