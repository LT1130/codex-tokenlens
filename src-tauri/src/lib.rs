use chrono::{DateTime, Utc};
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    env,
    ffi::OsString,
    fs::{self, File},
    io::{BufRead, BufReader, Seek, SeekFrom},
    path::{Path, PathBuf},
    process::Command,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Mutex, OnceLock,
    },
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

#[derive(Debug, Clone, Default)]
struct TokenUsage {
    input_tokens: u64,
    cached_input_tokens: u64,
    output_tokens: u64,
    reasoning_output_tokens: u64,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct UsageSegment {
    input: u64,
    output: u64,
    cache: u64,
    reasoning: u64,
    timestamp: Option<String>,
    model: Option<String>,
    context_window: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UsageTask {
    id: String,
    title: String,
    project: String,
    project_path: Option<String>,
    started_at: String,
    updated_at: String,
    duration_minutes: u64,
    model: String,
    source_path: String,
    input: u64,
    output: u64,
    cache: u64,
    reasoning: u64,
    usage_segments: Vec<UsageSegment>,
    status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CodexRateLimitWindow {
    used_percent: f64,
    window_minutes: u64,
    resets_at: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CodexRateLimits {
    primary: Option<CodexRateLimitWindow>,
    secondary: Option<CodexRateLimitWindow>,
    plan_type: Option<String>,
    source_path: String,
    captured_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CodexUsageSnapshot {
    tasks: Vec<UsageTask>,
    rate_limits: Option<CodexRateLimits>,
    diagnostics: ScanDiagnostics,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanDiagnostics {
    scanned_files: usize,
    failed_files: usize,
    skipped_lines: usize,
    watcher_active: bool,
    issues: Vec<ScanIssue>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScanIssue {
    path: String,
    message: String,
}

#[derive(Debug, Clone)]
struct ParsedSession {
    source_path: String,
    tasks: Vec<UsageTask>,
    rate_limits: Option<CodexRateLimits>,
    rate_limits_timestamp: Option<DateTime<Utc>>,
    skipped_lines: usize,
    skipped_line_numbers: Vec<usize>,
    cwd: Option<String>,
    model: Option<String>,
    pending_turn: Option<PendingTurn>,
    latest_line_timestamp: Option<DateTime<Utc>>,
    turn_active: bool,
    turn_index: u64,
    processed_lines: usize,
    latest_turn_usage: Option<TokenUsage>,
    turn_start_usage: Option<TokenUsage>,
    current_usage_segments: Vec<UsageSegment>,
    saw_lifecycle: bool,
}

#[derive(Debug, Clone)]
struct CachedSession {
    file_len: u64,
    modified_at: Option<SystemTime>,
    parsed: ParsedSession,
}

static SESSION_CACHE: OnceLock<Mutex<HashMap<PathBuf, CachedSession>>> = OnceLock::new();
static DIRTY_SESSION_PATHS: OnceLock<Mutex<HashSet<PathBuf>>> = OnceLock::new();
static FAILED_SESSION_PATHS: OnceLock<Mutex<HashSet<PathBuf>>> = OnceLock::new();
static SESSION_WATCHER: OnceLock<Mutex<Option<RecommendedWatcher>>> = OnceLock::new();
static LAST_FULL_SCAN: AtomicU64 = AtomicU64::new(0);
static SCAN_IN_PROGRESS: AtomicBool = AtomicBool::new(false);
const FULL_SCAN_INTERVAL_SECONDS: u64 = 300;

#[derive(Debug, Clone)]
struct PendingTurn {
    id: String,
    title: String,
    project: String,
    project_path: Option<String>,
    started_at: DateTime<Utc>,
    model: String,
}

#[tauri::command]
async fn scan_codex_usage() -> Result<Vec<UsageTask>, String> {
    Ok(run_codex_scan_in_background().await?.tasks)
}

#[tauri::command]
async fn scan_codex_snapshot() -> Result<CodexUsageSnapshot, String> {
    run_codex_scan_in_background().await
}

async fn run_codex_scan_in_background() -> Result<CodexUsageSnapshot, String> {
    if SCAN_IN_PROGRESS.swap(true, Ordering::AcqRel) {
        return Err("A Codex log scan is already in progress".to_string());
    }
    if !session_watcher_active() {
        let _ = start_session_watcher();
    }
    let joined = tauri::async_runtime::spawn_blocking(scan_codex_snapshot_from_disk).await;
    SCAN_IN_PROGRESS.store(false, Ordering::Release);
    joined.map_err(|error| format!("Unable to join Codex log scan: {error}"))?
}

fn scan_codex_snapshot_from_disk() -> Result<CodexUsageSnapshot, String> {
    let codex_root = codex_data_dir()?;
    let roots = [
        codex_root.join("sessions"),
        codex_root.join("archived_sessions"),
    ];
    let mut cache = SESSION_CACHE
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .map_err(|_| "Codex session cache lock was poisoned".to_string())?;
    let mut failed_paths = FAILED_SESSION_PATHS
        .get_or_init(|| Mutex::new(HashSet::new()))
        .lock()
        .map_err(|_| "Codex failed-path lock was poisoned".to_string())?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let full_scan = cache.is_empty()
        || now.saturating_sub(LAST_FULL_SCAN.load(Ordering::Relaxed)) >= FULL_SCAN_INTERVAL_SECONDS;
    if full_scan {
        let _ = start_session_watcher();
    }
    let files = if full_scan {
        let mut files = Vec::new();
        for root in roots {
            collect_jsonl_files(&root, &mut files);
        }
        let current_files = files.iter().cloned().collect::<HashSet<_>>();
        cache.retain(|path, _| current_files.contains(path));
        failed_paths.retain(|path| current_files.contains(path));
        LAST_FULL_SCAN.store(now, Ordering::Relaxed);
        files
    } else {
        let mut dirty = DIRTY_SESSION_PATHS
            .get_or_init(|| Mutex::new(HashSet::new()))
            .lock()
            .map_err(|_| "Codex dirty-path lock was poisoned".to_string())?;
        let mut files = dirty.drain().collect::<HashSet<_>>();
        // Some platform file watchers coalesce rapid JSONL appends into a directory event.
        // Always stat active sessions on refresh so a just-written completion event is not
        // hidden behind the next watcher notification or the five-minute full-scan fallback.
        files.extend(
            cache
                .iter()
                .filter(|(_, entry)| entry.parsed.turn_active)
                .map(|(path, _)| path.clone()),
        );
        files.into_iter().collect::<Vec<_>>()
    };

    for file in files {
        if file
            .extension()
            .is_none_or(|extension| extension != "jsonl")
        {
            continue;
        }
        if !file.exists() {
            cache.remove(&file);
            failed_paths.remove(&file);
            continue;
        }

        let metadata = fs::metadata(&file).ok();
        let file_len = metadata.as_ref().map_or(0, fs::Metadata::len);
        let modified_at = metadata.and_then(|value| value.modified().ok());
        if cache
            .get(&file)
            .filter(|entry| entry.file_len == file_len && entry.modified_at == modified_at)
            .is_some()
        {
            continue;
        }
        let previous = cache.get(&file).cloned();
        let parsed_result =
            if let Some(previous) = previous.as_ref().filter(|entry| file_len > entry.file_len) {
                parse_session_file_incremental(&file, previous)
            } else {
                parse_session_file(&file)
            };
        match parsed_result {
            Ok(parsed) => {
                failed_paths.remove(&file);
                cache.insert(
                    file,
                    CachedSession {
                        file_len,
                        modified_at,
                        parsed,
                    },
                );
            }
            Err(_) => {
                failed_paths.insert(file.clone());
                cache.remove(&file);
            }
        }
    }

    let mut tasks = Vec::new();
    let mut latest_rate_limits: Option<CodexRateLimits> = None;
    let mut latest_rate_limits_timestamp: Option<DateTime<Utc>> = None;
    let mut skipped_lines = 0;
    let mut issues = Vec::new();
    for entry in cache.values() {
        let parsed = &entry.parsed;
        tasks.extend(parsed.tasks.clone());
        skipped_lines += parsed.skipped_lines;
        if !parsed.skipped_line_numbers.is_empty() {
            issues.push(ScanIssue {
                path: parsed.source_path.clone(),
                message: format!("Skipped JSONL lines: {:?}", parsed.skipped_line_numbers),
            });
        }
        if let (Some(rate_limits), Some(timestamp)) =
            (parsed.rate_limits.clone(), parsed.rate_limits_timestamp)
        {
            if latest_rate_limits_timestamp.is_none_or(|latest| timestamp > latest) {
                latest_rate_limits = Some(rate_limits);
                latest_rate_limits_timestamp = Some(timestamp);
            }
        }
    }

    tasks.sort_by(|a, b| b.started_at.cmp(&a.started_at));
    issues.extend(failed_paths.iter().map(|path| ScanIssue {
        path: path.display().to_string(),
        message: "Unable to open or parse this file".to_string(),
    }));
    Ok(CodexUsageSnapshot {
        tasks,
        rate_limits: latest_rate_limits,
        diagnostics: ScanDiagnostics {
            scanned_files: cache.len() + failed_paths.len(),
            failed_files: failed_paths.len(),
            skipped_lines,
            watcher_active: session_watcher_active(),
            issues,
        },
    })
}

fn session_watcher_active() -> bool {
    SESSION_WATCHER
        .get()
        .and_then(|watcher| watcher.lock().ok())
        .is_some_and(|watcher| watcher.is_some())
}

fn start_session_watcher() -> Result<(), String> {
    let codex_root = codex_data_dir()?;
    if !codex_root.exists() {
        return Ok(());
    }
    let mut watcher = notify::recommended_watcher(|event: notify::Result<notify::Event>| {
        let Ok(event) = event else { return };
        let Ok(mut dirty) = DIRTY_SESSION_PATHS
            .get_or_init(|| Mutex::new(HashSet::new()))
            .lock()
        else {
            return;
        };
        dirty.extend(event.paths);
    })
    .map_err(|error| format!("Unable to create Codex session watcher: {error}"))?;
    watcher
        .watch(&codex_root, RecursiveMode::Recursive)
        .map_err(|error| format!("Unable to watch Codex session directory: {error}"))?;
    let watcher_slot = SESSION_WATCHER.get_or_init(|| Mutex::new(None));
    *watcher_slot
        .lock()
        .map_err(|_| "Codex watcher lock was poisoned".to_string())? = Some(watcher);
    Ok(())
}

fn codex_data_dir() -> Result<PathBuf, String> {
    resolve_codex_data_dir(
        env::var_os("CODEX_HOME"),
        env::var_os("HOME").or_else(|| env::var_os("USERPROFILE")),
    )
}

fn resolve_codex_data_dir(
    codex_home: Option<OsString>,
    user_home: Option<OsString>,
) -> Result<PathBuf, String> {
    if let Some(path) = codex_home.filter(|path| !path.is_empty()) {
        let path = PathBuf::from(path);
        if !path.is_absolute() {
            return Err(format!(
                "CODEX_HOME must be an absolute path: {}",
                path.display()
            ));
        }
        return Ok(path);
    }
    user_home
        .map(PathBuf::from)
        .map(|home| home.join(".codex"))
        .ok_or_else(|| "Unable to locate CODEX_HOME or the user home directory".to_string())
}

#[tauri::command]
fn open_codex_directory() -> Result<(), String> {
    let path = codex_data_dir()?;
    if !path.exists() {
        return Err(format!(
            "Codex data directory does not exist: {}",
            path.display()
        ));
    }
    let status = reveal_path_with_system(&path)?;
    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "Unable to open Codex data directory: {}",
            path.display()
        ))
    }
}

#[tauri::command]
fn save_usage_csv(app: tauri::AppHandle, csv: String) -> Result<String, String> {
    let downloads = app
        .path()
        .download_dir()
        .map_err(|error| format!("Unable to locate the downloads directory: {error}"))?;
    let filename = format!(
        "codex-tokenlens-{}.csv",
        Utc::now().format("%Y-%m-%d-%H%M%S")
    );
    let path = downloads.join(filename);
    fs::write(&path, csv).map_err(|error| format!("Unable to save CSV: {error}"))?;
    Ok(path.display().to_string())
}

#[tauri::command]
fn reveal_path(path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if !target.exists() {
        return Err(format!("Path does not exist: {path}"));
    }

    let status = reveal_path_with_system(&target)?;

    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "The system file manager returned a non-zero status for: {path}"
        ))
    }
}

const OFFICIAL_DOCUMENTATION_URLS: [&str; 4] = [
    "https://developers.openai.com/api/docs/pricing",
    "https://developers.openai.com/codex/prompting",
    "https://developers.openai.com/codex/learn/best-practices",
    "https://developers.openai.com/codex/agent-approvals-security",
];

#[tauri::command]
fn open_official_documentation(url: String) -> Result<(), String> {
    if !is_official_documentation_url(&url) {
        return Err("URL is not in the official documentation allowlist".to_string());
    }
    let status = open_url_with_system(&url)?;
    if status.success() {
        Ok(())
    } else {
        Err("The system browser returned a non-zero status".to_string())
    }
}

fn is_official_documentation_url(url: &str) -> bool {
    OFFICIAL_DOCUMENTATION_URLS.contains(&url)
}

#[cfg(target_os = "macos")]
fn open_url_with_system(url: &str) -> Result<std::process::ExitStatus, String> {
    Command::new("open")
        .arg(url)
        .status()
        .map_err(|error| format!("Unable to open the system browser: {error}"))
}

#[cfg(target_os = "windows")]
fn open_url_with_system(url: &str) -> Result<std::process::ExitStatus, String> {
    Command::new("cmd")
        .args(["/C", "start", "", url])
        .status()
        .map_err(|error| format!("Unable to open the system browser: {error}"))
}

#[cfg(all(unix, not(target_os = "macos")))]
fn open_url_with_system(url: &str) -> Result<std::process::ExitStatus, String> {
    Command::new("xdg-open")
        .arg(url)
        .status()
        .map_err(|error| format!("Unable to open the system browser: {error}"))
}

#[cfg(target_os = "macos")]
fn reveal_path_with_system(target: &Path) -> Result<std::process::ExitStatus, String> {
    let mut command = Command::new("open");
    if target.is_file() {
        command.arg("-R");
    }
    command
        .arg(target)
        .status()
        .map_err(|error| format!("Unable to open Finder: {error}"))
}

#[cfg(target_os = "windows")]
fn reveal_path_with_system(target: &Path) -> Result<std::process::ExitStatus, String> {
    let mut command = Command::new("explorer");
    if target.is_file() {
        command.arg(format!("/select,{}", target.display()));
    } else {
        command.arg(target);
    }
    command
        .status()
        .map_err(|error| format!("Unable to open File Explorer: {error}"))
}

#[cfg(all(unix, not(target_os = "macos")))]
fn reveal_path_with_system(target: &Path) -> Result<std::process::ExitStatus, String> {
    let destination = if target.is_file() {
        target.parent().unwrap_or(target)
    } else {
        target
    };
    Command::new("xdg-open")
        .arg(destination)
        .status()
        .map_err(|error| format!("Unable to open the system file manager: {error}"))
}

fn collect_jsonl_files(dir: &Path, files: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_jsonl_files(&path, files);
        } else if path
            .extension()
            .is_some_and(|extension| extension == "jsonl")
        {
            files.push(path);
        }
    }
}

