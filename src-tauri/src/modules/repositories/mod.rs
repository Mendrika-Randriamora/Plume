use serde::Serialize;
use std::{
    collections::HashMap,
    fs,
    path::{Component, Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use crate::{
    modules::updates::{detect, exec_root, Manager},
    shared::blocking,
};

const APT_DIR: &str = "/etc/apt/sources.list.d";
const APT_MAIN: &str = "/etc/apt/sources.list";
const DNF_DIR: &str = "/etc/yum.repos.d";
const PACMAN_CONF: &str = "/etc/pacman.conf";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Repository {
    id: String,
    name: String,
    url: String,
    enabled: bool,
    managed: bool,
    source: String,
    details: String,
    suite: String,
    components: String,
    gpg_key: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryInfo {
    manager: Manager,
    distro: String,
    codename: Option<String>,
    repositories: Vec<Repository>,
}

// ---------------------------------------------------------------------------
// Utilitaires communs
// ---------------------------------------------------------------------------

fn clean(value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.contains('\n') || value.contains('\r') {
        return Err("invalid_input".into());
    }
    Ok(value.to_string())
}

fn slugify(input: &str) -> String {
    let mut out = String::new();
    for c in input.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
        } else if !out.ends_with('-') {
            out.push('-');
        }
    }
    let out = out.trim_matches('-').to_string();
    if out.is_empty() {
        "repo".into()
    } else {
        out
    }
}

fn is_managed(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .is_some_and(|n| n.starts_with("plume-"))
}

/// Vérifie qu'un chemin reste bien dans le dossier de configuration attendu.
fn is_safe_path(path: &Path, dir: &str) -> bool {
    path.starts_with(dir) && !path.components().any(|c| matches!(c, Component::ParentDir))
}

fn os_release_field(key: &str) -> Option<String> {
    let text = fs::read_to_string("/etc/os-release").ok()?;
    text.lines().find_map(|line| {
        let (k, v) = line.split_once('=')?;
        (k.trim() == key).then(|| v.trim().trim_matches('"').to_string())
    })
}

fn root_write(path: &Path, content: &str) -> Result<(), String> {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let tmp = std::env::temp_dir().join(format!("plume-repo-{}-{stamp}.tmp", std::process::id()));
    fs::write(&tmp, content).map_err(|e| {
        eprintln!("Impossible d'écrire le fichier temporaire : {e}");
        "write_failed".to_string()
    })?;

    let tmp_str = tmp.to_string_lossy().into_owned();
    let path_str = path.to_string_lossy().into_owned();
    let out = exec_root(&["install", "-m", "644", &tmp_str, &path_str]);
    let _ = fs::remove_file(&tmp);
    let out = out?;
    if !out.success {
        out.log_failure();
        return Err("command_failed".into());
    }
    Ok(())
}

fn root_remove(path: &Path) -> Result<(), String> {
    let path_str = path.to_string_lossy().into_owned();
    let out = exec_root(&["rm", "-f", "--", &path_str])?;
    if !out.success {
        out.log_failure();
        return Err("command_failed".into());
    }
    Ok(())
}

struct RepoId {
    manager: String,
    kind: String,
    path: PathBuf,
    key: String,
}

fn parse_id(id: &str) -> Result<RepoId, String> {
    let mut parts = id.splitn(4, '|');
    let manager = parts.next().ok_or("invalid_id")?.to_string();
    let kind = parts.next().ok_or("invalid_id")?.to_string();
    let path = PathBuf::from(parts.next().ok_or("invalid_id")?);
    let key = parts.next().ok_or("invalid_id")?.to_string();
    Ok(RepoId {
        manager,
        kind,
        path,
        key,
    })
}

// ---------------------------------------------------------------------------
// APT
// ---------------------------------------------------------------------------

fn apt_files() -> Vec<PathBuf> {
    let mut files = Vec::new();
    let main = PathBuf::from(APT_MAIN);
    if main.is_file() {
        files.push(main);
    }
    if let Ok(entries) = fs::read_dir(APT_DIR) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path
                .extension()
                .and_then(|e| e.to_str())
                .is_some_and(|e| e == "list" || e == "sources")
            {
                files.push(path);
            }
        }
    }
    files.sort();
    files
}

