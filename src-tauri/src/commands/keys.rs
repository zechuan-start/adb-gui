
use tauri::AppHandle;

use super::device::run_adb_with_serial;

#[derive(Clone, Copy)]
pub enum KeyAction {
    Back,
    Home,
    Recents,
    Enter,
    Delete,
    Power,
    VolumeUp,
    VolumeDown,
}

impl KeyAction {
    pub fn keycode(self) -> &'static str {
        match self {
            KeyAction::Back => "4",
            KeyAction::Home => "3",
            KeyAction::Recents => "187",
            KeyAction::Enter => "66",
            KeyAction::Delete => "67",
            KeyAction::Power => "26",
            KeyAction::VolumeUp => "24",
            KeyAction::VolumeDown => "25",
        }
    }
}

#[tauri::command]
pub fn send_key_event(app: AppHandle, serial: String, action: String) -> Result<String, String> {
    let keycode = match action.as_str() {
        "back" => KeyAction::Back.keycode(),
        "home" => KeyAction::Home.keycode(),
        "recents" => KeyAction::Recents.keycode(),
        "enter" => KeyAction::Enter.keycode(),
        "delete" => KeyAction::Delete.keycode(),
        "power" => KeyAction::Power.keycode(),
        "volume-up" => KeyAction::VolumeUp.keycode(),
        "volume-down" => KeyAction::VolumeDown.keycode(),
        _ => return Err(format!("Unsupported key action: {action}")),
    };

    run_adb_with_serial(&app, &serial, &["shell", "input", "keyevent", keycode])
}
