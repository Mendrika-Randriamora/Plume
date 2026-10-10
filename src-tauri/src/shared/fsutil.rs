use std::path::{Path, PathBuf};
use walkdir::WalkDir;

/// Vrai si `p` (une fois résolu) se trouve dans `base`.
pub fn is_inside(base: &Path, p: &Path) -> bool {
    match (base.canonicalize(), p.canonicalize()) {
        (Ok(b), Ok(c)) => c.starts_with(b),
        _ => false,
    }
}

pub fn dir_size(p: &Path) -> u64 {
    if p.is_file() {
        return p.metadata().map(|m| m.len()).unwrap_or(0);
    }
    WalkDir::new(p)
        .follow_links(false)
        .into_iter()
        .flatten()
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| e.metadata().ok())
        .map(|m| m.len())
        .sum()
}

pub fn home() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from("/home"))
}