fn parse_apt_deb(body: &str) -> Option<(String, String, Vec<String>)> {
    let mut parts = body.split_whitespace();
    let kind = parts.next()?;
    if kind != "deb" && kind != "deb-src" {
        return None;
    }

    let mut rest = body[kind.len()..].trim_start();
    if rest.starts_with('[') {
        let end = rest.find(']')?;
        rest = rest[end + 1..].trim_start();
    }

    let mut fields = rest.split_whitespace();
    let url = fields.next()?.to_string();
    let suite = fields.next().unwrap_or("").to_string();
    let components = fields.map(String::from).collect();
    Some((url, suite, components))
}

fn apt_repos_from_list(path: &Path, content: &str) -> Vec<Repository> {
    let managed = is_managed(path);
    let source = path.display().to_string();
    content
        .lines()
        .enumerate()
        .filter_map(|(index, line)| {
            let trimmed = line.trim();
            let (enabled, body) = match trimmed.strip_prefix('#') {
                Some(rest) => (false, rest.trim()),
                None => (true, trimmed),
            };
            let (url, suite, components) = parse_apt_deb(body)?;
            Some(Repository {
                id: format!("apt|list|{}|{}", path.display(), index),
                name: if suite.is_empty() {
                    url.clone()
                } else {
                    suite.clone()
                },
                url,
                enabled,
                managed,
                source: source.clone(),
                details: components.join(" "),
                suite,
                components: components.join(" "),
                gpg_key: String::new(),
            })
        })
        .collect()
}

fn apt_repos_from_sources(path: &Path, content: &str) -> Vec<Repository> {
    let managed = is_managed(path);
    let source = path.display().to_string();
    let mut repos = Vec::new();

    for (index, stanza) in content.split("\n\n").enumerate() {
        let mut uris = Vec::new();
        let mut suites = Vec::new();
        let mut components = Vec::new();
        let mut types = String::new();
        let mut enabled = true;

        for line in stanza.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            let Some((key, value)) = line.split_once(':') else {
                continue;
            };
            match key.trim().to_ascii_lowercase().as_str() {
                "types" => types = value.trim().to_string(),
                "uris" => uris.extend(value.split_whitespace().map(String::from)),
                "suites" => suites.extend(value.split_whitespace().map(String::from)),
                "components" => components.extend(value.split_whitespace().map(String::from)),
                "enabled" => enabled = !value.trim().eq_ignore_ascii_case("no"),
                _ => {}
            }
        }

        if uris.is_empty()
            || (!types.is_empty()
                && !types
                    .split_whitespace()
                    .any(|t| t == "deb" || t == "deb-src"))
        {
            continue;
        }

        let url = uris.join(" ");
        let suite = suites.join(" ");
        let components = components.join(" ");
        repos.push(Repository {
            id: format!("apt|sources|{}|{}", path.display(), index),
            name: if suite.is_empty() {
                url.clone()
            } else {
                suite.clone()
            },
            url,
            enabled,
            managed,
            source: source.clone(),
            details: components.clone(),
            suite,
            components,
            gpg_key: String::new(),
        });
    }

    repos
}

fn apt_list() -> Vec<Repository> {
    let mut repos = Vec::new();
    for path in apt_files() {
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        if path.extension().and_then(|e| e.to_str()) == Some("sources") {
            repos.extend(apt_repos_from_sources(&path, &content));
        } else {
            repos.extend(apt_repos_from_list(&path, &content));
        }
    }
    repos
}

