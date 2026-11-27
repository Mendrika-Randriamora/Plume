use serde::Serialize;

/// Une entrée de lancement automatique : à l'ouverture de session ou planifiée par cron.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupEntry {
    /// `autostart:<fichier>` pour un fichier .desktop, `cron:<identifiant>` pour une tâche.
    id: String,
    name: String,
    command: String,
    /// `boot` (ouverture de session) ou `schedule` (cron).
    trigger: String,
    schedule: Option<String>,
    enabled: bool,
    /// Faux pour une entrée du système que Plume n'a pas créée : lecture seule.
    managed: bool,
    source: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupList {
    autostart_supported: bool,
    cron_supported: bool,
    entries: Vec<StartupEntry>,
}

#[tauri::command]
pub async fn list_startup_entries() -> Result<StartupList, String> {
    #[cfg(target_os = "linux")]
    {
        crate::shared::blocking(|| Ok(platform::list())).await
    }

    #[cfg(target_os = "windows")]
    {
        crate::shared::blocking(platform::list).await
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        Err("unsupported_platform".into())
    }
}

#[tauri::command]
pub async fn create_startup_entry(
    name: String,
    command: String,
    schedule: Option<String>,
) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        crate::shared::blocking(move || platform::create(&name, &command, schedule.as_deref()))
            .await
    }

    #[cfg(target_os = "windows")]
    {
        crate::shared::blocking(move || platform::create(&name, &command, schedule.as_deref()))
            .await
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        let _ = (name, command, schedule);
        Err("unsupported_platform".into())
    }
}

#[tauri::command]
pub async fn set_startup_entry_enabled(id: String, enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        crate::shared::blocking(move || platform::set_enabled(&id, enabled)).await
    }

    #[cfg(target_os = "windows")]
    {
        crate::shared::blocking(move || platform::set_enabled(&id, enabled)).await
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        let _ = (id, enabled);
        Err("unsupported_platform".into())
    }
}

#[tauri::command]
pub async fn remove_startup_entry(id: String) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        crate::shared::blocking(move || platform::remove(&id)).await
    }

    #[cfg(target_os = "windows")]
    {
        crate::shared::blocking(move || platform::remove(&id)).await
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        let _ = id;
        Err("unsupported_platform".into())
    }
}

/// Implémentation Linux : fichiers `~/.config/autostart` et crontab de l'utilisateur.
#[cfg(target_os = "linux")]
mod platform {
    use super::{StartupEntry, StartupList};
    use crate::modules::applications::clean_exec;
    use crate::shared::fsutil;
    use std::env;
    use std::fs;
    use std::os::unix::fs::PermissionsExt;
    use std::path::{Path, PathBuf};
    use std::process::Command;
    use std::time::{SystemTime, UNIX_EPOCH};

    /// Marqueur des fichiers .desktop créés par Plume : sans lui, rien n'est modifié.
    const AUTOSTART_MARKER: &str = "X-Plume-Autostart=true";
    const AUTOSTART_PREFIX: &str = "plume-startup-";
    const AUTOSTART_ENABLED: &str = "X-GNOME-Autostart-enabled";
    /// Marqueur des lignes de crontab gérées par Plume.
    const CRON_MARKER: &str = "# plume-startup:";
    const CRON_SOURCE: &str = "crontab";
    /// Variables de session recopiées dans la ligne cron, sans quoi une application
    /// graphique n'aurait ni affichage ni bus de session.
    const CRON_ENV_KEYS: [&str; 6] = [
        "PATH",
        "DISPLAY",
        "WAYLAND_DISPLAY",
        "XDG_RUNTIME_DIR",
        "XAUTHORITY",
        "DBUS_SESSION_BUS_ADDRESS",
    ];

    pub(super) fn list() -> StartupList {
        let mut entries = read_autostart();
        entries.extend(read_cron());
        StartupList {
            autostart_supported: true,
            cron_supported: crontab_binary().is_some(),
            entries,
        }
    }

    pub(super) fn create(name: &str, command: &str, schedule: Option<&str>) -> Result<(), String> {
        let name = validate_name(name)?;
        let command = validate_command(command)?;

        match schedule {
            None => create_autostart(&name, &command),
            Some(expr) => {
                if crontab_binary().is_none() {
                    return Err("cron_unavailable".into());
                }
                let expr = validate_schedule(expr)?;
                create_cron(&name, &command, &expr)
            }
        }
    }

    pub(super) fn set_enabled(id: &str, enabled: bool) -> Result<(), String> {
        match parse_id(id)? {
            ("autostart", key) => set_autostart_enabled(key, enabled),
            ("cron", key) => set_cron_enabled(key, enabled),
            _ => Err("invalid_input".into()),
        }
    }

    pub(super) fn remove(id: &str) -> Result<(), String> {
        match parse_id(id)? {
            ("autostart", key) => remove_autostart(key),
            ("cron", key) => remove_cron(key),
            _ => Err("invalid_input".into()),
        }
    }

    fn parse_id(id: &str) -> Result<(&str, &str), String> {
        let (kind, key) = id
            .split_once(':')
            .ok_or_else(|| "invalid_input".to_string())?;
        if kind.is_empty() || key.is_empty() {
            return Err("invalid_input".into());
        }
        Ok((kind, key))
    }

    // ---------- Validation ----------

    fn validate_name(value: &str) -> Result<String, String> {
        let value = value.trim();
        if value.is_empty()
            || value.chars().count() > 80
            || value.contains('\n')
            || value.contains('\r')
            || value.contains('|')
        {
            return Err("invalid_input".into());
        }
        Ok(value.to_string())
    }

    fn validate_command(value: &str) -> Result<String, String> {
        let value = value.trim();
        if value.is_empty()
            || value.chars().count() > 4096
            || value.contains('\n')
            || value.contains('\r')
        {
            return Err("invalid_input".into());
        }
        Ok(value.to_string())
    }

    /// Cinq champs (minute, heure, jour, mois, jour de la semaine), valeurs numériques.
    fn validate_schedule(expr: &str) -> Result<String, String> {
        let fields: Vec<&str> = expr.split_whitespace().collect();
        if fields.len() != 5 {
            return Err("invalid_schedule".into());
        }

        let limits = [59_u32, 23, 31, 12, 7];
        for (field, limit) in fields.iter().copied().zip(limits) {
            if !field_in_range(field, limit) {
                return Err("invalid_schedule".into());
            }
        }
        Ok(fields.join(" "))
    }

