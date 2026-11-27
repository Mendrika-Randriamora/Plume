use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::RwLock;

#[cfg(target_os = "linux")]
use crate::modules::updates::{detect, exec_root, run_root, Manager};
#[cfg(target_os = "linux")]
use crate::shared::blocking;
#[cfg(target_os = "windows")]
use crate::shared::blocking;
#[cfg(target_os = "windows")]
use std::collections::HashSet;
#[cfg(target_os = "linux")]
use std::collections::{HashMap, HashSet};
#[cfg(target_os = "linux")]
use std::env;
#[cfg(target_os = "linux")]
use std::fs;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "linux")]
use std::path::Path;
#[cfg(target_os = "linux")]
use std::process::Command;
#[cfg(target_os = "windows")]
use std::process::Command;
#[cfg(target_os = "linux")]
use std::time::Duration;

/// Empêche l'ouverture d'une fenêtre console pour les outils CLI lancés en arrière-plan.
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Application {
    /// Identifiant stable côté Rust : fichier .desktop sous Linux, clé registre sous Windows.
    pub id: String,
    pub name: String,
    /// Identifiant du paquet Linux ou de l'entrée Windows correspondante.
    pub package_name: String,
    pub version: Option<String>,
    pub size: Option<u64>,
    pub source: String,
    /// `Some(false)` indique qu'aucune commande de désinstallation n'est enregistrée.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uninstall_available: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApplicationDetails {
    pub name: String,
    pub package_name: String,
    pub version: Option<String>,
    pub size: Option<u64>,
    pub source: String,
    pub desktop_file: Option<String>,
    pub desktop_content: Option<String>,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub categories: Option<Vec<String>>,
    pub exec: Option<String>,
    /// Métadonnées Windows supplémentaires (absentes sous Linux).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub publisher: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub install_location: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_icon_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub install_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub architecture: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub registry_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uninstall_available: Option<bool>,
}

#[cfg(target_os = "windows")]
#[derive(Debug, Clone, Default)]
struct WindowsApplicationMetadata {
    publisher: Option<String>,
    install_location: Option<String>,
    display_icon: Option<String>,
    comments: Option<String>,
    install_date: Option<String>,
    architecture: Option<String>,
}

#[derive(Debug, Clone)]
struct CachedApplication {
    app: Application,
    path: PathBuf,
    categories: Vec<String>,
    /// Commande de désinstallation issue de UninstallString / QuietUninstallString.
    #[cfg(target_os = "windows")]
    uninstall: Option<String>,
    #[cfg(target_os = "windows")]
    windows_details: WindowsApplicationMetadata,
}

/// Inventaire conservé en mémoire : il n'est régénéré que sur demande explicite.
#[derive(Default)]
pub struct ApplicationsState {
    entries: RwLock<Option<Vec<CachedApplication>>>,
}

#[tauri::command]
pub async fn list_applications(
    state: tauri::State<'_, ApplicationsState>,
) -> Result<Vec<Application>, String> {
    #[cfg(target_os = "linux")]
    {
        if let Some(entries) = cached_entries(&state)? {
            return Ok(entries.into_iter().map(|entry| entry.app).collect());
        }
        scan_and_store(&state).await
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(entries) = cached_entries(&state)? {
            return Ok(entries.into_iter().map(|entry| entry.app).collect());
        }
        scan_windows_and_store(&state).await
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        let _ = state;
        Ok(Vec::new())
    }
}

#[tauri::command]
pub async fn refresh_applications(
    state: tauri::State<'_, ApplicationsState>,
) -> Result<Vec<Application>, String> {
    #[cfg(target_os = "linux")]
    {
        scan_and_store(&state).await
    }

    #[cfg(target_os = "windows")]
    {
        scan_windows_and_store(&state).await
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        let _ = state;
        Ok(Vec::new())
    }
}

#[tauri::command]
pub async fn search_applications(
    query: String,
    state: tauri::State<'_, ApplicationsState>,
) -> Result<Vec<Application>, String> {
    // Aucun sous-processus ici : on filtre uniquement le cache mémoire.
    #[cfg(any(target_os = "linux", target_os = "windows"))]
    {
        let entries = cached_entries(&state)?.unwrap_or_default();
        Ok(search_cached(entries, &query))
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        let _ = (query, state);
        Ok(Vec::new())
    }
}

/// Filtre l'inventaire en mémoire sur le nom, l'identifiant, le paquet et les catégories.
#[cfg(any(target_os = "linux", target_os = "windows"))]
fn search_cached(entries: Vec<CachedApplication>, query: &str) -> Vec<Application> {
    let normalized = normalize_search(query);
    let terms: Vec<&str> = normalized.split_whitespace().collect();

    entries
        .into_iter()
        .filter(|entry| {
            if terms.is_empty() {
                return true;
            }
            let haystack = normalize_search(&format!(
                "{} {} {} {}",
                entry.app.name,
                entry.app.id,
                entry.app.package_name,
                entry.categories.join(" ")
            ));
            terms.iter().all(|term| haystack.contains(*term))
        })
        .map(|entry| entry.app)
        .collect()
}

#[tauri::command]
pub async fn get_application_details(
    desktop_id: String,
    state: tauri::State<'_, ApplicationsState>,
) -> Result<ApplicationDetails, String> {
    #[cfg(target_os = "linux")]
    {
        let entry =
            find_cached(&state, &desktop_id)?.ok_or_else(|| "application_not_found".to_string())?;

        blocking(move || details_for_entry(&entry)).await
    }

    #[cfg(target_os = "windows")]
    {
        let entry =
            find_cached(&state, &desktop_id)?.ok_or_else(|| "application_not_found".to_string())?;

        blocking(move || details_for_windows(&entry)).await
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        let _ = (desktop_id, state);
        Err("unsupported_platform".into())
    }
}

#[tauri::command]
pub async fn uninstall_application(
    desktop_id: String,
    state: tauri::State<'_, ApplicationsState>,
) -> Result<bool, String> {
    #[cfg(target_os = "linux")]
    {
        // L'identifiant vient du front : on le valide dans l'inventaire en mémoire.
        let entry =
            find_cached(&state, &desktop_id)?.ok_or_else(|| "application_not_found".to_string())?;

        if entry.app.source == "manuel" {
            return Err("manual_application".into());
        }

        blocking(move || uninstall_entry(&entry)).await?;
        Ok(true)
    }

    #[cfg(target_os = "windows")]
    {
        // L'identifiant vient du front : on le valide dans l'inventaire en mémoire.
        let entry =
            find_cached(&state, &desktop_id)?.ok_or_else(|| "application_not_found".to_string())?;

        blocking(move || uninstall_windows(&entry)).await?;
        // Met à jour immédiatement la liste après la désinstallation.
        scan_windows_and_store(&state).await?;
        Ok(true)
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        let _ = (desktop_id, state);
        Err("unsupported_platform".into())
    }
}

#[tauri::command]
pub async fn launch_application(
    desktop_id: String,
    state: tauri::State<'_, ApplicationsState>,
) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        // L'identifiant vient du front : on le valide dans l'inventaire en mémoire.
        let entry =
            find_cached(&state, &desktop_id)?.ok_or_else(|| "application_not_found".to_string())?;

        blocking(move || launch_entry(&entry)).await
    }

    #[cfg(target_os = "windows")]
    {
        // L'identifiant vient du front : on le valide dans l'inventaire en mémoire.
        let entry =
            find_cached(&state, &desktop_id)?.ok_or_else(|| "application_not_found".to_string())?;

        blocking(move || launch_windows(&entry)).await
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    {
        let _ = (desktop_id, state);
        Err("unsupported_platform".into())
    }
}

