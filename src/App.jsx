import { useEffect, useRef, useState } from 'react'
import { HashRouter, NavLink, Route, Routes, useLocation, useParams } from 'react-router-dom'
import PaipanPage from './pages/PaipanPage.jsx'
import GuashiLibPage from './pages/GuashiLibPage.jsx'
import RecyclePage from './pages/RecyclePage.jsx'
import StatsPage from './pages/StatsPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import GuaciPage from './pages/help/GuaciPage.jsx'
import NayinPage from './pages/help/NayinPage.jsx'
import ChangshengPage from './pages/help/ChangshengPage.jsx'
import ChonghePage from './pages/help/ChonghePage.jsx'
import QuXiangPage from './pages/help/QuXiangPage.jsx'

/* ============ 占位页（未实现页面统一显示页面名） ============ */
function PlaceholderPage({ title }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
      <h2 className="text-2xl font-medium text-gold">{title}</h2>
      <p className="text-sm text-muted">页面开发中，敬请期待</p>
    </div>
  )
}

/* ============ 页面组件 ============ */
function HomePage() {
  return <PaipanPage />
}

function LibPage() {
  return <GuashiLibPage />
}

/* 辅助工具入口：卦辞爻辞 / 纳音 / 十二长生 / 生克冲合 / 取象 */
const HELP_ENTRIES = [
  { path: 'guaci', label: '卦辞爻辞' },
  { path: 'nayin', label: '纳音' },
  { path: 'changsheng', label: '十二长生' },
  { path: 'chonghe', label: '生克冲合' },
  { path: 'quxiang', label: '取象' },
]

function HelpPage() {
  const { type } = useParams()
  const entry = HELP_ENTRIES.find((e) => e.path === type)
  return <PlaceholderPage title={entry ? entry.label : '辅助资料'} />
}

function NotFoundPage() {
  return <PlaceholderPage title="页面未找到" />
}

/* ============ 内联 SVG 图标（随 currentColor 着色） ============ */
const svgBase = {
  viewBox: '0 0 24 24',
  className: 'h-4 w-4 shrink-0',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}

/** 排盘：六爻横线（断爻留缺口） */
function IconPaipan() {
  return (
    <svg {...svgBase}>
      <path d="M4 4.5h16M4 8.5h10M4 12.5h16M4 16.5h10M4 20.5h16" />
    </svg>
  )
}

/** 卦例库：书本 */
function IconLib() {
  return (
    <svg {...svgBase}>
      <path d="M12 5c-1.8-1.4-4-2-7-2v16c3 0 5.2.6 7 2 1.8-1.4 4-2 7-2V3c-3 0-5.2.6-7 2z" />
      <path d="M12 5v16" />
    </svg>
  )
}

/** 统计：柱状图 */
function IconStats() {
  return (
    <svg {...svgBase}>
      <path d="M4 20V11M10 20V4M16 20V8M22 20H2" />
    </svg>
  )
}

/** 回收站：垃圾桶 */
function IconRecycle() {
  return (
    <svg {...svgBase}>
      <path d="M4 6.5h16M9.5 6.5V4.5h5v2M6.5 6.5l1 13.5h9l1-13.5M10 10.5v6M14 10.5v6" />
    </svg>
  )
}

/* ============ 导航样式 ============ */
const tabClass = ({ isActive }) =>
  `shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors ${
    isActive ? 'bg-goldSoft text-gold' : 'text-muted hover:text-text'
  }`

/** 手机「更多」下拉菜单项 */
const moreItemClass = ({ isActive }) =>
  `block rounded-md px-3 py-2 text-sm transition-colors ${
    isActive ? 'bg-goldSoft text-gold' : 'text-muted hover:bg-bg hover:text-text'
  }`

/** 桌面侧栏主项（图标 + 文字） */
const sideMainClass = ({ isActive }) =>
  `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
    isActive ? 'bg-goldSoft text-gold' : 'text-muted hover:bg-bg hover:text-text'
  }`

/** 桌面侧栏辅助项（纯文字） */
const sideSubClass = ({ isActive }) =>
  `block rounded-md px-3 py-1.5 text-[13px] transition-colors ${
    isActive ? 'bg-goldSoft text-gold' : 'text-muted hover:bg-bg hover:text-gold'
  }`

/* 桌面侧栏主导航 */
const MAIN_NAV = [
  { to: '/', label: '排盘', icon: <IconPaipan />, end: true },
  { to: '/lib', label: '卦例库', icon: <IconLib /> },
  { to: '/stats', label: '统计', icon: <IconStats /> },
]