    fn field_in_range(field: &str, limit: u32) -> bool {
        if field.is_empty() {
            return false;
        }

        field.split(',').all(|part| {
            let (base, step) = match part.split_once('/') {
                Some((base, step)) => (base, Some(step)),
                None => (part, None),
            };

            if let Some(step) = step {
                match step.parse::<u32>() {
                    Ok(value) if value > 0 => {}
                    _ => return false,
                }
            }

            if base == "*" {
                return true;
            }

            match base.split_once('-') {
                Some((start, end)) => match (start.parse::<u32>(), end.parse::<u32>()) {
                    (Ok(start), Ok(end)) => start <= end && end <= limit,
                    _ => false,
                },
                None => match base.parse::<u32>() {
                    Ok(value) => value <= limit,
                    Err(_) => false,
                },
            }
        })
    }

    // ---------- Ouverture de session (autostart) ----------

    fn autostart_dir() -> PathBuf {
        fsutil::home().join(".config").join("autostart")
    }

    fn desktop_field(content: &str, key: &str) -> Option<String> {
        let mut in_main_group = false;
        for raw in content.lines() {
            let line = raw.trim();
            if line.starts_with('[') && line.ends_with(']') {
                in_main_group = &line[1..line.len() - 1] == "Desktop Entry";
                continue;
            }
            if !in_main_group {
                continue;
            }
            if let Some((name, value)) = line.split_once('=') {
                if name.trim() == key {
                    return Some(value.trim().to_string());
                }
            }
        }
        None
    }

    fn read_autostart() -> Vec<StartupEntry> {
        let Ok(read_dir) = fs::read_dir(autostart_dir()) else {
            return Vec::new();
        };

        let mut entries = Vec::new();
        for item in read_dir.flatten() {
            let path = item.path();
            if path.extension().and_then(|ext| ext.to_str()) != Some("desktop") {
                continue;
            }
            let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            let Ok(content) = fs::read_to_string(&path) else {
                continue;
            };

            let is_application = desktop_field(&content, "Type")
                .is_some_and(|kind| kind.eq_ignore_ascii_case("Application"));
            if !is_application {
                continue;
            }
            // Un fichier masqué ne se lance pas : inutile de l'afficher.
            if desktop_field(&content, "Hidden")
                .is_some_and(|value| value.eq_ignore_ascii_case("true"))
            {
                continue;
            }

            let managed = content.contains(AUTOSTART_MARKER);
            let enabled = !desktop_field(&content, AUTOSTART_ENABLED)
                .is_some_and(|value| value.eq_ignore_ascii_case("false"));
            let name = desktop_field(&content, "Name")
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| file_name.trim_end_matches(".desktop").to_string());

            entries.push(StartupEntry {
                id: format!("autostart:{file_name}"),
                name,
                command: desktop_field(&content, "Exec")
                    .map(|exec| clean_exec(&exec))
                    .unwrap_or_default(),
                trigger: "boot".to_string(),
                schedule: None,
                enabled,
                managed,
                source: path.display().to_string(),
            });
        }