fn cached_entries(state: &ApplicationsState) -> Result<Option<Vec<CachedApplication>>, String> {
    let guard = state
        .entries
        .read()
        .map_err(|_| "inventory_unavailable".to_string())?;
    Ok(guard.clone())
}

fn find_cached(
    state: &ApplicationsState,
    desktop_id: &str,
) -> Result<Option<CachedApplication>, String> {
    Ok(cached_entries(state)?
        .unwrap_or_default()
        .into_iter()
        .find(|entry| entry.app.id == desktop_id))
}

/// Scanne l'inventaire puis remplace le cache mémoire.
#[cfg(target_os = "linux")]
async fn scan_and_store(state: &ApplicationsState) -> Result<Vec<Application>, String> {
    let entries = blocking(scan_inventory).await?;
    let applications: Vec<Application> = entries.iter().map(|entry| entry.app.clone()).collect();

    {
        let mut guard = state
            .entries
            .write()
            .map_err(|_| "inventory_unavailable".to_string())?;
        *guard = Some(entries);
    }

    Ok(applications)
}

/// Scanne les applications Windows installées puis remplace le cache mémoire.
#[cfg(target_os = "windows")]
async fn scan_windows_and_store(state: &ApplicationsState) -> Result<Vec<Application>, String> {
    let entries = blocking(windows_scan_inventory).await?;
    let applications: Vec<Application> = entries.iter().map(|entry| entry.app.clone()).collect();

    {
        let mut guard = state
            .entries
            .write()
            .map_err(|_| "inventory_unavailable".to_string())?;
        *guard = Some(entries);
    }

    Ok(applications)
}

#[cfg(target_os = "linux")]
fn scan_inventory() -> Result<Vec<CachedApplication>, String> {
    let dirs = application_dirs();
    let desktops = current_desktops();
    let parsed = load_visible_entries(&dirs, &desktops);
    let manager = detect();
    let source = manager_source(manager);

    let owner_paths: Vec<PathBuf> = parsed
        .iter()
        .filter(|entry| origin_from_path(&entry.path, &entry.entry).is_none())
        .map(|entry| entry.path.clone())
        .collect();
    let owners = find_owners(&owner_paths, manager);

    let mut entries: Vec<CachedApplication> = parsed
        .into_iter()
        .map(|parsed| {
            if let Some((origin, package_name)) = origin_from_path(&parsed.path, &parsed.entry) {
                build_cached(parsed, origin, package_name)
            } else if let Some(package_name) = owners.get(&parsed.path) {
                build_cached(parsed, source.to_string(), package_name.clone())
            } else {
                build_cached(parsed, "manuel".to_string(), String::new())
            }
        })
        .collect();

    enrich_entries(&mut entries);
    entries.sort_by(|a, b| {
        a.app
            .name
            .to_lowercase()
            .cmp(&b.app.name.to_lowercase())
            .then_with(|| a.app.id.cmp(&b.app.id))
    });

    Ok(entries)
}

#[cfg(target_os = "linux")]
fn build_cached(parsed: ParsedDesktop, source: String, package_name: String) -> CachedApplication {
    let name = parsed
        .entry
        .localized("Name")
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| parsed.id.trim_end_matches(".desktop").to_string());
    let categories = parsed
        .entry
        .get("Categories")
        .map(split_list)
        .unwrap_or_default();

    CachedApplication {
        app: Application {
            id: parsed.id,
            name,
            package_name,
            version: None,
            size: None,
            source,
            uninstall_available: None,
        },
        path: parsed.path,
        categories,
    }
}

#[cfg(target_os = "linux")]
fn details_for_entry(entry: &CachedApplication) -> Result<ApplicationDetails, String> {
    let content = fs::read_to_string(&entry.path).ok();
    let parsed = content
        .as_deref()
        .map(parse_desktop_entry)
        .unwrap_or_default();

    let name = parsed
        .localized("Name")
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| entry.app.name.clone());
    let categories: Vec<String> = parsed.get("Categories").map(split_list).unwrap_or_default();

    Ok(ApplicationDetails {
        name,
        package_name: entry.app.package_name.clone(),
        version: entry.app.version.clone(),
        size: entry.app.size,
        source: entry.app.source.clone(),
        desktop_file: Some(entry.path.display().to_string()),
        desktop_content: content,
        description: parsed.localized("Comment").filter(|text| !text.is_empty()),
        icon: parsed
            .get("Icon")
            .map(str::to_string)
            .filter(|icon| !icon.is_empty()),
        categories: if categories.is_empty() {
            None
        } else {
            Some(categories)
        },
        exec: parsed
            .get("Exec")
            .map(clean_exec)
            .filter(|exec| !exec.is_empty()),
        publisher: None,
        install_location: None,
        display_icon_path: None,
        install_date: None,
        architecture: None,
        registry_key: None,
        uninstall_available: None,
    })
}

/// L'identifiant a déjà été validé dans le cache ; la commande ne reçoit que des arguments sûrs.
#[cfg(target_os = "linux")]
fn uninstall_entry(entry: &CachedApplication) -> Result<(), String> {
    let package = entry.app.package_name.as_str();
    if package.is_empty() {
        return Err("missing_package_id".into());
    }

    match entry.app.source.as_str() {
        "apt" => {
            run_root(&["apt-get", "remove", "-y", package])?;
        }
        "dnf" => {
            run_root(&["dnf", "remove", "-y", package])?;
        }
        "pacman" => {
            run_root(&["pacman", "-Rs", "--noconfirm", package])?;
        }
        "flatpak" => {
            run_root(&["flatpak", "uninstall", "-y", package])?;
        }
        "snap" => remove_snap(package)?,
        other => {
            eprintln!("Source d'application inconnue : {other}");
            return Err("unknown_source".into());
        }
    };
    Ok(())
}

/// Délai maximal d'attente d'une suppression de snap déjà lancée (instantané des
/// données utilisateur compris, ce qui peut prendre plusieurs minutes).
#[cfg(target_os = "linux")]
const SNAP_REMOVAL_TIMEOUT: Duration = Duration::from_secs(600);

/// Un snap ne doit être nommé qu'avec des minuscules, chiffres, `-` et `_`
/// (les instances parallèles utilisent `_`).
#[cfg(target_os = "linux")]
fn is_valid_snap_name(value: &str) -> bool {
    !value.is_empty()
        && value
            .chars()
            .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-' || ch == '_')
}

/// `snap remove` échoue si une suppression est déjà en cours pour ce snap
/// (tentative précédente encore active, double clic). On attend alors la fin de
/// cette suppression au lieu de signaler un faux échec.
#[cfg(target_os = "linux")]
fn remove_snap(package: &str) -> Result<(), String> {
    if !is_valid_snap_name(package) {
        return Err("missing_package_id".into());
    }

    let out = exec_root(&["snap", "remove", package])?;
    if out.success {
        return Ok(());
    }

    match out.code {
        Some(126) | Some(127) => return Err("permission_denied".into()),
        _ => {}
    }

    if out.stderr.contains("\"remove-snap\" change in progress") {
        return wait_for_snap_removal(package);
    }

    out.log_failure();
    if out.stderr.contains("is not installed") {
        Err("application_not_found".into())
    } else if out.stderr.contains("is not removable") || out.stderr.contains("is being used") {
        Err("snap_in_use".into())
    } else {
        Err("command_failed".into())
    }
}

