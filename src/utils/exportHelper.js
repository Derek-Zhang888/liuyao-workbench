/**
 * 导出辅助（v1.0.1 修复）
 *
 * 统一三处导出（单条 md / 批量 md zip / 数据备份 json）的保存逻辑：
 * - Tauri 桌面/Android：保存优先级 = 自定义导出路径 → 默认导出目录（文档/六爻工作台导出，自动创建）
 *   → 全部失败才弹系统保存对话框并如实提示。**绝不出现「提示已导出但实际没有」**。
 * - Web 版（浏览器）：无法自定义路径 → 浏览器下载到系统下载目录，如实提示。
 *
 * 所有返回均携带 message：成功=完整保存路径，取消=已取消保存，失败=原因。
 */
import { isTauri, writeToDir, getDefaultExportDir, saveFileDialog } from './tauriBridge.js'
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
 * 保存导出文件。返回 {ok, message, path, usedDefault}
 * @param {string} kind  'md' | 'backup' —— 决定用哪个自定义路径设置
 * @param {string} fileName  文件名（含扩展名）
 * @param {string|Uint8Array} content 文件内容（zip 为 Uint8Array）
 * @param {string} mime      浏览器下载用 MIME
 * @param {object} [filters] 保存对话框过滤器 { name, extensions: [] }
 */
export async function saveExport(kind, fileName, content, mime, filters) {
  if (isTauri()) {
    // 1) 读自定义路径设置（md → 'export-path-md'，backup → 'export-path-backup'）
    const key = kind === 'md' ? 'export-path-md' : 'export-path-backup'
    let dir = null
    try {
      dir = await getSetting(key)
    } catch (_) {}
    if (dir) {
      const r = await writeToDir(dir, fileName, content)
      if (r.ok) {
        return { ok: true, path: r.path, usedDefault: false, message: `已保存到：${r.path}` }
      }
      // 自定义路径写入失败（目录失效/无权限）→ 降级默认目录
      console.warn('custom export path failed, fallback to default:', r.error)
    }

    // 2) 默认导出目录兜底（文档/六爻工作台导出，自动创建）
    const defDir = await getDefaultExportDir()
    if (defDir) {
      const r = await writeToDir(defDir, fileName, content)
      if (r.ok) {
        return { ok: true, path: r.path, usedDefault: true, message: `已保存到默认目录：${r.path}` }
      }
    }

    // 3) 都失败 → 弹系统保存对话框，取消/失败如实提示
    const s = await saveFileDialog(fileName, content, filters)
    if (s.ok) return { ok: true, path: s.path, usedDefault: false, message: `已保存到：${s.path}` }
    return { ok: false, message: s.message || '保存失败，请检查磁盘空间或路径权限' }
  }

  // Web：浏览器下载
  browserDownload(fileName, content, mime)
  return { ok: true, message: `已保存到浏览器下载文件夹：${fileName}` }
}

/** 常用 md 过滤器 */
export const MD_FILTERS = { name: 'Markdown', extensions: ['md'] }
/** 常用 json 过滤器 */
export const JSON_FILTERS = { name: 'JSON', extensions: ['json'] }
