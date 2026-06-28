
mod adb;
mod commands;

use std::time::Duration;
use tauri::{AppHandle, Emitter};

fn start_device_poll(app: &AppHandle) {
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            if let Ok(devices) = commands::device::list_devices(app_handle.clone()) {
                let _ = app_handle.emit("devices-updated", &devices);
            }
            tokio::time::sleep(Duration::from_secs(3)).await;
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .manage(adb::AppState::new())
        .setup(|app| {
            start_device_poll(&app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::device::get_adb_info,
            commands::device::list_devices,
            commands::device::get_current_activity,
            commands::app::install_apk,
            commands::app::uninstall_app,
            commands::app::launch_app,
            commands::app::force_stop_app,
            commands::app::clear_app_data,
            commands::keys::send_key_event,
            commands::screenshot::take_screenshot,
            commands::logcat::start_logcat,
            commands::logcat::stop_logcat,
            commands::device_info::get_device_info,
            commands::packages::list_packages,
            commands::app_icon::get_app_icon,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