#[cfg(target_os = "linux")]
fn wait_for_snap_removal(package: &str) -> Result<(), String> {
    let mut remaining = SNAP_REMOVAL_TIMEOUT.as_secs();
    while remaining > 0 {
        std::thread::sleep(Duration::from_secs(1));
        remaining -= 1;

        if !snap_is_installed(package) {
            return Ok(());
        }
        // Plus aucune opération en cours alors que le snap est toujours là :
        // la suppression existante a échoué, inutile d'attendre davantage.
        if snap_changes_finished() {
            return Err("command_failed".into());
        }
    }
    Err("snap_change_in_progress".into())
}

#[cfg(target_os = "linux")]
fn snap_is_installed(package: &str) -> bool {
    Command::new("snap")
        .args(["list", package])
        .env("LC_ALL", "C")
        .output()
        .map(|out| out.status.success())
        .unwrap_or(true)
}

/// Vrai si `snap changes` ne montre plus aucune opération active. Les statuts
/// du démon sont stables (non traduits) : Done, Error, Undone, Abort.
#[cfg(target_os = "linux")]
fn snap_changes_finished() -> bool {
    let Ok(out) = Command::new("snap")
        .arg("changes")
        .env("LC_ALL", "C")
        .output()
    else {
        return false;
    };

    changes_are_finished(&String::from_utf8_lossy(&out.stdout))
}

/// Vrai si toutes les lignes de `snap changes` sont dans un état terminal.
#[cfg(target_os = "linux")]
fn changes_are_finished(output: &str) -> bool {
    let mut saw_change = false;
    for line in output.lines().skip(1) {
        if line.trim().is_empty() {
            continue;
        }
        saw_change = true;
        let Some(status) = line.split_whitespace().nth(1) else {
            return false;
        };
        if !matches!(status, "Done" | "Error" | "Undone" | "Abort") {
            return false;
        }
    }
    saw_change
}

/// `gio launch` applique les règles XDG du fichier `.desktop` (Exec, Terminal,
/// Path). En son absence, on exécute directement la commande déclarée.
#[cfg(target_os = "linux")]
fn launch_entry(entry: &CachedApplication) -> Result<(), String> {
    if Command::new("gio")
        .arg("launch")
        .arg(&entry.path)
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
    {
        return Ok(());
    }

    let content = fs::read_to_string(&entry.path).map_err(|_| "launch_failed".to_string())?;
    let exec = parse_desktop_entry(&content)
        .get("Exec")
        .map(clean_exec)
        .filter(|exec| !exec.is_empty())
        .ok_or_else(|| "launch_failed".to_string())?;

    Command::new("sh")
        .arg("-c")
        .arg(exec)
        .spawn()
        .map(|_| ())
        .map_err(|_| "launch_failed".to_string())
}

// ---------- Applications Windows ----------

/// Inventorie les entrées de désinstallation Windows.
/// Format de chaque ligne : id registre, nom, version, taille en Kio,
/// commande de désinstallation, emplacement, éditeur, icône, commentaires,
/// date d'installation et architecture.
#[cfg(target_os = "windows")]
const WINDOWS_INSTALLED_APPS_SCRIPT: &str = r#"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false

function ConvertTo-SafeField([object]$Value) {
    if ($null -eq $Value) { return '' }
    return ([string]$Value -replace "[`t`r`n]", ' ').Trim()
}

