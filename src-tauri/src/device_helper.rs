use std::path::{Path, PathBuf};
use std::process::{Output, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Manager};

use crate::{adb, commands::device::adb_output_error};

const PUSH_TIMEOUT: Duration = Duration::from_secs(30);
static DEPLOY_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
static NEXT_DEPLOY: AtomicU64 = AtomicU64::new(1);

pub fn resolve_app_info_dex_path(app: &AppHandle) -> Result<PathBuf, String> {
    let path = app
        .path()
        .resource_dir()
        .map_err(|error| format!("Failed to locate application resources: {error}"))?
        .join("app-info.dex");
    if !path.is_file() {
        return Err(format!("Bundled app-info.dex was not found at {}. Run scripts/build-app-info-dex/build.sh before packaging.", path.display()));
    }
    Ok(path)
}

pub fn fnv1a_64(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf29ce484222325_u64, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
    })
}

pub fn remote_dex_path(hash: u64) -> String {
    format!("/data/local/tmp/adb-gui-app-info-{hash:016x}.dex")
}

pub fn parse_ls_size_matches(output: &str, expected_size: u64) -> bool {
    output
        .split_ascii_whitespace()
        .nth(4)
        .and_then(|field| field.parse::<u64>().ok())
        == Some(expected_size)
}

pub async fn ensure_dex_pushed(
    app: &AppHandle,
    serial: &str,
    local_path: &Path,
    remote_path: &str,
    expected_size: u64,
    force: bool,
) -> Result<bool, String> {
    // Serialize publication across USB/WiFi aliases, but release before either helper runs.
    let _guard = deployment_lock(PUSH_TIMEOUT).await?;
    if !force {
        let probe =
            format!("if [ -f {remote_path} ]; then ls -l {remote_path}; else echo MISSING; fi");
        let output =
            run_adb_output(app, &["-s", serial, "shell", &probe], "inspect remote dex").await?;
        check_output(&output, "inspect remote dex")?;
        if parse_ls_size_matches(&String::from_utf8_lossy(&output.stdout), expected_size) {
            return Ok(false);
        }
    }

    let temporary = format!(
        "{remote_path}.{}-{}.tmp",
        std::process::id(),
        NEXT_DEPLOY.fetch_add(1, Ordering::Relaxed)
    );
    publish_dex(
        &local_path.to_string_lossy(),
        &temporary,
        remote_path,
        |args| async move {
            let mut scoped = vec!["-s", serial];
            scoped.extend(args.iter().map(String::as_str));
            let output = run_adb_output(app, &scoped, "publish helper dex").await?;
            check_output(&output, "publish helper dex")
        },
    )
    .await?;
    Ok(true)
}

async fn deployment_lock(
    timeout: Duration,
) -> Result<tokio::sync::MutexGuard<'static, ()>, String> {
    tokio::time::timeout(timeout, DEPLOY_LOCK.lock())
        .await
        .map_err(|_| "Timed out waiting for another DEX deployment.".to_string())
}

async fn publish_dex<F, Fut>(
    local: &str,
    temporary: &str,
    remote: &str,
    mut execute: F,
) -> Result<(), String>
where
    F: FnMut(Vec<String>) -> Fut,
    Fut: std::future::Future<Output = Result<(), String>>,
{
    let steps = [
        vec!["push", local, temporary],
        vec!["shell", "chmod", "444", temporary],
        vec!["shell", "mv", "-f", temporary, remote],
    ];
    for step in steps {
        if let Err(error) = execute(step.into_iter().map(str::to_string).collect()).await {
            let cleanup = execute(
                ["shell", "rm", "-f", temporary]
                    .into_iter()
                    .map(str::to_string)
                    .collect(),
            )
            .await;
            return Err(match cleanup {
                Ok(()) => error,
                Err(cleanup) => format!("{error}; temporary DEX cleanup failed: {cleanup}"),
            });
        }
    }
    Ok(())
}

fn check_output(output: &Output, operation: &str) -> Result<(), String> {
    if output.status.success() {
        return Ok(());
    }
    Err(format!(
        "Failed to {operation}: {}",
        adb_output_error(output)
    ))
}

async fn run_adb_output(app: &AppHandle, args: &[&str], operation: &str) -> Result<Output, String> {
    let adb_path = adb::resolve_adb_path(app)?;
    let child = adb::prepare_async_command(app, &adb_path)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|error| format!("Failed to {operation}: {error}"))?;
    tokio::time::timeout(PUSH_TIMEOUT, child.wait_with_output())
        .await
        .map_err(|_| format!("Timed out while trying to {operation}."))?
        .map_err(|error| format!("Failed to {operation}: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn size_probe_checks_the_size_column_only() {
        assert!(parse_ls_size_matches(
            "-r--r--r-- 1 shell shell 14224 2026-09-05 10:00 helper.dex",
            14224
        ));
        assert!(!parse_ls_size_matches(
            "-r--r--r-- 1 shell shell 14224 2026-09-05 10:00 helper.dex",
            1
        ));
        assert!(!parse_ls_size_matches("MISSING", 0));
    }

    #[tokio::test]
    async fn publication_never_overwrites_live_dex_and_cleans_failed_staging() {
        for failure in [None, Some(0), Some(1), Some(2)] {
            let calls = std::cell::RefCell::new(Vec::new());
            let result = publish_dex("local.dex", "staging.tmp", "live.dex", |args| {
                let index = calls.borrow().len();
                calls.borrow_mut().push(args);
                std::future::ready(if failure == Some(index) {
                    Err("failed".to_string())
                } else {
                    Ok(())
                })
            })
            .await;
            let calls = calls.into_inner();
            assert_eq!(calls[0], ["push", "local.dex", "staging.tmp"]);
            if let Some(index) = failure {
                assert!(result.is_err());
                assert_eq!(calls.len(), index + 2);
                assert_eq!(calls.last().unwrap(), &["shell", "rm", "-f", "staging.tmp"]);
            } else {
                assert!(result.is_ok());
                assert_eq!(calls[2], ["shell", "mv", "-f", "staging.tmp", "live.dex"]);
            }
        }
    }

    #[tokio::test]
    async fn alias_deployments_share_a_bounded_lock_released_before_execution() {
        let usb = deployment_lock(Duration::from_secs(1)).await.unwrap();
        assert!(deployment_lock(Duration::from_millis(10)).await.is_err());
        drop(usb);
        let wifi = deployment_lock(Duration::from_secs(1)).await.unwrap();
        drop(wifi);
        assert!(DEPLOY_LOCK.try_lock().is_ok());
    }
}