fn parse_session_file(path: &Path) -> Result<ParsedSession, String> {
    parse_session_file_from(path, None, 0)
}

fn parse_session_file_incremental(
    path: &Path,
    previous: &CachedSession,
) -> Result<ParsedSession, String> {
    parse_session_file_from(path, Some(&previous.parsed), previous.file_len)
}

fn parse_session_file_from(
    path: &Path,
    previous: Option<&ParsedSession>,
    offset: u64,
) -> Result<ParsedSession, String> {
    let mut file =
        File::open(path).map_err(|error| format!("Unable to open {}: {error}", path.display()))?;
    if offset > 0 {
        file.seek(SeekFrom::Start(offset))
            .map_err(|error| format!("Unable to seek {}: {error}", path.display()))?;
    }
    let reader = BufReader::new(file);

    let mut cwd = previous.and_then(|value| value.cwd.clone());
    let mut model = previous.and_then(|value| value.model.clone());
    let mut pending_turn = previous.and_then(|value| value.pending_turn.clone());
    let mut tasks = previous.map_or_else(Vec::new, |value| {
        value
            .tasks
            .iter()
            .filter(|task| task.status != "inProgress")
            .cloned()
            .collect()
    });
    let mut turn_index = previous.map_or(0, |value| value.turn_index);
    let mut latest_rate_limits = previous.and_then(|value| value.rate_limits.clone());
    let mut latest_rate_limits_timestamp = previous.and_then(|value| value.rate_limits_timestamp);
    let mut latest_line_timestamp = previous.and_then(|value| value.latest_line_timestamp);
    let mut turn_active = previous.is_some_and(|value| value.turn_active);
    let mut latest_turn_usage = previous.and_then(|value| value.latest_turn_usage.clone());
    let mut turn_start_usage = previous.and_then(|value| value.turn_start_usage.clone());
    let mut current_usage_segments = previous
        .map(|value| value.current_usage_segments.clone())
        .unwrap_or_default();
    let mut saw_lifecycle = previous.is_some_and(|value| value.saw_lifecycle);
    let mut skipped_lines = previous.map_or(0, |value| value.skipped_lines);
    let mut skipped_line_numbers =
        previous.map_or_else(Vec::new, |value| value.skipped_line_numbers.clone());
    let processed_lines = previous.map_or(0, |value| value.processed_lines);
    let mut new_lines = 0;

    for (line_index, line_result) in reader.lines().enumerate() {
        new_lines += 1;
        let absolute_line = processed_lines + line_index + 1;
        let Ok(line) = line_result else {
            skipped_lines += 1;
            if skipped_line_numbers.len() < 8 {
                skipped_line_numbers.push(absolute_line);
            }
            continue;
        };
        let Ok(value) = serde_json::from_str::<Value>(&line) else {
            skipped_lines += 1;
            if skipped_line_numbers.len() < 8 {
                skipped_line_numbers.push(absolute_line);
            }
            continue;
        };

        let mut line_timestamp: Option<DateTime<Utc>> = None;
        if let Some(timestamp) = value
            .get("timestamp")
            .and_then(Value::as_str)
            .and_then(parse_timestamp)
        {
            line_timestamp = Some(timestamp);
            latest_line_timestamp = Some(timestamp);
        }

        let payload = value.get("payload").unwrap_or(&Value::Null);
        match payload.get("type").and_then(Value::as_str) {
            Some("task_started") => {
                saw_lifecycle = true;
                turn_active = true;
                turn_start_usage = latest_turn_usage.clone();
                current_usage_segments.clear();
            }
            Some(status @ ("task_complete" | "turn_aborted")) => {
                saw_lifecycle = true;
                if let (Some(turn), Some(usage), Some(timestamp)) = (
                    pending_turn.take(),
                    latest_turn_usage.clone(),
                    line_timestamp,
                ) {
                    tasks.push(build_turn_task(
                        path,
                        turn,
                        timestamp,
                        subtract_usage(&usage, turn_start_usage.as_ref()),
                        std::mem::take(&mut current_usage_segments),
                        if status == "turn_aborted" {
                            "aborted"
                        } else {
                            "completed"
                        },
                    ));
                }
                turn_active = false;
                continue;
            }
            _ => {}
        }
        if let (Some(rate_limits), Some(timestamp)) =
            (read_rate_limits(payload, path), line_timestamp)
        {
            latest_rate_limits = Some(rate_limits);
            latest_rate_limits_timestamp = Some(timestamp);
        }
        if let Some(next_cwd) = payload.get("cwd").and_then(Value::as_str) {
            cwd = Some(next_cwd.to_owned());
        }
        if let Some(next_model) = payload.get("model").and_then(Value::as_str) {
            model = Some(next_model.to_owned());
        }
        if let (Some(text), Some(timestamp)) = (read_user_prompt(payload), line_timestamp) {
            if !saw_lifecycle {
                if let (Some(turn), Some(usage)) = (pending_turn.take(), latest_turn_usage.clone())
                {
                    tasks.push(build_turn_task(
                        path,
                        turn,
                        timestamp,
                        subtract_usage(&usage, turn_start_usage.as_ref()),
                        std::mem::take(&mut current_usage_segments),
                        "completed",
                    ));
                }
                turn_start_usage = latest_turn_usage.clone();
                current_usage_segments.clear();
            }
            turn_index += 1;
            pending_turn = Some(PendingTurn {
                id: format!(
                    "{}-turn-{}",
                    path.file_stem()
                        .and_then(|value| value.to_str())
                        .unwrap_or("codex-session"),
                    turn_index
                ),
                title: text,
                project: project_name(cwd.as_deref()),
                project_path: cwd.clone(),
                started_at: timestamp,
                model: model.clone().unwrap_or_else(|| "unknown".to_string()),
            });
        }
        if let Some(info) = payload.get("info") {
            let total_usage = info.get("total_token_usage").and_then(read_token_usage);
            let last_usage = info.get("last_token_usage").and_then(read_token_usage);
            let context_window = info.get("model_context_window").and_then(Value::as_u64);

            if let Some(total_usage) = total_usage {
                // Codex reports a session/thread cumulative total. Token-count events can be
                // duplicated or arrive with an older snapshot, so retain a component-wise high
                // water mark instead of letting a stale event move the counter backwards.
                //
                // A resumed/imported rollout can begin with task_started before its first token
                // snapshot. In that case total = previous total + last lets us recover the real
                // baseline without charging the restored history to the new task.
                if pending_turn.is_some() && turn_start_usage.is_none() {
                    turn_start_usage = Some(
                        last_usage
                            .as_ref()
                            .map(|last| subtract_usage(&total_usage, Some(last)))
                            .unwrap_or_default(),
                    );
                }
                let next_usage = max_usage(latest_turn_usage.as_ref(), &total_usage);
                if pending_turn.is_some() {
                    let segment = subtract_usage(
                        &next_usage,
                        latest_turn_usage.as_ref().or(turn_start_usage.as_ref()),
                    );
                    push_usage_segment(
                        &mut current_usage_segments,
                        &segment,
                        line_timestamp.as_ref(),
                        model.as_deref(),
                        context_window,
                    );
                }
                latest_turn_usage = Some(next_usage);
            } else if let Some(last_usage) = last_usage {
                // Very old/minimal records may expose only per-call usage. Preserve support by
                // accumulating those records; modern logs always prefer total_token_usage above.
                latest_turn_usage = Some(add_usage(latest_turn_usage.as_ref(), &last_usage));
                if pending_turn.is_some() {
                    push_usage_segment(
                        &mut current_usage_segments,
                        &last_usage,
                        line_timestamp.as_ref(),
                        model.as_deref(),
                        context_window,
                    );
                }
            }
        }
    }

    if turn_active && !is_archived_session_file(path) {
        if let (Some(turn), Some(last_activity)) = (pending_turn.clone(), latest_line_timestamp) {
            tasks.push(build_in_progress_task(
                path,
                turn,
                last_activity,
                subtract_usage(
                    &latest_turn_usage.clone().unwrap_or_default(),
                    turn_start_usage.as_ref(),
                ),
                current_usage_segments.clone(),
            ));
        }
    } else if !saw_lifecycle {
        if let (Some(turn), Some(last_activity), Some(usage)) = (
            pending_turn.clone(),
            latest_line_timestamp,
            latest_turn_usage.clone(),
        ) {
            tasks.push(build_turn_task(
                path,
                turn,
                last_activity,
                subtract_usage(&usage, turn_start_usage.as_ref()),
                current_usage_segments.clone(),
                "completed",
            ));
        }
    }

    Ok(ParsedSession {
        source_path: path.display().to_string(),
        tasks,
        rate_limits: latest_rate_limits,
        rate_limits_timestamp: latest_rate_limits_timestamp,
        skipped_lines,
        skipped_line_numbers,
        cwd,
        model,
        pending_turn,
        latest_line_timestamp,
        turn_active,
        turn_index,
        processed_lines: processed_lines + new_lines,
        latest_turn_usage,
        turn_start_usage,
        current_usage_segments,
        saw_lifecycle,
    })
}

