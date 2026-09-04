use std::collections::{HashMap, HashSet};
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, LazyLock,
};
use std::time::Duration;

use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufRead, AsyncBufReadExt, AsyncReadExt, BufReader};
use tokio::sync::Mutex;

use super::device_info::parse_battery_output;
use crate::adb;

const METRICS_SCRIPT: &str = r##"n=0
page_size=$(getconf PAGE_SIZE 2>/dev/null || echo 4096)
core_count=$(getconf _NPROCESSORS_ONLN 2>/dev/null || grep -c '^cpu[0-9]' /proc/stat)
echo "#I $page_size $core_count"
while true; do
  echo "#F"
  echo "#C"
  head -1 /proc/stat
  echo "#M"
  head -20 /proc/meminfo
  if [ $((n % 5)) = 0 ]; then
    echo "#P"
    cat /proc/[0-9]*/stat 2>/dev/null
    echo "#B"
    dumpsys battery
  fi
  echo "#/F"
  n=$((n+1))
  sleep 1
done"##;
const DEFAULT_PAGE_SIZE: u64 = 4096;
const DEFAULT_CORE_COUNT: u32 = 1;
const TOP_PROCESS_COUNT: usize = 15;
const STDERR_TAIL_MAX_BYTES: usize = 2 * 1024;
const STDERR_JOIN_TIMEOUT: Duration = Duration::from_millis(250);
const CHILD_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(3);

struct DeviceMetricsSession {
    serial: String,
    session_id: u64,
    child: tokio::process::Child,
}

static METRICS_SESSION: LazyLock<Mutex<Option<DeviceMetricsSession>>> =
    LazyLock::new(|| Mutex::new(None));
static METRICS_START_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));
static METRICS_SHUTTING_DOWN: AtomicBool = AtomicBool::new(false);
static NEXT_SESSION_ID: AtomicU64 = AtomicU64::new(1);

#[derive(serde::Serialize, Clone)]
pub struct DeviceMetricsSessionInfo {
    pub serial: String,
    pub session_id: u64,
}

#[derive(serde::Serialize, Clone)]
pub struct DeviceMetricsFrame {
    pub serial: String,
    pub session_id: u64,
    pub at_ms: i64,
    pub cpu: Option<CpuUsage>,
    pub memory: MemoryUsage,
    pub battery: Option<BatteryUsage>,
    pub processes: Option<Vec<ProcessUsage>>,
}

#[derive(serde::Serialize, Clone)]
pub struct CpuUsage {
    pub total_percent: f32,
    pub core_count: u32,
}

#[derive(serde::Serialize, Clone, Debug, PartialEq, Eq)]
pub struct MemoryUsage {
    pub total_kb: u64,
    pub available_kb: u64,
    pub used_kb: u64,
}

#[derive(serde::Serialize, Clone)]
pub struct BatteryUsage {
    pub level: String,
    pub status: String,
    pub temperature_c: Option<f32>,
}

#[derive(serde::Serialize, Clone, Debug, PartialEq)]
pub struct ProcessUsage {
    pub pid: String,
    pub comm: String,
    pub cpu_percent: f32,
    pub rss_kb: u64,
    pub is_new: bool,
}