$roots = @(
    [pscustomobject]@{ Path = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall'; Scope = 'Machine'; Architecture = '64-bit' },
    [pscustomobject]@{ Path = 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'; Scope = 'Machine'; Architecture = '32-bit' },
    [pscustomobject]@{ Path = 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall'; Scope = 'User'; Architecture = '64-bit' },
    [pscustomobject]@{ Path = 'HKCU:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'; Scope = 'User'; Architecture = '32-bit' }
)

foreach ($root in $roots) {
    Get-ItemProperty -Path ($root.Path + '\*') -ErrorAction SilentlyContinue | ForEach-Object {
        $name = ConvertTo-SafeField $_.DisplayName
        if ([string]::IsNullOrWhiteSpace($name)) { return }

        $uninstall = [string]$_.UninstallString
        if ([string]::IsNullOrWhiteSpace($uninstall)) {
            $uninstall = [string]$_.QuietUninstallString
        }

        # Certaines entrées MSI publient /I (maintenance) au lieu de /X (suppression).
        if ($_.WindowsInstaller -eq 1 -and -not [string]::IsNullOrWhiteSpace($uninstall)) {
            $uninstall = [regex]::Replace($uninstall, '(?i)/I(?=\s*\{)', '/X')
        }

        $sizeKb = ''
        if ($null -ne $_.EstimatedSize) {
            try { $sizeKb = [uint64]$_.EstimatedSize } catch { $sizeKb = '' }
        }

        $registryId = '{0}|{1}|{2}' -f $root.Scope, $root.Architecture, [string]$_.PSChildName
        $fields = @(
            (ConvertTo-SafeField $registryId),
            $name,
            (ConvertTo-SafeField $_.DisplayVersion),
            (ConvertTo-SafeField $sizeKb),
            (ConvertTo-SafeField $uninstall),
            (ConvertTo-SafeField $_.InstallLocation),
            (ConvertTo-SafeField $_.Publisher),
            (ConvertTo-SafeField $_.DisplayIcon),
            (ConvertTo-SafeField $_.Comments),
            (ConvertTo-SafeField $_.InstallDate),
            (ConvertTo-SafeField $root.Architecture)
        )
        [Console]::Out.WriteLine(($fields -join "`t"))
    }
}
"#;

/// Lit le registre sans afficher la fenêtre console de PowerShell.
#[cfg(target_os = "windows")]
fn windows_scan_inventory() -> Result<Vec<CachedApplication>, String> {
    let out = Command::new("powershell.exe")
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-Command",
            WINDOWS_INSTALLED_APPS_SCRIPT,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| {
            eprintln!("Impossible de lancer powershell.exe : {e}");
            "command_failed".to_string()
        })?;

    if !out.status.success() {
        eprintln!(
            "Échec de l'inventaire Windows : {}",
            String::from_utf8_lossy(&out.stderr)
        );
        return Err("command_failed".to_string());
    }

    let stdout = String::from_utf8_lossy(&out.stdout).into_owned();
    let mut entries: Vec<CachedApplication> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    for line in stdout.lines() {
        let fields: Vec<&str> = line.split('\t').collect();
        if fields.len() < 11 {
            continue;
        }

        let id = fields[0].trim();
        let name = fields[1].trim();
        if id.is_empty() || name.is_empty() || !seen.insert(id.to_ascii_lowercase()) {
            continue;
        }

        let version = fields[2].trim();
        let size_kb = fields[3].trim();
        let uninstall = fields[4].trim();
        let install_location = fields[5].trim();
        let publisher = fields[6].trim();
        let display_icon = fields[7].trim();
        let comments = fields[8].trim();
        let install_date = fields[9].trim();
        let architecture = fields[10].trim();

        let optional = |value: &str| (!value.is_empty()).then(|| value.to_string());
        let size = size_kb
            .parse::<u64>()
            .ok()
            .map(|kib| kib.saturating_mul(1024));

        entries.push(CachedApplication {
            app: Application {
                id: id.to_string(),
                name: name.to_string(),
                // Ne jamais exposer UninstallString comme identifiant de paquet.
                package_name: id.to_string(),
                version: optional(version),
                size,
                source: "windows".to_string(),
                uninstall_available: Some(!uninstall.is_empty()),
            },
            // UninstallString n'est pas le chemin de lancement de l'application.
            path: PathBuf::new(),
            categories: Vec::new(),
            uninstall: optional(uninstall),
            windows_details: WindowsApplicationMetadata {
                publisher: optional(publisher),
                install_location: optional(install_location),
                display_icon: optional(display_icon),
                comments: optional(comments),
                install_date: optional(install_date),
                architecture: optional(architecture),
            },
        });
    }

    entries.sort_by(|a, b| {
        a.app
            .name
            .to_lowercase()
            .cmp(&b.app.name.to_lowercase())
            .then_with(|| a.app.id.cmp(&b.app.id))
    });

    Ok(entries)
}

/// Le registre de désinstallation ne fournit pas un chemin de lancement fiable.
/// Ne jamais lancer par erreur l'exécutable du désinstalleur.
#[cfg(target_os = "windows")]
fn launch_windows(_entry: &CachedApplication) -> Result<(), String> {
    Err("launch_not_supported".into())
}

/// Exécute la commande enregistrée par l'installateur sans faire apparaître cmd.exe.
#[cfg(target_os = "windows")]
fn uninstall_windows(entry: &CachedApplication) -> Result<(), String> {
    let Some(uninstall) = entry.uninstall.as_deref() else {
        return Err("missing_package_id".into());
    };
    if uninstall.trim().is_empty() {
        return Err("missing_package_id".into());
    }

    let status = Command::new("cmd.exe")
        .args(["/D", "/C", uninstall])
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|e| {
            eprintln!("Impossible de lancer le désinstalleur : {e}");
            "command_failed".to_string()
        })?;

    // 1641 et 3010 sont des codes Windows Installer indiquant une réussite
    // nécessitant (ou ayant déclenché) un redémarrage.
    match status.code() {
        Some(0 | 1641 | 3010) => Ok(()),
        _ => Err("command_failed".into()),
    }
}

#[cfg(target_os = "windows")]
fn details_for_windows(entry: &CachedApplication) -> Result<ApplicationDetails, String> {
    let details = &entry.windows_details;

    Ok(ApplicationDetails {
        name: entry.app.name.clone(),
        package_name: entry.app.package_name.clone(),
        version: entry.app.version.clone(),
        size: entry.app.size,
        source: entry.app.source.clone(),
        // Les champs .desktop / Exec ne s'appliquent pas aux entrées du registre Windows.
        desktop_file: None,
        desktop_content: None,
        description: details.comments.clone(),
        // DisplayIcon est un chemin Windows, pas une URL image utilisable directement par le WebView.
        icon: None,
        categories: None,
        exec: None,
        publisher: details.publisher.clone(),
        install_location: details.install_location.clone(),
        display_icon_path: details.display_icon.clone(),
        install_date: details.install_date.clone(),
        architecture: details.architecture.clone(),
        registry_key: Some(entry.app.id.clone()),
        uninstall_available: Some(entry.uninstall.is_some()),
    })
}

// ---------- Découverte des fichiers .desktop ----------

#[cfg(target_os = "linux")]
#[derive(Debug, Clone, Default)]
struct DesktopEntry {
    values: HashMap<String, String>,
}

#[cfg(target_os = "linux")]
impl DesktopEntry {
    fn get(&self, key: &str) -> Option<&str> {
        self.values.get(key).map(String::as_str)
    }

    fn localized(&self, key: &str) -> Option<String> {
        for locale in locale_candidates() {
            if let Some(value) = self.values.get(&format!("{key}[{locale}]")) {
                let value = value.trim();
                if !value.is_empty() {
                    return Some(value.to_string());
                }
            }
        }
        self.get(key)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
    }

    fn boolean(&self, key: &str) -> bool {
        self.get(key)
            .map(|value| value.trim().eq_ignore_ascii_case("true"))
            .unwrap_or(false)
    }
}

#[cfg(target_os = "linux")]
#[derive(Debug)]
struct ParsedDesktop {
    id: String,
    path: PathBuf,
    entry: DesktopEntry,
}

#[cfg(target_os = "linux")]
fn application_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    let home = dirs::home_dir();

    let data_home = env::var_os("XDG_DATA_HOME")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .or_else(|| home.as_ref().map(|home| home.join(".local/share")));
    if let Some(data_home) = data_home {
        dirs.push(data_home.join("applications"));
    }

    match env::var_os("XDG_DATA_DIRS").filter(|value| !value.is_empty()) {
        Some(value) => {
            for dir in env::split_paths(&value) {
                dirs.push(dir.join("applications"));
            }
        }
        None => {
            dirs.push(PathBuf::from("/usr/share/applications"));
            dirs.push(PathBuf::from("/usr/local/share/applications"));
            dirs.push(PathBuf::from("/var/lib/flatpak/exports/share/applications"));
            if let Some(home) = &home {
                dirs.push(home.join(".local/share/flatpak/exports/share/applications"));
            }
            dirs.push(PathBuf::from("/var/lib/snapd/desktop/applications"));
        }
    }

    let mut seen = HashSet::new();
    dirs.retain(|dir| seen.insert(dir.clone()));
    dirs
}

#[cfg(target_os = "linux")]
fn current_desktops() -> Vec<String> {
    env::var("XDG_CURRENT_DESKTOP")
        .unwrap_or_default()
        .split(':')
        .map(str::trim)
        .filter(|desktop| !desktop.is_empty())
        .map(str::to_string)
        .collect()
}

/// Charge les entrées visibles de chaque dossier, en respectant la priorité utilisateur > système.
#[cfg(target_os = "linux")]
fn load_visible_entries(dirs: &[PathBuf], desktops: &[String]) -> Vec<ParsedDesktop> {
    let mut seen = HashSet::new();
    let mut entries = Vec::new();

    for dir in dirs {
        let mut files = Vec::new();
        collect_desktop_files(dir, &mut files);
        files.sort();

        for path in files {
            let id = desktop_id(dir, &path);
            // Un fichier utilisateur masque toujours l'entrée système de même ID.
            if !seen.insert(id.clone()) {
                continue;
            }

            let Some(entry) = read_desktop_entry(&path) else {
                continue;
            };
            if is_visible(&entry, desktops) {
                entries.push(ParsedDesktop { id, path, entry });
            }
        }
    }

    entries
}

#[cfg(target_os = "linux")]
fn collect_desktop_files(dir: &Path, files: &mut Vec<PathBuf>) {
    let Ok(read_dir) = fs::read_dir(dir) else {
        return;
    };

    for item in read_dir.flatten() {
        let name = item.file_name();
        if name.to_string_lossy().starts_with('.') {
            continue;
        }

        let path = item.path();
        if item.file_type().map(|kind| kind.is_dir()).unwrap_or(false) {
            collect_desktop_files(&path, files);
        } else if path.is_file() && path.extension().and_then(|ext| ext.to_str()) == Some("desktop")
        {
            files.push(path);
        }
    }
}