fn apt_toggle(id: &RepoId, enabled: bool) -> Result<(), String> {
    if !is_safe_path(&id.path, APT_DIR) && id.path != Path::new(APT_MAIN) {
        return Err("invalid_path".into());
    }
    let content = fs::read_to_string(&id.path).map_err(|_| "read_failed".to_string())?;

    let next = if id.kind == "list" {
        let mut lines: Vec<String> = content.lines().map(String::from).collect();
        let index: usize = id.key.parse().map_err(|_| "invalid_id".to_string())?;
        let line = lines.get_mut(index).ok_or("repo_not_found")?;
        let trimmed = line.trim_start();
        let indent = &line[..line.len() - trimmed.len()];
        let next = if enabled {
            trimmed
                .strip_prefix('#')
                .map(|rest| format!("{indent}{}", rest.trim_start()))
        } else if !trimmed.starts_with('#') {
            Some(format!("{indent}# {trimmed}"))
        } else {
            None
        };
        if let Some(next) = next {
            *line = next;
        }
        lines.join("\n") + "\n"
    } else {
        let mut stanzas: Vec<String> = content.split("\n\n").map(String::from).collect();
        let index: usize = id.key.parse().map_err(|_| "invalid_id".to_string())?;
        let stanza = stanzas.get_mut(index).ok_or("repo_not_found")?;
        let mut lines: Vec<String> = stanza.lines().map(String::from).collect();
        let mut found = false;
        for line in &mut lines {
            if line
                .trim_start()
                .to_ascii_lowercase()
                .starts_with("enabled:")
            {
                *line = format!("Enabled: {}", if enabled { "yes" } else { "no" });
                found = true;
                break;
            }
        }
        if !found {
            lines.push(format!("Enabled: {}", if enabled { "yes" } else { "no" }));
        }
        *stanza = lines.join("\n");
        stanzas.join("\n\n") + "\n"
    };

    root_write(&id.path, &next)
}

fn apt_remove(id: &RepoId) -> Result<(), String> {
    if !is_safe_path(&id.path, APT_DIR) && id.path != Path::new(APT_MAIN) {
        return Err("invalid_path".into());
    }
    let managed = is_managed(&id.path);
    let content = fs::read_to_string(&id.path).map_err(|_| "read_failed".to_string())?;

    if id.kind == "list" {
        let index: usize = id.key.parse().map_err(|_| "invalid_id".to_string())?;
        let lines: Vec<&str> = content.lines().collect();
        let Some(line) = lines.get(index) else {
            return Err("repo_not_found".into());
        };
        let trimmed = line.trim();
        let body = trimmed.strip_prefix('#').map(str::trim).unwrap_or(trimmed);
        if parse_apt_deb(body).is_none() {
            return Err("repo_not_found".into());
        }
        let next: Vec<&str> = lines
            .into_iter()
            .enumerate()
            .filter(|(i, _)| *i != index)
            .map(|(_, l)| l)
            .collect();
        let remaining = next.iter().any(|l| {
            let t = l.trim();
            let body = t.strip_prefix('#').map(str::trim).unwrap_or(t);
            parse_apt_deb(body).is_some()
        });
        // Les fichiers gérés par Plume peuvent être supprimés ; les fichiers
        // système sont uniquement modifiés pour retirer l'entrée ciblée.
        if managed && !remaining {
            root_remove(&id.path)
        } else {
            root_write(&id.path, &(next.join("\n") + "\n"))
        }
    } else {
        let index: usize = id.key.parse().map_err(|_| "invalid_id".to_string())?;
        let stanzas: Vec<&str> = content.split("\n\n").collect();
        if index >= stanzas.len() {
            return Err("repo_not_found".into());
        }
        let next: Vec<&str> = stanzas
            .into_iter()
            .enumerate()
            .filter(|(i, _)| *i != index)
            .map(|(_, s)| s)
            .collect();
        let remaining = next.iter().any(|s| s.contains("URIs:"));
        if managed && !remaining {
            root_remove(&id.path)
        } else {
            root_write(&id.path, &(next.join("\n\n") + "\n"))
        }
    }
}