#[derive(serde::Serialize, Clone)]
pub struct DeviceMetricsExit {
    pub serial: String,
    pub session_id: u64,
    pub reason: String,
    pub detail: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct CpuSnapshot {
    total: u64,
    idle: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct ProcessSnapshot {
    pid: String,
    comm: String,
    ticks: u64,
    start_time: u64,
    rss_pages: u64,
}

#[derive(Clone, Copy, Default)]
enum FrameSection {
    #[default]
    None,
    Cpu,
    Memory,
    Processes,
    Battery,
}

#[derive(Default)]
struct RawMetricsFrame {
    section: FrameSection,
    cpu: Option<String>,
    memory: Vec<String>,
    processes: Vec<String>,
    battery: Vec<String>,
    has_processes: bool,
    has_battery: bool,
}

impl RawMetricsFrame {
    fn push(&mut self, line: String) {
        match self.section {
            FrameSection::None => {}
            FrameSection::Cpu => self.cpu = Some(line),
            FrameSection::Memory => self.memory.push(line),
            FrameSection::Processes => self.processes.push(line),
            FrameSection::Battery => self.battery.push(line),
        }
    }
}

enum DecodedMetricsLine {
    Initialization { page_size: u64, core_count: u32 },
    Frame(RawMetricsFrame),
}

#[derive(Default)]
struct MetricsFrameDecoder {
    active_frame: Option<RawMetricsFrame>,
}

impl MetricsFrameDecoder {
    fn consume(&mut self, line: String) -> Option<DecodedMetricsLine> {
        match line.as_str() {
            "#F" => self.active_frame = Some(RawMetricsFrame::default()),
            "#/F" => return self.active_frame.take().map(DecodedMetricsLine::Frame),
            "#C" => {
                if let Some(frame) = self.active_frame.as_mut() {
                    frame.section = FrameSection::Cpu;
                }
            }
            "#M" => {
                if let Some(frame) = self.active_frame.as_mut() {
                    frame.section = FrameSection::Memory;
                }
            }
            "#P" => {
                if let Some(frame) = self.active_frame.as_mut() {
                    frame.section = FrameSection::Processes;
                    frame.has_processes = true;
                }
            }
            "#B" => {
                if let Some(frame) = self.active_frame.as_mut() {
                    frame.section = FrameSection::Battery;
                    frame.has_battery = true;
                }
            }
            _ => {
                if let Some((page_size, core_count)) = parse_initialization(&line) {
                    return Some(DecodedMetricsLine::Initialization {
                        page_size,
                        core_count,
                    });
                }
                if let Some(frame) = self.active_frame.as_mut() {
                    frame.push(line);
                }
            }
        }
        None
    }

    fn discard_incomplete(&mut self) {
        self.active_frame = None;
    }
}

struct MetricsState {
    page_size: u64,
    core_count: u32,
    previous_cpu: Option<CpuSnapshot>,
    previous_process_total: Option<u64>,
    previous_processes: HashMap<String, ProcessSnapshot>,
}

impl Default for MetricsState {
    fn default() -> Self {
        Self {
            page_size: DEFAULT_PAGE_SIZE,
            core_count: DEFAULT_CORE_COUNT,
            previous_cpu: None,
            previous_process_total: None,
            previous_processes: HashMap::new(),
        }
    }
}

fn parse_initialization(line: &str) -> Option<(u64, u32)> {
    let mut fields = line.strip_prefix("#I ")?.split_whitespace();
    let page_size = fields
        .next()
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(DEFAULT_PAGE_SIZE);
    let core_count = fields
        .next()
        .and_then(|value| value.parse::<u32>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(DEFAULT_CORE_COUNT);
    Some((page_size, core_count))
}

fn parse_cpu_snapshot(line: &str) -> Result<CpuSnapshot, String> {
    let mut fields = line.split_whitespace();
    if fields.next() != Some("cpu") {
        return Err("CPU frame is missing the aggregate cpu row".to_string());
    }
    let values = fields
        .map(|value| {
            value
                .parse::<u64>()
                .map_err(|error| format!("invalid CPU counter {value}: {error}"))
        })
        .collect::<Result<Vec<_>, _>>()?;
    if values.len() < 4 {
        return Err("CPU frame has fewer than four counters".to_string());
    }
    // guest and guest_nice are already included in user and nice.
    let total = values.iter().take(8).try_fold(0_u64, |sum, value| {
        sum.checked_add(*value)
            .ok_or_else(|| "CPU counter total overflowed".to_string())
    })?;
    let idle = values[3]
        .checked_add(values.get(4).copied().unwrap_or(0))
        .ok_or_else(|| "CPU idle counter overflowed".to_string())?;
    Ok(CpuSnapshot { total, idle })
}

fn cpu_percent(previous: CpuSnapshot, current: CpuSnapshot) -> Option<f32> {
    let total_delta = current.total.checked_sub(previous.total)?;
    let idle_delta = current.idle.checked_sub(previous.idle)?;
    if total_delta == 0 || idle_delta > total_delta {
        return None;
    }
    Some((total_delta - idle_delta) as f32 * 100.0 / total_delta as f32)
}

fn parse_memory(lines: &[String]) -> Result<MemoryUsage, String> {
    let mut total_kb: Option<u64> = None;
    let mut available_kb: Option<u64> = None;
    let mut free_kb: Option<u64> = None;
    let mut buffers_kb: Option<u64> = None;
    let mut cached_kb: Option<u64> = None;
    for line in lines {
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let parsed = value
            .split_whitespace()
            .next()
            .and_then(|raw| raw.parse().ok());
        match key {
            "MemTotal" => total_kb = parsed,
            "MemAvailable" => available_kb = parsed,
            "MemFree" => free_kb = parsed,
            "Buffers" => buffers_kb = parsed,
            "Cached" => cached_kb = parsed,
            _ => {}
        }
    }
    let total_kb = total_kb.ok_or_else(|| "Memory frame is missing MemTotal".to_string())?;
    let available_kb = match available_kb {
        Some(value) => value,
        None => free_kb
            .zip(buffers_kb)
            .zip(cached_kb)
            .and_then(|((free, buffers), cached)| free.checked_add(buffers)?.checked_add(cached))
            .ok_or_else(|| {
                "Memory frame is missing MemAvailable and its fallback fields".to_string()
            })?,
    };
    Ok(MemoryUsage {
        total_kb,
        available_kb,
        used_kb: total_kb.saturating_sub(available_kb),
    })
}

fn parse_process_snapshot(line: &str) -> Result<ProcessSnapshot, String> {
    let open = line
        .find('(')
        .ok_or_else(|| "process stat is missing '('".to_string())?;
    let close = line
        .rfind(')')
        .filter(|index| *index > open)
        .ok_or_else(|| "process stat is missing ')'".to_string())?;
    let pid = line[..open].trim();
    if pid.is_empty() || !pid.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err("process stat has an invalid pid".to_string());
    }
    let comm = &line[open + 1..close];
    let fields = line[close + 1..].split_whitespace().collect::<Vec<_>>();
    if fields.len() <= 21 {
        return Err("process stat has too few fields".to_string());
    }
    let utime = fields[11]
        .parse::<u64>()
        .map_err(|error| format!("invalid process utime: {error}"))?;
    let stime = fields[12]
        .parse::<u64>()
        .map_err(|error| format!("invalid process stime: {error}"))?;
    let rss_pages = fields[21]
        .parse::<i64>()
        .map_err(|error| format!("invalid process RSS: {error}"))?
        .max(0) as u64;
    let start_time = fields[19]
        .parse::<u64>()
        .map_err(|error| format!("invalid process start time: {error}"))?;
    Ok(ProcessSnapshot {
        pid: pid.to_string(),
        comm: comm.to_string(),
        ticks: utime.saturating_add(stime),
        start_time,
        rss_pages,
    })
}

fn build_process_usage(
    current: &HashMap<String, ProcessSnapshot>,
    previous: &HashMap<String, ProcessSnapshot>,
    total_delta: Option<u64>,
    page_size: u64,
) -> Vec<ProcessUsage> {
    let mut all = current
        .values()
        .map(|process| {
            let prior = previous.get(&process.pid).filter(|prior| {
                prior.comm == process.comm && prior.start_time == process.start_time
            });
            let cpu_percent = prior
                .zip(total_delta.filter(|delta| *delta > 0))
                .and_then(|(prior, total)| {
                    process
                        .ticks
                        .checked_sub(prior.ticks)
                        .map(|delta| (delta, total))
                })
                .map(|(delta, total)| delta as f32 * 100.0 / total as f32)
                .unwrap_or(0.0);
            ProcessUsage {
                pid: process.pid.clone(),
                comm: process.comm.clone(),
                cpu_percent,
                rss_kb: process.rss_pages.saturating_mul(page_size) / 1024,
                is_new: prior.is_none(),
            }
        })
        .collect::<Vec<_>>();

    let mut by_cpu = all.clone();
    by_cpu.sort_by(|left, right| {
        right
            .cpu_percent
            .total_cmp(&left.cpu_percent)
            .then_with(|| left.pid.cmp(&right.pid))
    });
    all.sort_by(|left, right| {
        right
            .rss_kb
            .cmp(&left.rss_kb)
            .then_with(|| left.pid.cmp(&right.pid))
    });

    let mut selected = Vec::with_capacity(TOP_PROCESS_COUNT * 2);
    let mut selected_pids = HashSet::with_capacity(TOP_PROCESS_COUNT * 2);
    for process in by_cpu
        .into_iter()
        .take(TOP_PROCESS_COUNT)
        .chain(all.into_iter().take(TOP_PROCESS_COUNT))
    {
        if selected_pids.insert(process.pid.clone()) {
            selected.push(process);
        }
    }
    selected
}

fn parse_frame(
    raw: RawMetricsFrame,
    state: &mut MetricsState,
    serial: &str,
    session_id: u64,
) -> Result<DeviceMetricsFrame, String> {
    let current_cpu = parse_cpu_snapshot(
        raw.cpu
            .as_deref()
            .ok_or_else(|| "Metrics frame is missing CPU data".to_string())?,
    )?;
    let memory = parse_memory(&raw.memory)?;
    let cpu = state
        .previous_cpu
        .and_then(|previous| cpu_percent(previous, current_cpu))
        .map(|total_percent| CpuUsage {
            total_percent,
            core_count: state.core_count,
        });
    state.previous_cpu = Some(current_cpu);

    let processes = if raw.has_processes {
        let current = raw
            .processes
            .iter()
            .filter_map(|line| parse_process_snapshot(line).ok())
            .map(|process| (process.pid.clone(), process))
            .collect::<HashMap<_, _>>();
        let total_delta = state
            .previous_process_total
            .and_then(|previous| current_cpu.total.checked_sub(previous));
        let usage = build_process_usage(
            &current,
            &state.previous_processes,
            total_delta,
            state.page_size,
        );
        state.previous_processes = current;
        state.previous_process_total = Some(current_cpu.total);
        Some(usage)
    } else {
        None
    };

    let battery = raw.has_battery.then(|| {
        let parsed = parse_battery_output(&raw.battery.join("\n"));
        BatteryUsage {
            level: parsed.level,
            status: parsed.status,
            temperature_c: parsed.temperature_c,
        }
    });

    Ok(DeviceMetricsFrame {
        serial: serial.to_string(),
        session_id,
        at_ms: chrono::Utc::now().timestamp_millis(),
        cpu,
        memory,
        battery,
        processes,
    })
}

fn append_stderr_tail(tail: &mut Vec<u8>, bytes: &[u8]) {
    tail.extend_from_slice(bytes);
    if tail.len() <= STDERR_TAIL_MAX_BYTES {
        return;
    }
    let mut start = tail.len() - STDERR_TAIL_MAX_BYTES;
    while start < tail.len() && tail[start] & 0b1100_0000 == 0b1000_0000 {
        start += 1;
    }
    tail.drain(..start);
}

fn build_exit_detail(read_error: Option<&str>, stderr_detail: &str) -> String {
    match (read_error, stderr_detail.is_empty()) {
        (Some(error), true) => error.to_string(),
        (Some(error), false) => format!("{error}\n{stderr_detail}"),
        (None, true) => "Device metrics process exited (stdout EOF)".to_string(),
        (None, false) => stderr_detail.to_string(),
    }
}

async fn read_metrics_line<R>(
    reader: &mut R,
    line_bytes: &mut Vec<u8>,
) -> std::io::Result<Option<String>>
where
    R: AsyncBufRead + Unpin,
{
    let bytes_read = reader.read_until(b'\n', line_bytes).await?;
    if bytes_read == 0 && line_bytes.is_empty() {
        return Ok(None);
    }
    let content_end = if line_bytes.ends_with(b"\r\n") {
        line_bytes.len() - 2
    } else if line_bytes.ends_with(b"\n") {
        line_bytes.len() - 1
    } else {
        line_bytes.len()
    };
    let line = String::from_utf8_lossy(&line_bytes[..content_end]).into_owned();
    line_bytes.clear();
    Ok(Some(line))
}

async fn stop_metrics_session(mut session: DeviceMetricsSession) -> Result<(), String> {
    let session_id = session.session_id;
    let kill_error = session.child.start_kill().err();
    let wait_error = match tokio::time::timeout(CHILD_SHUTDOWN_TIMEOUT, session.child.wait()).await
    {
        Ok(Ok(_)) => None,
        Ok(Err(error)) => Some(format!("wait failed: {error}")),
        Err(_) => Some("wait timed out".to_string()),
    };
    match (kill_error, wait_error) {
        (_, None) => Ok(()),
        (None, Some(wait_error)) => {
            Err(format!("Device metrics session {session_id} {wait_error}"))
        }
        (Some(kill_error), Some(wait_error)) => Err(format!(
            "Device metrics session {session_id} kill failed: {kill_error}; {wait_error}"
        )),
    }
}

#[tauri::command]
pub async fn start_device_metrics(
    app: AppHandle,
    serial: String,
) -> Result<DeviceMetricsSessionInfo, String> {
    let _start_guard = METRICS_START_LOCK.lock().await;
    if METRICS_SHUTTING_DOWN.load(Ordering::SeqCst) {
        return Err("Device metrics session rejected: application is shutting down".to_string());
    }

    let session_id = NEXT_SESSION_ID
        .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |current| {
            current.checked_add(1)
        })
        .map_err(|_| "Device metrics session ID exhausted".to_string())?;
    let adb_path = adb::resolve_adb_path(&app)?;
    let previous = METRICS_SESSION.lock().await.take();
    if let Some(previous) = previous {
        stop_metrics_session(previous).await?;
    }
    if METRICS_SHUTTING_DOWN.load(Ordering::SeqCst) {
        return Err("Device metrics session rejected: application is shutting down".to_string());
    }

    let mut child = adb::prepare_async_command(&app, &adb_path)
        .arg("-s")
        .arg(&serial)
        .arg("shell")
        .arg(METRICS_SCRIPT)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|error| format!("Failed to start device metrics: {error}"))?;