#[cfg(target_os = "linux")]
fn desktop_id(dir: &Path, path: &Path) -> String {
    path.strip_prefix(dir)
        .unwrap_or(path)
        .components()
        .map(|part| part.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("-")
}

#[cfg(target_os = "linux")]
fn read_desktop_entry(path: &Path) -> Option<DesktopEntry> {
    fs::read_to_string(path)
        .ok()
        .map(|content| parse_desktop_entry(&content))
}

#[cfg(target_os = "linux")]
fn parse_desktop_entry(content: &str) -> DesktopEntry {
    let mut entry = DesktopEntry::default();
    let mut in_main_group = false;

    for raw_line in content.lines() {
        let line = raw_line.trim_start_matches('\u{feff}').trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        if line.starts_with('[') && line.ends_with(']') {
            in_main_group = &line[1..line.len() - 1] == "Desktop Entry";
            continue;
        }

        if !in_main_group {
            continue;
        }

        if let Some((key, value)) = line.split_once('=') {
            entry
                .values
                .insert(key.trim().to_string(), value.trim().to_string());
        }
    }

    entry
}

#[cfg(target_os = "linux")]
fn is_visible(entry: &DesktopEntry, desktops: &[String]) -> bool {
    if !entry
        .get("Type")
        .map(|kind| kind.eq_ignore_ascii_case("Application"))
        .unwrap_or(false)
    {
        return false;
    }

    if entry.boolean("NoDisplay") || entry.boolean("Hidden") {
        return false;
    }

    let only_show_in = entry.get("OnlyShowIn").map(split_list).unwrap_or_default();
    if !only_show_in.is_empty()
        && !only_show_in.iter().any(|wanted| {
            desktops
                .iter()
                .any(|current| current.eq_ignore_ascii_case(wanted))
        })
    {
        return false;
    }

    let not_show_in = entry.get("NotShowIn").map(split_list).unwrap_or_default();
    if not_show_in.iter().any(|blocked| {
        desktops
            .iter()
            .any(|current| current.eq_ignore_ascii_case(blocked))
    }) {
        return false;
    }

    if let Some(try_exec) = entry.get("TryExec") {
        if !try_exec_exists(try_exec) {
            return false;
        }
    }

    true
}

#[cfg(target_os = "linux")]
fn split_list(value: &str) -> Vec<String> {
    value
        .split(';')
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(str::to_string)
        .collect()
}

#[cfg(target_os = "linux")]
fn try_exec_exists(value: &str) -> bool {
    let command = value.split_whitespace().next().unwrap_or_default();
    if command.is_empty() {
        return false;
    }

    let path = Path::new(command);
    if path.is_absolute() || command.contains('/') {
        return path.is_file();
    }

    env::var_os("PATH")
        .map(|paths| env::split_paths(&paths).any(|dir| dir.join(command).is_file()))
        .unwrap_or(false)
}

#[cfg(target_os = "linux")]
fn locale_candidates() -> Vec<String> {
    let mut candidates = Vec::new();
    for language in gio::glib::language_names() {
        let language = language.as_str();
        if language == "C" || language == "POSIX" {
            continue;
        }

        let without_encoding = language.split('.').next().unwrap_or(language);
        let without_modifier = without_encoding
            .split('@')
            .next()
            .unwrap_or(without_encoding);
        let short = without_modifier
            .split('_')
            .next()
            .unwrap_or(without_modifier);

        for candidate in [language, without_encoding, without_modifier, short] {
            if !candidate.is_empty()
                && !candidates
                    .iter()
                    .any(|existing: &String| existing == candidate)
            {
                candidates.push(candidate.to_string());
            }
        }
    }
    candidates
}

/// Retire les codes de champ XDG (`%U`, `%f`, `%i`, etc.) du champ Exec.
#[cfg(target_os = "linux")]
pub(crate) fn clean_exec(exec: &str) -> String {
    const FIELD_CODES: &[char] = &[
        'f', 'F', 'u', 'U', 'i', 'c', 'k', 'd', 'D', 'n', 'N', 'v', 'm',
    ];

    let mut cleaned = String::new();
    let mut chars = exec.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch != '%' {
            cleaned.push(ch);
            continue;
        }

        match chars.peek().copied() {
            Some('%') => {
                chars.next();
                cleaned.push('%');
            }
            Some(code) if FIELD_CODES.contains(&code) => {
                chars.next();
            }
            Some(_) => cleaned.push('%'),
            None => cleaned.push('%'),
        }
    }

    cleaned.split_whitespace().collect::<Vec<_>>().join(" ")
}

// ---------- Origine et propriétaire des paquets ----------

#[cfg(target_os = "linux")]
fn origin_from_path(path: &Path, entry: &DesktopEntry) -> Option<(String, String)> {
    let path_text = path.to_string_lossy();

    if path_text.contains("/flatpak/exports/") {
        let app_id = path.file_stem()?.to_string_lossy().to_string();
        return Some(("flatpak".to_string(), app_id));
    }

    if path_text.starts_with("/var/lib/snapd/desktop/") {
        // `X-SnapInstanceName` est la source fiable ; le préfixe du nom de fichier
        // ne suffit pas pour les instances parallèles (nom contenant `_`).
        let snap_name = entry
            .get("X-SnapInstanceName")
            .map(str::trim)
            .filter(|name| is_valid_snap_name(name))
            .map(str::to_string)
            .or_else(|| {
                let file_stem = path.file_stem()?.to_string_lossy();
                let prefix = file_stem.split('_').next().unwrap_or(&file_stem);
                is_valid_snap_name(prefix).then(|| prefix.to_string())
            })?;
        return Some(("snap".to_string(), snap_name));
    }

    None
}

#[cfg(target_os = "linux")]
fn manager_source(manager: Manager) -> &'static str {
    match manager {
        Manager::Apt => "apt",
        Manager::Dnf => "dnf",
        Manager::Pacman => "pacman",
        Manager::None => "manuel",
    }
}

/// Une seule commande groupée par gestionnaire pour retrouver les paquets propriétaires.
#[cfg(target_os = "linux")]
fn find_owners(paths: &[PathBuf], manager: Manager) -> HashMap<PathBuf, String> {
    if paths.is_empty() {
        return HashMap::new();
    }

    match manager {
        Manager::Apt => dpkg_owners(paths),
        Manager::Pacman => pacman_owners(paths),
        Manager::Dnf => rpm_owners(paths),
        Manager::None => HashMap::new(),
    }
}

#[cfg(target_os = "linux")]
fn dpkg_owners(paths: &[PathBuf]) -> HashMap<PathBuf, String> {
    let wanted: HashSet<PathBuf> = paths.iter().cloned().collect();
    let mut owners = HashMap::new();

    let Ok(entries) = fs::read_dir("/var/lib/dpkg/info") else {
        return owners;
    };

    for item in entries.flatten() {
        let list_path = item.path();
        if list_path.extension().and_then(|ext| ext.to_str()) != Some("list") {
            continue;
        }

        let Some(file_stem) = list_path.file_stem().and_then(|stem| stem.to_str()) else {
            continue;
        };
        // Les fichiers .list peuvent être nommés « paquet:architecture.list ».
        let package = file_stem.split(':').next().unwrap_or(file_stem).to_string();

        let Ok(content) = fs::read_to_string(&list_path) else {
            continue;
        };
        for line in content.lines() {
            let candidate = PathBuf::from(line.trim());
            if wanted.contains(&candidate) {
                owners.entry(candidate).or_insert_with(|| package.clone());
            }
        }

        if owners.len() == wanted.len() {
            break;
        }
    }

    owners
}

