use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::modules::updates::exec_root;
use crate::shared::{blocking, fsutil};

mod backups;
mod catalog;
mod index;
mod paths;

pub use backups::BackupEntry;
pub use catalog::ConfigEntry;
pub use index::{IndexStatus, SearchResult};

const MAX_READ_BYTES: u64 = 8 * 1024 * 1024;
const MAX_WRITE_BYTES: u64 = 4 * 1024 * 1024;
const READ_ONLY_BYTES: u64 = 1_000_000;
const MAX_DIR_ENTRIES: usize = 400;

static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Default)]
pub struct ConfigState {
    index: Arc<Mutex<index::IndexCache>>,
    favorites: Arc<Mutex<Option<Vec<FavoriteStored>>>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct FavoriteStored {
    path: String,
    added: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigFile {
    pub id: Option<String>,
    pub label: String,
    pub description: String,
    pub path: String,
    pub category: Option<String>,
    pub language: String,
    pub root: bool,
    pub validate: Option<Vec<String>>,
    pub danger: String,
    pub content: String,
    pub size: u64,
    pub read_only: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirListing {
    pub path: String,
    pub entries: Vec<DirEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteEntry {
    pub path: String,
    pub label: String,
    pub root: bool,
    pub language: String,
    pub added: u64,
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

/// Ajoute un détail lisible à un code d'erreur stable. L'interface sépare le
/// code du détail sur le premier `|`.
fn with_detail(code: &str, detail: &str) -> String {
    let detail = detail.trim();
    if detail.is_empty() {
        return code.to_string();
    }
    let detail: String = detail.chars().take(1200).collect();
    format!("{code}|{detail}")
}

fn is_binary(bytes: &[u8]) -> bool {
    bytes.iter().take(8192).any(|byte| *byte == 0) || std::str::from_utf8(bytes).is_err()
}

fn create_temp(prefix: &str, bytes: &[u8]) -> Result<PathBuf, String> {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let counter = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    let path = std::env::temp_dir().join(format!(
        "plume-config-{prefix}-{}-{stamp}-{counter}.tmp",
        std::process::id()
    ));

    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|error| {
            eprintln!("Impossible de créer un fichier temporaire : {error}");
            "config_write_failed".to_string()
        })?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = file.set_permissions(fs::Permissions::from_mode(0o600));
    }

    if let Err(error) = file.write_all(bytes).and_then(|_| file.sync_all()) {
        let _ = fs::remove_file(&path);
        eprintln!("Impossible d'écrire un fichier temporaire : {error}");
        return Err("config_write_failed".into());
    }
    Ok(path)
}

fn read_bytes(path: &Path, root: bool) -> Result<Vec<u8>, String> {
    match fs::read(path) {
        Ok(bytes) => Ok(bytes),
        Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied && root => {
            #[cfg(target_os = "linux")]
            {
                let path = path.to_string_lossy().into_owned();
                let output = exec_root(&["cat", "--", &path])?;
                if output.success {
                    Ok(output.stdout.into_bytes())
                } else {
                    Err(with_detail("config_read_failed", &output.stderr))
                }
            }
            #[cfg(not(target_os = "linux"))]
            {
                Err("permission_denied".into())
            }
        }
        Err(error) => {
            eprintln!("Impossible de lire une configuration : {error}");
            Err("config_read_failed".into())
        }
    }
}

fn read_config_sync(path: &str) -> Result<ConfigFile, String> {
    let canonical = paths::allowed_file(path)?;
    let metadata = fs::metadata(&canonical).map_err(|_| "config_read_failed".to_string())?;
    if metadata.len() > MAX_READ_BYTES {
        return Err("config_too_large".into());
    }

    let root = paths::is_system(&canonical);
    let bytes = read_bytes(&canonical, root)?;
    if is_binary(&bytes) {
        return Err("config_binary".into());
    }
    let content = String::from_utf8(bytes).map_err(|_| "config_binary".to_string())?;
    let entry = catalog::find_for(&canonical);

    Ok(ConfigFile {
        id: entry.as_ref().map(|entry| entry.id.clone()),
        label: catalog::label_for(&canonical),
        description: catalog::description_for(&canonical),
        path: canonical.to_string_lossy().into_owned(),
        category: catalog::category_for(&canonical),
        language: catalog::language_for(&canonical),
        root,
        validate: catalog::validate_for(&canonical),
        danger: catalog::danger_for(&canonical),
        size: metadata.len(),
        read_only: metadata.len() > READ_ONLY_BYTES,
        content,
    })
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

fn run_validation(args: &[String], root: bool) -> Result<(bool, String), String> {
    if args.is_empty() || args[0].is_empty() {
        return Ok((true, String::new()));
    }

    if root {
        let refs: Vec<&str> = args.iter().map(String::as_str).collect();
        let output = exec_root(&refs)?;
        if !output.success && matches!(output.code, Some(126) | Some(127)) {
            return Err("permission_denied".into());
        }
        Ok((
            output.success,
            format!("{}{}", output.stdout, output.stderr),
        ))
    } else {
        let output = std::process::Command::new(&args[0])
            .args(&args[1..])
            .env("LC_ALL", "C")
            .output()
            .map_err(|error| with_detail("config_validation_failed", &error.to_string()))?;
        Ok((
            output.status.success(),
            format!(
                "{}{}",
                String::from_utf8_lossy(&output.stdout),
                String::from_utf8_lossy(&output.stderr)
            ),
        ))
    }
}

fn validate_candidate(path: &Path, content: &str, root: bool) -> Result<(), String> {
    let Some(command) = catalog::validate_for(path) else {
        return Ok(());
    };
    if command.is_empty() {
        return Ok(());
    }

    let temp = create_temp("validation", content.as_bytes())?;
    let temp_path = temp.to_string_lossy().into_owned();
    let args: Vec<String> = command
        .iter()
        .map(|argument| argument.replace("{file}", &temp_path))
        .collect();

    let result = run_validation(&args, root);
    let _ = fs::remove_file(&temp);

    let (success, detail) = result?;
    if success {
        Ok(())
    } else {
        Err(with_detail("config_validation_failed", &detail))
    }
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------

fn write_user(path: &Path, content: &str) -> Result<(), String> {
    let parent = path.parent().ok_or("config_write_failed")?;
    let metadata = fs::metadata(path).map_err(|_| "config_write_failed".to_string())?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("config");
    let counter = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    let stamp = now_ms();
    let temp = parent.join(format!(
        ".{file_name}.plume-{}-{stamp}-{counter}.tmp",
        std::process::id()
    ));

    let result = (|| {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)
            .map_err(|error| with_detail("config_write_failed", &error.to_string()))?;
        file.write_all(content.as_bytes())
            .and_then(|_| file.sync_all())
            .map_err(|error| with_detail("config_write_failed", &error.to_string()))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = metadata.permissions().mode();
            file.set_permissions(fs::Permissions::from_mode(mode))
                .map_err(|error| with_detail("config_write_failed", &error.to_string()))?;
        }
        drop(file);
        fs::rename(&temp, path)
            .map_err(|error| with_detail("config_write_failed", &error.to_string()))
    })();

    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

fn write_root(path: &Path, content: &str) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;

        let temp = create_temp("root", content.as_bytes())?;
        let metadata = fs::metadata(path).map_err(|_| "config_write_failed".to_string())?;
        let mode = format!("{:o}", metadata.mode() & 0o7777);
        let uid = metadata.uid().to_string();
        let gid = metadata.gid().to_string();
        let temp_path = temp.to_string_lossy().into_owned();
        let target = path.to_string_lossy().into_owned();

        let output = exec_root(&[
            "install", "-m", &mode, "-o", &uid, "-g", &gid, "--", &temp_path, &target,
        ]);
        let _ = fs::remove_file(&temp);

        let output = output?;
        if output.success {
            Ok(())
        } else if matches!(output.code, Some(126) | Some(127)) {
            Err("permission_denied".into())
        } else {
            Err(with_detail("config_write_failed", &output.stderr))
        }
    }
    #[cfg(not(unix))]
    {
        let _ = (path, content);
        Err("unsupported_platform".into())
    }
}

fn write_resolved(path: &Path, content: &str, use_root: bool) -> Result<(), String> {
    if content.len() as u64 > MAX_WRITE_BYTES {
        return Err("config_too_large".into());
    }

    let metadata = fs::metadata(path).map_err(|_| "config_write_failed".to_string())?;
    // Les fichiers de plus de 1 Mo sont ouverts en lecture seule : on refuse
    // aussi l'écriture côté Rust, même si l'interface est contournée.
    if metadata.len() > READ_ONLY_BYTES {
        return Err("config_too_large".into());
    }

    let current = read_bytes(path, use_root)?;
    if is_binary(&current) {
        return Err("config_binary".into());
    }
    if current == content.as_bytes() {
        return Ok(());
    }

    validate_candidate(path, content, use_root)?;
    backups::create(path, &current)?;

    if use_root {
        write_root(path, content)
    } else {
        write_user(path, content)
    }
}

fn write_config_sync(path: &str, content: &str, requested_root: bool) -> Result<(), String> {
    let canonical = paths::allowed_file(path)?;
    let use_root = paths::is_system(&canonical);

    if requested_root && !use_root {
        return Err("config_invalid_root".into());
    }
    if use_root && !requested_root {
        return Err("config_root_required".into());
    }

    write_resolved(&canonical, content, use_root)
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

fn list_dir_sync(path: &str) -> Result<DirListing, String> {
    let directory = paths::allowed_dir(path)?;
    let read_dir = fs::read_dir(&directory).map_err(|_| "config_read_failed".to_string())?;
    let mut entries = Vec::new();

    for entry in read_dir.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_symlink() {
            continue;
        }
        if !file_type.is_file() && !file_type.is_dir() {
            continue;
        }
        entries.push(DirEntry {
            name,
            path: entry.path().to_string_lossy().into_owned(),
            is_dir: file_type.is_dir(),
        });
    }

    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    entries.truncate(MAX_DIR_ENTRIES);

    Ok(DirListing {
        path: directory.to_string_lossy().into_owned(),
        entries,
    })
}

// ---------------------------------------------------------------------------
// Favoris
// ---------------------------------------------------------------------------

fn favorites_file() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| fsutil::home().join(".config"))
        .join("plume/config-favorites.json")
}

