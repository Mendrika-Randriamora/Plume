use serde::Serialize;
use std::{collections::HashMap, path::PathBuf, time::SystemTime, time::UNIX_EPOCH};
use walkdir::WalkDir;

use super::fsutil::home;

/// Dossiers de dépendances / build ignorés (les dossiers cachés le sont aussi).
const SKIP: &[&str] = &[
    "node_modules", "vendor", "venv", "env", "__pycache__", "target", "dist", "build",
    "site-packages", "snap",
];

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub path: String,
    pub name: String,
    pub parent: String,
    pub is_dir: bool,
    pub size: u64,
    /// Dernière utilisation (secondes Unix) = max(accès, modification)
    pub last_used: u64,
}

fn secs(t: std::io::Result<SystemTime>) -> u64 {
    t.ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn entry(path: &std::path::Path, is_dir: bool, size: u64, last_used: u64) -> Entry {
    Entry {
        path: path.to_string_lossy().into_owned(),
        name: path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        parent: path.parent().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default(),
        is_dir,
        size,
        last_used,
    }
}

/// Parcourt le dossier personnel. Si `include_dirs`, ajoute aussi les dossiers
/// des 2 premiers niveaux avec leur taille cumulée.
pub fn scan(include_dirs: bool) -> Vec<Entry> {
    let root = home();
    let mut out = Vec::new();
    let mut dirs: HashMap<PathBuf, (u64, u64)> = HashMap::new();

    let walker = WalkDir::new(&root).follow_links(false).into_iter().filter_entry(|e| {
        if e.depth() == 0 {
            return true;
        }
        let name = e.file_name().to_string_lossy();
        if name.starts_with('.') {
            return false;
        }
        !(e.file_type().is_dir() && SKIP.contains(&&*name))
    });

    for e in walker.flatten() {
        if !e.file_type().is_file() {
            continue;
        }
        let Ok(md) = e.metadata() else { continue };
        let size = md.len();
        let last = secs(md.accessed()).max(secs(md.modified()));

        if include_dirs {
            if let Ok(rel) = e.path().strip_prefix(&root) {
                let comps: Vec<_> = rel.components().collect();
                for depth in 1..=2usize {
                    if comps.len() > depth {
                        let mut p = root.clone();
                        for c in &comps[..depth] {
                            p.push(c.as_os_str());
                        }
                        let slot = dirs.entry(p).or_insert((0, 0));
                        slot.0 += size;
                        slot.1 = slot.1.max(last);
                    }
                }
            }
        }
        out.push(entry(e.path(), false, size, last));
    }

    for (p, (size, last)) in dirs {
        out.push(entry(&p, true, size, last));
    }
    out
}