        entries.sort_by_key(|entry| entry.name.to_lowercase());
        entries
    }

    fn slugify(value: &str) -> String {
        let mut slug = String::new();
        for ch in value.chars() {
            if ch.is_ascii_alphanumeric() {
                slug.push(ch.to_ascii_lowercase());
            } else if !slug.ends_with('-') {
                slug.push('-');
            }
        }
        let slug = slug.trim_matches('-').to_string();
        if slug.is_empty() {
            "entree".to_string()
        } else {
            slug
        }
    }

    fn autostart_target(dir: &Path, name: &str) -> PathBuf {
        let slug = slugify(name);
        let mut candidate = dir.join(format!("{AUTOSTART_PREFIX}{slug}.desktop"));
        let mut suffix = 2;
        while candidate.exists() {
            candidate = dir.join(format!("{AUTOSTART_PREFIX}{slug}-{suffix}.desktop"));
            suffix += 1;
        }
        candidate
    }

    fn create_autostart(name: &str, command: &str) -> Result<(), String> {
        let dir = autostart_dir();
        fs::create_dir_all(&dir).map_err(|error| {
            eprintln!("Impossible de créer {} : {error}", dir.display());
            "command_failed".to_string()
        })?;

        let path = autostart_target(&dir, name);
        let content = format!(
            "[Desktop Entry]\nType=Application\nName={name}\nComment=Lancé par Plume à l'ouverture de session\nExec={exec}\nTerminal=false\n{AUTOSTART_MARKER}\n{AUTOSTART_ENABLED}=true\n",
            exec = clean_exec(command)
        );

        fs::write(&path, content).map_err(|error| {
            eprintln!("Impossible d'écrire {} : {error}", path.display());
            "command_failed".to_string()
        })
    }

    /// Résout un fichier autostart créé par Plume ; refuse tout le reste (lecture seule).
    fn managed_autostart(file_name: &str) -> Result<PathBuf, String> {
        if !file_name.starts_with(AUTOSTART_PREFIX)
            || !file_name.ends_with(".desktop")
            || file_name.contains('/')
            || file_name.contains("..")
        {
            return Err("invalid_input".into());
        }

        let dir = autostart_dir();
        let path = dir.join(file_name);
        if !path.is_file() || !fsutil::is_inside(&dir, &path) {
            return Err("invalid_input".into());
        }

        let content = fs::read_to_string(&path).map_err(|_| "command_failed".to_string())?;
        if !content.contains(AUTOSTART_MARKER) {
            return Err("unmanaged_entry".into());
        }
        Ok(path)
    }

    fn set_autostart_enabled(file_name: &str, enabled: bool) -> Result<(), String> {
        let path = managed_autostart(file_name)?;
        let content = fs::read_to_string(&path).map_err(|_| "command_failed".to_string())?;
        let value = if enabled { "true" } else { "false" };

        let mut lines: Vec<String> = Vec::new();
        let mut replaced = false;
        for line in content.lines() {
            if line.trim_start().starts_with(AUTOSTART_ENABLED) && line.contains('=') {
                lines.push(format!("{AUTOSTART_ENABLED}={value}"));
                replaced = true;
            } else {
                lines.push(line.to_string());
            }
        }
        if !replaced {
            lines.push(format!("{AUTOSTART_ENABLED}={value}"));
        }

        fs::write(&path, lines.join("\n") + "\n").map_err(|error| {
            eprintln!("Impossible d'écrire {} : {error}", path.display());
            "command_failed".to_string()
        })
    }

    fn remove_autostart(file_name: &str) -> Result<(), String> {
        let path = managed_autostart(file_name)?;
        fs::remove_file(&path).map_err(|error| {
            eprintln!("Impossible de supprimer {} : {error}", path.display());
            "command_failed".to_string()
        })
    }

    // ---------- Tâches planifiées (cron) ----------

    fn crontab_binary() -> Option<PathBuf> {
        let paths = env::var_os("PATH")?;
        env::split_paths(&paths)
            .map(|dir| dir.join("crontab"))
            .find(|path| path.is_file())
    }

    fn read_crontab() -> Result<Vec<String>, String> {
        let Some(binary) = crontab_binary() else {
            return Err("cron_unavailable".into());
        };

        match Command::new(binary).arg("-l").env("LC_ALL", "C").output() {
            Ok(output) if output.status.success() => Ok(String::from_utf8_lossy(&output.stdout)
                .lines()
                .map(str::to_string)
                .collect()),
            Ok(output) => {
                let stderr = String::from_utf8_lossy(&output.stderr);
                // « no crontab for <utilisateur> » signifie simplement un crontab vide.
                if stderr.contains("no crontab") {
                    Ok(Vec::new())
                } else {
                    eprintln!("crontab -l a échoué : {}", stderr.trim());
                    Err("crontab_failed".into())
                }
            }
            Err(error) => {
                eprintln!("Impossible d'exécuter crontab : {error}");
                Err("crontab_failed".into())
            }
        }
    }

    fn write_crontab(lines: &[String]) -> Result<(), String> {
        let Some(binary) = crontab_binary() else {
            return Err("cron_unavailable".into());
        };

        let mut content = lines.join("\n");
        content.push('\n');

        let path = env::temp_dir().join(format!("plume-crontab-{}.txt", std::process::id()));
        fs::write(&path, content).map_err(|error| {
            eprintln!("Impossible d'écrire {} : {error}", path.display());
            "crontab_failed".to_string()
        })?;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));

        let output = Command::new(binary).arg(&path).env("LC_ALL", "C").output();
        let _ = fs::remove_file(&path);

        match output {
            Ok(output) if output.status.success() => Ok(()),
            Ok(output) => {
                eprintln!(
                    "crontab a refusé le contenu : {}",
                    String::from_utf8_lossy(&output.stderr).trim()
                );
                Err("crontab_failed".into())
            }
            Err(error) => {
                eprintln!("Impossible d'exécuter crontab : {error}");
                Err("crontab_failed".into())
            }
        }
    }

    fn unique_id() -> String {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        format!("{stamp:x}{:x}", std::process::id())
    }

    fn create_cron(name: &str, command: &str, schedule: &str) -> Result<(), String> {
        let mut lines = read_crontab()?;
        // Dans une crontab, un « % » non échappé est traduit en retour à la ligne.
        let escaped = command.replace('%', "\\%");

        lines.push(format!("{CRON_MARKER}{}|{name}", unique_id()));
        lines.push(format!("{schedule} {}{escaped}", session_prefix()));
        write_crontab(&lines)
    }

    fn session_prefix() -> String {
        let mut parts = vec!["PATH=/usr/local/bin:/usr/bin:/bin".to_string()];
        for key in CRON_ENV_KEYS.iter().skip(1) {
            let Some(value) = env::var_os(key) else {
                continue;
            };
            let value = value.to_string_lossy();
            let value = value.trim();
            if value.is_empty()
                || value.chars().any(char::is_whitespace)
                || value.contains('\'')
                || value.contains('%')
            {
                continue;
            }
            parts.push(format!("{key}={value}"));
        }
        format!("{} ", parts.join(" "))
    }

    fn find_cron(lines: &[String], id: &str) -> Option<usize> {
        lines.iter().position(|line| {
            line.trim()
                .strip_prefix(CRON_MARKER)
                .is_some_and(|rest| match rest.split_once('|') {
                    Some((found, _)) => found == id,
                    None => rest == id,
                })
        })
    }

    fn read_cron() -> Vec<StartupEntry> {
        let Ok(lines) = read_crontab() else {
            return Vec::new();
        };

        let mut entries = Vec::new();
        let mut index = 0;
        while index < lines.len() {
            let marker = lines[index].trim();
            let Some(rest) = marker.strip_prefix(CRON_MARKER) else {
                index += 1;
                continue;
            };

            let (id, name) = rest.split_once('|').unwrap_or((rest, ""));
            if let Some(next) = lines.get(index + 1) {
                let next = next.trim();
                let (enabled, body) = match next.strip_prefix('#') {
                    Some(body) => (false, body.trim_start()),
                    None => (true, next),
                };
                if let Some((schedule, command)) = split_cron_line(body) {
                    entries.push(StartupEntry {
                        id: format!("cron:{id}"),
                        name: name.to_string(),
                        command,
                        trigger: "schedule".to_string(),
                        schedule: Some(schedule),
                        enabled,
                        managed: true,
                        source: CRON_SOURCE.to_string(),
                    });
                }
            }
            index += 2;
        }
        entries
    }

    fn split_cron_line(line: &str) -> Option<(String, String)> {
        let mut rest = line.trim();
        let mut fields = Vec::new();
        for _ in 0..5 {
            let end = rest.find(char::is_whitespace)?;
            fields.push(rest[..end].to_string());
            rest = rest[end..].trim_start();
        }
        if rest.is_empty() {
            return None;
        }
        Some((fields.join(" "), strip_env_prefix(rest)))
    }

    /// Retire le préfixe d'environnement ajouté par Plume, pour réafficher la commande seule.
    fn strip_env_prefix(command: &str) -> String {
        let mut rest = command.trim();
        while let Some((token, after)) = rest.split_once(char::is_whitespace) {
            let Some((key, _)) = token.split_once('=') else {
                break;
            };
            if !CRON_ENV_KEYS.contains(&key) {
                break;
            }
            rest = after.trim_start();
        }
        rest.to_string()
    }

    fn set_cron_enabled(id: &str, enabled: bool) -> Result<(), String> {
        let mut lines = read_crontab()?;
        let index = find_cron(&lines, id).ok_or_else(|| "invalid_input".to_string())?;
        let next = lines
            .get(index + 1)
            .cloned()
            .ok_or_else(|| "invalid_input".to_string())?;

        let trimmed = next.trim();
        let body = trimmed
            .strip_prefix('#')
            .map(str::trim_start)
            .unwrap_or(trimmed);
        if body.is_empty() {
            return Err("invalid_input".into());
        }

        lines[index + 1] = if enabled {
            body.to_string()
        } else {
            format!("# {body}")
        };
        write_crontab(&lines)
    }

    fn remove_cron(id: &str) -> Result<(), String> {
        let mut lines = read_crontab()?;
        let index = find_cron(&lines, id).ok_or_else(|| "invalid_input".to_string())?;
        let end = (index + 1).min(lines.len() - 1);
        lines.drain(index..=end);
        write_crontab(&lines)
    }
}

