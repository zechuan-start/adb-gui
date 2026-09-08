use tauri::{AppHandle, Listener};

fn settings_label(locale: &str) -> Option<&'static str> {
    match locale {
        "zh-CN" => Some("设置…"),
        "en" => Some("Settings…"),
        _ => None,
    }
}

fn initial_locale(languages: impl IntoIterator<Item = String>) -> &'static str {
    let first = languages.into_iter().find(|language| !language.is_empty());
    if first
        .as_deref()
        .and_then(|language| language.split('-').next())
        .is_some_and(|language| language.eq_ignore_ascii_case("zh"))
    {
        "zh-CN"
    } else {
        "en"
    }
}

pub fn settings_item(
    app: &AppHandle,
    id: &str,
) -> tauri::Result<tauri::menu::MenuItem<tauri::Wry>> {
    let locale = initial_locale(sys_locale::get_locales());
    let item = tauri::menu::MenuItem::with_id(
        app,
        id,
        settings_label(locale).expect("resolved menu locale"),
        true,
        Some("Cmd+,"),
    )?;
    let settings = item.clone();
    // Register while building the native menu, before the WebView's first emit.
    app.listen("locale-changed", move |event| {
        let locale = serde_json::from_str::<String>(event.payload());
        let label = locale.as_deref().ok().and_then(settings_label);
        let Some(label) = label else {
            eprintln!("invalid native menu locale payload");
            return;
        };
        if let Err(error) = settings.set_text(label) {
            eprintln!("failed to update settings menu language: {error}");
        }
    });
    Ok(item)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn system_menu_uses_the_first_nonempty_language_only() {
        for (languages, expected) in [
            (vec!["zh-CN"], "zh-CN"),
            (vec!["zh-TW"], "zh-CN"),
            (vec!["zh-Hant"], "zh-CN"),
            (vec!["ZH-hk"], "zh-CN"),
            (vec!["", "zh"], "zh-CN"),
            (vec!["en-US", "zh-CN"], "en"),
            (vec!["fr"], "en"),
            (vec![], "en"),
        ] {
            assert_eq!(
                initial_locale(languages.into_iter().map(String::from)),
                expected
            );
        }
    }

    #[test]
    fn events_accept_only_resolved_locales() {
        assert_eq!(settings_label("zh-CN"), Some("设置…"));
        assert_eq!(settings_label("en"), Some("Settings…"));
        for invalid in ["system", "zh", "zh-TW", "", "en-US"] {
            assert_eq!(settings_label(invalid), None);
        }
    }
}