    let stdout = match child.stdout.take() {
        Some(stdout) => stdout,
        None => {
            let _ = child.kill().await;
            return Err("Failed to capture device metrics stdout".to_string());
        }
    };
    let stderr = match child.stderr.take() {
        Some(stderr) => stderr,
        None => {
            let _ = child.kill().await;
            return Err("Failed to capture device metrics stderr".to_string());
        }
    };

    let registration = {
        let mut active = METRICS_SESSION.lock().await;
        if METRICS_SHUTTING_DOWN.load(Ordering::SeqCst) {
            Err((child, "application is shutting down"))
        } else if active.is_some() {
            Err((child, "another session became active while restarting"))
        } else {
            *active = Some(DeviceMetricsSession {
                serial: serial.clone(),
                session_id,
                child,
            });
            Ok(())
        }
    };
    if let Err((child, reason)) = registration {
        let cleanup = stop_metrics_session(DeviceMetricsSession {
            serial: serial.clone(),
            session_id,
            child,
        })
        .await;
        return match cleanup {
            Ok(()) => Err(format!(
                "Device metrics session {session_id} rejected: {reason}"
            )),
            Err(error) => Err(format!(
                "Device metrics session {session_id} rejected because {reason}; {error}"
            )),
        };
    }

    let stderr_tail = Arc::new(Mutex::new(Vec::with_capacity(STDERR_TAIL_MAX_BYTES)));
    let stderr_writer = Arc::clone(&stderr_tail);
    let stderr_task = tokio::spawn(async move {
        let mut stderr = stderr;
        let mut chunk = [0_u8; 1024];
        loop {
            match stderr.read(&mut chunk).await {
                Ok(0) => break,
                Ok(read) => {
                    let mut tail = stderr_writer.lock().await;
                    append_stderr_tail(&mut tail, &chunk[..read]);
                }
                Err(error) => {
                    eprintln!("failed to read device metrics stderr: {error}");
                    break;
                }
            }
        }
    });