/// Implémentation Windows : clé Run du registre, dossier Démarrage et
/// Planificateur de tâches (dossier `\Plume\`).
#[cfg(target_os = "windows")]
mod platform {
    use super::{StartupEntry, StartupList};
    use std::collections::BTreeSet;
    use std::fs;
    use std::os::windows::fs::MetadataExt;
    use std::os::windows::process::CommandExt;
    use std::path::PathBuf;
    use std::process::Command;
    use std::time::{SystemTime, UNIX_EPOCH};
    use winreg::enums::{
        HKEY_CURRENT_USER, KEY_READ, KEY_WRITE, REG_BINARY, REG_EXPAND_SZ, REG_SZ,
    };
    use winreg::{RegKey, RegValue};

    /// Évite l'ouverture d'une fenêtre console pour schtasks.exe.
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
    const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
    const APPROVED_RUN_KEY: &str =
        r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
    /// Préfixe des valeurs Run créées par Plume ; tout le reste est en lecture seule.
    const MANAGED_PREFIX: &str = "Plume - ";
    const TASK_FOLDER: &str = "Plume";

    pub(super) fn list() -> Result<StartupList, String> {
        let mut entries = read_run_entries()?;
        entries.extend(read_startup_folder());
        entries.extend(read_tasks()?);

        // Les lancements à l'ouverture de session d'abord, puis les tâches planifiées.
        entries.sort_by(|a, b| {
            let a_boot = a.trigger == "boot";
            let b_boot = b.trigger == "boot";
            b_boot
                .cmp(&a_boot)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });

        Ok(StartupList {
            autostart_supported: true,
            cron_supported: true,
            entries,
        })
    }

    pub(super) fn create(name: &str, command: &str, schedule: Option<&str>) -> Result<(), String> {
        let name = validate_name(name)?;
        let command = validate_command(command)?;

        match schedule {
            None => create_run_entry(&name, &command),
            Some(expr) => {
                let expr = expr.trim();
                if expr.is_empty() {
                    return Err("invalid_schedule".into());
                }
                create_task(&name, &command, expr)
            }
        }
    }

    pub(super) fn set_enabled(id: &str, enabled: bool) -> Result<(), String> {
        match parse_id(id)? {
            ("run", key) => set_run_entry_enabled(key, enabled),
            ("task", key) => set_task_enabled(key, enabled),
            ("folder", _) => Err("unmanaged_entry".into()),
            _ => Err("invalid_input".into()),
        }
    }

    pub(super) fn remove(id: &str) -> Result<(), String> {
        match parse_id(id)? {
            ("run", key) => remove_run_entry(key),
            ("task", key) => remove_task(key),
            ("folder", _) => Err("unmanaged_entry".into()),
            _ => Err("invalid_input".into()),
        }
    }

    fn parse_id(id: &str) -> Result<(&str, &str), String> {
        let (kind, key) = id
            .split_once(':')
            .ok_or_else(|| "invalid_input".to_string())?;
        if kind.is_empty() || key.is_empty() {
            return Err("invalid_input".into());
        }
        Ok((kind, key))
    }

    // ---------- Validation ----------

