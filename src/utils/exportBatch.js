/**
 * md 导出工具（Task 10）
 *
 * 单条导出：downloadGuashiMd(guashi) → 生成 Blob 并触发浏览器下载
 * 批量导出：downloadGuashiBatch(list) → 逐条下载（测试版策略，不引入 JSZip；
 *           浏览器对连续多文件下载有并发限制，间隔 400ms 依次触发）
 */
import { guashiToMd } from '../md/exportMd.js'

/** 安全文件名：去掉 Windows/浏览器非法字符 */
export function safeFileName(title) {
  return (title || '卦例').replace(/[\\/:*?"<>|]/g, '_')
}

/** 下载单条卦例的 md 文件 */
export function downloadGuashiMd(guashi) {
  const md = guashiToMd(guashi)
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeFileName(guashi.title)}.md`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** 批量下载：逐条触发（间隔 400ms，防浏览器拦截连续下载） */
export async function downloadGuashiBatch(guashiList) {
  for (const g of guashiList) {
    downloadGuashiMd(g)
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 400))
  }
}