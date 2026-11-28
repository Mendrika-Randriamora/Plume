use serde::Serialize;
use std::time::{Duration, Instant};
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};

use crate::shared::blocking;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
use linux as imp;

#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
use windows as imp;

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
mod unsupported;
#[cfg(not(any(target_os = "linux", target_os = "windows")))]
use unsupported as imp;

/// Une entrée de la table des ports, telle que lue sur la machine.
///
/// `system` vaut vrai lorsque le port est tenu par l'OS, par un processus
/// protégé ou par un processus dont l'appartenance ne peut pas être lue sans
/// élévation de droits. Ces entrées ne sont jamais arrêtables depuis Plume.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortEntry {
    pub port: u16,
    pub protocol: String,
    pub address: String,
    pub remote: String,
    pub state: String,
    pub listening: bool,
    pub pid: Option<u32>,
    pub process: Option<String>,
    pub system: bool,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum StopStatus {
    Stopped,
    PermissionDenied,
    Protected,
    NotFound,
    Timeout,
    Unsupported,
    ElevationCancelled,
    ElevationUnavailable,
    Failed,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StopOutcome {
    pub status: StopStatus,
}

/// Attend la disparition du processus après l'envoi du signal d'arrêt.
fn wait_exit(pid: u32) -> bool {
    let pid = Pid::from_u32(pid);
    let mut sys = System::new();
    let start = Instant::now();

    while start.elapsed() < Duration::from_secs(3) {
        sys.refresh_processes_specifics(
            ProcessesToUpdate::Some(&[pid]),
            true,
            ProcessRefreshKind::new(),
        );

        match sys.process(pid) {
            None => return true,
            Some(process)
                if matches!(
                    process.status(),
                    sysinfo::ProcessStatus::Zombie | sysinfo::ProcessStatus::Dead
                ) =>
            {
                return true;
            }
            Some(_) => std::thread::sleep(Duration::from_millis(50)),
        }
    }

    false
}

/// Vérifie que le PID possède réellement un port et qu'il n'est pas protégé.
///
/// Le résultat imbriqué distingue une erreur de lecture (extérieure) d'un refus
/// métier (intérieure) : le frontend peut ainsi proposer l'élévation seulement
/// quand les droits manquent.
fn verify_owner(pid: u32) -> Result<Result<(), StopStatus>, String> {
    if pid <= 1 || pid == std::process::id() {
        return Ok(Err(StopStatus::Protected));
    }

    let entries = imp::scan(true)?;
    let mut owned = false;

    for entry in &entries {
        if entry.pid == Some(pid) {
            owned = true;
            if entry.system {
                return Ok(Err(StopStatus::Protected));
            }
        }
    }

    Ok(if owned {
        Ok(())
    } else {
        Err(StopStatus::NotFound)
    })
}

/// Liste les ports TCP/UDP de la machine.
#[tauri::command]
pub async fn list_ports(include_outgoing: bool) -> Result<Vec<PortEntry>, String> {
    blocking(move || imp::scan(include_outgoing)).await
}

/// Arrête le processus qui possède un port.
///
/// `elevate` n'est jamais activé automatiquement : il correspond à un clic
/// explicite sur le bouton d'élévation après un refus de droits.
#[tauri::command]
pub async fn stop_port_process(pid: u32, elevate: bool) -> Result<StopOutcome, String> {
    blocking(move || match verify_owner(pid)? {
        Ok(()) => imp::terminate(pid, elevate).map(|status| StopOutcome { status }),
        Err(status) => Ok(StopOutcome { status }),
    })
    .await
}

/// Ouvre la page du projet Porter dans le navigateur externe.
#[tauri::command]
pub async fn open_porter_credit() -> Result<(), String> {
    blocking(imp::open_credit).await
}