fn build_turn_task(
    path: &Path,
    turn: PendingTurn,
    finished_at: DateTime<Utc>,
    usage: TokenUsage,
    usage_segments: Vec<UsageSegment>,
    status: &str,
) -> UsageTask {
    let duration_minutes = finished_at
        .signed_duration_since(turn.started_at)
        .num_minutes()
        .max(1) as u64;

    UsageTask {
        id: turn.id,
        title: turn.title,
        project: turn.project,
        project_path: turn.project_path,
        started_at: turn.started_at.to_rfc3339(),
        updated_at: finished_at.to_rfc3339(),
        duration_minutes,
        model: turn.model,
        source_path: path.display().to_string(),
        input: usage.input_tokens,
        output: usage.output_tokens,
        cache: usage.cached_input_tokens,
        reasoning: usage.reasoning_output_tokens,
        usage_segments,
        status: status.to_string(),
    }
}

fn subtract_usage(total: &TokenUsage, baseline: Option<&TokenUsage>) -> TokenUsage {
    let baseline = baseline.cloned().unwrap_or_default();
    TokenUsage {
        input_tokens: total.input_tokens.saturating_sub(baseline.input_tokens),
        cached_input_tokens: total
            .cached_input_tokens
            .saturating_sub(baseline.cached_input_tokens),
        output_tokens: total.output_tokens.saturating_sub(baseline.output_tokens),
        reasoning_output_tokens: total
            .reasoning_output_tokens
            .saturating_sub(baseline.reasoning_output_tokens),
    }
}