#[cfg(target_os = "linux")]
fn pacman_owners(paths: &[PathBuf]) -> HashMap<PathBuf, String> {
    let mut command = Command::new("pacman");
    command.arg("-Qo");
    for path in paths {
        command.arg(path);
    }

    let Ok(output) = command.env("LC_ALL", "C").output() else {
        return HashMap::new();
    };

    let mut owners = HashMap::new();
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let Some((file, rest)) = line.split_once(" is owned by ") else {
            continue;
        };
        let Some(package) = rest.split_whitespace().next() else {
            continue;
        };
        owners.insert(PathBuf::from(file.trim()), package.to_string());
    }
    owners
}

#[cfg(target_os = "linux")]
fn rpm_owners(paths: &[PathBuf]) -> HashMap<PathBuf, String> {
    let mut command = Command::new("rpm");
    command.args(["-qf", "--qf", "%{NAME}\t%{VERSION}-%{RELEASE}\n"]);
    for path in paths {
        command.arg(path);
    }

    let Ok(output) = command.env("LC_ALL", "C").output() else {
        return HashMap::new();
    };

    // rpm signale sur stderr les fichiers non possédés : on les retire de la liste,
    // puis stdout reste aligné avec les chemins restants.
    let mut rejected = HashSet::new();
    for line in String::from_utf8_lossy(&output.stderr).lines() {
        if let Some(path) = rpm_error_path(line) {
            rejected.insert(path.to_string());
        }
    }

    let remaining: Vec<&PathBuf> = paths
        .iter()
        .filter(|path| !rejected.contains(path.to_string_lossy().as_ref()))
        .collect();

    let mut owners = HashMap::new();
    for (path, line) in remaining
        .into_iter()
        .zip(String::from_utf8_lossy(&output.stdout).lines())
    {
        let Some((package, _)) = line.split_once('\t') else {
            continue;
        };
        let package = package.trim();
        if !package.is_empty() {
            owners.insert(path.clone(), package.to_string());
        }
    }
    owners
}

#[cfg(target_os = "linux")]
fn rpm_error_path(line: &str) -> Option<&str> {
    let line = line.trim();
    if let Some(rest) = line.strip_prefix("error: file ") {
        return rest.split(':').next().map(str::trim);
    }
    if let Some(rest) = line.strip_prefix("file ") {
        return rest
            .strip_suffix(" is not owned by any package")
            .map(str::trim);
    }
    None
}

// ---------- Enrichissement (version, taille) ----------

#[cfg(target_os = "linux")]
#[derive(Debug, Clone, Default)]
struct PackageMeta {
    version: Option<String>,
    size: Option<u64>,
}

#[cfg(target_os = "linux")]
fn enrich_entries(entries: &mut [CachedApplication]) {
    let needs_apt = entries.iter().any(|entry| entry.app.source == "apt");
    let needs_dnf = entries.iter().any(|entry| entry.app.source == "dnf");
    let needs_pacman = entries.iter().any(|entry| entry.app.source == "pacman");
    let needs_flatpak = entries.iter().any(|entry| entry.app.source == "flatpak");
    let needs_snap = entries.iter().any(|entry| entry.app.source == "snap");

    let apt = if needs_apt {
        apt_metadata()
    } else {
        HashMap::new()
    };
    let dnf = if needs_dnf {
        rpm_metadata()
    } else {
        HashMap::new()
    };
    let pacman = if needs_pacman {
        pacman_metadata()
    } else {
        HashMap::new()
    };
    let flatpak = if needs_flatpak {
        flatpak_metadata()
    } else {
        HashMap::new()
    };
    let snap = if needs_snap {
        snap_metadata()
    } else {
        HashMap::new()
    };

    for entry in entries {
        let meta = match entry.app.source.as_str() {
            "apt" => apt.get(&entry.app.package_name),
            "dnf" => dnf.get(&entry.app.package_name),
            "pacman" => pacman.get(&entry.app.package_name),
            "flatpak" => flatpak.get(&entry.app.package_name),
            "snap" => snap.get(&entry.app.package_name),
            _ => None,
        };

        if let Some(meta) = meta {
            entry.app.version = meta.version.clone();
            entry.app.size = meta.size;
        }
    }
}

#[cfg(target_os = "linux")]
fn apt_metadata() -> HashMap<String, PackageMeta> {
    let output = Command::new("dpkg-query")
        .args(["-W", "-f=${Package}\t${Version}\t${Installed-Size}\n"])
        .env("LC_ALL", "C")
        .output();

    let Ok(output) = output else {
        return HashMap::new();
    };

    let mut metadata = HashMap::new();
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let mut fields = line.splitn(3, '\t');
        let Some(package) = fields.next() else {
            continue;
        };
        let version = fields.next().unwrap_or_default().trim();
        let size = fields.next().unwrap_or_default();

        metadata.insert(
            package.trim().to_string(),
            PackageMeta {
                version: (!version.is_empty()).then(|| version.to_string()),
                size: parse_installed_size(size),
            },
        );
    }
    metadata
}

#[cfg(target_os = "linux")]
fn rpm_metadata() -> HashMap<String, PackageMeta> {
    let output = Command::new("rpm")
        .args(["-qa", "--qf", "%{NAME}\t%{VERSION}-%{RELEASE}\t%{SIZE}\n"])
        .env("LC_ALL", "C")
        .output();

    let Ok(output) = output else {
        return HashMap::new();
    };

    let mut metadata = HashMap::new();
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let mut fields = line.splitn(3, '\t');
        let Some(package) = fields.next() else {
            continue;
        };
        let version = fields.next().unwrap_or_default().trim();
        let size = fields.next().unwrap_or_default().trim();

        metadata.insert(
            package.trim().to_string(),
            PackageMeta {
                version: (!version.is_empty()).then(|| version.to_string()),
                size: size.parse::<u64>().ok(),
            },
        );
    }
    metadata
}

#[cfg(target_os = "linux")]
fn pacman_metadata() -> HashMap<String, PackageMeta> {
    let output = Command::new("pacman")
        .arg("-Qi")
        .env("LC_ALL", "C")
        .output();

    let Ok(output) = output else {
        return HashMap::new();
    };

    let mut metadata = HashMap::new();
    let mut name: Option<String> = None;
    let mut version: Option<String> = None;
    let mut size: Option<u64> = None;

    for line in String::from_utf8_lossy(&output.stdout).lines() {
        if line.trim().is_empty() {
            if let Some(package) = name.take() {
                metadata.insert(
                    package,
                    PackageMeta {
                        version: version.take(),
                        size: size.take(),
                    },
                );
            }
            continue;
        }

        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let value = value.trim();
        match key.trim() {
            "Name" => name = Some(value.to_string()),
            "Version" => version = (!value.is_empty()).then(|| value.to_string()),
            "Installed Size" => size = parse_human_size(value),
            _ => {}
        }
    }

    if let Some(package) = name {
        metadata.insert(package, PackageMeta { version, size });
    }
    metadata
}

