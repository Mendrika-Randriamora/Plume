use serde::Serialize;
use std::path::{Path, PathBuf};

use crate::shared::{blocking, fsutil, scanner, scanner::Entry};

/// filter: "unused" (moins utilisés récemment) ou "largest" (plus volumineux)
#[tauri::command]
pub async fn scan_clean(filter: String, only_files: bool, limit: usize) -> Result<Vec<Entry>, String> {
    blocking(move || {
        let mut v = scanner::scan(!only_files);
        if filter == "unused" {
            v.retain(|e| e.size >= 1_000_000);
            v.sort_by_key(|e| e.last_used);
        } else {
            v.sort_by(|a, b| b.size.cmp(&a.size));
        }
        v.truncate(limit.min(500));
        Ok(v)
    })
    .await
}

/// Envoie à la corbeille (récupérable). Refuse tout ce qui est hors de /home.
#[tauri::command]
pub async fn delete_to_trash(paths: Vec<String>) -> Result<(), String> {
    blocking(move || {
        let home = fsutil::home();
        let mut ok: Vec<PathBuf> = Vec::new();
        for p in paths {
            let pb = PathBuf::from(&p);
            if pb != home && fsutil::is_inside(&home, &pb) {
                ok.push(pb);
            }
        }
        trash::delete_all(ok).map_err(|e| e.to_string())
    })
    .await
}

#[derive(Serialize)]
pub struct TempItem {
    id: String,
    label: String,
    path: String,
    size: u64,
}

fn trash_files() -> PathBuf {
    fsutil::home().join(".local/share/Trash/files")
}

#[tauri::command]
pub async fn scan_temp() -> Result<Vec<TempItem>, String> {
    blocking(|| {
        let mut items = Vec::new();
        let cache = fsutil::home().join(".cache");
        if let Ok(rd) = std::fs::read_dir(&cache) {
            for e in rd.flatten() {
                let path = e.path();
                let size = fsutil::dir_size(&path);
                if size >= 1_000_000 {
                    let name = e.file_name().to_string_lossy().into_owned();
                    items.push(TempItem {
                        id: name.clone(),
                        label: format!("Cache de {name}"),
                        path: path.to_string_lossy().into_owned(),
                        size,
                    });
                }
            }
        }
        let t = trash_files();
        let size = fsutil::dir_size(&t);
        if size > 0 {
            items.push(TempItem {
                id: "trash".into(),
                label: "Corbeille".into(),
                path: t.to_string_lossy().into_owned(),
                size,
            });
        }
        items.sort_by(|a, b| b.size.cmp(&a.size));
        Ok(items)
    })
    .await
}

fn empty_dir(dir: &Path) {
    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.flatten() {
            let p = e.path();
            let _ = if p.is_dir() && !p.is_symlink() {
                std::fs::remove_dir_all(&p)
            } else {
                std::fs::remove_file(&p)
            };
        }
    }
}

/// Vide uniquement ~/.cache/* et la corbeille.
#[tauri::command]
pub async fn clear_temp(paths: Vec<String>) -> Result<(), String> {
    blocking(move || {
        let cache = fsutil::home().join(".cache");
        let tf = trash_files();
        for p in paths {
            let pb = PathBuf::from(&p);
            if pb == tf {
                empty_dir(&tf);
                empty_dir(&fsutil::home().join(".local/share/Trash/info"));
            } else if pb != cache && fsutil::is_inside(&cache, &pb) {
                empty_dir(&pb);
                let _ = std::fs::remove_dir(&pb);
                let _ = std::fs::remove_file(&pb);
            }
        }
        Ok(())
    })
    .await
}