    let app_clone = app.clone();
    let reader_serial = serial.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout);
        let mut line_bytes = Vec::new();
        let mut decoder = MetricsFrameDecoder::default();
        let mut metrics_state = MetricsState::default();
        let (reason, read_error) = loop {
            match read_metrics_line(&mut reader, &mut line_bytes).await {
                Ok(Some(line)) => match decoder.consume(line) {
                    Some(DecodedMetricsLine::Frame(frame)) => {
                        match parse_frame(frame, &mut metrics_state, &reader_serial, session_id) {
                            Ok(frame) => {
                                if let Err(error) = app_clone.emit("device-metrics-frame", frame) {
                                    eprintln!("failed to emit device metrics frame: {error}");
                                }
                            }
                            Err(error) => break ("error", Some(error)),
                        }
                    }
                    Some(DecodedMetricsLine::Initialization {
                        page_size,
                        core_count,
                    }) => {
                        metrics_state.page_size = page_size;
                        metrics_state.core_count = core_count;
                    }
                    None => {}
                },
                Ok(None) => {
                    decoder.discard_incomplete();
                    break ("eof", None);
                }
                Err(error) => {
                    decoder.discard_incomplete();
                    break ("error", Some(error.to_string()));
                }
            }
        };

        let finished = {
            let mut active = METRICS_SESSION.lock().await;
            if active.as_ref().is_some_and(|session| {
                session.session_id == session_id && session.serial == reader_serial
            }) {
                active.take()
            } else {
                None
            }
        };
        if let Some(session) = finished {
            if let Err(error) = stop_metrics_session(session).await {
                eprintln!("failed to clean up finished device metrics process: {error}");
            }
        }

        let _ = tokio::time::timeout(STDERR_JOIN_TIMEOUT, stderr_task).await;
        let stderr_detail = String::from_utf8_lossy(&stderr_tail.lock().await)
            .trim()
            .to_string();
        let detail = build_exit_detail(read_error.as_deref(), &stderr_detail);
        if let Err(error) = app_clone.emit(
            "device-metrics-exit",
            DeviceMetricsExit {
                serial: reader_serial,
                session_id,
                reason: reason.to_string(),
                detail,
            },
        ) {
            eprintln!("failed to emit device metrics exit: {error}");
        }
    });

    Ok(DeviceMetricsSessionInfo { serial, session_id })
}

