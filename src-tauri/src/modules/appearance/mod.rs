use std::path::{Path, PathBuf};

use tauri::image::Image;
use tauri::{AppHandle, Manager};

/// Icône claire (fond beige), utilisée quand l'interface est en thème clair.
const ICON_LIGHT: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/icons/new-icons/icone-f-imparfait-512.png"
));

/// Icône sombre (fond encre), utilisée quand l'interface est en thème sombre.
const ICON_DARK: &[u8] = include_bytes!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/icons/new-icons/icone-f-imparfait-sombre-512.png"
));

/// Fichier de configuration natif de la barre de titre. Il est lu avant la
/// création de la fenêtre : sous Wayland, GTK négocie les décorations au
/// moment où la fenêtre est créée, pas lorsque `set_decorations` est appelé.
const TITLE_BAR_FILE: &str = "plume/title-bar.json";

fn title_bar_file() -> std::path::PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| crate::shared::fsutil::home().join(".config"))
        .join(TITLE_BAR_FILE)
}

/// Indique si la préférence enregistrée demande la barre système.
pub fn stored_title_bar_native() -> bool {
    std::fs::read_to_string(title_bar_file())
        .ok()
        .is_some_and(|raw| is_native_mode(&raw))
}

fn is_native_mode(raw: &str) -> bool {
    serde_json::from_str::<String>(raw)
        .ok()
        .is_some_and(|mode| mode == "native")
}

/// Renvoie le mode de barre de titre qui sera appliqué au prochain lancement.
#[tauri::command]
pub fn title_bar_mode() -> Result<String, String> {
    Ok(if stored_title_bar_native() {
        "native"
    } else {
        "custom"
    }
    .to_string())
}

/// Enregistre le mode choisi. Un redémarrage est nécessaire pour que GTK
/// recrée la fenêtre avec (ou sans) décorations système.
#[tauri::command]
pub fn set_title_bar_mode(mode: String) -> Result<(), String> {
    if mode != "custom" && mode != "native" {
        return Err("invalid_title_bar_mode".to_string());
    }

    let file = title_bar_file();
    if let Some(parent) = file.parent() {
        std::fs::create_dir_all(parent).map_err(|_| "title_bar_write_failed".to_string())?;
    }

    let contents =
        serde_json::to_string(&mode).map_err(|_| "title_bar_write_failed".to_string())?;
    std::fs::write(file, contents).map_err(|_| "title_bar_write_failed".to_string())
}

/// Aligne l'icône de Plume sur le thème choisi par l'utilisateur.
///
/// Sous X11 et Windows, l'icône de la fenêtre suffit. Sous Wayland, le
/// compositeur ignore l'icône de fenêtre et se base sur le fichier `.desktop` :
/// on maintient donc une entrée utilisateur avec un `Icon=` absolu.
#[tauri::command]
pub fn sync_app_icon(app: AppHandle, dark: bool) -> Result<(), String> {
    let bytes = if dark { ICON_DARK } else { ICON_LIGHT };

    if let Ok(image) = Image::from_bytes(bytes) {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.set_icon(image);
        }
    }

    #[cfg(target_os = "linux")]
    sync_desktop_entry(dark).map_err(|_| "errors.unknown".to_string())?;

    Ok(())
}

/// Prépare l'entrée `.desktop` dès le démarrage, avant la création de la
/// fenêtre : sous Wayland, GNOME associe l'icône au moment où la fenêtre
/// apparaît. On reprend le dernier thème appliqué pour éviter un clignotement.
#[cfg(target_os = "linux")]
pub fn prepare_desktop_entry() {
    let dark = last_theme_was_dark();
    let _ = sync_desktop_entry(dark);
}

/// Indique si la dernière icône écrite pour l'entrée `.desktop` était sombre.
#[cfg(target_os = "linux")]
fn last_theme_was_dark() -> bool {
    dirs::data_dir()
        .and_then(|data_dir| {
            std::fs::read_to_string(data_dir.join("applications").join("Plume.desktop")).ok()
        })
        .is_some_and(|entry| {
            entry.lines().any(|line| {
                line.trim_start().starts_with("Icon=") && line.ends_with("plume-dark.png")
            })
        })
}

/// Écrit (si nécessaire) un fichier sans toucher à sa date de modification.
#[cfg(target_os = "linux")]
fn write_if_changed(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if std::fs::read(path).is_ok_and(|current| current == bytes) {
        return Ok(());
    }
    std::fs::write(path, bytes)
}

/// Remplace une clé d'une entrée `.desktop` (ou l'ajoute à la fin).
#[cfg(target_os = "linux")]
fn replace_key(entry: &str, key: &str, replacement: &str) -> String {
    let prefix = format!("{key}=");
    let mut lines: Vec<&str> = entry.lines().collect();
    if let Some(line) = lines
        .iter_mut()
        .find(|line| line.trim_start().starts_with(&prefix))
    {
        *line = replacement;
    } else {
        lines.push(replacement);
    }

    let mut result = lines.join("\n");
    result.push('\n');
    result
}

