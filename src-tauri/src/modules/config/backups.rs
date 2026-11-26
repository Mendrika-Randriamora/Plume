use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::shared::fsutil;

const MAX_BACKUP_BYTES: u64 = 4 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupEntry {
    pub id: String,
    pub created: u64,
    pub size: u64,
}

#[derive(Debug, Serialize, Deserialize)]
struct Meta {
    path: String,
    created: u64,
    size: u64,
}

fn root() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(|| fsutil::home().join(".local/share"))
        .join("plume/backups")
}

fn safe_name(path: &Path) -> String {
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("config");
    let mut out: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.') {
                c
            } else {
                '_'
            }
        })
        .take(80)
        .collect();
    if out.is_empty() || out == "." || out == ".." {
        out = "config".into();
    }
    out
}

fn dir_for(path: &Path) -> PathBuf {
    root().join(safe_name(path))
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn write_private(path: &Path, bytes: &[u8]) -> Result<(), String> {
    fs::write(path, bytes).map_err(|error| {
        eprintln!("Impossible d'écrire une sauvegarde : {error}");
        "config_backup_failed".to_string()
    })?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

/// Crée une sauvegarde horodatée avant une écriture.
pub fn create(path: &Path, content: &[u8]) -> Result<(), String> {
    if content.len() as u64 > MAX_BACKUP_BYTES {
        return Err("config_too_large".into());
    }

    let dir = dir_for(path);
    fs::create_dir_all(&dir).map_err(|error| {
        eprintln!("Impossible de créer le dossier de sauvegarde : {error}");
        "config_backup_failed".to_string()
    })?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&dir, fs::Permissions::from_mode(0o700));
    }

    let mut id = now_ms();
    while dir.join(format!("{id}.json")).exists() || dir.join(format!("{id}.bak")).exists() {
        id += 1;
    }

    let meta = Meta {
        path: path.to_string_lossy().into_owned(),
        created: id,
        size: content.len() as u64,
    };
    let json = serde_json::to_vec(&meta).map_err(|_| "config_backup_failed".to_string())?;

    write_private(&dir.join(format!("{id}.bak")), content)?;
    write_private(&dir.join(format!("{id}.json")), &json)?;
    Ok(())
}

pub fn list(path: &Path) -> Result<Vec<BackupEntry>, String> {
    let dir = dir_for(path);
    let target = path.to_string_lossy();
    let mut entries = Vec::new();

    let Ok(read_dir) = fs::read_dir(&dir) else {
        return Ok(entries);
    };

    for entry in read_dir.flatten() {
        let meta_path = entry.path();
        if meta_path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        let Ok(raw) = fs::read_to_string(&meta_path) else {
            continue;
        };
        let Ok(meta) = serde_json::from_str::<Meta>(&raw) else {
            continue;
        };
        if meta.path != target {
            continue;
        }
        let Some(id) = meta_path
            .file_stem()
            .and_then(|stem| stem.to_str())
            .map(str::to_string)
        else {
            continue;
        };
        if !id.chars().all(|c| c.is_ascii_digit()) {
            continue;
        }
        if !dir.join(format!("{id}.bak")).is_file() {
            continue;
        }
        entries.push(BackupEntry {
            id,
            created: meta.created,
            size: meta.size,
        });
    }

    entries.sort_by_key(|entry| std::cmp::Reverse(entry.created));
    Ok(entries)
}

/// Relit une sauvegarde précise, en vérifiant qu'elle appartient bien au fichier demandé.
pub fn read(path: &Path, id: &str) -> Result<Vec<u8>, String> {
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_digit()) {
        return Err("config_invalid_id".into());
    }

    let dir = dir_for(path);
    let raw = fs::read_to_string(dir.join(format!("{id}.json")))
        .map_err(|_| "config_backup_not_found".to_string())?;
    let meta: Meta =
        serde_json::from_str(&raw).map_err(|_| "config_backup_not_found".to_string())?;
    if meta.path != path.to_string_lossy() {
        return Err("config_backup_not_found".into());
    }

    let bytes = fs::read(dir.join(format!("{id}.bak")))
        .map_err(|_| "config_backup_not_found".to_string())?;
    if bytes.len() as u64 > MAX_BACKUP_BYTES {
        return Err("config_too_large".into());
    }
    Ok(bytes)
}
