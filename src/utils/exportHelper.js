/**
 * 导出辅助（v1.0.1）
 *
 * 统一三处导出（单条 md / 批量 md zip / 数据备份 json）的保存逻辑：
 * - Tauri 桌面/Android：若设置了自定义导出路径 → 写入该目录并返回完整路径；
 *   未设置路径 → 弹系统保存对话框让用户选位置。
 * - Web 版（浏览器）：无法自定义路径 → 浏览器下载到系统下载目录，
 *   返回提示「已保存到浏览器下载文件夹」。
 */
import { isTauri, writeToDir, saveFileDialog } from './tauriBridge.js'
import { getSetting } from '../db/settingsRepo.js'

/** 触发浏览器下载（Web fallback） */
function browserDownload(fileName, content, mime) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * 保存导出文件。返回 {ok, message, path}
 * @param {string} kind  'md' | 'backup' —— 决定用哪个自定义路径设置
 * @param {string} fileName  文件名（含扩展名）
 * @param {string} content   文件内容（字符串）
 * @param {string} mime      浏览器下载用 MIME
 * @param {object} [filters] 保存对话框过滤器 { name, extensions: [] }
 */
export async function saveExport(kind, fileName, content, mime, filters) {
  if (isTauri()) {
    // 1) 读自定义路径设置（md → 'export-path-md'，backup → 'export-path-backup'）
    const key = kind === 'md' ? 'export-path-md' : 'export-path-backup'
    const dir = await getSetting(key)
    if (dir) {
      const r = await writeToDir(dir, fileName, content)
      if (r.ok) {
        return { ok: true, path: r.path, message: `已保存到：${r.path}` }
      }
      // 写入失败（路径失效等）→ 回退保存对话框
      const s = await saveFileDialog(fileName, content, filters)
      if (s.ok) return { ok: true, path: s.path, message: `已保存到：${s.path}` }
      return { ok: false, message: `自定义路径写入失败：${r.error ?? ''}，请检查路径` }
    }
    // 2) 未设置路径 → 弹系统保存对话框
    const s = await saveFileDialog(fileName, content, filters)
    if (s.ok) return { ok: true, path: s.path, message: `已保存到：${s.path}` }
    return { ok: false, message: '已取消保存' }
  }

  // Web：浏览器下载
  browserDownload(fileName, content, mime)
  return { ok: true, message: `已保存到浏览器下载文件夹：${fileName}` }
}

/** 常用 md 过滤器 */
export const MD_FILTERS = { name: 'Markdown', extensions: ['md'] }
/** 常用 json 过滤器 */
export const JSON_FILTERS = { name: 'JSON', extensions: ['json'] }
