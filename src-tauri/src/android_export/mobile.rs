//! Android 侧：注册 Kotlin 插件 + run_mobile_plugin 调用（MediaStore / SAF）
use serde::de::DeserializeOwned;
use tauri::{
  plugin::{PluginApi, PluginHandle},
  AppHandle, Manager, Runtime,
};

/// Kotlin 插件注册信息：包名 com.liuyao.workbench + 类名 AndroidExportPlugin
const PLUGIN_IDENTIFIER: &str = "com.liuyao.workbench";
const CLASS_NAME: &str = "AndroidExportPlugin";

/// 插件初始化：Android 注册 Kotlin 插件类；其他（iOS/无）返回 None
pub fn init<R: Runtime, C: DeserializeOwned>(
  _app: &AppHandle<R>,
  api: PluginApi<R, C>,
) -> tauri::Result<Option<PluginHandle<R>>> {
  #[cfg(target_os = "android")]
  let handle: Option<PluginHandle<R>> = Some(api.register_android_plugin(PLUGIN_IDENTIFIER, CLASS_NAME)?);
  #[cfg(not(target_os = "android"))]
  let handle: Option<PluginHandle<R>> = None;
  Ok(handle)
}

#[derive(serde::Serialize)]
struct ExportReq {
  fileName: String,
  /// base64 编码的文件内容（前端已编码，原样透传给 Kotlin）
  content: String,
}

#[derive(serde::Deserialize)]
struct ExportRes {
  path: String,
}

/// 调用 Kotlin AndroidExportPlugin：pick=false → MediaStore 存 Download/六爻工作台；pick=true → SAF 选择器
pub async fn save<R: Runtime>(
  app: AppHandle<R>,
  file_name: String,
  content: String,
  pick: bool,
) -> Result<String, String> {
  let handle = app
    .state::<crate::android_export::AndroidExport<R>>()
    .0
    .clone()
    .ok_or_else(|| "此功能仅 Android 端支持".to_string())?;
  let req = ExportReq { fileName: file_name, content };
  let res: ExportRes = handle
    .run_mobile_plugin(if pick { "savePick" } else { "saveDefault" }, req)
    .map_err(|e| format!("Android 导出失败：{e}"))?;
  Ok(res.path)
}
