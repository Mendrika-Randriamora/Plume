use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use crate::shared::fsutil;

const CATALOG: &str = include_str!("configs.json");

/// Entrée du catalogue de fichiers connus, telle qu'envoyée à l'interface.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigEntry {
    pub id: String,
    pub label: String,
    pub description: String,
    pub path: String,
    pub category: String,
    pub language: String,
    pub root: bool,
    #[serde(default)]
    pub validate: Option<Vec<String>>,
    pub danger: String,
}

fn expand(path: &str) -> String {
    if path == "~" {
        return fsutil::home().to_string_lossy().into_owned();
    }
    if let Some(rest) = path.strip_prefix("~/") {
        return fsutil::home().join(rest).to_string_lossy().into_owned();
    }
    path.to_string()
}

fn entries() -> &'static Vec<ConfigEntry> {
    static ENTRIES: OnceLock<Vec<ConfigEntry>> = OnceLock::new();
    ENTRIES.get_or_init(|| {
        let mut list: Vec<ConfigEntry> = serde_json::from_str(CATALOG).unwrap_or_default();
        for entry in &mut list {
            entry.path = expand(&entry.path);
        }
        list
    })
}

fn category_rank(category: &str) -> u8 {
    match category {
        "Système" => 0,
        "Réseau" => 1,
        "Démarrage" => 2,
        "Shell" => 3,
        "Applications" => 4,
        _ => 5,
    }
}

/// Catalogue filtré par existence : un simple `stat`, aucun scan récursif.
pub fn list_existing() -> Vec<ConfigEntry> {
    let mut list: Vec<ConfigEntry> = entries()
        .iter()
        .filter(|entry| Path::new(&entry.path).is_file())
        .cloned()
        .collect();
    list.sort_by(|a, b| {
        category_rank(&a.category)
            .cmp(&category_rank(&b.category))
            .then_with(|| a.label.to_lowercase().cmp(&b.label.to_lowercase()))
    });
    list
}

fn canonical(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
}

/// Retrouve l'entrée du catalogue correspondant à un chemin, même si le
/// fichier est un lien symbolique.
pub fn find_for(path: &Path) -> Option<ConfigEntry> {
    let target = canonical(path);
    entries()
        .iter()
        .find(|entry| canonical(Path::new(&entry.path)) == target)
        .cloned()
}

pub fn language_for(path: &Path) -> String {
    if let Some(entry) = find_for(path) {
        return entry.language;
    }

    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .to_lowercase();
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default()
        .to_lowercase();

    match (name.as_str(), ext.as_str()) {
        ("bashrc" | ".bashrc" | ".bash_profile" | ".zshrc" | ".zprofile" | ".profile", _) => {
            "shell".into()
        }
        ("dockerfile", _) => "dockerfile".into(),
        (_, "sh" | "bash" | "zsh" | "fish") => "shell".into(),
        (_, "ini" | "cfg" | "conf" | "properties") => "ini".into(),
        (_, "yaml" | "yml") => "yaml".into(),
        (_, "toml") => "toml".into(),
        (_, "json") => "json".into(),
        (_, "xml") => "xml".into(),
        (_, "nginx") => "nginx".into(),
        _ => "plaintext".into(),
    }
}

pub fn danger_for(path: &Path) -> String {
    find_for(path)
        .map(|entry| entry.danger)
        .unwrap_or_else(|| "low".into())
}

pub fn validate_for(path: &Path) -> Option<Vec<String>> {
    find_for(path).and_then(|entry| entry.validate)
}

pub fn label_for(path: &Path) -> String {
    if let Some(entry) = find_for(path) {
        return entry.label;
    }
    path.file_name()
        .and_then(|n| n.to_str())
        .map(str::to_string)
        .unwrap_or_else(|| path.to_string_lossy().into_owned())
}

pub fn description_for(path: &Path) -> String {
    if let Some(entry) = find_for(path) {
        return entry.description;
    }
    path.parent()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_default()
}

pub fn category_for(path: &Path) -> Option<String> {
    find_for(path).map(|entry| entry.category)
}