fn apt_update(id: &RepoId, url: &str, suite: &str, components: &str) -> Result<(), String> {
    if !is_safe_path(&id.path, APT_DIR) && id.path != Path::new(APT_MAIN) {
        return Err("invalid_path".into());
    }
    let content = fs::read_to_string(&id.path).map_err(|_| "read_failed".to_string())?;

    let next = if id.kind == "list" {
        let mut lines: Vec<String> = content.lines().map(String::from).collect();
        let index: usize = id.key.parse().map_err(|_| "invalid_id".to_string())?;
        let line = lines.get_mut(index).ok_or("repo_not_found")?;
        let trimmed = line.trim_start();
        let indent = &line[..line.len() - trimmed.len()];
        let (commented, body) = match trimmed.strip_prefix('#') {
            Some(rest) => (true, rest.trim_start()),
            None => (false, trimmed),
        };
        let kind = body.split_whitespace().next().ok_or("repo_not_found")?;
        if kind != "deb" && kind != "deb-src" {
            return Err("repo_not_found".into());
        }
        // On conserve les options éventuelles (`[arch=...]`, `signed-by=...`).
        let rest = body[kind.len()..].trim_start();
        let options = if rest.starts_with('[') {
            let end = rest.find(']').ok_or("repo_not_found")?;
            &rest[..=end]
        } else {
            ""
        };
        let mut next_body = format!("{kind} ");
        if !options.is_empty() {
            next_body.push_str(options);
            next_body.push(' ');
        }
        next_body.push_str(url);
        next_body.push(' ');
        next_body.push_str(suite);
        next_body.push(' ');
        next_body.push_str(components);
        *line = format!("{indent}{}{next_body}", if commented { "# " } else { "" });
        lines.join("\n") + "\n"
    } else {
        let mut stanzas: Vec<String> = content.split("\n\n").map(String::from).collect();
        let index: usize = id.key.parse().map_err(|_| "invalid_id".to_string())?;
        let stanza = stanzas.get_mut(index).ok_or("repo_not_found")?;
        let mut lines: Vec<String> = stanza.lines().map(String::from).collect();
        let mut seen_uris = false;
        let mut seen_suites = false;
        let mut seen_components = false;

        for line in &mut lines {
            let Some((key, _)) = line.split_once(':') else {
                continue;
            };
            match key.trim().to_ascii_lowercase().as_str() {
                "uris" => {
                    *line = format!("URIs: {url}");
                    seen_uris = true;
                }
                "suites" => {
                    *line = format!("Suites: {suite}");
                    seen_suites = true;
                }
                "components" => {
                    *line = format!("Components: {components}");
                    seen_components = true;
                }
                _ => {}
            }
        }

        if !seen_uris {
            lines.insert(0, format!("URIs: {url}"));
        }
        if !seen_suites {
            lines.push(format!("Suites: {suite}"));
        }
        if !seen_components && !components.is_empty() {
            lines.push(format!("Components: {components}"));
        }

        *stanza = lines.join("\n");
        stanzas.join("\n\n") + "\n"
    };

    root_write(&id.path, &next)
}

// ---------------------------------------------------------------------------
// DNF
// ---------------------------------------------------------------------------

fn dnf_files() -> Vec<PathBuf> {
    let mut files = Vec::new();
    if let Ok(entries) = fs::read_dir(DNF_DIR) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("repo") {
                files.push(path);
            }
        }
    }
    files.sort();
    files
}

