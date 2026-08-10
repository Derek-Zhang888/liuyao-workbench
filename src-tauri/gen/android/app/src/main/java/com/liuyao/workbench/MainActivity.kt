package com.liuyao.workbench

import android.content.Intent
import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  // 2026-08-10：安卓导出插件「保存到任意位置」需要系统保存选择器结果。
  // Tauri 的 Plugin 基类不转发 ActivityResult，这里在 MainActivity 层补转发。
  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    AndroidExportPlugin.forwardActivityResult(requestCode, resultCode, data)
  }
}