#[cfg(target_os = "linux")]
fn flatpak_metadata() -> HashMap<String, PackageMeta> {
    let output = Command::new("flatpak")
        .args(["list", "--app", "--columns=application,name,version,size"])
        .env("LC_ALL", "C")
        .output();

    let Ok(output) = output else {
        return HashMap::new();
    };

    let mut metadata = HashMap::new();
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let fields: Vec<&str> = line.split('\t').collect();
        if fields.len() < 3 {
            continue;
        }

        let app_id = fields[0].trim();
        if app_id.is_empty() {
            continue;
        }
        let version = fields[2].trim();

        metadata.insert(
            app_id.to_string(),
            PackageMeta {
                version: (!version.is_empty()).then(|| version.to_string()),
                size: fields.get(3).and_then(|size| parse_human_size(size)),
            },
        );
    }
    metadata
}

#[cfg(target_os = "linux")]
fn snap_metadata() -> HashMap<String, PackageMeta> {
    let output = Command::new("snap").arg("list").env("LC_ALL", "C").output();

    let Ok(output) = output else {
        return HashMap::new();
    };

    let mut metadata = HashMap::new();
    for (index, line) in String::from_utf8_lossy(&output.stdout).lines().enumerate() {
        if index == 0 {
            continue;
        }

        let mut fields = line.split_whitespace();
        let Some(name) = fields.next() else {
            continue;
        };
        let version = fields.next().unwrap_or_default();
        let revision = fields.next().unwrap_or_default();

        metadata.insert(
            name.to_string(),
            PackageMeta {
                version: (!version.is_empty() && version != "—" && version != "-")
                    .then(|| version.to_string()),
                size: snap_size(name, revision),
            },
        );
    }
    metadata
}

/// Taille du fichier `.snap` installé : `snap list` n'expose pas l'espace occupé,
/// mais le fichier squashfs correspondant à la révision active donne la taille
/// réellement stockée sur le disque (identique à l'« installed » de `snap info`).
#[cfg(target_os = "linux")]
fn snap_size(name: &str, revision: &str) -> Option<u64> {
    let safe_name = !name.is_empty()
        && name
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_');
    // Les snaps installés hors boutique ont une révision du type « x1 ».
    let safe_revision =
        !revision.is_empty() && revision.chars().all(|ch| ch.is_ascii_alphanumeric());
    if !safe_name || !safe_revision {
        return None;
    }

    let path = Path::new("/var/lib/snapd/snaps").join(format!("{name}_{revision}.snap"));
    fs::metadata(path).ok().map(|metadata| metadata.len())
}

/// `Installed-Size` de dpkg est exprimé en Kio.
#[cfg(target_os = "linux")]
fn parse_installed_size(raw: &str) -> Option<u64> {
    let raw = raw.trim();
    if raw.is_empty() {
        return None;
    }
    raw.parse::<u64>().ok().map(|kib| kib.saturating_mul(1024))
}

#[cfg(target_os = "linux")]
fn parse_human_size(raw: &str) -> Option<u64> {
    let value = raw.trim().replace(',', ".");
    if value.is_empty() {
        return None;
    }

    let split_at = value
        .find(|ch: char| !(ch.is_ascii_digit() || ch == '.'))
        .unwrap_or(value.len());
    let number = value[..split_at].parse::<f64>().ok()?;
    if !number.is_finite() || number < 0.0 {
        return None;
    }

    let unit = value[split_at..].trim().to_ascii_uppercase();
    let multiplier = match unit.as_str() {
        "" | "B" | "BYTE" | "BYTES" | "O" => 1.0,
        "K" | "KB" | "KO" => 1000.0,
        "KIB" | "KIO" => 1024.0,
        "M" | "MB" | "MO" => 1000.0 * 1000.0,
        "MIB" | "MIO" => 1024.0 * 1024.0,
        "G" | "GB" | "GO" => 1000.0 * 1000.0 * 1000.0,
        "GIB" | "GIO" => 1024.0 * 1024.0 * 1024.0,
        "T" | "TB" | "TO" => 1000.0 * 1000.0 * 1000.0 * 1000.0,
        "TIB" | "TIO" => 1024.0 * 1024.0 * 1024.0 * 1024.0,
        _ => return None,
    };

    Some((number * multiplier).round() as u64)
}

// ---------- Recherche insensible à la casse et aux accents ----------