fn push_dnf_repo(
    path: &Path,
    managed: bool,
    id: &str,
    values: &HashMap<String, String>,
    repos: &mut Vec<Repository>,
) {
    let name = values
        .get("name")
        .cloned()
        .unwrap_or_else(|| id.to_string());
    let url = values
        .get("baseurl")
        .or_else(|| values.get("metalink"))
        .or_else(|| values.get("mirrorlist"))
        .cloned()
        .unwrap_or_default();
    let enabled = values
        .get("enabled")
        .is_none_or(|v| v.trim() != "0" && !v.trim().eq_ignore_ascii_case("false"));

    repos.push(Repository {
        id: format!("dnf|repo|{}|{}", path.display(), id),
        name,
        url,
        enabled,
        managed,
        source: path.display().to_string(),
        details: id.to_string(),
        suite: String::new(),
        components: String::new(),
        gpg_key: values.get("gpgkey").cloned().unwrap_or_default(),
    });
}

fn dnf_repos_from_file(path: &Path, content: &str) -> Vec<Repository> {
    let managed = is_managed(path);
    let mut repos = Vec::new();
    let mut current: Option<String> = None;
    let mut values: HashMap<String, String> = HashMap::new();

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') || line.starts_with(';') {
            continue;
        }
        if line.starts_with('[') && line.ends_with(']') {
            if let Some(previous) = current.take() {
                push_dnf_repo(path, managed, &previous, &values, &mut repos);
            }
            current = Some(line[1..line.len() - 1].to_string());
            values.clear();
        } else if current.is_some() {
            if let Some((key, value)) = line.split_once('=') {
                values.insert(key.trim().to_ascii_lowercase(), value.trim().to_string());
            }
        }
    }
    if let Some(previous) = current {
        push_dnf_repo(path, managed, &previous, &values, &mut repos);
    }
    repos
}

fn dnf_list() -> Vec<Repository> {
    let mut repos = Vec::new();
    for path in dnf_files() {
        if let Ok(content) = fs::read_to_string(&path) {
            repos.extend(dnf_repos_from_file(&path, &content));
        }
    }
    repos
}

fn dnf_toggle(id: &RepoId, enabled: bool) -> Result<(), String> {
    if !is_safe_path(&id.path, DNF_DIR) {
        return Err("invalid_path".into());
    }
    let content = fs::read_to_string(&id.path).map_err(|_| "read_failed".to_string())?;
    let mut lines: Vec<String> = content.lines().map(String::from).collect();
    let mut in_section = false;
    let mut found = false;
    let mut header = None;

    for (index, line) in lines.iter_mut().enumerate() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_section = trimmed[1..trimmed.len() - 1] == id.key;
            if in_section {
                header = Some(index);
            }
            continue;
        }
        if in_section
            && trimmed.to_ascii_lowercase().starts_with("enabled")
            && trimmed.contains('=')
        {
            *line = format!("enabled={}", if enabled { 1 } else { 0 });
            found = true;
            break;
        }
    }

    if !found {
        let index = header.ok_or("repo_not_found")? + 1;
        lines.insert(index, format!("enabled={}", if enabled { 1 } else { 0 }));
    }

    root_write(&id.path, &(lines.join("\n") + "\n"))
}

fn dnf_remove(id: &RepoId) -> Result<(), String> {
    if !is_safe_path(&id.path, DNF_DIR) {
        return Err("invalid_path".into());
    }
    let managed = is_managed(&id.path);
    let content = fs::read_to_string(&id.path).map_err(|_| "read_failed".to_string())?;
    let mut output = Vec::new();
    let mut skipping = false;
    let mut found = false;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            skipping = trimmed[1..trimmed.len() - 1] == id.key;
            found |= skipping;
        }
        if !skipping {
            output.push(line);
        }
    }

    if !found {
        return Err("repo_not_found".into());
    }

    let remaining = output.iter().any(|l| l.trim().starts_with('['));
    // Les fichiers gérés par Plume peuvent être supprimés ; les fichiers
    // système sont uniquement modifiés pour retirer la section ciblée.
    if managed && !remaining {
        root_remove(&id.path)
    } else {
        root_write(&id.path, &(output.join("\n") + "\n"))
    }
}

