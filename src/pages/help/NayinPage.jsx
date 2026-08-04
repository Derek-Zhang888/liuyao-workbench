/**
 * 六十甲子纳音页（Task 12）
 *
 * 六十甲子纳音表：按六旬（甲子/甲戌/甲申/甲午/甲辰/甲寅旬）分组，
 * 纳音名与五行按纳音五行映射 WUXING_COLOR 配色；表格横向滚动适配手机。
 */
import { Fragment } from 'react'
import { NAYIN_60, NAYIN_XUN } from '../../data/helpData.js'
import { WUXING_COLOR } from '../../engine/paipan.js'

const WUXING_ORDER = ['木', '火', '土', '金', '水']

export default function NayinPage() {
  return (
    <div className="space-y-4">
      {/* 说明 + 五行图例 */}
      <section className="rounded-xl border border-border bg-panel p-4 sm:p-5">
        <h2 className="mb-1 text-base font-medium text-gold">六十甲子纳音</h2>
        <p className="text-sm leading-relaxed text-muted">
          干支组合共六十组，两两一组纳音相同（如甲子、乙丑同属海中金）。纳音五行常用于取象与旺衰参考。
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {WUXING_ORDER.map((w) => (
            <span
              key={w}
              className="rounded-md border border-border px-2.5 py-1 text-xs"
              style={{ color: WUXING_COLOR[w] }}
            >
              五行·{w}
            </span>
          ))}
        </div>
      </section>

      {/* 纳音表 */}
      <section className="overflow-hidden rounded-xl border border-border bg-panel">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-border bg-black/20 text-xs text-muted">
                <th className="px-4 py-2 text-left font-normal">干支</th>
                <th className="px-4 py-2 text-left font-normal">纳音</th>
                <th className="px-4 py-2 text-left font-normal">五行</th>
              </tr>
            </thead>
            <tbody>
              {NAYIN_60.map((n, i) => {
                const xun = NAYIN_XUN[Math.floor(i / 10)]
                const first = i % 10 === 0
                return (
                  <Fragment key={n.gz}>
                    {first && (
                      <tr className="border-y border-border bg-black/30">
                        <td colSpan={3} className="px-4 py-1.5 text-xs text-gold">
                          {xun}
                        </td>
                      </tr>
                    )}
                    <tr className="border-b border-border/60 transition-colors last:border-0 hover:bg-goldSoft">
                      <td className="px-4 py-1.5 text-text">{n.gz}</td>
                      <td className="px-4 py-1.5 font-medium" style={{ color: WUXING_COLOR[n.wuxing] }}>
                        {n.nayin}
                      </td>
                      <td className="px-4 py-1.5" style={{ color: WUXING_COLOR[n.wuxing] }}>
                        {n.wuxing}
                      </td>
                    </tr>
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