#[cfg(any(target_os = "linux", target_os = "windows"))]
fn normalize_search(value: &str) -> String {
    let mut normalized = String::with_capacity(value.len());
    for ch in value.to_lowercase().chars() {
        match ch {
            'à' | 'á' | 'â' | 'ã' | 'ä' | 'å' | 'ā' | 'ă' | 'ą' => normalized.push('a'),
            'ç' | 'ć' | 'č' => normalized.push('c'),
            'ď' | 'đ' => normalized.push('d'),
            'è' | 'é' | 'ê' | 'ë' | 'ē' | 'ė' | 'ę' | 'ě' => normalized.push('e'),
            'ğ' | 'ĝ' | 'ģ' => normalized.push('g'),
            'ì' | 'í' | 'î' | 'ï' | 'ī' | 'į' => normalized.push('i'),
            'ł' | 'ľ' | 'ĺ' => normalized.push('l'),
            'ñ' | 'ń' | 'ň' => normalized.push('n'),
            'ò' | 'ó' | 'ô' | 'õ' | 'ö' | 'ø' | 'ō' | 'ő' => normalized.push('o'),
            'ŕ' | 'ř' => normalized.push('r'),
            'ś' | 'š' | 'ş' => normalized.push('s'),
            'ť' | 'ţ' => normalized.push('t'),
            'ù' | 'ú' | 'û' | 'ü' | 'ū' | 'ů' | 'ű' | 'ų' => normalized.push('u'),
            'ý' | 'ÿ' => normalized.push('y'),
            'ź' | 'ż' | 'ž' => normalized.push('z'),
            'œ' => normalized.push_str("oe"),
            'æ' => normalized.push_str("ae"),
            'ß' => normalized.push_str("ss"),
            _ => normalized.push(ch),
        }
    }
    normalized
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TempDir(PathBuf);

    impl TempDir {
        fn new() -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|duration| duration.as_nanos())
                .unwrap_or_default();
            let path = env::temp_dir().join(format!(
                "plume-applications-{}-{unique}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("création du dossier temporaire");
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn write_desktop(dir: &Path, name: &str, content: &str) {
        fs::write(dir.join(name), content).expect("écriture du fichier .desktop");
    }

    #[test]
    fn filtre_les_entrees_non_visibles() {
        let tmp = TempDir::new();

        write_desktop(
            tmp.path(),
            "visible.desktop",
            "[Desktop Entry]\nType=Application\nName=Visible\nExec=visible %U\n",
        );
        write_desktop(
            tmp.path(),
            "nodisplay.desktop",
            "[Desktop Entry]\nType=Application\nName=Cachée\nNoDisplay=true\nExec=hidden\n",
        );
        write_desktop(
            tmp.path(),
            "hidden.desktop",
            "[Desktop Entry]\nType=Application\nName=Masquée\nHidden=true\nExec=hidden\n",
        );
        write_desktop(
            tmp.path(),
            "library.desktop",
            "[Desktop Entry]\nType=Library\nName=Bibliothèque\nExec=lib\n",
        );
        write_desktop(
            tmp.path(),
            "kde.desktop",
            "[Desktop Entry]\nType=Application\nName=KDE\nOnlyShowIn=KDE;\nExec=kde\n",
        );
        write_desktop(
            tmp.path(),
            "gnome.desktop",
            "[Desktop Entry]\nType=Application\nName=GNOME\nOnlyShowIn=GNOME;\nExec=gnome\n",
        );
        write_desktop(
            tmp.path(),
            "pasgnome.desktop",
            "[Desktop Entry]\nType=Application\nName=Pas GNOME\nNotShowIn=GNOME;\nExec=autre\n",
        );
        write_desktop(
            tmp.path(),
            "tryexec-absent.desktop",
            "[Desktop Entry]\nType=Application\nName=Absent\nTryExec=/chemin/qui/n-existe-pas\nExec=absent\n",
        );
        write_desktop(
            tmp.path(),
            "tryexec-present.desktop",
            "[Desktop Entry]\nType=Application\nName=Présent\nTryExec=/bin/sh\nExec=present\n",
        );

        let entries = load_visible_entries(&[tmp.path().to_path_buf()], &["GNOME".to_string()]);
        let ids: Vec<&str> = entries.iter().map(|entry| entry.id.as_str()).collect();

        assert!(ids.contains(&"visible.desktop"));
        assert!(ids.contains(&"gnome.desktop"));
        assert!(ids.contains(&"tryexec-present.desktop"));
        assert!(!ids.contains(&"nodisplay.desktop"));
        assert!(!ids.contains(&"hidden.desktop"));
        assert!(!ids.contains(&"library.desktop"));
        assert!(!ids.contains(&"kde.desktop"));
        assert!(!ids.contains(&"pasgnome.desktop"));
        assert!(!ids.contains(&"tryexec-absent.desktop"));
    }

    #[test]
    fn la_source_utilisateur_gagne_sur_le_systeme() {
        let user = TempDir::new();
        let system = TempDir::new();

        write_desktop(
            user.path(),
            "partage.desktop",
            "[Desktop Entry]\nType=Application\nName=Utilisateur\nExec=user\n",
        );
        write_desktop(
            system.path(),
            "partage.desktop",
            "[Desktop Entry]\nType=Application\nName=Système\nExec=system\n",
        );

        let entries = load_visible_entries(
            &[user.path().to_path_buf(), system.path().to_path_buf()],
            &[],
        );

        assert_eq!(entries.len(), 1);
        assert_eq!(
            entries[0].entry.localized("Name").as_deref(),
            Some("Utilisateur")
        );
    }

    #[test]
    fn une_entree_utilisateur_masquee_cache_celle_du_systeme() {
        let user = TempDir::new();
        let system = TempDir::new();

        write_desktop(
            user.path(),
            "partage.desktop",
            "[Desktop Entry]\nType=Application\nName=Masquée\nHidden=true\nExec=user\n",
        );
        write_desktop(
            system.path(),
            "partage.desktop",
            "[Desktop Entry]\nType=Application\nName=Système\nExec=system\n",
        );

        let entries = load_visible_entries(
            &[user.path().to_path_buf(), system.path().to_path_buf()],
            &[],
        );

        assert!(entries.is_empty());
    }

    #[test]
    fn nettoie_les_codes_de_champ_exec() {
        assert_eq!(clean_exec("firefox %U"), "firefox");
        assert_eq!(
            clean_exec("/usr/bin/app --file=%f %i %c %k %F %u"),
            "/usr/bin/app --file="
        );
        assert_eq!(clean_exec("app %%{foo} %U"), "app %{foo}");
        assert_eq!(clean_exec("   "), "");
    }

    #[test]
    fn detecte_lorigine_par_chemin() {
        let no_entry = DesktopEntry::default();
        assert_eq!(
            origin_from_path(
                Path::new("/var/lib/flatpak/exports/share/applications/org.gimp.GIMP.desktop"),
                &no_entry
            ),
            Some(("flatpak".to_string(), "org.gimp.GIMP".to_string()))
        );
        assert_eq!(
            origin_from_path(
                Path::new(
                    "/home/alice/.local/share/flatpak/exports/share/applications/org.mozilla.firefox.desktop"
                ),
                &no_entry
            ),
            Some(("flatpak".to_string(), "org.mozilla.firefox".to_string()))
        );
        assert_eq!(
            origin_from_path(
                Path::new("/var/lib/snapd/desktop/applications/firefox_firefox.desktop"),
                &no_entry
            ),
            Some(("snap".to_string(), "firefox".to_string()))
        );
        assert_eq!(
            origin_from_path(
                Path::new("/usr/share/applications/gedit.desktop"),
                &no_entry
            ),
            None
        );
    }

    #[test]
    fn utilise_le_nom_dinstance_snap_du_fichier_desktop() {
        let entry =
            parse_desktop_entry("[Desktop Entry]\nType=Application\nX-SnapInstanceName=foo_bar\n");
        assert_eq!(
            origin_from_path(
                Path::new("/var/lib/snapd/desktop/applications/foo_bar_app.desktop"),
                &entry
            ),
            Some(("snap".to_string(), "foo_bar".to_string()))
        );

        // Nom d'instance invalide : on retombe sur le préfixe du fichier.
        let invalid =
            parse_desktop_entry("[Desktop Entry]\nType=Application\nX-SnapInstanceName=../evil\n");
        assert_eq!(
            origin_from_path(
                Path::new("/var/lib/snapd/desktop/applications/foo_app.desktop"),
                &invalid
            ),
            Some(("snap".to_string(), "foo".to_string()))
        );
    }

    #[test]
    fn parse_installed_size_en_kio() {
        assert_eq!(parse_installed_size("1234"), Some(1234 * 1024));
        assert_eq!(parse_installed_size(" 42 \n"), Some(42 * 1024));
        assert_eq!(parse_installed_size(""), None);
        assert_eq!(parse_installed_size("inconnue"), None);
    }

    #[test]
    fn parse_les_tailles_humaines_de_flatpak() {
        assert_eq!(parse_human_size("593,5 Mo"), Some(593_500_000));
        assert_eq!(parse_human_size("1.2 GB"), Some(1_200_000_000));
        assert_eq!(parse_human_size("512 Kio"), Some(512 * 1024));
        assert_eq!(parse_human_size(""), None);
        assert_eq!(parse_human_size("inconnue"), None);
    }

    #[test]
    fn rejette_les_noms_de_snap_douteux() {
        assert_eq!(snap_size("../etc", "1"), None);
        assert_eq!(snap_size("firefox", "../../etc/passwd"), None);
        assert_eq!(snap_size("firefox", ""), None);
        assert_eq!(snap_size("", "1"), None);
        assert!(!is_valid_snap_name("../evil"));
        assert!(!is_valid_snap_name("Firefox"));
        assert!(is_valid_snap_name("firefox_esr"));
    }

    #[test]
    fn detecte_la_fin_des_operations_snap() {
        let done = "Identifiant État Descendance Prêt Résumé\n\
                    299 Done hier à 15 h 43 hier à 15 h 49 Supprimer le paquet Snap \"steam\"\n";
        assert!(changes_are_finished(done));

        let in_progress = "ID Status Spawn Ready Summary\n\
                           301 Doing today at 15:43 today at 15:49 Remove snap \"foo\"\n";
        assert!(!changes_are_finished(in_progress));

        assert!(!changes_are_finished(""));
    }
}