    fn validate_name(value: &str) -> Result<String, String> {
        let value = value.trim();
        if value.is_empty()
            || value.chars().count() > 80
            || value.chars().any(|ch| ch.is_control())
            || value
                .chars()
                .any(|ch| matches!(ch, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|'))
        {
            return Err("invalid_input".into());
        }
        Ok(value.to_string())
    }

    fn validate_command(value: &str) -> Result<String, String> {
        let value = value.trim();
        if value.is_empty()
            || value.chars().count() > 4096
            || value.contains('\n')
            || value.contains('\r')
        {
            return Err("invalid_input".into());
        }
        Ok(value.to_string())
    }

    /// Cinq champs (minute, heure, jour, mois, jour de la semaine), valeurs numériques.
    fn validate_schedule(expr: &str) -> Result<Vec<&str>, String> {
        let fields: Vec<&str> = expr.split_whitespace().collect();
        if fields.len() != 5 {
            return Err("invalid_schedule".into());
        }

        let limits = [59_u32, 23, 31, 12, 7];
        for (field, limit) in fields.iter().copied().zip(limits) {
            if !field_in_range(field, limit) {
                return Err("invalid_schedule".into());
            }
        }
        Ok(fields)
    }

    fn field_in_range(field: &str, limit: u32) -> bool {
        if field.is_empty() {
            return false;
        }

        field.split(',').all(|part| {
            let (base, step) = match part.split_once('/') {
                Some((base, step)) => (base, Some(step)),
                None => (part, None),
            };

            if let Some(step) = step {
                match step.parse::<u32>() {
                    Ok(value) if value > 0 => {}
                    _ => return false,
                }
            }

            if base == "*" {
                return true;
            }

            match base.split_once('-') {
                Some((start, end)) => match (start.parse::<u32>(), end.parse::<u32>()) {
                    (Ok(start), Ok(end)) => start <= end && end <= limit,
                    _ => false,
                },
                None => match base.parse::<u32>() {
                    Ok(value) => value <= limit,
                    Err(_) => false,
                },
            }
        })
    }

    /// Traduit une expression cron en arguments `schtasks /Create`.
    /// Les formes non représentables par schtasks sont refusées.
    fn schedule_args(expr: &str) -> Result<(String, Vec<String>), String> {
        let fields = validate_schedule(expr)?;
        let minute = fields[0];
        let hour = fields[1];
        let day_of_month = fields[2];
        let month = fields[3];
        let day_of_week = fields[4];

        if minute == "*" {
            if hour == "*" && day_of_month == "*" && month == "*" && day_of_week == "*" {
                return Ok((
                    "MINUTE".to_string(),
                    vec!["/MO".into(), "1".into(), "/ST".into(), "00:00".into()],
                ));
            }
            return Err("invalid_schedule".into());
        }

        if let Some(step) = step_value(minute) {
            if hour == "*" && day_of_month == "*" && month == "*" && day_of_week == "*" {
                return Ok((
                    "MINUTE".to_string(),
                    vec!["/MO".into(), step.to_string(), "/ST".into(), "00:00".into()],
                ));
            }
            return Err("invalid_schedule".into());
        }

        let Some(minute_value) = single_value(minute) else {
            return Err("invalid_schedule".into());
        };

        if hour == "*" {
            if day_of_month == "*" && month == "*" && day_of_week == "*" {
                return Ok((
                    "HOURLY".to_string(),
                    vec![
                        "/MO".into(),
                        "1".into(),
                        "/ST".into(),
                        format!("00:{minute_value:02}"),
                    ],
                ));
            }
            return Err("invalid_schedule".into());
        }

        if let Some(step) = step_value(hour) {
            if day_of_month == "*" && month == "*" && day_of_week == "*" {
                return Ok((
                    "HOURLY".to_string(),
                    vec![
                        "/MO".into(),
                        step.to_string(),
                        "/ST".into(),
                        format!("00:{minute_value:02}"),
                    ],
                ));
            }
            return Err("invalid_schedule".into());
        }

        let Some(hour_value) = single_value(hour) else {
            return Err("invalid_schedule".into());
        };
        let time = format!("{hour_value:02}:{minute_value:02}");

        if day_of_month == "*" && month == "*" && day_of_week == "*" {
            return Ok(("DAILY".to_string(), vec!["/ST".into(), time]));
        }

        if day_of_month == "*" && month == "*" && day_of_week != "*" {
            let days = expand_dow(day_of_week)?;
            return Ok((
                "WEEKLY".to_string(),
                vec!["/D".into(), days, "/ST".into(), time],
            ));
        }

        if day_of_month != "*" && month == "*" && day_of_week == "*" {
            let day = single_value(day_of_month).ok_or_else(|| "invalid_schedule".to_string())?;
            if day == 0 {
                return Err("invalid_schedule".into());
            }
            return Ok((
                "MONTHLY".to_string(),
                vec!["/D".into(), day.to_string(), "/ST".into(), time],
            ));
        }

        if day_of_month != "*" && month != "*" && day_of_week == "*" {
            let day = single_value(day_of_month).ok_or_else(|| "invalid_schedule".to_string())?;
            if day == 0 {
                return Err("invalid_schedule".into());
            }
            let months = expand_months(month)?;
            return Ok((
                "MONTHLY".to_string(),
                vec![
                    "/D".into(),
                    day.to_string(),
                    "/M".into(),
                    months,
                    "/ST".into(),
                    time,
                ],
            ));
        }

        // Jour du mois et jour de la semaine ensemble, ou mois sans jour précis :
        // la sémantique de cron (OU) n'est pas représentable avec une seule tâche.
        Err("invalid_schedule".into())
    }

    fn step_value(field: &str) -> Option<u32> {
        let rest = field.strip_prefix("*/")?;
        rest.parse::<u32>().ok().filter(|value| *value > 0)
    }

    fn single_value(field: &str) -> Option<u32> {
        if field.is_empty() || !field.chars().all(|ch| ch.is_ascii_digit()) {
            return None;
        }
        field.parse::<u32>().ok()
    }

    fn expand_dow(field: &str) -> Result<String, String> {
        let mut days = BTreeSet::new();

        if let Some(step) = step_value(field) {
            let mut day = 0_u32;
            while day <= 6 {
                days.insert(day);
                day += step;
            }
        } else {
            for part in field.split(',') {
                if part.is_empty() {
                    return Err("invalid_schedule".into());
                }
                if let Some((start, end)) = part.split_once('-') {
                    let start = start
                        .parse::<u32>()
                        .map_err(|_| "invalid_schedule".to_string())?;
                    let end = end
                        .parse::<u32>()
                        .map_err(|_| "invalid_schedule".to_string())?;
                    if start > end || end > 7 {
                        return Err("invalid_schedule".into());
                    }
                    for day in start..=end {
                        days.insert(if day == 7 { 0 } else { day });
                    }
                } else {
                    let day = part
                        .parse::<u32>()
                        .map_err(|_| "invalid_schedule".to_string())?;
                    if day > 7 {
                        return Err("invalid_schedule".into());
                    }
                    days.insert(if day == 7 { 0 } else { day });
                }
            }
        }

        if days.is_empty() {
            return Err("invalid_schedule".into());
        }

        let names = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
        Ok(days
            .iter()
            .map(|day| names[*day as usize])
            .collect::<Vec<_>>()
            .join(","))
    }

    fn expand_months(field: &str) -> Result<String, String> {
        let mut months = BTreeSet::new();

        if let Some(step) = step_value(field) {
            let mut month = 1_u32;
            while month <= 12 {
                months.insert(month);
                month += step;
            }
        } else {
            for part in field.split(',') {
                if part.is_empty() {
                    return Err("invalid_schedule".into());
                }
                if let Some((start, end)) = part.split_once('-') {
                    let start = start
                        .parse::<u32>()
                        .map_err(|_| "invalid_schedule".to_string())?;
                    let end = end
                        .parse::<u32>()
                        .map_err(|_| "invalid_schedule".to_string())?;
                    if start == 0 || start > end || end > 12 {
                        return Err("invalid_schedule".into());
                    }
                    for month in start..=end {
                        months.insert(month);
                    }
                } else {
                    let month = part
                        .parse::<u32>()
                        .map_err(|_| "invalid_schedule".to_string())?;
                    if month == 0 || month > 12 {
                        return Err("invalid_schedule".into());
                    }
                    months.insert(month);
                }
            }
        }

        if months.is_empty() {
            return Err("invalid_schedule".into());
        }

        let names = [
            "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
        ];
        Ok(months
            .iter()
            .map(|month| names[*month as usize - 1])
            .collect::<Vec<_>>()
            .join(","))
    }

    // ---------- Ouverture de session (registre Run) ----------

    fn read_run_entries() -> Result<Vec<StartupEntry>, String> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let key = match hkcu.open_subkey_with_flags(RUN_KEY, KEY_READ) {
            Ok(key) => key,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(error) => {
                eprintln!("Impossible de lire {RUN_KEY} : {error}");
                return Err("command_failed".into());
            }
        };

        let approved = hkcu.open_subkey_with_flags(APPROVED_RUN_KEY, KEY_READ).ok();
        let mut entries = Vec::new();

        for item in key.enum_values() {
            let Ok((value_name, _)) = item else {
                continue;
            };
            if value_name.is_empty() {
                continue;
            }
            let Some(command) = read_registry_string(&key, &value_name) else {
                continue;
            };
            if command.trim().is_empty() {
                continue;
            }

            let managed = value_name.starts_with(MANAGED_PREFIX);
            let name = if managed {
                value_name[MANAGED_PREFIX.len()..].to_string()
            } else {
                value_name.clone()
            };
            if name.trim().is_empty() {
                continue;
            }

            let enabled = approved
                .as_ref()
                .map_or(true, |key| approved_enabled(key, &value_name));

            entries.push(StartupEntry {
                id: format!("run:{value_name}"),
                name,
                command,
                trigger: "boot".to_string(),
                schedule: None,
                enabled,
                managed,
                source: RUN_KEY.to_string(),
            });
        }

        Ok(entries)
    }

    fn read_registry_string(key: &RegKey, name: &str) -> Option<String> {
        let value = key.get_raw_value(name).ok()?;
        if value.vtype != REG_SZ && value.vtype != REG_EXPAND_SZ {
            return None;
        }

        let mut units: Vec<u16> = value
            .bytes
            .chunks_exact(2)
            .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
            .collect();
        while units.last() == Some(&0) {
            units.pop();
        }
        Some(String::from_utf16_lossy(&units))
    }

    fn approved_enabled(key: &RegKey, value_name: &str) -> bool {
        match key.get_raw_value(value_name) {
            Ok(value) if !value.bytes.is_empty() => value.bytes[0] & 1 == 0,
            _ => true,
        }
    }

    fn startup_approved_blob(enabled: bool) -> Vec<u8> {
        let mut bytes = vec![
            if enabled { 0x02 } else { 0x03 },
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
        ];

        if !enabled {
            let filetime = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs()
                .saturating_mul(10_000_000)
                .saturating_add(116_444_736_000_000_000);
            bytes[4..].copy_from_slice(&filetime.to_le_bytes());
        }

        bytes
    }

    fn create_run_entry(name: &str, command: &str) -> Result<(), String> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let (key, _) = hkcu.create_subkey(RUN_KEY).map_err(|error| {
            eprintln!("Impossible d'ouvrir {RUN_KEY} : {error}");
            "command_failed".to_string()
        })?;

        let value_name = unique_run_name(&key, name);
        key.set_value(&value_name, &command).map_err(|error| {
            eprintln!("Impossible d'écrire {value_name} : {error}");
            "command_failed".to_string()
        })?;

        if let Err(error) = set_run_enabled_value(&value_name, true) {
            let _ = key.delete_value(&value_name);
            return Err(error);
        }

        Ok(())
    }

