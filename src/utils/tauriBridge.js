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
