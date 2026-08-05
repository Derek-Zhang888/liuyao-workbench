/**
 * 十二长生页（Task 12）
 *
 * 十二长生表：行=五行（木火土金水），列=长生…养 12 位。
 * 各五行长生位不同：木长生在亥、火长生在寅、金长生在巳、水土长生在申（阳干顺行）。
 * 地支文字按所在行五行配色；帝旺列加高亮；表格横向滚动适配手机。
 */
import { CHANGSHENG_STAGES, CHANGSHENG_ROWS } from '../../data/helpData.js'
import { WUXING_COLOR } from '../../engine/paipan.js'

const HIGHLIGHT_IDXS = new Set([
  CHANGSHENG_STAGES.indexOf('长生'),
  CHANGSHENG_STAGES.indexOf('帝旺'),
  CHANGSHENG_STAGES.indexOf('墓'),
  CHANGSHENG_STAGES.indexOf('绝'),
])

export default function ChangshengPage() {
  return (
    <div className="space-y-4">
      {/* 说明 */}
      <section className="rounded-xl border border-border bg-panel p-4 sm:p-5">
        <h2 className="mb-1 text-base font-medium text-gold">十二长生</h2>
        <p className="text-sm leading-relaxed text-muted">
          十二长生是五行在十二地支上的旺衰历程，共十二位，周而复始：
          长生 → 沐浴 → 冠带 → 临官 → 帝旺 → 衰 → 病 → 死 → 墓 → 绝 → 胎 → 养。
        </p>
        <ul className="mt-3 space-y-1 text-sm text-muted">
          <li>· 长生位：木长生在亥、火长生在寅、金长生在巳、水土长生在申（阳干顺行，阴干逆行，本表按阳干列出）。</li>
          <li>· 帝旺为最旺，墓为入库收藏，绝为最衰，胎养为新一轮孕育。</li>
          <li>· 与排盘页「旺相休囚死」（月建生克简化版）为两套体系，供交叉参考。</li>
        </ul>
      </section>

      {/* 十二长生表 */}
      <section className="overflow-hidden rounded-xl border border-border bg-panel">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-center text-sm">
            <thead>
              <tr className="border-b border-border bg-black/20 text-xs text-muted">
                <th className="px-3 py-2 text-left font-normal">五行</th>
                {CHANGSHENG_STAGES.map((s) => (
                  <th
                    key={s}
                    className={`px-2 py-2 font-normal ${HIGHLIGHT_IDXS.has(s) ? 'text-gold' : ''}`}
                  >
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CHANGSHENG_ROWS.map((row) => (
                <tr key={row.wuxing} className="border-b border-border/60 transition-colors last:border-0 hover:bg-goldSoft">
                  <td className="whitespace-nowrap px-3 py-2 text-left">
                    <span className="font-medium" style={{ color: WUXING_COLOR[row.wuxing] }}>
                      {row.wuxing}
                    </span>
                    <span className="ml-1.5 text-xs text-muted">长生在{row.start}</span>
                  </td>
                  {row.zhis.map((z, i) => (
                    <td
                      key={i}
                      className={`px-2 py-2 ${HIGHLIGHT_IDXS.has(i) ? 'bg-goldSoft' : ''}`}
                      style={{ color: WUXING_COLOR[row.wuxing] }}
                    >
                      {z}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
