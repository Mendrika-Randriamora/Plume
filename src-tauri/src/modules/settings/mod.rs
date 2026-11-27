use serde::Serialize;
use std::collections::HashMap;
#[cfg(target_os = "linux")]
use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};
use sysinfo::{Disks, System};

use crate::shared::blocking;

// Logos SVG embarqués, découverts au build dans `logos/` (voir `build.rs`).
include!(concat!(env!("OUT_DIR"), "/logos.rs"));

/// Informations « À propos » de la machine, affichées en tête des réglages.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    model: String,
    memory: u64,
    processor: String,
    cores: usize,
    gpus: Vec<String>,
    disk_total: u64,
    firmware: Option<String>,
    os_name: String,
    os_bits: Option<u32>,
    gnome_version: Option<String>,
    session: Option<String>,
    kernel: Option<String>,
    /// Logo de la distribution : source SVG, ou URL `data:` pour un PNG.
    logo: Option<String>,
}

#[tauri::command]
pub async fn system_info() -> Result<SystemInfo, String> {
    blocking(gather).await
}

fn gather() -> Result<SystemInfo, String> {
    let mut sys = System::new();
    sys.refresh_memory();
    sys.refresh_cpu_all();

    let cpus = sys.cpus();
    let processor = cpus
        .first()
        .map(|cpu| clean_cpu_brand(cpu.brand()))
        .filter(|brand| !brand.is_empty())
        .unwrap_or_else(|| "—".to_string());
    let cores = cpus.len();

    let os = os_release();

    Ok(SystemInfo {
        model: model(),
        memory: sys.total_memory(),
        processor,
        cores,
        gpus: gpus(),
        disk_total: disk_total(),
        firmware: firmware(),
        os_name: os_name(&os),
        os_bits: os_bits(),
        gnome_version: gnome_version(),
        session: session_type(),
        kernel: kernel(),
        logo: logo(&os),
    })
}

/// « Intel(R) Core(TM) i5-7300HQ CPU @ 2.50GHz » → « Intel® Core™ i5-7300HQ ».
fn clean_cpu_brand(brand: &str) -> String {
    let mut cleaned = brand.replace("(R)", "®").replace("(TM)", "™");
    if let Some(index) = cleaned.find(" CPU @") {
        cleaned.truncate(index);
    }
    cleaned.trim().to_string()
}

#[cfg(target_os = "linux")]
fn read_sys(path: &str) -> Option<String> {
    fs::read_to_string(path)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty() && value != "None")
}

/// Certains firmwares renvoient des libellés génériques : on les ignore.
#[cfg(target_os = "linux")]
fn meaningful(value: &str) -> bool {
    !matches!(
        value,
        "System Product Name" | "To Be Filled By O.E.M." | "Default string" | "Not Specified"
    )
}

fn model() -> String {
    #[cfg(target_os = "linux")]
    {
        let vendor = read_sys("/sys/class/dmi/id/sys_vendor").filter(|value| meaningful(value));
        let product = read_sys("/sys/class/dmi/id/product_name").filter(|value| meaningful(value));
        match (vendor, product) {
            (Some(vendor), Some(product)) => return format!("{vendor} {product}"),
            (None, Some(product)) => return product,
            (Some(vendor), None) => return vendor,
            (None, None) => {}
        }
    }
    System::host_name().unwrap_or_else(|| "—".to_string())
}

fn firmware() -> Option<String> {
    #[cfg(target_os = "linux")]
    {
        read_sys("/sys/class/dmi/id/bios_version")
    }
    #[cfg(not(target_os = "linux"))]
    {
        None
    }
}

