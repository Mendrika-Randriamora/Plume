use std::path::{Component, Path, PathBuf};

use crate::shared::fsutil;

/// Développe `~` et refuse les chemins relatifs ou contenant `..`.
pub fn expand(path: &str) -> Result<PathBuf, String> {
    let raw = path.trim();
    if raw.is_empty() || raw.contains('\0') {
        return Err("config_path_denied".into());
    }

    let expanded = if raw == "~" {
        fsutil::home()
    } else if let Some(rest) = raw.strip_prefix("~/") {
        fsutil::home().join(rest)
    } else {
        PathBuf::from(raw)
    };

    if !expanded.is_absolute() {
        return Err("config_path_denied".into());
    }
    if expanded
        .components()
        .any(|component| matches!(component, Component::ParentDir))
    {
        return Err("config_path_denied".into());
    }

    Ok(expanded)
}

fn canonical(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
}

fn home() -> PathBuf {
    canonical(&fsutil::home())
}

/// Un fichier est autorisé s'il reste dans le dossier personnel ou dans /etc.
pub fn inside_allowed(path: &Path) -> bool {
    let path = canonical(path);
    if path.starts_with(home()) {
        return true;
    }
    #[cfg(target_os = "linux")]
    {
        if path.starts_with("/etc") {
            return true;
        }
    }
    false
}

/// Vrai pour un fichier système : une écriture devra passer par pkexec.
pub fn is_system(path: &Path) -> bool {
    #[cfg(target_os = "linux")]
    {
        canonical(path).starts_with("/etc")
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = path;
        false
    }
}

/// Résout et valide un fichier existant, en suivant les liens symboliques.
pub fn allowed_file(path: &str) -> Result<PathBuf, String> {
    let expanded = expand(path)?;
    let resolved = expanded
        .canonicalize()
        .map_err(|_| "config_not_found".to_string())?;
    if !resolved.is_file() {
        return Err("config_not_found".into());
    }
    if !inside_allowed(&resolved) {
        return Err("config_path_denied".into());
    }
    Ok(resolved)
}

/// Résout et valide un dossier que l'interface a le droit de parcourir :
/// uniquement /etc et ~/.config (et leurs sous-dossiers).
pub fn allowed_dir(path: &str) -> Result<PathBuf, String> {
    let expanded = expand(path)?;
    let resolved = expanded
        .canonicalize()
        .map_err(|_| "config_not_found".to_string())?;
    if !resolved.is_dir() {
        return Err("config_not_found".into());
    }

    let user_config = canonical(&fsutil::home().join(".config"));
    let allowed = resolved.starts_with(&user_config)
        || (cfg!(target_os = "linux") && resolved.starts_with("/etc"));
    if !allowed {
        return Err("config_path_denied".into());
    }
    Ok(resolved)
}
