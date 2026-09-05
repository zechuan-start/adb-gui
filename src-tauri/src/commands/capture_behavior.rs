#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveBehavior {
    pub open_after_save: bool,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotBehavior {
    pub open_after_save: bool,
    pub reveal_after_save: bool,
}

pub fn after_save<E: std::fmt::Display>(
    enabled: bool,
    action: impl FnOnce() -> Result<(), E>,
) -> bool {
    if !enabled {
        return false;
    }
    match action() {
        Ok(()) => true,
        Err(error) => {
            eprintln!("saved capture, but opener failed: {error}");
            false
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disabled_actions_never_call_opener() {
        for open in [false, true] {
            for reveal in [false, true] {
                let calls = std::cell::Cell::new(0);
                let action = || {
                    calls.set(calls.get() + 1);
                    Ok::<(), String>(())
                };
                assert_eq!(after_save(open, action), open);
                assert_eq!(after_save(reveal, action), reveal);
                assert_eq!(calls.get(), usize::from(open) + usize::from(reveal));
            }
        }
        assert!(!after_save(true, || Err("opener failed")));
    }

    #[test]
    fn behaviors_are_required() {
        assert!(serde_json::from_str::<SaveBehavior>("{}").is_err());
        assert!(serde_json::from_str::<ScreenshotBehavior>(r#"{"openAfterSave":true}"#).is_err());
    }
}
