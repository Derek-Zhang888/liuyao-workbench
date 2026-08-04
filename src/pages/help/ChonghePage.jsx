/**
 * 生克冲合页（Task 12）
 *
 * 内容：
 *   - 十二地支圆环图（SVG）：六冲红线、六合金线，可开关显示
 *   - 五行相生相克链
 *   - 关系表：六冲 / 六合 / 三合 / 相刑 / 相害（地支按五行配色）
 */
import { Fragment, useState } from 'react'
import { ZHI, WUXING_ZHI } from '../../engine/ganzhi.js'
import { WUXING_COLOR } from '../../engine/paipan.js'
import { LIU_CHONG, LIU_HE, SAN_HE, XIANG_XING, XIANG_HAI } from '../../data/helpData.js'

const CX = 160
const CY = 160
const R = 118

/* ============ 六亲生克图（五节点圆环） ============ */
const QCX = 160
const QCY = 168
const QR = 100
/** 相生环顺序：父母生兄弟 → 兄弟生子孙 → 子孙生妻财 → 妻财生官鬼 → 官鬼生父母 */
const LIUQIN_ORDER = ['父母', '兄弟', '子孙', '妻财', '官鬼']

/** 六亲节点在圆环上的坐标（-90° 起顺时针 72° 间隔） */
function qpos(i) {
  const rad = ((-90 + i * 72) * Math.PI) / 180
  return { x: QCX + QR * Math.cos(rad), y: QCY + QR * Math.sin(rad) }
}

const NODE_R = 26

/**
 * 以【节点圆心】为基准把端点收缩到圆盘边缘（距图心 QR±NODE_R±1）。
 * inner=true → 圆盘内缘（相克直线贴内缘进，避免穿中心文字）；
 * inner=false → 圆盘外缘（相生弧线贴外缘进）。
 * 箭头可见性由 DOM 绘制顺序保证：线条在节点圆盘之后渲染，浮于其上。
 */
function nodeEdge(p, inner) {
  const dx = p.x - QCX
  const dy = p.y - QCY
  const d = Math.hypot(dx, dy) || 1
  const r = inner ? QR - NODE_R + 1 : QR + NODE_R - 1
  return { x: QCX + (dx / d) * r, y: QCY + (dy / d) * r }
}

/** 地支在圆环上的坐标（子居正北，顺时针：子丑寅卯辰巳午未申酉戌亥） */
function pos(i) {
  const rad = ((-90 + i * 30) * Math.PI) / 180
  return { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) }
}

/** 地支文本（按五行配色） */
function ZLabel({ z, className = '' }) {
  return (
    <span className={className} style={{ color: WUXING_COLOR[WUXING_ZHI[z]] }}>
      {z}
    </span>
  )
}