/* ============ 应用外壳 ============ */
function Shell() {
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef(null)

  // 路由变化时收起手机版「更多」菜单
  useEffect(() => {
    setMoreOpen(false)
  }, [location])

  // 点击「更多」菜单外部任意区域时收起（手机触摸场景）
  useEffect(() => {
    if (!moreOpen) return
    const onDown = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
    }
  }, [moreOpen])

  return (
    <div className="min-h-screen bg-bg text-text">
      {/* ===== 手机版顶部栏（<768px）：品牌 + 主 Tab + 更多菜单 ===== */}
      <header className="sticky top-0 z-30 border-b border-border bg-panel md:hidden">
        <div className="flex items-center justify-between px-4 pb-1 pt-2.5">
          <span className="text-lg font-bold text-gold">六爻工作台</span>
          <NavLink
            to="/settings"
            title="设置"
            className="flex h-8 w-8 items-center justify-center rounded-md text-lg text-muted transition-colors hover:bg-bg hover:text-gold"
          >
            ⚙
          </NavLink>
        </div>
        <nav className="flex items-center gap-0.5 overflow-x-auto px-2 pb-2">
          <NavLink to="/" end className={tabClass}>
            排盘
          </NavLink>
          <NavLink to="/lib" className={tabClass}>
            卦例库
          </NavLink>
          <NavLink to="/stats" className={tabClass}>
            统计
          </NavLink>

          {/* 更多：辅助工具 ×5 + 回收站 */}
          <div className="relative shrink-0" ref={moreRef}>
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              className={`shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors ${
                moreOpen ? 'bg-goldSoft text-gold' : 'text-muted hover:text-text'
              }`}
            >
              更多 ▾
            </button>
            {moreOpen && (
              <div className="absolute right-0 top-full z-40 mt-1.5 w-44 rounded-xl border border-border bg-panel p-2 shadow-2xl">
                {HELP_ENTRIES.map((e) => (
                  <NavLink key={e.path} to={`/help/${e.path}`} className={moreItemClass}>
                    {e.label}
                  </NavLink>
                ))}
                <div className="my-1.5 border-t border-border" />
                <NavLink to="/recycle" className={moreItemClass}>
                  回收站
                </NavLink>
              </div>
            )}
          </div>
        </nav>
      </header>

      {/* ===== 桌面版左侧导航（≥768px）：图标 + 文字纵排 ===== */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-52 flex-col border-r border-border bg-panel md:flex">
        <div className="flex h-14 shrink-0 items-center border-b border-border px-4">
          <span className="text-lg font-bold text-gold">六爻工作台</span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {MAIN_NAV.map((m) => (
            <NavLink key={m.to} to={m.to} end={m.end} className={sideMainClass}>
              <span className="text-gold">{m.icon}</span>
              {m.label}
            </NavLink>
          ))}

          <div className="mb-1.5 mt-6 px-2 text-xs text-muted">辅助工具</div>
          {HELP_ENTRIES.map((e) => (
            <NavLink key={e.path} to={`/help/${e.path}`} className={sideSubClass}>
              {e.label}
            </NavLink>
          ))}
        </nav>

        <div className="shrink-0 border-t border-border px-3 py-3">
          <NavLink to="/recycle" className={sideMainClass}>
            <span className="text-gold">
              <IconRecycle />
            </span>
            回收站
          </NavLink>
          <NavLink to="/settings" className={sideMainClass}>
            <span className="text-lg leading-4 text-gold">⚙</span>
            设置
          </NavLink>
        </div>
      </aside>

      {/* ===== 内容区（桌面版让出侧栏宽度） ===== */}
      <div className="flex min-h-screen flex-col md:pl-52">
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 md:px-6 md:py-6">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/lib" element={<LibPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/recycle" element={<RecyclePage />} />
            {/* 辅助页：卦辞爻辞（guaci 卦辞 / yaoci 爻辞，同页双形态）/ 纳音 / 十二长生 / 生克冲合 / 取象 */}
            <Route path="/help/guaci" element={<GuaciPage />} />
            <Route path="/help/yaoci" element={<GuaciPage />} />
            <Route path="/help/nayin" element={<NayinPage />} />
            <Route path="/help/changsheng" element={<ChangshengPage />} />
            <Route path="/help/chonghe" element={<ChonghePage />} />
            {/* 旧导航 shengke 路由别名（Task 12 前占位路径，保留兼容） */}
            <Route path="/help/shengke" element={<ChonghePage />} />
            <Route path="/help/quxiang" element={<QuXiangPage />} />
            <Route path="/help/:type" element={<HelpPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>

        <footer className="border-t border-border py-4 text-center text-xs text-muted">
          六爻工作台 · 暗色专业版
        </footer>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  )
}