fn max_usage(current: Option<&TokenUsage>, next: &TokenUsage) -> TokenUsage {
    let current = current.cloned().unwrap_or_default();
    TokenUsage {
        input_tokens: current.input_tokens.max(next.input_tokens),
        cached_input_tokens: current.cached_input_tokens.max(next.cached_input_tokens),
        output_tokens: current.output_tokens.max(next.output_tokens),
        reasoning_output_tokens: current
            .reasoning_output_tokens
            .max(next.reasoning_output_tokens),
    }
}

fn add_usage(current: Option<&TokenUsage>, next: &TokenUsage) -> TokenUsage {
    let current = current.cloned().unwrap_or_default();
    TokenUsage {
        input_tokens: current.input_tokens.saturating_add(next.input_tokens),
        cached_input_tokens: current
            .cached_input_tokens
            .saturating_add(next.cached_input_tokens),
        output_tokens: current.output_tokens.saturating_add(next.output_tokens),
        reasoning_output_tokens: current
            .reasoning_output_tokens
            .saturating_add(next.reasoning_output_tokens),
    }
}

fn push_usage_segment(
    segments: &mut Vec<UsageSegment>,
    usage: &TokenUsage,
    timestamp: Option<&DateTime<Utc>>,
    model: Option<&str>,
    context_window: Option<u64>,
) {
    if usage.input_tokens == 0
        && usage.cached_input_tokens == 0
        && usage.output_tokens == 0
        && usage.reasoning_output_tokens == 0
    {
        return;
    }
    segments.push(UsageSegment {
        input: usage.input_tokens,
        output: usage.output_tokens,
        cache: usage.cached_input_tokens,
        reasoning: usage.reasoning_output_tokens,
        timestamp: timestamp.map(DateTime::to_rfc3339),
        model: model.map(str::to_owned),
        context_window,
    });
}