fn read_stored() -> Vec<FavoriteStored> {
    fs::read_to_string(favorites_file())
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn write_stored(list: &[FavoriteStored]) -> Result<(), String> {
    let file = favorites_file();
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            eprintln!("Impossible de créer le dossier de configuration : {error}");
            "config_favorites_failed".to_string()
        })?;
    }
    let json =
        serde_json::to_vec_pretty(list).map_err(|_| "config_favorites_failed".to_string())?;
    fs::write(&file, json).map_err(|error| {
        eprintln!("Impossible d'écrire les favoris : {error}");
        "config_favorites_failed".to_string()
    })?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&file, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

fn favorites_list(
    state: &Arc<Mutex<Option<Vec<FavoriteStored>>>>,
) -> Result<Vec<FavoriteStored>, String> {
    let mut guard = state.lock().map_err(|_| "internal_error".to_string())?;
    if guard.is_none() {
        *guard = Some(read_stored());
    }
    Ok(guard.as_ref().cloned().unwrap_or_default())
}

fn favorite_entry(path: &Path, added: u64) -> FavoriteEntry {
    FavoriteEntry {
        path: path.to_string_lossy().into_owned(),
        label: catalog::label_for(path),
        root: paths::is_system(path),
        language: catalog::language_for(path),
        added,
    }
}