fn dnf_update(id: &RepoId, name: &str, url: &str, gpg_key: &str) -> Result<(), String> {
    if !is_safe_path(&id.path, DNF_DIR) {
        return Err("invalid_path".into());
    }
    let content = fs::read_to_string(&id.path).map_err(|_| "read_failed".to_string())?;
    let lines: Vec<String> = content.lines().map(String::from).collect();

    let mut start = None;
    let mut end = lines.len();
    for (index, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            if start.is_some() {
                end = index;
                break;
            }
            if trimmed[1..trimmed.len() - 1] == id.key {
                start = Some(index);
            }
        }
    }
    let start = start.ok_or("repo_not_found")?;

    let mut body: Vec<String> = lines[start + 1..end].to_vec();
    let mut has_name = false;
    let mut has_url = false;
    let mut has_gpgcheck = false;
    let mut has_gpgkey = false;

    for line in &mut body {
        let trimmed = line.trim();
        if trimmed.starts_with('#') || trimmed.starts_with(';') {
            continue;
        }
        let Some((key, _)) = trimmed.split_once('=') else {
            continue;
        };
        match key.trim().to_ascii_lowercase().as_str() {
            "name" => {
                *line = format!("name={name}");
                has_name = true;
            }
            "baseurl" | "metalink" | "mirrorlist" => {
                if has_url {
                    *line = format!("# {trimmed}");
                } else {
                    *line = format!("baseurl={url}");
                    has_url = true;
                }
            }
            "gpgcheck" => {
                *line = format!("gpgcheck={}", if gpg_key.is_empty() { 0 } else { 1 });
                has_gpgcheck = true;
            }
            "gpgkey" => {
                if gpg_key.is_empty() {
                    *line = String::new();
                } else {
                    *line = format!("gpgkey={gpg_key}");
                    has_gpgkey = true;
                }
            }
            _ => {}
        }
    }

    body.retain(|line| !line.is_empty());
    if !has_name {
        body.insert(0, format!("name={name}"));
    }
    if !has_url {
        body.push(format!("baseurl={url}"));
    }
    if gpg_key.is_empty() {
        if !has_gpgcheck {
            body.push("gpgcheck=0".into());
        }
    } else {
        if !has_gpgcheck {
            body.push("gpgcheck=1".into());
        }
        if !has_gpgkey {
            body.push(format!("gpgkey={gpg_key}"));
        }
    }

    let mut next: Vec<String> = lines[..start].to_vec();
    next.push(lines[start].clone());
    next.extend(body);
    next.extend(lines[end..].iter().cloned());

    root_write(&id.path, &(next.join("\n") + "\n"))
}

// ---------------------------------------------------------------------------
// Pacman
// ---------------------------------------------------------------------------

fn pacman_list() -> Vec<Repository> {
    let Ok(content) = fs::read_to_string(PACMAN_CONF) else {
        return Vec::new();
    };
    let path = Path::new(PACMAN_CONF);
    let mut repos = Vec::new();
    let mut current: Option<(String, Vec<String>)> = None;

    for line in content.lines() {
        let line = line.trim();
        if line.starts_with('[') && line.ends_with(']') {
            if let Some((name, servers)) = current.take() {
                if name != "options" {
                    repos.push(pacman_repo(&name, servers));
                }
            }
            current = Some((line[1..line.len() - 1].to_string(), Vec::new()));
        } else if let Some((_, servers)) = current.as_mut() {
            if let Some((key, value)) = line.split_once('=') {
                let key = key.trim().to_ascii_lowercase();
                if key == "server" || key == "include" {
                    servers.push(value.trim().to_string());
                }
            }
        }
    }
    if let Some((name, servers)) = current {
        if name != "options" {
            repos.push(pacman_repo(&name, servers));
        }
    }

    repos
        .into_iter()
        .map(|mut repo| {
            repo.source = path.display().to_string();
            repo
        })
        .collect()
}

