use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Manager, WindowEvent};

#[cfg(desktop)]
use tauri::{
  menu::{Menu, MenuItem},
  tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
};

/// 关闭窗口行为：true = 最小化到托盘（默认），false = 直接退出
struct CloseBehavior(AtomicBool);

#[tauri::command]
fn set_close_behavior(state: tauri::State<CloseBehavior>, to_tray: bool) {
  state.0.store(to_tray, Ordering::SeqCst);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .manage(CloseBehavior(AtomicBool::new(true)))
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // 托盘图标（桌面端）：左键显示主窗口，菜单提供「显示 / 退出」
      #[cfg(desktop)]
      {
        let show_i = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
        let quit_i = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
        let menu = Menu::with_items(app, &[&show_i, &quit_i])?;
        TrayIconBuilder::with_id("main-tray")
          .icon(app.default_window_icon().unwrap().clone())
          .menu(&menu)
          .show_menu_on_left_click(false)
          .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
              if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
              }
            }
            "quit" => {
              app.exit(0);
            }
            _ => {}
          })
          .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
              button: MouseButton::Left,
              ..
            } = event
            {
              let app = tray.app_handle();
              if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
              }
            }
          })
          .build(app)?;
      }

      Ok(())
    })
    .on_window_event(|window, event| {
      // 关闭窗口时：若为「最小化到托盘」则拦截关闭并隐藏
      if let WindowEvent::CloseRequested { api, .. } = event {
        let state = window.state::<CloseBehavior>();
        if state.0.load(Ordering::SeqCst) {
          api.prevent_close();
          let _ = window.hide();
        }
      }
    })
    .invoke_handler(tauri::generate_handler![set_close_behavior])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
