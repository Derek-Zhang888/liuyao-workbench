/**
 * 常见取象页（Task 12）
 *
 * 三个分区：
 *   - 爻位取象：初爻=基层/脚 … 上爻=高层/头
 *   - 十二地支取象：地支 / 生肖 / 五行 / 方位 / 时辰 / 常见取象
 *   - 六亲六兽取象：六亲（生克关系 + 取象）、六神（五行 + 取象）
 * 表格横向滚动适配手机；地支按五行配色。
 */
import { WUXING_ZHI } from '../../engine/ganzhi.js'
import { WUXING_COLOR } from '../../engine/paipan.js'
import {
  YAO_QUXIANG,
  DIZHI_QUXIANG,
  LIUQIN_QUXIANG,
  LIUSHEN_QUXIANG,
} from '../../data/helpData.js'

/** 表格容器（横向滚动） */
function TableBox({ title, hint, children }) {
  return (
    <section className="overflow-hidden card rounded-xl border border-border bg-panel">
      <div className="flex flex-wrap items-baseline gap-2 border-b border-border bg-black/20 px-4 py-2">
        <h3 className="text-sm font-medium text-gold">{title}</h3>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  )
}

export default function QuXiangPage() {
  return (
    <div className="space-y-4">
      {/* 爻位取象 */}
      <TableBox title="爻位取象" hint="自下而上六位，位越升权重越大">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th className="px-4 py-2 text-left font-normal">爻位</th>
              <th className="px-4 py-2 text-left font-normal">身体部位</th>
              <th className="px-4 py-2 text-left font-normal">象征意义</th>
            </tr>
          </thead>
          <tbody>
            {/* 上爻在上、初爻在下：数据源保持初→上，展示时反转 */}
            {[...YAO_QUXIANG].reverse().map((q) => (
              <tr key={q.line} className="border-b border-borderDim transition-colors last:border-0 hover:bg-goldSoft">
                <td className="px-4 py-2 text-gold">{q.line}</td>
                <td className="px-4 py-2 text-text">{q.body}</td>
                <td className="px-4 py-2 text-muted">{q.meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableBox>

      {/* 地支取象 */}
      <TableBox title="十二地支取象" hint="地支按五行配色">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th className="px-4 py-2 text-left font-normal">地支</th>
              <th className="px-4 py-2 text-left font-normal">生肖</th>
              <th className="px-4 py-2 text-left font-normal">五行</th>
              <th className="px-4 py-2 text-left font-normal">方位</th>
              <th className="px-4 py-2 text-left font-normal">时辰</th>
              <th className="px-4 py-2 text-left font-normal">常见取象</th>
            </tr>
          </thead>
          <tbody>
            {DIZHI_QUXIANG.map((q) => (
              <tr key={q.zhi} className="border-b border-borderDim transition-colors last:border-0 hover:bg-goldSoft">
                <td className="px-4 py-2 font-medium" style={{ color: WUXING_COLOR[q.wuxing] }}>
                  {q.zhi}
                </td>
                <td className="px-4 py-2 text-text">{q.shengxiao}</td>
                <td className="px-4 py-2" style={{ color: WUXING_COLOR[q.wuxing] }}>
                  {q.wuxing}
                </td>
                <td className="px-4 py-2 text-muted">{q.fangwei}</td>
                <td className="px-4 py-2 whitespace-nowrap text-muted">{q.shichen}</td>
                <td className="px-4 py-2 text-muted">{q.image}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableBox>

      {/* 六亲六兽取象 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TableBox title="六亲取象" hint="以卦中五行为我，分生克关系">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th className="px-4 py-2 text-left font-normal">六亲</th>
                <th className="px-4 py-2 text-left font-normal">关系</th>
                <th className="px-4 py-2 text-left font-normal">常见取象</th>
              </tr>
            </thead>
            <tbody>
              {LIUQIN_QUXIANG.map((q) => (
                <tr key={q.name} className="border-b border-borderDim align-top transition-colors last:border-0 hover:bg-goldSoft">
                  <td className="px-4 py-2 whitespace-nowrap text-gold">{q.name}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-muted">{q.relation}</td>
                  <td className="px-4 py-2 text-muted">{q.image}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableBox>

        <TableBox title="六神取象" hint="六神（六兽）随日干起，主性格与事象">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted">
                <th className="px-4 py-2 text-left font-normal">六神</th>
                <th className="px-4 py-2 text-left font-normal">五行</th>
                <th className="px-4 py-2 text-left font-normal">常见取象</th>
              </tr>
            </thead>
            <tbody>
              {LIUSHEN_QUXIANG.map((q) => (
                <tr key={q.name} className="border-b border-borderDim align-top transition-colors last:border-0 hover:bg-goldSoft">
                  <td className="px-4 py-2 whitespace-nowrap text-gold">{q.name}</td>
                  <td className="px-4 py-2 whitespace-nowrap" style={{ color: WUXING_COLOR[q.wuxing] }}>
                    {q.wuxing}
                  </td>
                  <td className="px-4 py-2 text-muted">{q.image}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableBox>
      </div>
    </div>
  )
}