fn gpus() -> Vec<String> {
    #[cfg(target_os = "linux")]
    {
        let Ok(output) = Command::new("lspci").arg("-mm").output() else {
            return Vec::new();
        };
        let text = String::from_utf8_lossy(&output.stdout);
        let mut found: Vec<String> = Vec::new();
        for line in text.lines() {
            // Champs non vides séparés par des guillemets : emplacement,
            // classe, fabricant, modèle.
            let fields: Vec<&str> = line
                .split('"')
                .map(str::trim)
                .filter(|field| !field.is_empty())
                .collect();
            let (Some(class), Some(vendor), Some(device)) =
                (fields.get(1), fields.get(2), fields.get(3))
            else {
                continue;
            };
            let is_gpu = class.contains("VGA compatible")
                || class.contains("3D controller")
                || class.contains("Display controller");
            if !is_gpu {
                continue;
            }
            let name = device_name(vendor, device);
            if !name.is_empty() && !found.contains(&name) {
                found.push(name);
            }
        }
        found
    }
    #[cfg(not(target_os = "linux"))]
    {
        Vec::new()
    }
}

#[cfg(target_os = "linux")]
fn device_name(vendor: &str, device: &str) -> String {
    let vendor = if vendor.contains("NVIDIA") {
        "NVIDIA"
    } else if vendor.contains("Intel") {
        "Intel"
    } else if vendor.contains("AMD") || vendor.contains("Advanced Micro Devices") {
        "AMD"
    } else {
        vendor.trim()
    };

    // « Kaby Lake-H GT2 [HD Graphics 630] » → « HD Graphics 630 ».
    let model = match (device.find('['), device.rfind(']')) {
        (Some(start), Some(end)) if end > start + 1 => &device[start + 1..end],
        _ => device,
    };

    format!("{vendor} {}", model.trim()).trim().to_string()
}

fn disk_total() -> u64 {
    #[cfg(target_os = "linux")]
    {
        if let Ok(entries) = fs::read_dir("/sys/block") {
            let mut total = 0u64;
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().into_owned();
                // Uniquement les disques physiques : boucles snap, dm et
                // périphériques virtuels fausseraient la capacité totale.
                let physical = name.starts_with("sd")
                    || name.starts_with("hd")
                    || name.starts_with("vd")
                    || name.starts_with("nvme")
                    || name.starts_with("mmcblk");
                if !physical {
                    continue;
                }
                let removable = fs::read_to_string(entry.path().join("removable"))
                    .map(|value| value.trim() == "1")
                    .unwrap_or(false);
                if removable {
                    continue;
                }
                if let Ok(size) = fs::read_to_string(entry.path().join("size")) {
                    if let Ok(sectors) = size.trim().parse::<u64>() {
                        total = total.saturating_add(sectors.saturating_mul(512));
                    }
                }
            }
            if total > 0 {
                return total;
            }
        }
    }
    disks_fallback()
}

fn disks_fallback() -> u64 {
    let disks = Disks::new_with_refreshed_list();
    let mut seen: Vec<String> = Vec::new();
    let mut total = 0u64;
    for disk in disks.iter() {
        let name = disk.name().to_string_lossy().into_owned();
        if name.is_empty() || seen.contains(&name) {
            continue;
        }
        seen.push(name);
        total = total.saturating_add(disk.total_space());
    }
    total
}

fn os_release() -> HashMap<String, String> {
    #[cfg(target_os = "linux")]
    {
        let text = fs::read_to_string("/etc/os-release")
            .or_else(|_| fs::read_to_string("/usr/lib/os-release"));
        if let Ok(text) = text {
            return text
                .lines()
                .filter_map(|line| {
                    let (key, value) = line.split_once('=')?;
                    Some((
                        key.trim().to_string(),
                        value
                            .trim()
                            .trim_matches('"')
                            .trim_matches('\'')
                            .to_string(),
                    ))
                })
                .collect();
        }
    }
    HashMap::new()
}

fn os_name(os: &HashMap<String, String>) -> String {
    os.get("PRETTY_NAME")
        .cloned()
        .or_else(System::long_os_version)
        .or_else(System::name)
        .unwrap_or_else(|| "—".to_string())
}

