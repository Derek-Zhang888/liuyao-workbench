import { HashRouter, NavLink, Route, Routes, useParams } from 'react-router-dom'
import PaipanPage from './pages/PaipanPage.jsx'
import GuashiLibPage from './pages/GuashiLibPage.jsx'
import RecyclePage from './pages/RecyclePage.jsx'
import StatsPage from './pages/StatsPage.jsx'

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

function SettingsPage() {
  return <PlaceholderPage title="设置" />
}

/* 辅助工具入口：卦辞爻辞 / 纳音 / 十二长生 / 生克冲合 / 取象 */
const HELP_ENTRIES = [
  { path: 'guaci', label: '卦辞爻辞' },
  { path: 'nayin', label: '纳音' },
  { path: 'changsheng', label: '十二长生' },
  { path: 'shengke', label: '生克冲合' },
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

/* ============ 导航样式 ============ */
const tabClass = ({ isActive }) =>
  `rounded-md px-3 py-1.5 text-sm transition-colors ${
    isActive ? 'bg-goldSoft text-gold' : 'text-muted hover:text-text'
  }`

const helperClass = ({ isActive }) =>
  `rounded-md px-2.5 py-1.5 text-xs transition-colors ${
    isActive ? 'bg-goldSoft text-gold' : 'text-muted hover:bg-panel hover:text-gold'
  }`

/* ============ 应用外壳 ============ */
export default function App() {
  return (
    <HashRouter>
      <div className="flex min-h-screen flex-col bg-bg text-text">
        {/* 顶部导航栏 */}
        <header className="sticky top-0 z-10 border-b border-border bg-panel">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
            {/* 品牌 */}
            <span className="text-lg font-bold text-gold">六爻工作台</span>

            {/* 主 Tab：排盘 / 卦例库 / 统计 */}
            <nav className="flex items-center gap-1">
              <NavLink to="/" end className={tabClass}>
                排盘
              </NavLink>
              <NavLink to="/lib" className={tabClass}>
                卦例库
              </NavLink>
              <NavLink to="/stats" className={tabClass}>
                统计
              </NavLink>
            </nav>

            {/* 辅助工具入口 + 设置 */}
            <div className="ml-auto flex flex-wrap items-center gap-1">
              {HELP_ENTRIES.map((e) => (
                <NavLink key={e.path} to={`/help/${e.path}`} className={helperClass}>
                  {e.label}
                </NavLink>
              ))}
              <NavLink
                to="/settings"
                title="设置"
                className="ml-1 flex h-8 w-8 items-center justify-center rounded-md text-lg text-muted transition-colors hover:bg-panel hover:text-gold"
              >
                ⚙
              </NavLink>
            </div>
          </div>
        </header>

        {/* 内容区 */}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/lib" element={<LibPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/recycle" element={<RecyclePage />} />
            <Route path="/help/:type" element={<HelpPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>

        <footer className="border-t border-border py-4 text-center text-xs text-muted">
          六爻工作台 · 暗色专业版
        </footer>
      </div>
    </HashRouter>
  )
}