    fn unique_run_name(key: &RegKey, base: &str) -> String {
        let mut candidate = format!("{MANAGED_PREFIX}{base}");
        let mut suffix = 2;
        while key.get_raw_value(&candidate).is_ok() {
            candidate = format!("{MANAGED_PREFIX}{base} ({suffix})");
            suffix += 1;
        }
        candidate
    }

    fn set_run_entry_enabled(value_name: &str, enabled: bool) -> Result<(), String> {
        if !value_name.starts_with(MANAGED_PREFIX) {
            return Err("unmanaged_entry".into());
        }

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let key = hkcu
            .open_subkey_with_flags(RUN_KEY, KEY_READ)
            .map_err(|error| {
                eprintln!("Impossible d'ouvrir {RUN_KEY} : {error}");
                "command_failed".to_string()
            })?;
        if key.get_raw_value(value_name).is_err() {
            return Err("invalid_input".into());
        }

        set_run_enabled_value(value_name, enabled)
    }

    fn set_run_enabled_value(value_name: &str, enabled: bool) -> Result<(), String> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let (key, _) = hkcu.create_subkey(APPROVED_RUN_KEY).map_err(|error| {
            eprintln!("Impossible d'ouvrir {APPROVED_RUN_KEY} : {error}");
            "command_failed".to_string()
        })?;
        let value = RegValue {
            bytes: startup_approved_blob(enabled).into(),
            vtype: REG_BINARY,
        };
        key.set_raw_value(value_name, &value).map_err(|error| {
            eprintln!("Impossible d'écrire StartupApproved\\Run\\{value_name} : {error}");
            "command_failed".to_string()
        })
    }

    fn remove_run_entry(value_name: &str) -> Result<(), String> {
        if !value_name.starts_with(MANAGED_PREFIX) {
            return Err("unmanaged_entry".into());
        }

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let key = hkcu
            .open_subkey_with_flags(RUN_KEY, KEY_WRITE)
            .map_err(|error| {
                eprintln!("Impossible d'ouvrir {RUN_KEY} : {error}");
                "command_failed".to_string()
            })?;
        key.delete_value(value_name).map_err(|error| {
            eprintln!("Impossible de supprimer {value_name} : {error}");
            if error.kind() == std::io::ErrorKind::NotFound {
                "invalid_input".to_string()
            } else {
                "command_failed".to_string()
            }
        })?;

        if let Ok(approved) = hkcu.open_subkey_with_flags(APPROVED_RUN_KEY, KEY_WRITE) {
            let _ = approved.delete_value(value_name);
        }

        Ok(())
    }

    // ---------- Dossier Démarrage ----------

    fn startup_folder() -> Option<PathBuf> {
        dirs::config_dir().map(|dir| {
            dir.join("Microsoft")
                .join("Windows")
                .join("Start Menu")
                .join("Programs")
                .join("Startup")
        })
    }

    fn read_startup_folder() -> Vec<StartupEntry> {
        let Some(dir) = startup_folder() else {
            return Vec::new();
        };
        let Ok(read_dir) = fs::read_dir(&dir) else {
            return Vec::new();
        };

        let mut entries = Vec::new();
        for item in read_dir.flatten() {
            let path = item.path();
            let Ok(metadata) = item.metadata() else {
                continue;
            };
            if !metadata.is_file() || metadata.file_attributes() & FILE_ATTRIBUTE_HIDDEN != 0 {
                continue;
            }

            let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            if file_name.eq_ignore_ascii_case("desktop.ini") {
                continue;
            }

            let name = path
                .file_stem()
                .and_then(|name| name.to_str())
                .unwrap_or(file_name)
                .to_string();

            entries.push(StartupEntry {
                id: format!("folder:{file_name}"),
                name,
                command: path.display().to_string(),
                trigger: "boot".to_string(),
                schedule: None,
                enabled: true,
                // Le dossier Démarrage n'est pas géré par Plume : lecture seule.
                managed: false,
                source: path.display().to_string(),
            });
        }

        entries
    }

    // ---------- Tâches planifiées (schtasks) ----------

    fn read_tasks() -> Result<Vec<StartupEntry>, String> {
        let output = Command::new("cmd.exe")
            .args(["/D", "/C", "chcp 65001 >nul & schtasks.exe /Query /XML"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|error| {
                eprintln!("Impossible d'exécuter schtasks.exe : {error}");
                "command_failed".to_string()
            })?;

        if !output.status.success() {
            eprintln!(
                "schtasks /Query /XML a échoué : {}",
                command_error(&output.stdout, &output.stderr)
            );
            return Err("command_failed".into());
        }

        Ok(parse_tasks(&decode_output(&output.stdout)))
    }

    fn create_task(name: &str, command: &str, schedule: &str) -> Result<(), String> {
        let (schedule_type, extra) = schedule_args(schedule)?;
        let task_name = unique_task_name(name);

        let mut args: Vec<String> = vec![
            "/Create".to_string(),
            "/TN".to_string(),
            task_path(&task_name),
            "/TR".to_string(),
            command.to_string(),
            "/SC".to_string(),
            schedule_type,
            "/RL".to_string(),
            "LIMITED".to_string(),
        ];
        args.extend(extra);

        run_schtasks(&args)
    }

    fn unique_task_name(base: &str) -> String {
        let mut candidate = base.to_string();
        let mut suffix = 2;
        while task_exists(&candidate) {
            candidate = format!("{base} ({suffix})");
            suffix += 1;
        }
        candidate
    }

    fn task_path(relative: &str) -> String {
        format!("\\{TASK_FOLDER}\\{relative}")
    }

    fn task_exists(relative: &str) -> bool {
        task_exists_path(&task_path(relative))
    }

    fn task_exists_path(path: &str) -> bool {
        Command::new("schtasks.exe")
            .args(["/Query", "/TN", path])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false)
    }

    fn set_task_enabled(relative: &str, enabled: bool) -> Result<(), String> {
        validate_task_relative(relative)?;
        let path = task_path(relative);
        if !task_exists_path(&path) {
            return Err("invalid_input".into());
        }

        let flag = if enabled { "/ENABLE" } else { "/DISABLE" };
        run_schtasks(&[
            "/Change".to_string(),
            "/TN".to_string(),
            path,
            flag.to_string(),
        ])
    }

    fn remove_task(relative: &str) -> Result<(), String> {
        validate_task_relative(relative)?;
        let path = task_path(relative);
        if !task_exists_path(&path) {
            return Err("invalid_input".into());
        }

        run_schtasks(&[
            "/Delete".to_string(),
            "/TN".to_string(),
            path,
            "/F".to_string(),
        ])
    }

    fn validate_task_relative(relative: &str) -> Result<(), String> {
        if relative.is_empty()
            || relative.starts_with('\\')
            || relative.ends_with('\\')
            || relative.contains('/')
            || relative.chars().any(|ch| ch.is_control())
            || relative
                .split('\\')
                .any(|part| part.is_empty() || part == "." || part == "..")
        {
            return Err("invalid_input".into());
        }
        Ok(())
    }

    fn run_schtasks(args: &[String]) -> Result<(), String> {
        let output = Command::new("schtasks.exe")
            .args(args)
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|error| {
                eprintln!("Impossible d'exécuter schtasks.exe : {error}");
                "command_failed".to_string()
            })?;

        if output.status.success() {
            return Ok(());
        }

        eprintln!(
            "schtasks a échoué : {}",
            command_error(&output.stdout, &output.stderr)
        );
        Err("command_failed".into())
    }

    fn command_error(stdout: &[u8], stderr: &[u8]) -> String {
        let stderr = decode_output(stderr);
        if !stderr.trim().is_empty() {
            return stderr;
        }
        decode_output(stdout)
    }

    /// schtasks peut écrire en UTF-16 ou dans la page de code de la console
    /// selon la version de Windows ; on gère les deux cas.
    fn decode_output(bytes: &[u8]) -> String {
        if bytes.starts_with(&[0xFF, 0xFE]) {
            return decode_utf16(&bytes[2..], true);
        }
        if bytes.starts_with(&[0xFE, 0xFF]) {
            return decode_utf16(&bytes[2..], false);
        }

        let nul_odd = bytes
            .iter()
            .skip(1)
            .step_by(2)
            .filter(|byte| **byte == 0)
            .count();
        if bytes.len() >= 4 && nul_odd > bytes.len() / 8 {
            return decode_utf16(bytes, true);
        }

        String::from_utf8_lossy(bytes)
            .trim_start_matches('\u{feff}')
            .to_string()
    }

    fn decode_utf16(bytes: &[u8], little_endian: bool) -> String {
        let units: Vec<u16> = bytes
            .chunks_exact(2)
            .map(|pair| {
                if little_endian {
                    u16::from_le_bytes([pair[0], pair[1]])
                } else {
                    u16::from_be_bytes([pair[0], pair[1]])
                }
            })
            .collect();
        String::from_utf16_lossy(&units)
    }

    fn parse_tasks(xml: &str) -> Vec<StartupEntry> {
        let mut entries = Vec::new();
        let mut offset = 0;

        while let Some(relative) = xml[offset..].find("<Task") {
            let start = offset + relative;
            let Some(open_end) = xml[start..].find('>') else {
                break;
            };
            let body_start = start + open_end + 1;
            let Some(close_offset) = xml[body_start..].find("</Task>") else {
                break;
            };
            let end = body_start + close_offset;
            let block = &xml[start..end + "</Task>".len()];

            if let Some(entry) = parse_task(block) {
                entries.push(entry);
            }

            offset = end + "</Task>".len();
        }

        entries
    }

    fn parse_task(block: &str) -> Option<StartupEntry> {
        let uri = xml_unescape(xml_tag(block, "URI")?.trim());
        if !uri.to_ascii_lowercase().starts_with("\\plume\\") {
            return None;
        }

        let relative = uri.get("\\Plume\\".len()..)?.trim_start_matches('\\');
        if relative.is_empty() {
            return None;
        }

        let name = relative.rsplit('\\').next().unwrap_or(relative).to_string();

        Some(StartupEntry {
            id: format!("task:{relative}"),
            name,
            command: task_command(block),
            trigger: "schedule".to_string(),
            schedule: task_schedule(block),
            enabled: task_enabled(block),
            managed: true,
            source: uri,
        })
    }

    fn task_command(block: &str) -> String {
        let Some(actions) = xml_tag(block, "Actions") else {
            return String::new();
        };
        let Some(exec) = xml_tag(actions, "Exec") else {
            return String::new();
        };

        let command = xml_unescape(xml_tag(exec, "Command").unwrap_or("").trim());
        if command.is_empty() {
            return String::new();
        }
        let arguments = xml_unescape(xml_tag(exec, "Arguments").unwrap_or("").trim());

        let command = if command.contains(' ') && !command.starts_with('"') {
            format!("\"{command}\"")
        } else {
            command
        };

        if arguments.is_empty() {
            command
        } else {
            format!("{command} {arguments}")
        }
    }

    fn task_enabled(block: &str) -> bool {
        xml_tag(block, "Settings")
            .and_then(|settings| xml_tag(settings, "Enabled"))
            .map(|value| !value.trim().eq_ignore_ascii_case("false"))
            .unwrap_or(true)
    }

    fn task_schedule(block: &str) -> Option<String> {
        let (hour, minute) = parse_start_boundary(block)?;

        if let Some(calendar) = xml_tag(block, "CalendarTrigger") {
            if let Some(day) = xml_tag(calendar, "ScheduleByDay") {
                let interval = xml_tag(day, "DaysInterval")
                    .and_then(|value| value.trim().parse::<u32>().ok())
                    .unwrap_or(1);
                return Some(if interval <= 1 {
                    format!("{minute} {hour} * * *")
                } else {
                    format!("{minute} {hour} */{interval} * *")
                });
            }

            if let Some(week) = xml_tag(calendar, "ScheduleByWeek") {
                let days = xml_tag(week, "DaysOfWeek")?;
                let dow = cron_dow(days)?;
                return Some(format!("{minute} {hour} * * {dow}"));
            }

            if let Some(month) = xml_tag(calendar, "ScheduleByMonth") {
                let days = xml_tag(month, "DaysOfMonth")?;
                let day = xml_tag(days, "Day")?.trim();
                if day.is_empty() {
                    return None;
                }
                let months = xml_tag(month, "Months")
                    .map(cron_months)
                    .unwrap_or_else(|| "*".to_string());
                return Some(format!("{minute} {hour} {day} {months} *"));
            }

            return None;
        }

        if let Some(trigger) = xml_tag(block, "TimeTrigger") {
            let interval = xml_tag(trigger, "Repetition")
                .and_then(|repetition| xml_tag(repetition, "Interval"))
                .map(str::trim)?;
            let (hours, minutes) = parse_iso_duration(interval)?;

            if hours > 0 && minutes == 0 {
                return Some(if hours == 1 {
                    format!("{minute} * * * *")
                } else {
                    format!("{minute} */{hours} * * *")
                });
            }
            if hours == 0 && minutes > 0 {
                return Some(if minutes == 1 {
                    "* * * * *".to_string()
                } else {
                    format!("*/{minutes} * * * *")
                });
            }
        }

        None
    }

    fn parse_start_boundary(block: &str) -> Option<(u32, u32)> {
        let value = xml_tag(block, "StartBoundary")?.trim();
        let time = value.split_once('T')?.1;
        let mut parts = time.split(':');
        let hour = parts.next()?.parse::<u32>().ok()?;
        let minute = parts.next()?.parse::<u32>().ok()?;
        Some((hour, minute))
    }

    fn cron_dow(xml: &str) -> Option<String> {
        let names = [
            ("Sunday", 0_u32),
            ("Monday", 1),
            ("Tuesday", 2),
            ("Wednesday", 3),
            ("Thursday", 4),
            ("Friday", 5),
            ("Saturday", 6),
        ];

        let mut days = Vec::new();
        for (name, value) in names {
            if xml.contains(&format!("<{name}")) {
                days.push(value);
            }
        }
        if days.is_empty() {
            return None;
        }
        Some(format_dow_set(&days))
    }

    fn format_dow_set(days: &[u32]) -> String {
        if days.len() == 7 {
            return "*".to_string();
        }
        if days == &[1_u32, 2, 3, 4, 5][..] {
            return "1-5".to_string();
        }
        days.iter()
            .map(|day| day.to_string())
            .collect::<Vec<_>>()
            .join(",")
    }

    fn cron_months(xml: &str) -> String {
        let names = [
            ("January", 1_u32),
            ("February", 2),
            ("March", 3),
            ("April", 4),
            ("May", 5),
            ("June", 6),
            ("July", 7),
            ("August", 8),
            ("September", 9),
            ("October", 10),
            ("November", 11),
            ("December", 12),
        ];

        let mut months = Vec::new();
        for (name, value) in names {
            if xml.contains(&format!("<{name}")) {
                months.push(value);
            }
        }

        if months.is_empty() || months.len() == 12 {
            return "*".to_string();
        }
        months
            .iter()
            .map(|month| month.to_string())
            .collect::<Vec<_>>()
            .join(",")
    }

    fn parse_iso_duration(value: &str) -> Option<(u32, u32)> {
        let rest = value.strip_prefix("PT")?;
        let mut hours = 0_u32;
        let mut minutes = 0_u32;
        let mut number = String::new();

        for ch in rest.chars() {
            if ch.is_ascii_digit() {
                number.push(ch);
            } else {
                let parsed = number.parse::<u32>().ok()?;
                match ch {
                    'H' => hours = parsed,
                    'M' => minutes = parsed,
                    _ => return None,
                }
                number.clear();
            }
        }

        if !number.is_empty() {
            return None;
        }
        Some((hours, minutes))
    }

    fn xml_tag<'a>(block: &'a str, tag: &str) -> Option<&'a str> {
        let open = format!("<{tag}>");
        let close = format!("</{tag}>");
        let start = block.find(&open)? + open.len();
        let end = block[start..].find(&close)? + start;
        Some(&block[start..end])
    }

    fn xml_unescape(value: &str) -> String {
        value
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&apos;", "'")
            .replace("&amp;", "&")
    }
}