fn build_in_progress_task(
    path: &Path,
    turn: PendingTurn,
    updated_at: DateTime<Utc>,
    usage: TokenUsage,
    usage_segments: Vec<UsageSegment>,
) -> UsageTask {
    let duration_minutes = updated_at
        .signed_duration_since(turn.started_at)
        .num_minutes()
        .max(0) as u64;
    UsageTask {
        id: turn.id,
        title: turn.title,
        project: turn.project,
        project_path: turn.project_path,
        started_at: turn.started_at.to_rfc3339(),
        updated_at: updated_at.to_rfc3339(),
        duration_minutes,
        model: turn.model,
        source_path: path.display().to_string(),
        input: usage.input_tokens,
        output: usage.output_tokens,
        cache: usage.cached_input_tokens,
        reasoning: usage.reasoning_output_tokens,
        usage_segments,
        status: "inProgress".to_string(),
    }
}

fn is_archived_session_file(path: &Path) -> bool {
    path.components()
        .any(|component| component.as_os_str() == "archived_sessions")
}

fn project_name(cwd: Option<&str>) -> String {
    cwd.and_then(|value| Path::new(value).file_name())
        .and_then(|value| value.to_str())
        .unwrap_or("unknown")
        .to_string()
}

fn parse_timestamp(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .map(|timestamp| timestamp.with_timezone(&Utc))
        .ok()
}

fn read_token_usage(value: &Value) -> Option<TokenUsage> {
    Some(TokenUsage {
        input_tokens: value.get("input_tokens")?.as_u64()?,
        cached_input_tokens: value
            .get("cached_input_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        output_tokens: value.get("output_tokens")?.as_u64()?,
        reasoning_output_tokens: value
            .get("reasoning_output_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
    })
}

fn read_rate_limits(payload: &Value, path: &Path) -> Option<CodexRateLimits> {
    let value = payload.get("rate_limits")?;
    let primary = value.get("primary").and_then(read_rate_limit_window);
    let secondary = value.get("secondary").and_then(read_rate_limit_window);

    if primary.is_none() && secondary.is_none() {
        return None;
    }

    Some(CodexRateLimits {
        primary,
        secondary,
        plan_type: value
            .get("plan_type")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned),
        source_path: path.display().to_string(),
        captured_at: Utc::now().to_rfc3339(),
    })
}

fn read_rate_limit_window(value: &Value) -> Option<CodexRateLimitWindow> {
    Some(CodexRateLimitWindow {
        used_percent: value.get("used_percent")?.as_f64()?,
        window_minutes: value.get("window_minutes")?.as_u64()?,
        resets_at: value.get("resets_at")?.as_u64()?,
    })
}

fn read_user_prompt(payload: &Value) -> Option<String> {
    let role = payload.get("role").and_then(Value::as_str)?;
    if role != "user" {
        return None;
    }

    let content = payload.get("content")?.as_array()?;
    let has_structured_images = content
        .iter()
        .any(|item| item.get("type").and_then(Value::as_str) == Some("input_image"));
    let mut image_index = 0_usize;
    let text = content
        .iter()
        .filter_map(|item| read_prompt_content(item, &mut image_index, has_structured_images))
        .filter(|value| is_user_facing_title_candidate(value))
        .collect::<Vec<_>>()
        .join("\n");

    normalize_prompt(&text)
}

fn read_prompt_content(
    item: &Value,
    image_index: &mut usize,
    has_structured_images: bool,
) -> Option<String> {
    if item.get("type").and_then(Value::as_str) == Some("input_image") {
        *image_index += 1;
        return Some(format!("图{}", chinese_image_index(*image_index)));
    }

    let text = item
        .get("text")
        .or_else(|| item.get("input_text"))
        .and_then(Value::as_str)?;
    let trimmed = text.trim();
    if trimmed.starts_with("<image ") {
        if has_structured_images {
            return None;
        }
        *image_index += 1;
        return Some(format!("图{}", chinese_image_index(*image_index)));
    }

    Some(clean_prompt_text(trimmed))
}

fn chinese_image_index(index: usize) -> &'static str {
    match index {
        1 => "一",
        2 => "二",
        3 => "三",
        4 => "四",
        5 => "五",
        _ => "片",
    }
}

fn clean_prompt_text(text: &str) -> String {
    let without_file_preamble = text
        .split("## My request for Codex:")
        .last()
        .unwrap_or(text);

    without_file_preamble
        .lines()
        .map(str::trim)
        .filter(|line| {
            !line.starts_with("# Files mentioned by the user:")
                && !line.starts_with("## ")
                && !line.starts_with("<image ")
                && !line.starts_with("<image>")
                && !line.starts_with("</image")
        })
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

fn is_user_facing_title_candidate(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return false;
    }

    let lower = trimmed.to_lowercase();
    !lower.starts_with("<environment_context>")
        && !lower.starts_with("<turn_aborted>")
        && !lower.starts_with("<codex")
        && !lower.starts_with("<system")
        && !lower.starts_with("<developer")
        && !lower.contains("<cwd>")
}