fn os_bits() -> Option<u32> {
    let arch = System::cpu_arch()?;
    Some(if arch.contains("64") {
        64
    } else if arch.contains("x86") || arch.contains("i686") || arch.contains("arm") {
        32
    } else {
        64
    })
}

fn gnome_version() -> Option<String> {
    #[cfg(target_os = "linux")]
    {
        let output = Command::new("gnome-shell").arg("--version").output().ok()?;
        if !output.status.success() {
            return None;
        }
        let text = String::from_utf8_lossy(&output.stdout);
        let version = text.split_whitespace().last()?; // « GNOME Shell 50.1 »
        version.split('.').next().map(str::to_string)
    }
    #[cfg(not(target_os = "linux"))]
    {
        None
    }
}

fn session_type() -> Option<String> {
    let raw = std::env::var("XDG_SESSION_TYPE").ok().or_else(|| {
        if std::env::var_os("WAYLAND_DISPLAY").is_some() {
            Some("wayland".to_string())
        } else if std::env::var_os("DISPLAY").is_some() {
            Some("x11".to_string())
        } else {
            None
        }
    })?;

    match raw.trim().to_lowercase().as_str() {
        "wayland" => Some("wayland".to_string()),
        "x11" => Some("x11".to_string()),
        _ => None,
    }
}

fn kernel() -> Option<String> {
    let version = System::kernel_version()?;
    #[cfg(target_os = "linux")]
    {
        Some(format!("Linux {version}"))
    }
    #[cfg(not(target_os = "linux"))]
    {
        Some(version)
    }
}

fn logo(os: &HashMap<String, String>) -> Option<String> {
    #[cfg(target_os = "linux")]
    {
        let names = local_logo_names(os);

        // 1. SVG local : logo officiel de la distribution, déjà vectoriel.
        if let Some(svg) = local_logo(&names, &["-symbolic.svg", ".svg", "-icon.svg"]) {
            return Some(svg);
        }
        // 2. SVG embarqué : indispensable quand la distribution ne fournit
        // qu'un raster basse résolution (Debian et son PNG 48×48).
        if let Some(svg) = bundled_linux_logo(os) {
            return Some(svg.to_string());
        }
        // 3. Raster local : dernier recours avant l'icône générique.
        if let Some(png) = local_logo(&names, &["-symbolic.png", ".png", "-icon.png"]) {
            return Some(png);
        }
        // 4. Logo générique livré avec l'application.
        bundled_logo("linux/linux").map(str::to_string)
    }
    #[cfg(target_os = "windows")]
    {
        let _ = os;
        bundled_windows_logo().map(str::to_string)
    }
    #[cfg(target_os = "macos")]
    {
        let _ = os;
        bundled_macos_logo().map(str::to_string)
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    {
        let _ = os;
        None
    }
}

/// Noms de fichiers à chercher dans les thèmes d'icônes locaux.
///
/// `LOGO=` d'`os-release` vient en premier (choix explicite de la
/// distribution), puis la convention Papirus `distributor-logo-<ID>`, puis le
/// nom générique des thèmes GNOME.
#[cfg(target_os = "linux")]
fn local_logo_names(os: &HashMap<String, String>) -> Vec<String> {
    let mut names: Vec<String> = Vec::new();

    if let Some(logo) = os.get("LOGO") {
        push_name(&mut names, logo);
    }
    if let Some(id) = os.get("ID") {
        push_name(&mut names, &format!("distributor-logo-{id}"));
    }
    if let Some(like) = os.get("ID_LIKE") {
        for id in like.split_whitespace() {
            push_name(&mut names, &format!("distributor-logo-{id}"));
        }
    }
    push_name(&mut names, "distributor-logo");
    names
}

#[cfg(target_os = "linux")]
fn push_name(names: &mut Vec<String>, name: &str) {
    let name = name.trim();
    if !name.is_empty() && !names.iter().any(|known| known == name) {
        names.push(name.to_string());
    }
}

/// Dossiers d'icônes candidats, du plus grand au plus petit : un 256×256 doit
/// primer sur un 48×48, quel que soit le thème qui le fournit.
#[cfg(target_os = "linux")]
fn icon_dirs() -> Vec<PathBuf> {
    let mut themes: Vec<PathBuf> = Vec::new();
    for root in ["/usr/share/icons", "/usr/local/share/icons"] {
        let Ok(entries) = fs::read_dir(root) else {
            continue;
        };
        themes.extend(entries.flatten().map(|entry| entry.path()));
    }
    themes.sort();

    let mut dirs: Vec<PathBuf> = Vec::new();
    for size in ["scalable", "256x256", "128x128", "64x64", "48x48"] {
        for theme in &themes {
            dirs.push(theme.join(size).join("places"));
            dirs.push(theme.join(size).join("apps"));
        }
    }
    // Les pixmaps ne contiennent souvent qu'un petit PNG : en dernier.
    dirs.push(PathBuf::from("/usr/share/pixmaps"));
    dirs
}

#[cfg(target_os = "linux")]
fn local_logo(names: &[String], suffixes: &[&str]) -> Option<String> {
    let dirs = icon_dirs();
    for suffix in suffixes {
        for dir in &dirs {
            for name in names {
                let path = dir.join(format!("{name}{suffix}"));
                if let Some(data) = logo_data(&path) {
                    return Some(data);
                }
            }
        }
    }
    None
}

/// Logo embarqué de la distribution : `ID` puis chaque entrée d'`ID_LIKE`.
#[cfg(target_os = "linux")]
fn bundled_linux_logo(os: &HashMap<String, String>) -> Option<&'static str> {
    let mut keys: Vec<&str> = Vec::new();
    if let Some(id) = os.get("ID") {
        keys.push(id);
    }
    if let Some(like) = os.get("ID_LIKE") {
        keys.extend(like.split_whitespace());
    }
    keys.into_iter()
        .find_map(|id| bundled_logo(&format!("linux/{id}")))
}

