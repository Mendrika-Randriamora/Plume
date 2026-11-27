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
        let mut names: Vec<String> = Vec::new();
        if let Some(name) = os.get("LOGO").filter(|name| !name.is_empty()) {
            names.push(name.clone());
        }
        names.push("distributor-logo".to_string());

        let mut dirs: Vec<PathBuf> = vec![PathBuf::from("/usr/share/pixmaps")];
        for root in ["/usr/share/icons", "/usr/local/share/icons"] {
            let Ok(themes) = fs::read_dir(root) else {
                continue;
            };
            for theme in themes.flatten() {
                for size in ["scalable", "256x256", "128x128", "64x64", "48x48"] {
                    dirs.push(theme.path().join(size).join("places"));
                    dirs.push(theme.path().join(size).join("apps"));
                }
            }
        }

        // Le symbolique d'abord : une forme simple se prête bien au masque
        // monochrome appliqué côté interface.
        for suffix in [
            "-symbolic.svg",
            ".svg",
            "-icon.svg",
            "-symbolic.png",
            ".png",
            "-icon.png",
        ] {
            for dir in &dirs {
                for name in &names {
                    let path = dir.join(format!("{name}{suffix}"));
                    if let Some(data) = logo_data(&path) {
                        return Some(data);
                    }
                }
            }
        }
        None
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = os;
        None
    }
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
