/**
 * 卦例卡片（Task 10）
 *
 * 展示：标题 / 日期 / 起卦方式 / 本卦名（含变卦）/ tag 徽章 / 吉凶色标（吉=金 凶=红）/
 *       对错标记（已反馈且记录对错时：吉✓ / 凶✗）/ 已反馈标识
 * 交互：点击卡片 → 打开详情编辑；可选勾选框（批量操作）；底部「导出 / 删除」单条操作。
 * 样式：暗色专业风，hover 时边框变金、背景提亮。
 */
import { QIGUA_METHODS } from '../engine/qigua.js'

const METHOD_NAME = Object.fromEntries(QIGUA_METHODS.map((m) => [m.id, m.name]))

/** tag 徽章颜色：优先 tags 表配色，未知 tag 用弱化灰 */
function tagStyle(color) {
  const c = color ?? '#8b93a7'
  return { borderColor: c, color: c, background: c + '1f' }
}

/** 指南针图标（内联 SVG，方位标志用，v0.10 建议4 #8） */
function CompassIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 4.5l1.4 3h-2.8z M12 19.5l-1.4-3h2.8z M4.5 12l3-1.4v2.8z M19.5 12l-3 1.4v-2.8z" fill="currentColor" />
      <path d="M12 12l4-5-1 6z M12 12l-4 5 1-6z" fill="currentColor" />
    </svg>
  )
}

export default function GuashiCard({
  guashi,
  tagColors = {},
  selectable = false,
  selected = false,
  onToggleSelect,
  onOpen,
  onExport,
  onDelete,
}) {
  const fed = guashi.status === '已反馈'
  const jx = guashi.jixiong
  const jxOk = guashi.jixiongOk
  const yq = guashi.yingqi
  const yqOk = guashi.yingqiOk
  const fw = guashi.fangwei
  const fwOk = guashi.fangweiOk
  const ben = guashi.panSnapshot?.ben?.name
  const bian = guashi.panSnapshot?.bian?.name
  const tags = Array.isArray(guashi.tags) ? guashi.tags : []
  const methodName = METHOD_NAME[guashi.method] ?? guashi.method

  return (
    <article
      onClick={() => onOpen?.(guashi.id)}
      className="group flex cursor-pointer flex-col gap-3 rounded-xl border border-border bg-panel p-4 transition-colors hover:border-gold/60 hover:bg-[#1b212b]"
      title="点击查看/编辑"
    >
      {/* 头部：勾选 + 标题 + 已反馈标识 */}
      <div className="flex items-start gap-2">
        {selectable && (
          <input
            type="checkbox"
            checked={selected}
            onClick={(e) => e.stopPropagation()}
            onChange={() => onToggleSelect?.(guashi.id)}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[#d4af37]"
            title={selected ? '取消选择' : '选择'}
          />
        )}
        <h3
          className="min-w-0 flex-1 truncate text-sm font-medium text-text"
          title={guashi.title || '未命名卦例'}
        >
          {guashi.title || '未命名卦例'}
        </h3>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${
            fed ? 'border-[#34d399]/60 bg-[#34d399]/10 text-[#34d399]' : 'border-border text-muted'
          }`}
        >
          {fed ? '✓ 已反馈' : '未反馈'}
        </span>
      </div>

      {/* 信息行：日期 / 方式 / 卦名 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span>{guashi.date || '—'}</span>
        <span>{methodName}</span>
        {ben && (
          <span className="font-medium text-gold">
            {ben}
            {bian ? ` → ${bian}` : ''}
          </span>
        )}
      </div>

      {/* tag 徽章 */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span
              key={t}
              className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
              style={tagStyle(tagColors[t])}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: tagColors[t] ?? '#8b93a7' }}
              />
              {t}
            </span>
          ))}
        </div>
      )}

      {/* 底部：吉凶/对错 + 应期/方位图标 + 操作（v0.10 建议4 #8） */}
      <div className="mt-auto border-t border-border pt-2.5">
        <div className="flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {/* 吉凶组合：已反馈带 ✓/✗；未反馈仅吉/凶 */}
            {jx && (
              <span
                className={`flex items-center gap-0.5 rounded-md border px-2 py-0.5 text-xs font-medium ${
                  jx === '吉'
                    ? 'border-gold/60 bg-goldSoft text-gold'
                    : 'border-red/60 bg-red/10 text-red'
                }`}
              >
                {jx}
                {fed && (jxOk === '对' ? '✓' : jxOk === '错' ? '✗' : '')}
              </span>
            )}
            {/* 应期标志：已反馈显示 🕰✓/🕰✗；未反馈显示 🕰（断语含时间信息） */}
            {(fed ? yqOk : yq) && (
              <span
                className={`flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-xs ${
                  fed
                    ? yqOk === '对'
                      ? 'border-gold/60 bg-goldSoft text-gold'
                      : 'border-red/60 bg-red/10 text-red'
                    : 'border-border text-muted'
                }`}
                title={`应期${fed ? (yqOk === '对' ? '对' : yqOk === '错' ? '错' : '未定') : '已记'}`}
              >
                🕰
                {fed && (yqOk === '对' ? '✓' : yqOk === '错' ? '✗' : '')}
              </span>
            )}
            {/* 方位标志：已反馈显示 方位✓/✗；未反馈显示 方位图标 */}
            {(fed ? fwOk : fw) && (
              <span
                className={`flex items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-xs ${
                  fed
                    ? fwOk === '对'
                      ? 'border-gold/60 bg-goldSoft text-gold'
                      : 'border-red/60 bg-red/10 text-red'
                    : 'border-border text-muted'
                }`}
                title={`方位${fed ? (fwOk === '对' ? '对' : fwOk === '错' ? '错' : '未定') : '已记'}`}
              >
                <CompassIcon className="h-3.5 w-3.5" />
                {fed && (fwOk === '对' ? '✓' : fwOk === '错' ? '✗' : '')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onExport?.(guashi)
              }}
              className="rounded px-2 py-1 text-xs text-muted transition-colors hover:bg-goldSoft hover:text-gold"
            >
              导出
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onDelete?.(guashi)
              }}
              className="rounded px-2 py-1 text-xs text-muted transition-colors hover:bg-red/10 hover:text-red"
            >
              删除
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}