/// Windows 11 partage la version 10.0 avec Windows 10 : seul le numéro de
/// build (≥ 22000) les distingue.
#[cfg(target_os = "windows")]
fn bundled_windows_logo() -> Option<&'static str> {
    let version = System::os_version().unwrap_or_default();
    let build = version
        .split('.')
        .nth(2)
        .and_then(|value| value.parse::<u32>().ok());
    let key = match build {
        Some(build) if build >= 22000 => "windows/windows-11",
        _ => "windows/windows-10",
    };
    bundled_logo(key).or_else(|| bundled_logo("windows/windows"))
}

#[cfg(target_os = "macos")]
fn bundled_macos_logo() -> Option<&'static str> {
    bundled_logo("macos/macos")
}

#[cfg(target_os = "linux")]
fn logo_data(path: &Path) -> Option<String> {
    let bytes = fs::read(path).ok()?;
    if path
        .extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("svg"))
    {
        return String::from_utf8(bytes).ok();
    }
    Some(format!("data:image/png;base64,{}", base64(&bytes)))
}

/// Encodage base64 minimal : évite une dépendance pour un simple PNG.
#[cfg(target_os = "linux")]
fn base64(data: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for chunk in data.chunks(3) {
        let a = chunk[0] as u32;
        let b = chunk.get(1).copied().unwrap_or(0) as u32;
        let c = chunk.get(2).copied().unwrap_or(0) as u32;
        let n = (a << 16) | (b << 8) | c;
        out.push(TABLE[((n >> 18) & 63) as usize] as char);
        out.push(TABLE[((n >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 {
            TABLE[((n >> 6) & 63) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            TABLE[(n & 63) as usize] as char
        } else {
            '='
        });
    }
    out
}
