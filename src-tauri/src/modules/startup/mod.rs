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

    #[cfg(not(target_os = "linux"))]
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

    #[cfg(not(target_os = "linux"))]
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

    #[cfg(not(target_os = "linux"))]
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

    #[cfg(not(target_os = "linux"))]
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
