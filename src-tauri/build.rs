fn main() {
  // 2026-08-10：安卓导出插件（androidExportPlugin）的 ACL 权限声明。
  // Tauri 2 的 ACL：带 `plugin:` 前缀的调用必须先在权限清单里定义权限，
  // 否则 release 构建下 invoke 会被 "Command ... not allowed by ACL" 拒绝
  // （桌面端此前未暴露是因为 isAndroid()=false 时前端根本不调用这两个命令）。
  // InlinedPlugin 会让 tauri-build 自动生成 allow-save-default / allow-save-pick
  // 权限，capabilities/default.json 里引用 androidExportPlugin:default 即放行全部命令。
  tauri_build::try_build(
    tauri_build::Attributes::new().plugin(
      "androidExportPlugin",
      tauri_build::InlinedPlugin::new()
        .commands(&["save_default", "save_pick"])
        .default_permission(tauri_build::DefaultPermissionRule::AllowAllCommands),
    ),
  )
  .expect("failed to run tauri-build");
}