#[tauri::command]
pub async fn stop_device_metrics(serial: String, session_id: u64) -> Result<(), String> {
    let session = {
        let mut active = METRICS_SESSION.lock().await;
        if active
            .as_ref()
            .is_some_and(|session| session.serial == serial && session.session_id == session_id)
        {
            active.take()
        } else {
            None
        }
    };
    if let Some(session) = session {
        stop_metrics_session(session).await?;
    }
    Ok(())
}

pub async fn shutdown_device_metrics_sessions() -> Result<(), String> {
    METRICS_SHUTTING_DOWN.store(true, Ordering::SeqCst);
    let _start_guard = METRICS_START_LOCK.lock().await;
    let session = METRICS_SESSION.lock().await.take();
    if let Some(session) = session {
        stop_metrics_session(session).await?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        build_process_usage, cpu_percent, parse_cpu_snapshot, parse_initialization, parse_memory,
        parse_process_snapshot, CpuSnapshot, DecodedMetricsLine, MetricsFrameDecoder,
        ProcessSnapshot, DEFAULT_CORE_COUNT, DEFAULT_PAGE_SIZE, TOP_PROCESS_COUNT,
    };
    use std::collections::{HashMap, HashSet};

    fn stat_line(pid: &str, comm: &str, utime: u64, stime: u64, rss: i64) -> String {
        format!(
            "{pid} ({comm}) S 1 2 3 4 5 6 7 8 9 10 {utime} {stime} 13 14 15 16 17 18 19 20 {rss}"
        )
    }

    #[test]
    fn initialization_uses_valid_values_and_explicit_fallbacks() {
        assert_eq!(parse_initialization("#I 16384 8"), Some((16384, 8)));
        assert_eq!(
            parse_initialization("#I invalid 0"),
            Some((DEFAULT_PAGE_SIZE, DEFAULT_CORE_COUNT))
        );
        assert_eq!(parse_initialization("#F"), None);
    }

    #[test]
    fn parses_cpu_and_computes_idle_aware_usage() {
        let previous = parse_cpu_snapshot("cpu 100 0 50 700 50 0 0 0").unwrap();
        let current = parse_cpu_snapshot("cpu 150 0 70 760 70 0 0 0").unwrap();
        assert_eq!(
            previous,
            CpuSnapshot {
                total: 900,
                idle: 750
            }
        );
        assert_eq!(
            current,
            CpuSnapshot {
                total: 1050,
                idle: 830
            }
        );
        assert!((cpu_percent(previous, current).unwrap() - 46.666668).abs() < 0.001);
        assert_eq!(cpu_percent(current, current), None);
        assert_eq!(cpu_percent(current, previous), None);
    }

    #[test]
    fn parses_total_available_and_used_memory() {
        let memory = parse_memory(&[
            "MemTotal:       8000000 kB".to_string(),
            "MemFree:         100000 kB".to_string(),
            "MemAvailable:   3000000 kB".to_string(),
        ])
        .unwrap();
        assert_eq!(memory.total_kb, 8_000_000);
        assert_eq!(memory.available_kb, 3_000_000);
        assert_eq!(memory.used_kb, 5_000_000);
    }

    #[test]
    fn falls_back_to_legacy_available_memory_fields() {
        let memory = parse_memory(&[
            "MemTotal:       8000000 kB".to_string(),
            "MemFree:         100000 kB".to_string(),
            "Buffers:          50000 kB".to_string(),
            "Cached:         2000000 kB".to_string(),
        ])
        .unwrap();
        assert_eq!(memory.available_kb, 2_150_000);
        assert_eq!(memory.used_kb, 5_850_000);
    }

    #[test]
    fn frame_decoder_emits_one_complete_frame_and_discards_a_half_frame() {
        let mut decoder = MetricsFrameDecoder::default();
        assert!(matches!(
            decoder.consume("#I 4096 8".to_string()),
            Some(DecodedMetricsLine::Initialization {
                page_size: 4096,
                core_count: 8
            })
        ));
        for line in [
            "#F",
            "#C",
            "cpu 1 2 3 4",
            "#M",
            "MemTotal: 100 kB",
            "MemAvailable: 40 kB",
            "#P",
            "42 (app) S 1 2 3",
            "#B",
            "level: 80",
        ] {
            assert!(decoder.consume(line.to_string()).is_none());
        }
        let Some(DecodedMetricsLine::Frame(frame)) = decoder.consume("#/F".to_string()) else {
            panic!("complete frame was not emitted");
        };
        assert_eq!(frame.cpu.as_deref(), Some("cpu 1 2 3 4"));
        assert_eq!(frame.memory.len(), 2);
        assert!(frame.has_processes);
        assert!(frame.has_battery);
        assert!(decoder.consume("#/F".to_string()).is_none());

        assert!(decoder.consume("#F".to_string()).is_none());
        assert!(decoder.consume("#C".to_string()).is_none());
        assert!(decoder.consume("cpu 5 6 7 8".to_string()).is_none());
        decoder.discard_incomplete();
        assert!(decoder.consume("#/F".to_string()).is_none());
    }

    #[test]
    fn parses_process_names_with_spaces_and_right_parentheses() {
        let spaced =
            parse_process_snapshot(&stat_line("42", "Chrome_IO Thread", 10, 20, 30)).unwrap();
        assert_eq!(spaced.comm, "Chrome_IO Thread");
        assert_eq!(spaced.ticks, 30);
        assert_eq!(spaced.rss_pages, 30);

        let right_paren = parse_process_snapshot(&stat_line("43", "a)b", 7, 9, 12)).unwrap();
        assert_eq!(right_paren.comm, "a)b");
        assert_eq!(right_paren.ticks, 16);
    }

    #[test]
    fn process_usage_uses_the_heavy_frame_delta_and_marks_new_pids() {
        let previous = HashMap::from([(
            "42".to_string(),
            ProcessSnapshot {
                pid: "42".to_string(),
                comm: "app".to_string(),
                ticks: 100,
                start_time: 19,
                rss_pages: 10,
            },
        )]);
        let current = HashMap::from([
            (
                "42".to_string(),
                ProcessSnapshot {
                    pid: "42".to_string(),
                    comm: "app".to_string(),
                    ticks: 150,
                    start_time: 19,
                    rss_pages: 20,
                },
            ),
            (
                "43".to_string(),
                ProcessSnapshot {
                    pid: "43".to_string(),
                    comm: "new app".to_string(),
                    ticks: 999,
                    start_time: 19,
                    rss_pages: 5,
                },
            ),
        ]);
        let usage = build_process_usage(&current, &previous, Some(500), 4096);
        let existing = usage.iter().find(|process| process.pid == "42").unwrap();
        assert_eq!(existing.cpu_percent, 10.0);
        assert_eq!(existing.rss_kb, 80);
        assert!(!existing.is_new);
        let new_process = usage.iter().find(|process| process.pid == "43").unwrap();
        assert_eq!(new_process.cpu_percent, 0.0);
        assert!(new_process.is_new);
    }

    #[test]
    fn process_usage_is_the_bounded_union_of_top_cpu_and_rss() {
        let mut previous = HashMap::new();
        let mut current = HashMap::new();
        for index in 0_u64..40 {
            let pid = (1_000 + index).to_string();
            previous.insert(
                pid.clone(),
                ProcessSnapshot {
                    pid: pid.clone(),
                    comm: format!("process-{index}"),
                    ticks: 100,
                    start_time: 10,
                    rss_pages: index + 1,
                },
            );
            current.insert(
                pid.clone(),
                ProcessSnapshot {
                    pid,
                    comm: format!("process-{index}"),
                    ticks: 140 - index,
                    start_time: 10,
                    rss_pages: index + 1,
                },
            );
        }

        let usage = build_process_usage(&current, &previous, Some(1_000), 4_096);
        let pids = usage
            .iter()
            .map(|process| process.pid.as_str())
            .collect::<HashSet<_>>();

        assert_eq!(usage.len(), TOP_PROCESS_COUNT * 2);
        assert_eq!(pids.len(), usage.len());
        assert!(pids.contains("1000"));
        assert!(pids.contains("1039"));
        assert!(!pids.contains("1020"));
    }
}
