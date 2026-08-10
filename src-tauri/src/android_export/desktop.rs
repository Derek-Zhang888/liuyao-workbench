//! 桌面端：导出走原逻辑（本插件仅 Android 生效，调用返回「仅 Android 支持」）
use tauri::{AppHandle, Runtime};

pub async fn save<R: Runtime>(
  _app: AppHandle<R>,
  _file_name: String,
  _content: String,
  _pick: bool,
) -> Result<String, String> {
  Err("此功能仅 Android 端支持".to_string())
}
