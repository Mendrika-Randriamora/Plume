use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use sysinfo::{Networks, System};

use crate::shared::blocking;
#[cfg(target_os = "linux")]
use crate::shared::fsutil;

// ---------------------------------------------------------------------------
// État partagé
// ---------------------------------------------------------------------------

/// sysinfo ne calcule les débits qu'en comparant deux relevés : on conserve
/// donc un état commun entre les appels de la page Ressources.
pub struct ResourcesState {
    inner: Arc<Mutex<Inner>>,
}

struct Inner {
    sys: System,
    networks: Networks,
    last_net: Instant,
    /// Appareil bloc qui contient le dossier personnel (Linux uniquement).
    device: Option<String>,
    last_io: Instant,
    io_read: u64,
    io_write: u64,
}

impl Default for ResourcesState {
    fn default() -> Self {
        let mut sys = System::new();
        sys.refresh_memory();
        sys.refresh_cpu_usage();

        let mut networks = Networks::new_with_refreshed_list();
        networks.refresh();

        let device = home_device();
        let (io_read, io_write) = block_io(device.as_deref()).unwrap_or((0, 0));

        Self {
            inner: Arc::new(Mutex::new(Inner {
                sys,
                networks,
                last_net: Instant::now(),
                device,
                last_io: Instant::now(),
                io_read,
                io_write,
            })),
        }
    }
}

// ---------------------------------------------------------------------------
// Relevé
// ---------------------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceSnapshot {
    cpu_cores: Vec<f32>,
    cpu_global: f32,
    ram_used: u64,
    ram_total: u64,
    swap_used: u64,
    swap_total: u64,
    net_rx: u64,
    net_tx: u64,
    net_rx_total: u64,
    net_tx_total: u64,
    disk_read: u64,
    disk_write: u64,
    disk_read_total: u64,
    disk_write_total: u64,
}

/// Débit en octets par seconde entre deux relevés. Un intervalle trop court
/// (double appel) ou trop long (page restée fermée) est ignoré pour ne pas
/// fausser la courbe.
fn rate(elapsed: f64, current: u64, previous: u64) -> u64 {
    if !(0.2..=5.0).contains(&elapsed) {
        return 0;
    }
    ((current.saturating_sub(previous)) as f64 / elapsed) as u64
}

/// Photographie de l'activité du processeur, de la mémoire, du réseau et du disque.
#[tauri::command]
pub async fn resource_snapshot(
    state: tauri::State<'_, ResourcesState>,
) -> Result<ResourceSnapshot, String> {
    let inner = state.inner.clone();
    blocking(move || {
        let mut i = inner
            .lock()
            .map_err(|_| "resources_unavailable".to_string())?;

        i.sys.refresh_memory();
        i.sys.refresh_cpu_usage();
        let cpu_cores: Vec<f32> = i.sys.cpus().iter().map(|c| c.cpu_usage()).collect();

        // Réseau : somme de toutes les interfaces sauf la boucle locale.
        i.networks.refresh();
        let (mut rx, mut tx, mut rx_total, mut tx_total) = (0u64, 0u64, 0u64, 0u64);
        for (name, data) in i.networks.list() {
            if name == "lo" {
                continue;
            }
            rx += data.received();
            tx += data.transmitted();
            rx_total += data.total_received();
            tx_total += data.total_transmitted();
        }
        let now = Instant::now();
        let elapsed = now.saturating_duration_since(i.last_net).as_secs_f64();
        i.last_net = now;
        let net_rx = rate(elapsed, rx, 0);
        let net_tx = rate(elapsed, tx, 0);

        // Disque : compteurs du noyau pour l'appareil qui porte le dossier personnel.
        if i.device.is_none() {
            i.device = home_device();
        }
        let (read_total, write_total) = block_io(i.device.as_deref()).unwrap_or((0, 0));
        let now = Instant::now();
        let elapsed = now.saturating_duration_since(i.last_io).as_secs_f64();
        i.last_io = now;
        let disk_read = rate(elapsed, read_total, i.io_read);
        let disk_write = rate(elapsed, write_total, i.io_write);
        i.io_read = read_total;
        i.io_write = write_total;

        Ok(ResourceSnapshot {
            cpu_global: i.sys.global_cpu_usage(),
            cpu_cores,
            ram_used: i.sys.used_memory(),
            ram_total: i.sys.total_memory(),
            swap_used: i.sys.used_swap(),
            swap_total: i.sys.total_swap(),
            net_rx,
            net_tx,
            net_rx_total: rx_total,
            net_tx_total: tx_total,
            disk_read,
            disk_write,
            disk_read_total: read_total,
            disk_write_total: write_total,
        })
    })
    .await
}

// ---------------------------------------------------------------------------
// Disque (Linux)
// ---------------------------------------------------------------------------

/// Nom de l'appareil bloc (ex. `nvme0n1p2`) sur lequel est monté le dossier
/// personnel, trouvé en prenant le point de montage le plus spécifique.
#[cfg(target_os = "linux")]
fn home_device() -> Option<String> {
    let home = fsutil::home();
    let mounts = std::fs::read_to_string("/proc/mounts").ok()?;

    let mut best: Option<(usize, String)> = None;
    for line in mounts.lines() {
        let mut parts = line.split_whitespace();
        let Some(source) = parts.next() else {
            continue;
        };
        let Some(mount) = parts.next() else {
            continue;
        };
        if !source.starts_with("/dev/") {
            continue;
        }
        let mount = unescape(mount);
        if !home.starts_with(&mount) {
            continue;
        }
        if best.as_ref().is_none_or(|(len, _)| mount.len() > *len) {
            best = Some((mount.len(), source.to_string()));
        }
    }

    let (_, source) = best?;
    let path = std::fs::canonicalize(&source).unwrap_or_else(|_| source.into());
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
}

#[cfg(not(target_os = "linux"))]
fn home_device() -> Option<String> {
    None
}

/// Octets lus et écrits depuis le démarrage, d'après `/sys/class/block`.
#[cfg(target_os = "linux")]
fn block_io(device: Option<&str>) -> Option<(u64, u64)> {
    let stat = std::fs::read_to_string(format!("/sys/class/block/{}/stat", device?)).ok()?;
    let fields: Vec<&str> = stat.split_whitespace().collect();
    // Les colonnes 3 et 7 sont des secteurs de 512 octets.
    let read: u64 = fields.get(2)?.parse().ok()?;
    let written: u64 = fields.get(6)?.parse().ok()?;
    Some((read * 512, written * 512))
}

#[cfg(not(target_os = "linux"))]
fn block_io(_device: Option<&str>) -> Option<(u64, u64)> {
    None
}

/// `/proc/mounts` échappe les espaces et autres caractères spéciaux en octal.
#[cfg(target_os = "linux")]
fn unescape(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'\\'
            && i + 3 < bytes.len()
            && bytes[i + 1..i + 4].iter().all(|b| b.is_ascii_digit())
        {
            if let Ok(code) = u8::from_str_radix(&s[i + 1..i + 4], 8) {
                out.push(code);
                i += 4;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}