fn pacman_repo(name: &str, servers: Vec<String>) -> Repository {
    Repository {
        id: format!("pacman|section|{}|{}", PACMAN_CONF, name),
        name: name.to_string(),
        url: servers.join(" "),
        enabled: true,
        managed: name.starts_with("plume-"),
        source: PACMAN_CONF.to_string(),
        details: name.to_string(),
        suite: String::new(),
        components: String::new(),
        gpg_key: String::new(),
    }
}

fn pacman_remove(id: &RepoId) -> Result<(), String> {
    if id.path != Path::new(PACMAN_CONF) || id.kind != "section" || id.key == "options" {
        return Err("invalid_id".into());
    }
    let content = fs::read_to_string(PACMAN_CONF).map_err(|_| "read_failed".to_string())?;
    let mut output = Vec::new();
    let mut skipping = false;
    let mut found = false;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            skipping = trimmed[1..trimmed.len() - 1] == id.key;
            found |= skipping;
        }
        if !skipping {
            output.push(line);
        }
    }

    if !found {
        return Err("repo_not_found".into());
    }

    root_write(Path::new(PACMAN_CONF), &(output.join("\n") + "\n"))
}

fn pacman_update(id: &RepoId, url: &str) -> Result<(), String> {
    if id.path != Path::new(PACMAN_CONF) || id.kind != "section" || id.key == "options" {
        return Err("invalid_id".into());
    }
    let content = fs::read_to_string(PACMAN_CONF).map_err(|_| "read_failed".to_string())?;
    let mut lines: Vec<String> = content.lines().map(String::from).collect();
    let mut in_section = false;
    let mut found = false;
    let mut written = false;

    for line in &mut lines {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_section = trimmed[1..trimmed.len() - 1] == id.key;
            found |= in_section;
            continue;
        }
        if in_section {
            if let Some((key, _)) = trimmed.split_once('=') {
                if key.trim().eq_ignore_ascii_case("server") && !written {
                    *line = format!("Server = {url}");
                    written = true;
                }
            }
        }
    }

    if !found {
        return Err("repo_not_found".into());
    }

    if !written {
        let index = lines
            .iter()
            .position(|line| {
                let trimmed = line.trim();
                trimmed.starts_with('[')
                    && trimmed.ends_with(']')
                    && trimmed[1..trimmed.len() - 1] == id.key
            })
            .ok_or("repo_not_found")?;
        lines.insert(index + 1, format!("Server = {url}"));
    }

    root_write(Path::new(PACMAN_CONF), &(lines.join("\n") + "\n"))
}

// ---------------------------------------------------------------------------
// Commandes
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn list_repositories() -> Result<RepositoryInfo, String> {
    blocking(|| {
        let manager = detect();
        let repositories = match manager {
            Manager::Apt => apt_list(),
            Manager::Dnf => dnf_list(),
            Manager::Pacman => pacman_list(),
            Manager::None => Vec::new(),
        };
        Ok(RepositoryInfo {
            manager,
            distro: os_release_field("NAME").unwrap_or_default(),
            codename: os_release_field("VERSION_CODENAME")
                .or_else(|| os_release_field("UBUNTU_CODENAME")),
            repositories,
        })
    })
    .await
}

