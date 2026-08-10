/**
 * 导出辅助（v1.0.1 修复）
 *
 * 统一三处导出（单条 md / 批量 md zip / 数据备份 json）的保存逻辑：
 * - Tauri 桌面/Android：保存优先级 = 自定义导出路径 → 默认导出目录（文档/六爻工作台导出，自动创建）
 *   → 全部失败才弹系统保存对话框并如实提示。**绝不出现「提示已导出但实际没有」**。
 * - Web 版（浏览器）：无法自定义路径 → 浏览器下载到系统下载目录，如实提示。
 *
 * 所有返回均携带 message：成功=完整保存路径，取消=已取消保存，失败=原因。
 * 同时返回 path（完整文件路径）和 dir（所在目录），便于 UI 显示与「打开目录」。
 */
import { isTauri, isAndroid, writeToDir, getDefaultExportDir, saveFileDialog, androidExportDefault, androidExportPick } from './tauriBridge.js'
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

/** 从完整文件路径提取目录（支持 Windows \ 与 POSIX /） */
function dirOfPath(filePath) {
  if (!filePath) return ''
  const i = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'))
  return i >= 0 ? filePath.slice(0, i) : filePath
}

/**
 * 保存导出文件。返回 {ok, message, dir, path, usedDefault}
 * @param {string} kind  'md' | 'backup' —— 决定用哪个自定义路径设置
 * @param {string} fileName  文件名（含扩展名）
 * @param {string|Uint8Array} content 文件内容（zip 为 Uint8Array）
 * @param {string} mime      浏览器下载用 MIME
 * @param {object} [filters] 保存对话框过滤器 { name, extensions: [] }
 */
export async function saveExport(kind, fileName, content, mime, filters) {
  // 2026-08-11 防御性日志：记录环境判断实际值，排查 UA 误判（安卓浏览器 isAndroid()=true
  // 但 isTauri()=false 曾导致误入安卓分支、invoke undefined 抛错）
  // eslint-disable-next-line no-console
  console.warn('[saveExport] env:', {
    isTauri: isTauri(),
    isAndroid: isAndroid(),
    kind,
    fileName,
  })
  // 2026-08-10 安卓分支：默认导出到公共 Download/六爻工作台（MediaStore，坚果云等可同步）；
  // 设置页可选「每次选择保存位置」（SAF CreateDocument 弹系统保存框）。
  // 不再落入 app data 沙盒目录——这是安卓端数据同步的前提。
  // 2026-08-11 三修：安卓分支必须 isTauri() && isAndroid() 双条件。
  // 安卓浏览器 UA 含 Android 会让 isAndroid() 误判为 true，但浏览器没有 Tauri runtime，
  // 直接调 androidExport* 会 invoke undefined 抛错。双条件后安卓浏览器走下方 Web 下载分支。
  if (isTauri() && isAndroid()) {
    let mode = 'default'
    try {
      mode = (await getSetting('export-android-mode')) || 'default'
    } catch (_) {}
    const fn = mode === 'pick' ? androidExportPick : androidExportDefault
    try {
      const path = await fn(fileName, content)
      return {
        ok: true,
        path,
        dir: mode === 'pick' ? '选择的位置' : '下载/六爻工作台',
        usedDefault: mode !== 'pick',
        message: mode === 'pick' ? '已导出' : '已导出到 下载/六爻工作台',
      }
    } catch (e) {
      // 2026-08-10：透传真实错误（ACL 拒绝 / MediaStore 失败 / 用户取消等），
      // 不再硬编码「无法写入所选位置」；取消选择不算失败
      const msg = e && e.message ? e.message : String(e)
      if (msg.includes('已取消')) return { ok: false, message: '已取消保存' }
      return { ok: false, message: msg.startsWith('导出失败') ? msg : `导出失败：${msg}` }
    }
  }
  if (isTauri() && !isAndroid()) {
    // 1) 读自定义路径设置（md → 'export-path-md'，backup → 'export-path-backup'）
    const key = kind === 'md' ? 'export-path-md' : 'export-path-backup'
    let dir = null
    try {
      dir = await getSetting(key)
    } catch (_) {}
    if (dir) {
      const r = await writeToDir(dir, fileName, content)
      if (r.ok) {
        return {
          ok: true,
          path: r.path,
          dir: dirOfPath(r.path),
          usedDefault: false,
          message: '已导出 md',
        }
      }
      // 自定义路径写入失败（目录失效/无权限）→ 降级默认目录
      console.warn('custom export path failed, fallback to default:', r.error)
    }

    // 2) 默认导出目录兜底（文档/六爻工作台导出，自动创建）
    const defDir = await getDefaultExportDir()
    if (defDir) {
      const r = await writeToDir(defDir, fileName, content)
      if (r.ok) {
        return {
          ok: true,
          path: r.path,
          dir: defDir,
          usedDefault: true,
          message: '已导出 md（默认目录）',
        }
      }
    }

    // 3) 都失败 → 弹系统保存对话框，取消/失败如实提示
    const s = await saveFileDialog(fileName, content, filters)
    if (s.ok) {
      return {
        ok: true,
        path: s.path,
        dir: dirOfPath(s.path),
        usedDefault: false,
        message: '已导出 md',
      }
    }
    return { ok: false, message: s.message || '保存失败，请检查磁盘空间或路径权限' }
  }

  // Web：浏览器下载
  browserDownload(fileName, content, mime)
  return { ok: true, message: '已导出到浏览器下载文件夹' }
}

/** 常用 md 过滤器 */
export const MD_FILTERS = { name: 'Markdown', extensions: ['md'] }
/** 常用 json 过滤器 */
export const JSON_FILTERS = { name: 'JSON', extensions: ['json'] }