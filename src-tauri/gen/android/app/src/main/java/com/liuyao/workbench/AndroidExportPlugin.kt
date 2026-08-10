package com.liuyao.workbench

import android.app.Activity
import android.content.ContentValues
import android.content.Intent
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * 安卓导出插件（2026-08-10）
 *
 * 解决导出文件写入 app data 目录（Android 沙盒，坚果云等同步 App 无法访问）的问题：
 * - saveDefault：MediaStore 写入公共 Download/六爻工作台/（Android 10+ 免权限，可被同步）
 * - savePick：ACTION_CREATE_DOCUMENT 弹系统「保存到」选择器，用户选任意位置（SAF）
 *
 * Rust 侧对应 src/android_export/mod.rs（builder 名 androidExportPlugin），
 * 内容字节由前端 base64 编码后传输。
 */
@InvokeArg
class SaveArgs {
  lateinit var fileName: String
  lateinit var content: String // base64 文件内容
}

@TauriPlugin
class AndroidExportPlugin(private val activity: Activity) : Plugin(activity) {
  init {
    instance = this
  }

  private var pendingInvoke: Invoke? = null
  private var pendingArgs: SaveArgs? = null

  @Command
  fun saveDefault(invoke: Invoke) {
    val args = invoke.parseArgs(SaveArgs::class.java)
    CoroutineScope(Dispatchers.IO).launch {
      try {
        val bytes = Base64.decode(args.content, Base64.NO_WRAP)
        val resolver = activity.contentResolver
        val values = ContentValues().apply {
          put(MediaStore.Downloads.DISPLAY_NAME, args.fileName)
          put(MediaStore.Downloads.MIME_TYPE, mimeOf(args.fileName))
          put(
            MediaStore.Downloads.RELATIVE_PATH,
            Environment.DIRECTORY_DOWNLOADS + "/六爻工作台"
          )
        }
        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
          ?: throw Exception("无法创建下载文件")
        val out = resolver.openOutputStream(uri) ?: throw Exception("无法写入文件")
        out.use { it.write(bytes) }
        invoke.resolve(JSObject().apply { put("path", uri.toString()) })
      } catch (e: Exception) {
        invoke.reject(e.message ?: "导出失败")
      }
    }
  }

  @Command
  fun savePick(invoke: Invoke) {
    val args = invoke.parseArgs(SaveArgs::class.java)
    val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = mimeOf(args.fileName)
      putExtra(Intent.EXTRA_TITLE, args.fileName)
    }
    pendingInvoke = invoke
    pendingArgs = args
    try {
      activity.startActivityForResult(intent, REQ_CREATE_DOC)
    } catch (e: Exception) {
      pendingInvoke = null
      pendingArgs = null
      invoke.reject("无法打开保存选择器：${e.message}")
    }
  }

  /** 系统保存选择器结果（由 MainActivity.onActivityResult 转发到此） */
  private fun handleCreateDocResult(resultCode: Int, data: Intent?) {
    val invoke = pendingInvoke ?: return
    val args = pendingArgs
    pendingInvoke = null
    pendingArgs = null
    if (resultCode != Activity.RESULT_OK || data?.data == null) {
      invoke.reject("已取消保存")
      return
    }
    val uri = data.data!!
    CoroutineScope(Dispatchers.IO).launch {
      try {
        val bytes = Base64.decode(args!!.content, Base64.NO_WRAP)
        val out = activity.contentResolver.openOutputStream(uri)
          ?: throw Exception("无法写入所选位置")
        out.use { it.write(bytes) }
        invoke.resolve(JSObject().apply { put("path", uri.toString()) })
      } catch (e: Exception) {
        invoke.reject(e.message ?: "保存失败")
      }
    }
  }

  private fun mimeOf(name: String): String {
    return when (name.substringAfterLast('.', "").lowercase()) {
      "json" -> "application/json"
      "md" -> "text/markdown"
      else -> "application/octet-stream"
    }
  }

  companion object {
    private const val REQ_CREATE_DOC = 1001
    private var instance: AndroidExportPlugin? = null

    /** MainActivity.onActivityResult 转发（Tauri Plugin 基类不转发 ActivityResult） */
    @JvmStatic
    fun forwardActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode == REQ_CREATE_DOC) {
        instance?.handleCreateDocResult(resultCode, data)
      }
    }
  }
}
