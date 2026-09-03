mod adb;
mod commands;

use std::time::Duration;
use tauri::{AppHandle, Emitter};

#[cfg(target_os = "macos")]
use tauri::Manager;

#[cfg(target_os = "macos")]
const HIDE_WINDOW_MENU_ID: &str = "hide-window";

#[cfg(target_os = "macos")]
const HIDE_WINDOW_FROM_WINDOW_MENU_ID: &str = "hide-window-from-window-menu";

fn start_device_poll(app: &AppHandle) {
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            if adb::is_shutting_down(&app_handle) {
                break;
            }
            if let Ok(devices) = commands::device::list_devices(app_handle.clone()).await {
                if adb::is_shutting_down(&app_handle) {
                    break;
                }
                let _ = app_handle.emit("devices-updated", &devices);
            }
            tokio::time::sleep(Duration::from_secs(3)).await;
        }
    });
}

#[cfg(target_os = "macos")]
fn macos_menu(app: &AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    use tauri::menu::{
        AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu, HELP_SUBMENU_ID,
        WINDOW_SUBMENU_ID,
    };

    let package_info = app.package_info();
    let config = app.config();
    let about_metadata = AboutMetadata {
        name: Some(package_info.name.clone()),
        version: Some(package_info.version.to_string()),
        copyright: config.bundle.copyright.clone(),
        authors: config
            .bundle
            .publisher
            .clone()
            .map(|publisher| vec![publisher]),
        ..Default::default()
    };

    let app_menu = Submenu::with_items(
        app,
        package_info.name.clone(),
        true,
        &[
            &PredefinedMenuItem::about(app, None, Some(about_metadata))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;
    let file_menu = Submenu::with_items(
        app,
        "File",
        true,
        &[&MenuItem::with_id(
            app,
            HIDE_WINDOW_MENU_ID,
            "Close Window",
            true,
            Some("CmdOrCtrl+W"),
        )?],
    )?;
    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;
    let view_menu = Submenu::with_items(
        app,
        "View",
        true,
        &[&PredefinedMenuItem::fullscreen(app, None)?],
    )?;
    let window_menu = Submenu::with_id_and_items(
        app,
        WINDOW_SUBMENU_ID,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(
                app,
                HIDE_WINDOW_FROM_WINDOW_MENU_ID,
                "Close Window",
                true,
                None::<&str>,
            )?,
        ],
    )?;
    let help_menu = Submenu::with_id_and_items(app, HELP_SUBMENU_ID, "Help", true, &[])?;

    Menu::with_items(
        app,
        &[
            &app_menu,
            &file_menu,
            &edit_menu,
            &view_menu,
            &window_menu,
            &help_menu,
        ],
    )
}

#[cfg(target_os = "macos")]
fn with_primary_window(app: &AppHandle, action: impl FnOnce(tauri::WebviewWindow<tauri::Wry>)) {
    if let Some(window) = app.webview_windows().into_values().next() {
        action(window);
    }
}

#[cfg(target_os = "macos")]
fn hide_primary_window(app: &AppHandle) {
    with_primary_window(app, |window| {
        if let Err(err) = window.hide() {
            eprintln!("failed to hide window: {err}");
        }
    });
}

#[cfg(target_os = "macos")]
fn show_primary_window(app: &AppHandle) {
    with_primary_window(app, |window| {
        if let Err(err) = window.show() {
            eprintln!("failed to show window: {err}");
            return;
        }
        if let Err(err) = window.set_focus() {
            eprintln!("failed to focus window: {err}");
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .manage(adb::AppState::new())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            start_device_poll(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::device::get_adb_info,
            commands::device::list_devices,
            commands::device::get_current_activity,
            commands::device_files::list_device_directory,
            commands::device_files::create_device_directory,
            commands::device_files::upload_device_file,
            commands::device_files::download_device_file,
            commands::device_files::preview_device_image,
            commands::image_file::read_image_file,
            commands::app::install_apk,
            commands::app::uninstall_app,
            commands::app::launch_app,
            commands::app::force_stop_app,
            commands::app::clear_app_data,
            commands::keys::send_key_event,
            commands::screenshot::take_screenshot,
            commands::logcat::clear_logcat,
            commands::logcat::get_package_pids,
            commands::logcat::list_device_processes,
            commands::logcat::export_logcat,
            commands::logcat::start_logcat,
            commands::logcat::stop_logcat,
            commands::device_info::get_device_info,
            commands::packages::list_packages,
            commands::app_icon::get_app_icon,
            commands::app_info::get_installed_apps,
            commands::app_info::get_installed_app_icons,
            commands::wifi::adb_connect,
            commands::wifi::adb_disconnect,
            commands::wifi::enable_wifi_debugging,
            commands::deeplink::open_deep_link,
            commands::port_forward::list_port_forwards,
            commands::port_forward::add_port_forward,
            commands::port_forward::remove_port_forward,
            commands::screen_record::start_screen_record,
            commands::screen_record::stop_screen_record,
            commands::screen_record::get_screen_record_status,
            commands::bug_report::collect_quick_bug_report,
            commands::bug_report::collect_full_bugreport,
        ]);

    #[cfg(target_os = "macos")]
    let builder = builder.menu(macos_menu).on_menu_event(|app, event| {
        if event.id() == HIDE_WINDOW_MENU_ID || event.id() == HIDE_WINDOW_FROM_WINDOW_MENU_ID {
            hide_primary_window(app);
        }
    });

    let app = builder
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    app.run(|_app, event| match event {
        tauri::RunEvent::Exit => {
            adb::begin_shutdown(_app);
            if let Err(error) =
                tauri::async_runtime::block_on(commands::logcat::shutdown_logcat_sessions())
            {
                eprintln!("failed to stop Logcat sessions during application exit: {error}");
            }
            if let Err(error) = adb::shutdown_embedded_adb_server(_app) {
                eprintln!("failed to stop bundled ADB server during application exit: {error}");
            }
        }
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen {
            has_visible_windows: false,
            ..
        } => show_primary_window(_app),
        _ => {}
    });
}