/// Chemin de l'exécutable courant, échappé pour la clé `Exec=`.
#[cfg(target_os = "linux")]
fn exec_line() -> Option<String> {
    let exe = std::env::var_os("APPIMAGE")
        .filter(|path| !path.is_empty())
        .map(PathBuf::from)
        .or_else(|| std::env::current_exe().ok())?;

    let path = exe.to_string_lossy();
    let needs_quotes = path.chars().any(|c| {
        c.is_whitespace()
            || matches!(
                c,
                '"' | '`'
                    | '$'
                    | '\\'
                    | '>'
                    | '<'
                    | '~'
                    | '|'
                    | '&'
                    | ';'
                    | '*'
                    | '?'
                    | '#'
                    | '('
                    | ')'
            )
    });

    let exec = if needs_quotes {
        format!(
            "\"{}\"",
            path.replace('\\', "\\\\")
                .replace('"', "\\\"")
                .replace('`', "\\`")
                .replace('$', "\\$")
        )
    } else {
        path.into_owned()
    };

    Some(format!("Exec={exec}"))
}

/// Écrit l'entrée `.desktop` de façon atomique pour que GNOME la recharge.
#[cfg(target_os = "linux")]
fn write_desktop_entry(path: &Path, contents: &str) -> std::io::Result<()> {
    if std::fs::read_to_string(path).is_ok_and(|current| current == contents) {
        return Ok(());
    }

    let tmp = path.with_extension("desktop.tmp");
    std::fs::write(&tmp, contents)?;
    std::fs::rename(&tmp, path)
}

#[cfg(target_os = "linux")]
fn sync_desktop_entry(dark: bool) -> std::io::Result<()> {
    let Some(data_dir) = dirs::data_dir() else {
        return Ok(());
    };
    sync_desktop_entry_in(&data_dir, dark)
}

#[cfg(target_os = "linux")]
fn sync_desktop_entry_in(data_dir: &Path, dark: bool) -> std::io::Result<()> {
    // Les PNG sont embarqués dans le binaire : on les dépose dans un dossier
    // stable du home pour que le compositeur puisse les lire.
    let icon_dir = data_dir.join("plume").join("icons");
    std::fs::create_dir_all(&icon_dir)?;

    let light_icon = icon_dir.join("plume-light.png");
    let dark_icon = icon_dir.join("plume-dark.png");
    write_if_changed(&light_icon, ICON_LIGHT)?;
    write_if_changed(&dark_icon, ICON_DARK)?;

    let icon = if dark { &dark_icon } else { &light_icon };
    let icon_line = format!("Icon={}", icon.display());

    let apps_dir = data_dir.join("applications");
    std::fs::create_dir_all(&apps_dir)?;
    let entry_path = apps_dir.join("Plume.desktop");

    // On repart de l'entrée système quand elle existe (pour suivre ses mises à
    // jour), sinon de l'entrée utilisateur déjà présente (AppImage, etc.).
    let base = std::fs::read_to_string("/usr/share/applications/Plume.desktop")
        .or_else(|_| std::fs::read_to_string(&entry_path))
        .unwrap_or_else(|_| {
            String::from(
                "[Desktop Entry]\n\
                 Type=Application\n\
                 Name=Plume\n\
                 Comment=Garder votre machine légère\n\
                 Exec=plume\n\
                 Terminal=false\n\
                 Categories=Utility;\n\
                 StartupWMClass=plume\n",
            )
        });

    let mut entry = replace_key(&base, "Icon", &icon_line);
    if let Some(exec) = exec_line() {
        entry = replace_key(&entry, "Exec", &exec);
    }

    write_desktop_entry(&entry_path, &entry)
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;

    #[test]
    fn title_bar_mode_is_parsed_safely() {
        assert!(is_native_mode("\"native\""));
        assert!(!is_native_mode("\"custom\""));
        assert!(!is_native_mode("native"));
        assert!(!is_native_mode(""));
    }

    #[test]
    fn desktop_entry_follows_theme() {
        let dir = std::env::temp_dir().join(format!("plume-icon-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);

        sync_desktop_entry_in(&dir, false).unwrap();
        let light = std::fs::read_to_string(dir.join("applications/Plume.desktop")).unwrap();
        assert!(light.contains("plume-light.png"));
        assert!(light.contains("Exec="));
        assert!(!light.lines().any(|line| line == "Exec=plume"));
        assert!(dir.join("plume/icons/plume-light.png").exists());

        sync_desktop_entry_in(&dir, true).unwrap();
        let dark = std::fs::read_to_string(dir.join("applications/Plume.desktop")).unwrap();
        assert!(dark.contains("plume-dark.png"));
        assert!(dir.join("plume/icons/plume-dark.png").exists());

        let _ = std::fs::remove_dir_all(&dir);
    }
}