fn normalize_prompt(text: &str) -> Option<String> {
    let normalized = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    let normalized = normalized.split_whitespace().collect::<Vec<_>>().join(" ");

    if normalized.is_empty() {
        return None;
    }
    Some(normalized)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Err(error) = start_session_watcher() {
        eprintln!("{error}");
    }
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            open_codex_directory,
            open_official_documentation,
            reveal_path,
            save_usage_csv,
            scan_codex_snapshot,
            scan_codex_usage
        ])
        .run(tauri::generate_context!())
        .expect("error while running Codex TokenLens");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temporary_jsonl(contents: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after the Unix epoch")
            .as_nanos();
        let path = env::temp_dir().join(format!("codex-tokenlens-test-{suffix}.jsonl"));
        fs::write(&path, contents).expect("test JSONL should be writable");
        path
    }

    #[test]
    fn external_documentation_uses_a_fixed_allowlist() {
        assert!(is_official_documentation_url(
            "https://developers.openai.com/api/docs/pricing"
        ));
        assert!(!is_official_documentation_url(
            "https://example.com/api/docs/pricing"
        ));
    }

    #[test]
    fn parser_skips_bad_lines_and_reads_a_complete_turn() {
        let path = temporary_jsonl(
            r#"{"timestamp":"2026-06-18T08:00:00Z","payload":{"cwd":"/tmp/demo","model":"gpt-test","role":"user","content":[{"type":"input_text","text":"Inspect the parser"}]}}
not valid json
{"timestamp":"2026-06-18T08:01:00Z","payload":{"info":{"last_token_usage":{"input_tokens":120,"cached_input_tokens":80,"output_tokens":30,"reasoning_output_tokens":10}}}}
"#,
        );

        let parsed = parse_session_file(&path).expect("valid lines should still be parsed");
        fs::remove_file(&path).ok();

        assert_eq!(parsed.tasks.len(), 1);
        let task = &parsed.tasks[0];
        assert_eq!(task.project, "demo");
        assert_eq!(task.model, "gpt-test");
        assert_eq!(task.input, 120);
        assert_eq!(task.output, 30);
        assert_eq!(task.cache, 80);
        assert_eq!(task.reasoning, 10);
        assert_eq!(task.duration_minutes, 1);
        assert_eq!(task.status, "completed");
        assert_eq!(parsed.skipped_lines, 1);
    }

    #[test]
    fn parser_keeps_an_unpaired_prompt_as_in_progress() {
        let path = temporary_jsonl(
            r#"{"timestamp":"2026-06-18T07:59:59Z","payload":{"type":"task_started","turn_id":"turn-1"}}
{"timestamp":"2026-06-18T08:00:00Z","payload":{"role":"user","content":[{"type":"input_text","text":"Incomplete turn"}]}}
{"timestamp":"2026-06-18T08:01:00Z","payload":{"info":{"last_token_usage":{"input_tokens":120}}}}
"#,
        );

        let parsed =
            parse_session_file(&path).expect("incomplete records should not fail the file");
        fs::remove_file(&path).ok();
        assert_eq!(parsed.tasks.len(), 1);
        assert_eq!(parsed.tasks[0].status, "inProgress");
        assert_eq!(parsed.tasks[0].input, 0);
        assert_eq!(parsed.tasks[0].output, 0);
        assert_eq!(parsed.tasks[0].updated_at, "2026-06-18T08:01:00+00:00");
    }

    #[test]
    fn parser_does_not_turn_abort_control_messages_into_tasks() {
        let path = temporary_jsonl(
            r#"{"timestamp":"2026-06-18T08:00:00Z","payload":{"role":"user","content":[{"type":"input_text","text":"Start work"}]}}
{"timestamp":"2026-06-18T08:01:00Z","payload":{"role":"user","content":[{"type":"input_text","text":"<turn_aborted>Internal interruption notice</turn_aborted>"}]}}
{"timestamp":"2026-06-18T08:01:00Z","payload":{"type":"turn_aborted","reason":"interrupted"}}
"#,
        );

        let parsed = parse_session_file(&path).expect("abort records should be tolerated");
        fs::remove_file(&path).ok();
        assert!(parsed.tasks.is_empty());
    }

    #[test]
    fn completed_lifecycle_does_not_leave_an_in_progress_task() {
        let path = temporary_jsonl(
            r#"{"timestamp":"2026-06-18T07:59:59Z","payload":{"type":"task_started","turn_id":"turn-1"}}
{"timestamp":"2026-06-18T08:00:00Z","payload":{"role":"user","content":[{"type":"input_text","text":"Complete lifecycle"}]}}
{"timestamp":"2026-06-18T08:01:00Z","payload":{"type":"task_complete","turn_id":"turn-1"}}
"#,
        );
        let parsed = parse_session_file(&path).expect("lifecycle should parse");
        fs::remove_file(&path).ok();
        assert!(parsed.tasks.is_empty());
    }

    #[test]
    fn final_answer_waits_for_the_following_usage_snapshot() {
        let path = temporary_jsonl(
            r#"{"timestamp":"2026-06-18T08:00:00Z","payload":{"type":"task_started","turn_id":"turn-1"}}
{"timestamp":"2026-06-18T08:00:01Z","payload":{"role":"user","content":[{"type":"input_text","text":"Finish promptly"}]}}
{"timestamp":"2026-06-18T08:00:10Z","payload":{"type":"agent_message","message":"Done","phase":"final_answer"}}
{"timestamp":"2026-06-18T08:00:11Z","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":100,"output_tokens":10},"last_token_usage":{"input_tokens":100,"output_tokens":10}}}}
{"timestamp":"2026-06-18T08:00:12Z","payload":{"type":"task_complete","turn_id":"turn-1"}}
"#,
        );

        let parsed = parse_session_file(&path).expect("final usage should be included");
        fs::remove_file(&path).ok();
        assert_eq!(parsed.tasks.len(), 1);
        assert_eq!(parsed.tasks[0].status, "completed");
        assert_eq!(parsed.tasks[0].input, 100);
        assert_eq!(parsed.tasks[0].output, 10);
        assert_eq!(parsed.tasks[0].updated_at, "2026-06-18T08:00:12+00:00");
        assert!(!parsed.turn_active);
    }

    #[test]
    fn appended_lines_are_parsed_incrementally() {
        let path = temporary_jsonl(
            r#"{"timestamp":"2026-06-18T08:00:00Z","payload":{"type":"task_started","turn_id":"turn-1"}}
{"timestamp":"2026-06-18T08:00:01Z","payload":{"role":"user","content":[{"type":"input_text","text":"Incremental task"}]}}
"#,
        );
        let parsed = parse_session_file(&path).expect("initial file should parse");
        let initial_len = fs::metadata(&path).expect("metadata should exist").len();
        let cached = CachedSession {
            file_len: initial_len,
            modified_at: None,
            parsed,
        };
        let mut file = fs::OpenOptions::new()
            .append(true)
            .open(&path)
            .expect("file should append");
        file.write_all(concat!(r#"{"timestamp":"2026-06-18T08:01:00Z","payload":{"info":{"last_token_usage":{"input_tokens":10,"output_tokens":5}}}}"#, "\n").as_bytes()).unwrap();
        file.write_all(concat!(r#"{"timestamp":"2026-06-18T08:01:01Z","payload":{"type":"task_complete","turn_id":"turn-1"}}"#, "\n").as_bytes()).unwrap();
        file.flush().expect("appended test data should be flushed");
        let parsed =
            parse_session_file_incremental(&path, &cached).expect("appended lines should parse");
        fs::remove_file(&path).ok();
        assert_eq!(parsed.tasks.len(), 1);
        assert_eq!(parsed.tasks[0].status, "completed");
        assert_eq!(parsed.tasks[0].input, 10);
    }

    #[test]
    fn completed_turn_uses_final_cumulative_usage() {
        let path = temporary_jsonl(
            r#"{"timestamp":"2026-06-18T08:00:00Z","payload":{"type":"task_started","turn_id":"turn-1"}}
{"timestamp":"2026-06-18T08:00:00.500Z","payload":{"model":"gpt-5.5"}}
{"timestamp":"2026-06-18T08:00:01Z","payload":{"role":"user","content":[{"type":"input_text","text":"Multi-call task"}]}}
{"timestamp":"2026-06-18T08:00:10Z","payload":{"info":{"total_token_usage":{"input_tokens":100,"output_tokens":10},"last_token_usage":{"input_tokens":100,"output_tokens":10},"model_context_window":353400}}}
{"timestamp":"2026-06-18T08:00:20Z","payload":{"info":{"total_token_usage":{"input_tokens":240,"cached_input_tokens":80,"output_tokens":30,"reasoning_output_tokens":5},"last_token_usage":{"input_tokens":140,"output_tokens":20},"model_context_window":353400}}}
{"timestamp":"2026-06-18T08:00:21Z","payload":{"type":"task_complete","turn_id":"turn-1"}}
"#,
        );
        let parsed = parse_session_file(&path).expect("multi-call turn should parse");
        fs::remove_file(&path).ok();
        assert_eq!(parsed.tasks.len(), 1);
        assert_eq!(parsed.tasks[0].input, 240);
        assert_eq!(parsed.tasks[0].output, 30);
        assert_eq!(parsed.tasks[0].cache, 80);
        assert_eq!(parsed.tasks[0].reasoning, 5);
        assert_eq!(parsed.tasks[0].usage_segments.len(), 2);
        assert_eq!(
            parsed.tasks[0].usage_segments[0].model.as_deref(),
            Some("gpt-5.5")
        );
        assert_eq!(
            parsed.tasks[0].usage_segments[0].context_window,
            Some(353400)
        );
        assert_eq!(
            parsed.tasks[0].usage_segments[0].timestamp.as_deref(),
            Some("2026-06-18T08:00:10+00:00")
        );
        assert_eq!(
            parsed.tasks[0]
                .usage_segments
                .iter()
                .map(|segment| segment.input)
                .sum::<u64>(),
            240
        );
    }

    #[test]
    fn consecutive_turns_subtract_the_previous_thread_total() {
        let path = temporary_jsonl(
            r#"{"timestamp":"2026-06-18T08:00:00Z","payload":{"type":"task_started","turn_id":"turn-1"}}
{"timestamp":"2026-06-18T08:00:01Z","payload":{"role":"user","content":[{"type":"input_text","text":"First"}]}}
{"timestamp":"2026-06-18T08:00:10Z","payload":{"info":{"total_token_usage":{"input_tokens":100,"output_tokens":10}}}}
{"timestamp":"2026-06-18T08:00:11Z","payload":{"type":"task_complete","turn_id":"turn-1"}}
{"timestamp":"2026-06-18T08:01:00Z","payload":{"type":"task_started","turn_id":"turn-2"}}
{"timestamp":"2026-06-18T08:01:01Z","payload":{"role":"user","content":[{"type":"input_text","text":"Second"}]}}
{"timestamp":"2026-06-18T08:01:10Z","payload":{"info":{"total_token_usage":{"input_tokens":250,"output_tokens":30}}}}
{"timestamp":"2026-06-18T08:01:11Z","payload":{"type":"task_complete","turn_id":"turn-2"}}
"#,
        );
        let parsed = parse_session_file(&path).expect("consecutive turns should parse");
        fs::remove_file(&path).ok();
        assert_eq!(parsed.tasks.len(), 2);
        assert_eq!((parsed.tasks[0].input, parsed.tasks[0].output), (100, 10));
        assert_eq!((parsed.tasks[1].input, parsed.tasks[1].output), (150, 20));
    }

    #[test]
    fn stale_token_snapshots_do_not_move_session_totals_backwards() {
        let path = temporary_jsonl(
            r#"{"timestamp":"2026-06-18T08:00:00Z","payload":{"type":"task_started","turn_id":"turn-1"}}
{"timestamp":"2026-06-18T08:00:01Z","payload":{"role":"user","content":[{"type":"input_text","text":"Out of order snapshots"}]}}
{"timestamp":"2026-06-18T08:00:10Z","payload":{"info":{"total_token_usage":{"input_tokens":100,"output_tokens":10},"last_token_usage":{"input_tokens":100,"output_tokens":10}}}}
{"timestamp":"2026-06-18T08:00:11Z","payload":{"info":{"total_token_usage":{"input_tokens":240,"output_tokens":30},"last_token_usage":{"input_tokens":140,"output_tokens":20}}}}
{"timestamp":"2026-06-18T08:00:12Z","payload":{"info":{"total_token_usage":{"input_tokens":100,"output_tokens":10},"last_token_usage":{"input_tokens":100,"output_tokens":10}}}}
{"timestamp":"2026-06-18T08:00:13Z","payload":{"type":"task_complete","turn_id":"turn-1"}}
"#,
        );
        let parsed = parse_session_file(&path).expect("stale snapshots should parse");
        fs::remove_file(&path).ok();
        assert_eq!((parsed.tasks[0].input, parsed.tasks[0].output), (240, 30));
        assert_eq!(parsed.tasks[0].usage_segments.len(), 2);
    }

    #[test]
    fn first_snapshot_can_recover_a_resumed_thread_baseline() {
        let path = temporary_jsonl(
            r#"{"timestamp":"2026-06-18T08:00:00Z","payload":{"type":"task_started","turn_id":"turn-1"}}
{"timestamp":"2026-06-18T08:00:01Z","payload":{"role":"user","content":[{"type":"input_text","text":"Resumed task"}]}}
{"timestamp":"2026-06-18T08:00:10Z","payload":{"info":{"total_token_usage":{"input_tokens":1250,"cached_input_tokens":900,"output_tokens":130},"last_token_usage":{"input_tokens":250,"cached_input_tokens":200,"output_tokens":30}}}}
{"timestamp":"2026-06-18T08:00:11Z","payload":{"type":"task_complete","turn_id":"turn-1"}}
"#,
        );
        let parsed = parse_session_file(&path).expect("resumed baseline should parse");
        fs::remove_file(&path).ok();
        assert_eq!(parsed.tasks[0].input, 250);
        assert_eq!(parsed.tasks[0].cache, 200);
        assert_eq!(parsed.tasks[0].output, 30);
    }

    #[test]
    fn last_usage_only_records_are_accumulated() {
        let path = temporary_jsonl(
            r#"{"timestamp":"2026-06-18T08:00:00Z","payload":{"type":"task_started","turn_id":"turn-1"}}
{"timestamp":"2026-06-18T08:00:01Z","payload":{"role":"user","content":[{"type":"input_text","text":"Legacy task"}]}}
{"timestamp":"2026-06-18T08:00:10Z","payload":{"info":{"last_token_usage":{"input_tokens":10,"output_tokens":2}}}}
{"timestamp":"2026-06-18T08:00:11Z","payload":{"info":{"last_token_usage":{"input_tokens":20,"output_tokens":3}}}}
{"timestamp":"2026-06-18T08:00:12Z","payload":{"type":"task_complete","turn_id":"turn-1"}}
"#,
        );
        let parsed = parse_session_file(&path).expect("legacy usage should parse");
        fs::remove_file(&path).ok();
        assert_eq!((parsed.tasks[0].input, parsed.tasks[0].output), (30, 5));
    }

    #[test]
    fn overlapping_threads_keep_independent_cumulative_counters() {
        let first_path = temporary_jsonl(
            r#"{"timestamp":"2026-06-18T08:00:00Z","payload":{"type":"task_started","turn_id":"a"}}
{"timestamp":"2026-06-18T08:00:01Z","payload":{"role":"user","content":[{"type":"input_text","text":"Project A"}]}}
{"timestamp":"2026-06-18T08:01:00Z","payload":{"info":{"total_token_usage":{"input_tokens":100,"output_tokens":10},"last_token_usage":{"input_tokens":100,"output_tokens":10}}}}
{"timestamp":"2026-06-18T08:02:00Z","payload":{"type":"task_complete","turn_id":"a"}}
"#,
        );
        let second_path = temporary_jsonl(
            r#"{"timestamp":"2026-06-18T08:00:30Z","payload":{"type":"task_started","turn_id":"b"}}
{"timestamp":"2026-06-18T08:00:31Z","payload":{"role":"user","content":[{"type":"input_text","text":"Project B"}]}}
{"timestamp":"2026-06-18T08:01:30Z","payload":{"info":{"total_token_usage":{"input_tokens":250,"output_tokens":25},"last_token_usage":{"input_tokens":250,"output_tokens":25}}}}
{"timestamp":"2026-06-18T08:02:30Z","payload":{"type":"task_complete","turn_id":"b"}}
"#,
        );

        let first = parse_session_file(&first_path).expect("first thread should parse");
        let second = parse_session_file(&second_path).expect("second thread should parse");
        fs::remove_file(&first_path).ok();
        fs::remove_file(&second_path).ok();

        assert_eq!((first.tasks[0].input, first.tasks[0].output), (100, 10));
        assert_eq!((second.tasks[0].input, second.tasks[0].output), (250, 25));
    }

    #[test]
    fn structured_image_is_not_counted_twice_with_its_text_wrapper() {
        let payload = serde_json::json!({
            "role": "user",
            "content": [
                { "type": "input_text", "text": "请检查这张截图" },
                { "type": "input_text", "text": "<image name=[Image #1] path=\"/tmp/test.png\">" },
                { "type": "input_image", "image_url": "data:image/png;base64,test" },
                { "type": "input_text", "text": "</image>" }
            ]
        });

        assert_eq!(
            read_user_prompt(&payload).as_deref(),
            Some("请检查这张截图 图一")
        );
    }

    #[test]
    fn legacy_text_only_image_placeholder_is_still_counted() {
        let payload = serde_json::json!({
            "role": "user",
            "content": [
                { "type": "input_text", "text": "请检查" },
                { "type": "input_text", "text": "<image name=[Image #1] path=\"/tmp/test.png\">" }
            ]
        });

        assert_eq!(read_user_prompt(&payload).as_deref(), Some("请检查 图一"));
    }

    #[test]
    fn custom_codex_home_takes_precedence() {
        let resolved = resolve_codex_data_dir(
            Some(OsString::from("/custom/codex")),
            Some(OsString::from("/users/test")),
        )
        .expect("custom Codex home should resolve");
        assert_eq!(resolved, PathBuf::from("/custom/codex"));
    }

    #[test]
    fn empty_codex_home_falls_back_to_user_home() {
        let resolved =
            resolve_codex_data_dir(Some(OsString::new()), Some(OsString::from("/users/test")))
                .expect("user home fallback should resolve");
        assert_eq!(resolved, PathBuf::from("/users/test/.codex"));
    }

    #[test]
    fn missing_codex_and_user_home_returns_an_error() {
        assert!(resolve_codex_data_dir(None, None).is_err());
    }

    #[test]
    fn relative_codex_home_returns_an_error() {
        assert!(resolve_codex_data_dir(
            Some(OsString::from("relative/codex")),
            Some(OsString::from("/users/test")),
        )
        .is_err());
    }

    #[test]
    fn parser_uses_the_latest_model_for_each_turn() {
        let path = temporary_jsonl(
            r#"{"timestamp":"2026-06-18T08:00:00Z","payload":{"model":"gpt-old"}}
{"timestamp":"2026-06-18T08:01:00Z","payload":{"model":"gpt-new"}}
{"timestamp":"2026-06-18T08:02:00Z","payload":{"role":"user","content":[{"type":"input_text","text":"Use the new model"}]}}
{"timestamp":"2026-06-18T08:03:00Z","payload":{"info":{"last_token_usage":{"input_tokens":10,"output_tokens":5}}}}
"#,
        );

        let parsed = parse_session_file(&path).expect("model changes should be parsed");
        fs::remove_file(&path).ok();
        assert_eq!(parsed.tasks.len(), 1);
        assert_eq!(parsed.tasks[0].model, "gpt-new");
    }

    #[test]
    fn prompt_cleanup_keeps_the_user_request() {
        let cleaned = clean_prompt_text(
            "# Files mentioned by the user:\n/tmp/a.png\n## My request for Codex:\nFix the chart",
        );
        assert_eq!(cleaned, "Fix the chart");
    }
}
