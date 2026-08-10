//! 安卓导出插件（2026-08-10）
//!
//! 解决安卓端导出文件默认写入 app data 目录（Android 沙盒，坚果云等同步 App 无法访问）的问题：
//! - `save_default`：经 MediaStore 写入公共 `Download/六爻工作台/`（免权限，可被同步）
//! - `save_pick`：弹系统「保存到」选择器（SAF CreateDocument），用户选任意位置
//!
//! Rust 侧为 inline 插件（builder 名 `androidExportPlugin`），Android 侧对应
//! Kotlin 类 `AndroidExportPlugin`（@TauriPlugin，包 com.liuyao.workbench，注册于
//! gen/android/app/src/main/java/...，PluginManager 自动扫描）。
//! 内容字节由前端 base64 编码后传输。
#[cfg(mobile)]
mod mobile;
#[cfg(not(mobile))]
mod desktop;

#[cfg(mobile)]
use mobile as impl_mod;
#[cfg(not(mobile))]
use desktop as impl_mod;

use tauri::{
  plugin::{Builder, PluginHandle, TauriPlugin},
  AppHandle, Manager, Runtime,
};

/// 插件状态：桌面端为 None（导出命令返回「仅 Android 支持」），Android 端为已注册的移动插件句柄
pub struct AndroidExport<R: Runtime>(pub Option<PluginHandle<R>>);

#[tauri::command]
pub async fn save_default<R: Runtime>(
  app: tauri::AppHandle<R>,
  file_name: String,
  content: String,
) -> Result<String, String> {
  impl_mod::save(app, file_name, content, false).await
}

#[tauri::command]
pub async fn save_pick<R: Runtime>(
  app: tauri::AppHandle<R>,
  file_name: String,
  content: String,
) -> Result<String, String> {
  impl_mod::save(app, file_name, content, true).await
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("androidExportPlugin")
    .invoke_handler(tauri::generate_handler![save_default, save_pick])
    .setup(|app, api| {
      #[cfg(mobile)]
      let handle = mobile::init(app, api)?;
      #[cfg(desktop)]
      let handle: Option<PluginHandle<R>> = None;
      app.manage(AndroidExport(handle));
      Ok(())
    })
    .build()
}

/// 桌面端可能提示「AppHandle 未使用」——保留签名一致性
#[allow(dead_code)]
fn _desktop_anchor<R: Runtime>(_app: AppHandle<R>) {}