fn list_favorites_sync(
    state: &Arc<Mutex<Option<Vec<FavoriteStored>>>>,
) -> Result<Vec<FavoriteEntry>, String> {
    let stored = favorites_list(state)?;
    let mut entries = Vec::new();
    for item in stored {
        let Ok(path) = paths::allowed_file(&item.path) else {
            continue;
        };
        entries.push(favorite_entry(&path, item.added));
    }
    entries.sort_by_key(|entry| std::cmp::Reverse(entry.added));
    Ok(entries)
}

fn add_favorite_sync(
    state: &Arc<Mutex<Option<Vec<FavoriteStored>>>>,
    path: &str,
) -> Result<FavoriteEntry, String> {
    let canonical = paths::allowed_file(path)?;
    let mut guard = state.lock().map_err(|_| "internal_error".to_string())?;
    if guard.is_none() {
        *guard = Some(read_stored());
    }
    let list = guard.as_mut().ok_or("internal_error")?;
    let target = canonical.to_string_lossy().into_owned();

    if let Some(existing) = list.iter().find(|item| item.path == target) {
        return Ok(favorite_entry(&canonical, existing.added));
    }

    let stored = FavoriteStored {
        path: target,
        added: now_ms(),
    };
    list.push(stored.clone());
    write_stored(list)?;
    Ok(favorite_entry(&canonical, stored.added))
}

