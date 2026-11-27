use serde::Serialize;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use walkdir::WalkDir;

use crate::shared::fsutil;

const MAX_ITEMS: usize = 12_000;
const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_RESULTS: usize = 60;

/// Dossiers de caches applicatifs : inutiles pour éditer une configuration.
const SKIP_DIRS: &[&str] = &[
    "Cache",
    "CachedData",
    "Code Cache",
    "GPUCache",
    "Crashpad",
    "node_modules",
    ".git",
    "logs",
    "Service Worker",
    "blob_storage",
    "IndexedDB",
    "Local Storage",
    "Session Storage",
];

#[derive(Default)]
pub struct IndexCache {
    pub ready: bool,
    pub building: bool,
    pub items: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexStatus {
    pub ready: bool,
    pub building: bool,
    pub count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub ready: bool,
    pub building: bool,
    pub items: Vec<String>,
}

/// Lance la construction de l'index en arrière-plan, une seule fois.
pub fn start(cache: Arc<Mutex<IndexCache>>) {
    {
        let Ok(mut state) = cache.lock() else {
            return;
        };
        if state.ready || state.building {
            return;
        }
        state.building = true;
    }

    std::thread::spawn(move || {
        let items = std::panic::catch_unwind(build).unwrap_or_default();
        if let Ok(mut state) = cache.lock() {
            state.items = items;
            state.ready = true;
            state.building = false;
        }
    });
}

fn build() -> Vec<String> {
    let mut roots = vec![PathBuf::from("/etc")];
    let user_config = fsutil::home().join(".config");
    if user_config.is_dir() {
        roots.push(user_config);
    }

    let mut items = Vec::new();
    for root in roots {
        if !root.is_dir() {
            continue;
        }
        let walker = WalkDir::new(&root)
            .max_depth(8)
            .follow_links(false)
            .into_iter()
            .filter_entry(|entry| {
                if entry.depth() == 0 {
                    return true;
                }
                if entry.file_type().is_symlink() {
                    return false;
                }
                if entry.file_type().is_dir() {
                    let name = entry.file_name().to_string_lossy();
                    if SKIP_DIRS.contains(&&*name) {
                        return false;
                    }
                }
                true
            });

        for entry in walker.flatten() {
            if items.len() >= MAX_ITEMS {
                break;
            }
            if !entry.file_type().is_file() {
                continue;
            }
            let too_large = entry
                .metadata()
                .map(|meta| meta.len() > MAX_FILE_BYTES)
                .unwrap_or(true);
            if too_large {
                continue;
            }
            items.push(entry.path().to_string_lossy().into_owned());
        }

        if items.len() >= MAX_ITEMS {
            break;
        }
    }

    items.sort();
    items.dedup();
    items
}

pub fn status(cache: &Mutex<IndexCache>) -> Result<IndexStatus, String> {
    let state = cache.lock().map_err(|_| "internal_error".to_string())?;
    Ok(IndexStatus {
        ready: state.ready,
        building: state.building,
        count: state.items.len(),
    })
}

/// Recherche floue dans l'index en cache. Aucun accès disque ici.
pub fn search(cache: &Mutex<IndexCache>, query: &str) -> Result<SearchResult, String> {
    let state = cache.lock().map_err(|_| "internal_error".to_string())?;
    let query = query.trim().to_lowercase();
    let mut items = Vec::new();

    if state.ready && !query.is_empty() {
        let mut scored: Vec<(i32, &String)> = state
            .items
            .iter()
            .filter_map(|path| score(path, &query).map(|value| (value, path)))
            .collect();
        scored.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(b.1)));
        items = scored
            .into_iter()
            .take(MAX_RESULTS)
            .map(|(_, path)| path.clone())
            .collect();
    }

    Ok(SearchResult {
        ready: state.ready,
        building: state.building,
        items,
    })
}

fn score(path: &str, query: &str) -> Option<i32> {
    let lower = path.to_lowercase();
    let name = lower.rsplit('/').next().unwrap_or(lower.as_str());

    if let Some(position) = lower.find(query) {
        let mut value = 120 - position.min(80) as i32;
        if name.starts_with(query) {
            value += 80;
        } else if name.contains(query) {
            value += 40;
        }
        return Some(value);
    }

    let mut fuzzy = 0;
    let mut cursor = 0usize;
    let mut previous = 0usize;
    for needle in query.chars() {
        let found = lower[cursor..].find(needle)? + cursor;
        fuzzy += if found == previous { 4 } else { 1 };
        previous = found + needle.len_utf8();
        cursor = previous;
    }
    Some(fuzzy)
}
