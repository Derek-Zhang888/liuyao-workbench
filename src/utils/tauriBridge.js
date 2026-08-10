/**
 * Tauri 运行时能力封装（桌面端 / Android）
 *
 * - isTauri()：当前是否运行在 Tauri 容器内（Web 版为 false）
 * - setCloseBehavior(toTray)：通知 Rust 端关闭窗口行为（托盘 / 直接退出）
 * - pickDirectory(title)：调用系统目录选择器，返回绝对路径或 null
 * - writeToDir(dir, fileName, content)：把内容写入指定目录（Tauri 专用）
 * - getDefaultExportDir()：获取/创建默认导出目录（文档/六爻工作台导出），保证导出必成功
 * - openExportDir(dir)：在文件管理器中打开目录（opener 插件）
 *
 * Web 版（浏览器）无法自定义保存路径，由调用方 fallback 到浏览器下载。
 */
import { isTauri as tauriIsTauri } from '@tauri-apps/api/core'
import { writeTextFile, writeFile, mkdir } from '@tauri-apps/plugin-fs'
import { open, save } from '@tauri-apps/plugin-dialog'

/** 是否运行在 Tauri 容器内 */
export function isTauri() {
  try {
    return typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__
  } catch {
    return false
  }
}

/**
 * 是否 Android（Tauri Android WebView；桌面 Tauri / Web 均为 false）
 * 2026-08-09 二修：UA + platform 双保险判断，防止个别 WebView 定制 UA 漏判
 * 导致「安卓被当成桌面」而显示桌面专属设置（曾引发关闭窗口/自定义路径混淆）
 */
export function isAndroid() {
  try {
    if (typeof navigator === 'undefined') return false
    const ua = `${navigator.userAgent || ''} ${navigator.platform || ''}`
    return /android/i.test(ua)
  } catch {
    return false
  }
}

/** 是否 Tauri 桌面端（Windows/macOS/Linux，不含 Android） */
export function isDesktop() {
  return isTauri() && !isAndroid()
}

/** 通知 Rust：关闭窗口行为（true=最小化到托盘，false=直接退出） */
export async function setCloseBehavior(toTray) {
  if (!isTauri()) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('set_close_behavior', { toTray })
  } catch (e) {
    console.warn('set_close_behavior failed:', e)
  }
}

/** 内容 → base64（字符串按 UTF-8 编码，中文安全；二进制直接转换；大块分片防栈溢出） */
function toBase64(content) {
  const bytes = content instanceof Uint8Array ? content : new TextEncoder().encode(String(content))
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

/**
 * 安卓导出到公共 Download/六爻工作台（MediaStore，免权限；坚果云等同步 App 可访问）。
 * 2026-08-10：解决安卓端导出落 app data 沙盒目录、同步工具无法访问的问题。
 * @param {string} fileName 文件名（含扩展名）
 * @param {string|Uint8Array} content 文件内容
 * @returns {Promise<string|null>} content URI 字符串；非 Android 返回 null。
 * 失败时抛出 Error（携带 Rust/Kotlin 侧真实错误信息，2026-08-10 改为不吞错，
 * 之前统一吞成 null 导致 UI 只能显示硬编码「无法写入所选位置」，无法定位根因）。
 */
export async function androidExportDefault(fileName, content) {
  if (!isAndroid()) return null
  const { invoke } = await import('@tauri-apps/api/core')
  return await invoke('plugin:androidExportPlugin|save_default', {
    fileName,
    content: toBase64(content),
  })
}

/**
 * 安卓导出弹系统「保存到」选择器（SAF CreateDocument），用户选任意位置。
 * @returns {Promise<string|null>} content URI 字符串；非 Android 返回 null；取消/失败抛 Error
 */
export async function androidExportPick(fileName, content) {
  if (!isAndroid()) return null
  const { invoke } = await import('@tauri-apps/api/core')
  return await invoke('plugin:androidExportPlugin|save_pick', {
    fileName,
    content: toBase64(content),
  })
}

/** 启动时读取持久化的关闭窗口行为并通知 Rust（默认托盘）；非 Tauri 环境静默跳过 */
export async function initCloseBehavior() {
  if (!isTauri()) return
  try {
    const { getSetting } = await import('../db/settingsRepo.js')
    const v = await getSetting('close-behavior')
    await setCloseBehavior(v !== 'quit')
  } catch (e) {
    console.warn('initCloseBehavior failed:', e)
  }
}

/** 弹出目录选择器，返回选中目录绝对路径；取消返回 null */
export async function pickDirectory(title = '选择保存目录') {
  if (!isTauri()) return null
  try {
    const dir = await open({ directory: true, title })
    return typeof dir === 'string' ? dir : null
  } catch (e) {
    console.warn('pickDirectory failed:', e)
    return null
  }
}

/**
 * 获取默认导出目录（文档/六爻工作台导出），不存在则自动创建。
 * 用于未设置自定义路径时的兜底，确保导出必成功。
 * @returns {Promise<string|null>} 目录绝对路径；非 Tauri 或失败返回 null
 */
export async function getDefaultExportDir() {
  if (!isTauri()) return null
  try {
    const { documentDir, join } = await import('@tauri-apps/api/path')
    const base = await documentDir()
    const dir = await join(base, '六爻工作台导出')
    // 目录不存在则创建（recursive）
    try {
      await mkdir(dir, { recursive: true })
    } catch (_) {
      /* 已存在则忽略 */
    }
    return dir
  } catch (e) {
    console.warn('getDefaultExportDir failed:', e)
    return null
  }
}

/**
 * 把内容写入指定目录（Tauri 专用；Web 版返回 false 由调用方走浏览器下载）
 * @returns {Promise<{ok: boolean, path?: string, error?: string}>}
 */
export async function writeToDir(dir, fileName, content) {
  if (!isTauri() || !dir) return { ok: false }
  try {
    const { join } = await import('@tauri-apps/api/path')
    const full = await join(dir, fileName)
    // 二进制（Uint8Array）用 writeFile，文本字符串用 writeTextFile
    if (content instanceof Uint8Array) {
      await writeFile(full, content)
    } else {
      await writeTextFile(full, content)
    }
    return { ok: true, path: full }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

/**
 * 弹保存对话框（Tauri 专用，让用户直接选文件保存位置）。
 * 取消时返回 { ok:false, message:'已取消保存' }，与失败区分。
 * @returns {Promise<{ok: boolean, path?: string, error?: string, message?: string}>}
 */
export async function saveFileDialog(defaultName, content, filters) {
  if (!isTauri()) return { ok: false, message: '当前环境不支持保存对话框' }
  try {
    const path = await save({
      defaultPath: defaultName,
      filters,
    })
    if (!path) return { ok: false, message: '已取消保存' }
    if (content instanceof Uint8Array) {
      await writeFile(path, content)
    } else {
      await writeTextFile(path, content)
    }
    return { ok: true, path }
  } catch (e) {
    return { ok: false, error: e.message, message: `保存失败：${e.message}` }
  }
}

/** 在系统文件管理器中打开目录（Rust command：explorer/open/xdg-open）；失败返回 false */
export async function openExportDir(dir) {
  if (!isTauri() || !dir) return false
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('open_dir', { path: dir })
    return true
  } catch (e) {
    console.warn('openExportDir failed:', e)
    return false
  }
}

// 供外部显式 import 使用（避免 tree-shaking 告警）
export const __tauriExports = { tauriIsTauri }
