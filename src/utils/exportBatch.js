/**
 * md 导出工具（Task 10 / v0.10 #11 / v1.0.1 自定义路径）
 *
 * 单条导出：downloadGuashiMd(guashi) → 生成 md 并保存
 * 批量导出：downloadGuashiBatch(list) → 打成 zip（v0.10 #11 改进）后保存单一压缩包
 *           Stored 模式，无压缩；自实现 zip 工具，无外部依赖
 * v1.0.1：Tauri 端按自定义导出路径保存并提示完整路径；Web 端浏览器下载
 */
import { guashiToMd } from '../md/exportMd.js'
import { createZip, utf8, stamp } from './zip.js'
import { saveExport } from './exportHelper.js'

/** 安全文件名：去掉 Windows/浏览器非法字符 + 重复 → 避免 zip 内同名冲突 */
export function safeFileName(title) {
  const base = (title || '卦例').replace(/[\\/:*?"<>|]/g, '_').trim() || '卦例'
  return base
}

/** 文件名去重：同目录内同名追加 (1)、(2)… */
function uniquifyNames(items) {
  const seen = new Map()
  return items.map(({ title, data }) => {
    const base = safeFileName(title)
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    const name = n === 1 ? `${base}.md` : `${base}(${n - 1}).md`
    return { name, data }
  })
}

/** 下载单条卦例的 md 文件 */
export async function downloadGuashiMd(guashi) {
  const md = guashiToMd(guashi)
  const fileName = `${safeFileName(guashi.title)}.md`
  return saveExport('md', fileName, md, 'text/markdown;charset=utf-8', { name: 'Markdown', extensions: ['md'] })
}

/** 批量导出：把选中卦例打成 zip 后整体下载 */
export async function downloadGuashiBatch(guashiList) {
  if (!guashiList || guashiList.length === 0) return
  const items = uniquifyNames(
    guashiList.map((g) => ({ title: g.title, data: utf8(guashiToMd(g)) })),
  )
  const buf = createZip(items, new Date())
  // 文件名：卦例导出-YYYY-MM-DD HH:mm.zip（冒号在 Windows 不合法，换成 HHmm）
  const safeStamp = stamp().replace(/[: ]/g, '-')
  const fileName = `卦例导出-${safeStamp}.zip`
  // zip 是二进制：Tauri 端传 Uint8Array（writeFile），Web 端 Blob 下载
  return saveExport('md', fileName, new Uint8Array(buf), 'application/zip', { name: 'ZIP', extensions: ['zip'] })
}