fn remove_favorite_sync(
    state: &Arc<Mutex<Option<Vec<FavoriteStored>>>>,
    path: &str,
) -> Result<(), String> {
    let expanded = paths::expand(path)?;
    let target = expanded
        .canonicalize()
        .unwrap_or(expanded)
        .to_string_lossy()
        .into_owned();

    let mut guard = state.lock().map_err(|_| "internal_error".to_string())?;
    if guard.is_none() {
        *guard = Some(read_stored());
    }
    let list = guard.as_mut().ok_or("internal_error")?;
    list.retain(|item| item.path != target);
    write_stored(list)
}

// ---------------------------------------------------------------------------
// Commandes Tauri
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn config_supported() -> bool {
    cfg!(target_os = "linux")
}

#[tauri::command]
pub fn list_known_configs() -> Result<Vec<ConfigEntry>, String> {
    if !cfg!(target_os = "linux") {
        return Ok(Vec::new());
    }
    Ok(catalog::list_existing())
}

#[tauri::command]
pub async fn read_config(path: String) -> Result<ConfigFile, String> {
    blocking(move || read_config_sync(&path)).await
}

#[tauri::command]
pub async fn write_config(path: String, content: String, root: bool) -> Result<(), String> {
    blocking(move || write_config_sync(&path, &content, root)).await
}

#[tauri::command]
pub async fn list_dir(path: String) -> Result<DirListing, String> {
    blocking(move || list_dir_sync(&path)).await
}

#[tauri::command]
pub fn start_index(state: tauri::State<'_, ConfigState>) -> Result<(), String> {
    index::start(state.index.clone());
    Ok(())
}

#[tauri::command]
pub fn index_status(state: tauri::State<'_, ConfigState>) -> Result<IndexStatus, String> {
    index::status(&state.index)
}

#[tauri::command]
pub async fn search_configs(
    state: tauri::State<'_, ConfigState>,
    query: String,
) -> Result<SearchResult, String> {
    let cache = state.index.clone();
    index::start(cache.clone());
    blocking(move || index::search(&cache, &query)).await
}

#[tauri::command]
pub async fn list_backups(path: String) -> Result<Vec<BackupEntry>, String> {
    blocking(move || {
        let canonical = paths::allowed_file(&path)?;
        backups::list(&canonical)
    })
    .await
}

#[tauri::command]
pub async fn restore_backup(path: String, id: String) -> Result<(), String> {
    blocking(move || {
        let canonical = paths::allowed_file(&path)?;
        let bytes = backups::read(&canonical, &id)?;
        let content = String::from_utf8(bytes).map_err(|_| "config_binary".to_string())?;
        let use_root = paths::is_system(&canonical);
        write_resolved(&canonical, &content, use_root)
    })
    .await
}

#[tauri::command]
pub async fn list_favorites(
    state: tauri::State<'_, ConfigState>,
) -> Result<Vec<FavoriteEntry>, String> {
    let favorites = state.favorites.clone();
    blocking(move || list_favorites_sync(&favorites)).await
}

#[tauri::command]
pub async fn add_favorite(
    state: tauri::State<'_, ConfigState>,
    path: String,
) -> Result<FavoriteEntry, String> {
    let favorites = state.favorites.clone();
    blocking(move || add_favorite_sync(&favorites, &path)).await
}

#[tauri::command]
pub async fn remove_favorite(
    state: tauri::State<'_, ConfigState>,
    path: String,
) -> Result<(), String> {
    let favorites = state.favorites.clone();
    blocking(move || remove_favorite_sync(&favorites, &path)).await
}