/** 关系表卡片 */
function RelCard({ title, desc, rows }) {
  return (
    <section className="rounded-xl border border-border bg-panel p-4">
      <h3 className="text-sm font-medium text-gold">{title}</h3>
      {desc && <p className="mt-0.5 text-xs text-muted">{desc}</p>}
      <ul className="mt-3 space-y-1.5 text-sm">
        {rows.map((row, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {row}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** 组内地支（用 /、/、 连接，色按各自五行） */
function ZhiGroup({ items, sep = '、' }) {
  return items.map((z, i) => (
    <Fragment key={z + i}>
      {i > 0 && <span className="text-muted">{sep}</span>}
      <ZLabel z={z} />
    </Fragment>
  ))
}

export default function ChonghePage() {
  const [showChong, setShowChong] = useState(true)
  const [showHe, setShowHe] = useState(true)

  const toggleCls = (on) =>
    `rounded-md border px-3 py-1.5 text-xs transition-colors ${
      on ? 'border-gold bg-goldSoft text-gold' : 'border-border text-muted hover:text-text'
    }`

  return (
    <div className="space-y-4">
      {/* 说明 */}
      <section className="rounded-xl border border-border bg-panel p-4 sm:p-5">
        <h2 className="mb-1 text-base font-medium text-gold">生克冲合</h2>
        <p className="text-sm leading-relaxed text-muted">
          十二地支之间的生克冲合关系，是判断六爻旺衰、应期与吉凶的重要依据。
          红色连线为六冲（对宫相冲，冲散之象），金色连线为六合（合住之象）。
        </p>
      </section>

      {/* 圆环图 */}
      <section className="rounded-xl border border-border bg-panel p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button type="button" className={toggleCls(showChong)} onClick={() => setShowChong((v) => !v)}>
            <span className="mr-1 inline-block h-0.5 w-3 align-middle" style={{ background: 'var(--red)' }} />
            六冲
          </button>
          <button type="button" className={toggleCls(showHe)} onClick={() => setShowHe((v) => !v)}>
            <span className="mr-1 inline-block h-0.5 w-3 align-middle" style={{ background: 'var(--gold)' }} />
            六合
          </button>
        </div>

        <svg viewBox="0 0 320 320" className="mx-auto h-auto w-full max-w-md">
          {/* 外圈 */}
          <circle cx={CX} cy={CY} r={R + 22} fill="none" stroke="var(--border)" strokeWidth="1" />
          <circle cx={CX} cy={CY} r={R - 24} fill="none" stroke="var(--border)" strokeWidth="1" strokeDasharray="3 4" />

          {/* 六冲连线（红线） */}
          {showChong &&
            LIU_CHONG.map(([a, b]) => {
              const p1 = pos(ZHI.indexOf(a))
              const p2 = pos(ZHI.indexOf(b))
              return (
                <line
                  key={a + b}
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke="var(--red)"
                  strokeWidth="1.5"
                  strokeOpacity="0.7"
                />
              )
            })}

          {/* 六合连线（金线） */}
          {showHe &&
            LIU_HE.map(([a, b]) => {
              const p1 = pos(ZHI.indexOf(a))
              const p2 = pos(ZHI.indexOf(b))
              return (
                <line
                  key={a + b}
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke="var(--gold)"
                  strokeWidth="1.5"
                  strokeOpacity="0.8"
                />
              )
            })}

          {/* 十二地支 */}
          {ZHI.map((z, i) => {
            const p = pos(i)
            return (
              <g key={z}>
                <circle cx={p.x} cy={p.y} r={20} fill="var(--panel)" stroke="var(--border)" />
                <text
                  x={p.x}
                  y={p.y + 5}
                  textAnchor="middle"
                  fontSize="14"
                  fill={WUXING_COLOR[WUXING_ZHI[z]]}
                >
                  {z}
                </text>
              </g>
            )
          })}

          {/* 圆心说明 */}
          <text x={CX} y={CY - 4} textAnchor="middle" fontSize="13" fill="var(--muted)">
            十二地支
          </text>
          <text x={CX} y={CY + 14} textAnchor="middle" fontSize="11" fill="var(--muted)">
            子正北 · 顺时针
          </text>
        </svg>
      </section>

      {/* 五行生克 */}
      <section className="rounded-xl border border-border bg-panel p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-medium text-gold">五行生克</h3>
        <div className="flex flex-wrap items-center gap-1.5 text-sm">
          {['木', '火', '土', '金', '水'].map((w, i) => (
            <Fragment key={w}>
              {i > 0 && <span className="text-muted">→</span>}
              <span style={{ color: WUXING_COLOR[w] }}>{w}</span>
            </Fragment>
          ))}
          <span className="text-muted">→</span>
          <span style={{ color: WUXING_COLOR['木'] }}>木</span>
          <span className="ml-3 text-xs text-muted">相生</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
          {['木', '土', '水', '火', '金'].map((w, i) => (
            <Fragment key={w}>
              {i > 0 && <span className="text-muted">→</span>}
              <span style={{ color: WUXING_COLOR[w] }}>{w}</span>
            </Fragment>
          ))}
          <span className="text-muted">→</span>
          <span style={{ color: WUXING_COLOR['木'] }}>木</span>
          <span className="ml-3 text-xs text-muted">相克</span>
        </div>
      </section>

      {/* 六亲生克图 */}
      <section className="rounded-xl border border-border bg-panel p-4 sm:p-5">
        <h3 className="text-sm font-medium text-gold">六亲生克</h3>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">
          金色箭头为相生（父母生兄弟 → 兄弟生子孙 → 子孙生妻财 → 妻财生官鬼 → 官鬼生父母）；
          红色箭头为相克（父母克子孙 → 子孙克官鬼 → 官鬼克兄弟 → 兄弟克妻财 → 妻财克父母）。
        </p>
        <svg viewBox="0 0 320 320" className="mx-auto h-auto w-full max-w-md" role="img" aria-label="六亲生克关系图">
          <defs>
            <marker id="arrowGold" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse">
              <path d="M0,0 L8,4 L0,8 Z" fill="var(--gold)" />
            </marker>
            <marker id="arrowRed" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse">
              <path d="M0,0 L8,4 L0,8 Z" fill="var(--red)" />
            </marker>
          </defs>
          {/* 六亲节点（先绘，线条后绘浮于其上） */}
          {LIUQIN_ORDER.map((q, i) => {
            const p = qpos(i)
            return (
              <g key={q}>
                <circle cx={p.x} cy={p.y} r={26} fill="var(--panel)" stroke="var(--border)" strokeWidth="1" />
                <text x={p.x} y={p.y + 5} textAnchor="middle" fontSize="14" fill="var(--text)">
                  {q}
                </text>
              </g>
            )
          })}
          {/* 相生弧线（顺时针 相邻，贴节点外缘） */}
          {LIUQIN_ORDER.map((q, i) => {
            const n = (i + 1) % LIUQIN_ORDER.length
            const a = nodeEdge(qpos(i), false)
            const b = nodeEdge(qpos(n), false)
            // 二次贝塞尔：中点沿径向外推，弧线鼓向外侧
            const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
            const rr = Math.hypot(mid.x - QCX, mid.y - QCY)
            const c = { x: QCX + (mid.x - QCX) * (1 + 24 / rr), y: QCY + (mid.y - QCY) * (1 + 24 / rr) }
            return (
              <path
                key={`sheng-${q}`}
                d={`M ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`}
                fill="none"
                stroke="var(--gold)"
                strokeWidth="1.5"
                strokeOpacity="0.85"
                markerEnd="url(#arrowGold)"
              />
            )
          })}
          {/* 相克连线（红色 隔一节点，贴节点内缘） */}
          {LIUQIN_ORDER.map((q, i) => {
            const n = (i + 2) % LIUQIN_ORDER.length
            const a = nodeEdge(qpos(i), true)
            const b = nodeEdge(qpos(n), true)
            return (
              <line
                key={`ke-${q}`}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="var(--red)"
                strokeWidth="1.5"
                strokeOpacity="0.7"
                markerEnd="url(#arrowRed)"
              />
            )
          })}
          <text x={QCX} y={QCY - 4} textAnchor="middle" fontSize="12" fill="var(--muted)">
            六亲
          </text>
        </svg>
      </section>

      {/* 关系表 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <RelCard
          title="六冲"
          desc="对宫相冲，为冲散、变动之象"
          rows={LIU_CHONG.map(([a, b]) => (
            <Fragment key={a + b}>
              <ZLabel z={a} />
              <span className="mx-1 text-xs text-muted">冲</span>
              <ZLabel z={b} />
            </Fragment>
          ))}
        />
        <RelCard
          title="六合"
          desc="合住、和合、牵绊之象"
          rows={LIU_HE.map(([a, b]) => (
            <Fragment key={a + b}>
              <ZLabel z={a} />
              <span className="mx-1 text-xs text-muted">合</span>
              <ZLabel z={b} />
            </Fragment>
          ))}
        />
        <RelCard
          title="三合"
          desc="三支成局，力量最聚"
          rows={SAN_HE.map((s) => (
            <Fragment key={s.name}>
              <span className="text-xs text-muted">{s.name}·</span>
              <ZhiGroup items={s.zhis} />
            </Fragment>
          ))}
        />
        <RelCard
          title="相刑"
          desc="刑者伤也，多主刑伤、口舌"
          rows={XIANG_XING.map((x) => (
            <Fragment key={x.name}>
              <span className="text-xs text-muted">{x.name}·</span>
              <ZhiGroup items={x.zhis} />
            </Fragment>
          ))}
        />
        <RelCard
          title="相害"
          desc="暗害、隔阻之象"
          rows={XIANG_HAI.map(([a, b]) => (
            <Fragment key={a + b}>
              <ZLabel z={a} />
              <span className="mx-1 text-xs text-muted">害</span>
              <ZLabel z={b} />
            </Fragment>
          ))}
        />
      </div>
    </div>
  )
}