#[tauri::command]
pub async fn add_repository(
    name: String,
    url: String,
    suite: String,
    components: String,
    gpg_key: String,
) -> Result<(), String> {
    blocking(move || {
        let name = clean(&name)?;
        let url = clean(&url)?;
        let suite = clean(&suite)?;
        let components = clean(&components)?;
        let gpg_key = clean(&gpg_key)?;

        if name.is_empty() || url.is_empty() {
            return Err("invalid_input".into());
        }
        if url.split_whitespace().count() != 1 {
            return Err("invalid_input".into());
        }
        let slug = slugify(&name);

        match detect() {
            Manager::Apt => {
                if suite.is_empty() || suite.split_whitespace().count() != 1 {
                    return Err("invalid_input".into());
                }
                let components = if components.is_empty() {
                    "main".to_string()
                } else {
                    components
                };
                let path = PathBuf::from(APT_DIR).join(format!("plume-{slug}.list"));
                if path.exists() {
                    return Err("repo_exists".into());
                }
                root_write(&path, &format!("deb {url} {suite} {components}\n"))
            }
            Manager::Dnf => {
                let path = PathBuf::from(DNF_DIR).join(format!("plume-{slug}.repo"));
                if path.exists() {
                    return Err("repo_exists".into());
                }
                let mut content =
                    format!("[plume-{slug}]\nname={name}\nbaseurl={url}\nenabled=1\n");
                if gpg_key.is_empty() {
                    content.push_str("gpgcheck=0\n");
                } else {
                    content.push_str(&format!("gpgcheck=1\ngpgkey={gpg_key}\n"));
                }
                root_write(&path, &content)
            }
            Manager::Pacman => {
                let content =
                    fs::read_to_string(PACMAN_CONF).map_err(|_| "read_failed".to_string())?;
                if content.contains(&format!("[plume-{slug}]")) {
                    return Err("repo_exists".into());
                }
                let next = format!(
                    "{}\n[plume-{slug}]\nSigLevel = Required DatabaseOptional\nServer = {url}\n",
                    content.trim_end()
                );
                root_write(Path::new(PACMAN_CONF), &next)
            }
            Manager::None => Err("unsupported_package_manager".into()),
        }
    })
    .await
}

#[tauri::command]
pub async fn update_repository(
    id: String,
    name: String,
    url: String,
    suite: String,
    components: String,
    gpg_key: String,
) -> Result<(), String> {
    blocking(move || {
        let id = parse_id(&id)?;
        let name = clean(&name)?;
        let url = clean(&url)?;
        let suite = clean(&suite)?;
        let components = clean(&components)?;
        let gpg_key = clean(&gpg_key)?;

        if url.is_empty() {
            return Err("invalid_input".into());
        }

        match id.manager.as_str() {
            "apt" => {
                if suite.is_empty() {
                    return Err("invalid_input".into());
                }
                // Le format .list n'accepte qu'une seule suite et une seule URL.
                if id.kind == "list"
                    && (url.split_whitespace().count() != 1
                        || suite.split_whitespace().count() != 1)
                {
                    return Err("invalid_input".into());
                }
                let components = if components.is_empty() {
                    "main".to_string()
                } else {
                    components
                };
                apt_update(&id, &url, &suite, &components)
            }
            "dnf" => {
                if name.is_empty() || url.split_whitespace().count() != 1 {
                    return Err("invalid_input".into());
                }
                dnf_update(&id, &name, &url, &gpg_key)
            }
            "pacman" => {
                if url.split_whitespace().count() != 1 {
                    return Err("invalid_input".into());
                }
                pacman_update(&id, &url)
            }
            _ => Err("unsupported_package_manager".into()),
        }
    })
    .await
}

#[tauri::command]
pub async fn remove_repository(id: String) -> Result<(), String> {
    blocking(move || {
        let id = parse_id(&id)?;
        match id.manager.as_str() {
            "apt" => apt_remove(&id),
            "dnf" => dnf_remove(&id),
            "pacman" => pacman_remove(&id),
            _ => Err("unsupported_package_manager".into()),
        }
    })
    .await
}

#[tauri::command]
pub async fn set_repository_enabled(id: String, enabled: bool) -> Result<(), String> {
    blocking(move || {
        let id = parse_id(&id)?;
        match id.manager.as_str() {
            "apt" => apt_toggle(&id, enabled),
            "dnf" => dnf_toggle(&id, enabled),
            "pacman" => Err("unsupported_operation".into()),
            _ => Err("unsupported_package_manager".into()),
        }
    })
    .await
}
