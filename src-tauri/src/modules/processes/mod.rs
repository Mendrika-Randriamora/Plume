use serde::Serialize;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::Instant,
};
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System};

use crate::shared::blocking;

/// État partagé : sysinfo calcule l'utilisation CPU par différence entre deux
/// relevés, et les octets disque sont cumulés depuis le lancement du processus.
pub struct ProcessesState {
    inner: Arc<Mutex<Inner>>,
}

struct Inner {
    sys: System,
    last: Instant,
    /// Total lu/écrit par PID au relevé précédent.
    io: HashMap<u32, (u64, u64)>,
}

impl Default for ProcessesState {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(Inner {
                sys: System::new(),
                last: Instant::now(),
                io: HashMap::new(),
            })),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessInfo {
    pid: u32,
    name: String,
    /// Utilisation CPU en pourcentage d'un cœur.
    cpu: f32,
    memory: u64,
    /// Octets lus / écrits par seconde depuis le dernier relevé.
    read: u64,
    write: u64,
}

/// Liste des processus en cours, triée par mémoire décroissante.
#[tauri::command]
pub async fn list_processes(
    state: tauri::State<'_, ProcessesState>,
) -> Result<Vec<ProcessInfo>, String> {
    let inner = state.inner.clone();
    blocking(move || {
        let mut i = inner
            .lock()
            .map_err(|_| "Impossible de lire la liste des processus".to_string())?;

        i.sys.refresh_processes_specifics(
            ProcessesToUpdate::All,
            true,
            ProcessRefreshKind::new()
                .with_cpu()
                .with_memory()
                .with_disk_usage(),
        );

        let now = Instant::now();
        let elapsed = now.saturating_duration_since(i.last).as_secs_f64();
        i.last = now;

        // Un intervalle trop court (double appel) ou trop long (page restée
        // fermée) donnerait un débit faux.
        let valid = (0.2..=5.0).contains(&elapsed);
        let per_second = |bytes: u64| -> u64 {
            if valid {
                (bytes as f64 / elapsed) as u64
            } else {
                0
            }
        };

        let mut out: Vec<ProcessInfo> = Vec::with_capacity(i.sys.processes().len());
        let mut seen: HashMap<u32, (u64, u64)> = HashMap::new();

        for p in i.sys.processes().values() {
            if p.thread_kind().is_some() {
                continue; // ignorer les threads (Linux)
            }
            let pid = p.pid().as_u32();
            let io = p.disk_usage();
            let totals = (io.total_read_bytes, io.total_written_bytes);
            // Nouveau processus : pas de relevé précédent, donc pas de débit.
            let (read, write) = match i.io.get(&pid) {
                Some(prev) => (
                    per_second(totals.0.saturating_sub(prev.0)),
                    per_second(totals.1.saturating_sub(prev.1)),
                ),
                None => (0, 0),
            };
            seen.insert(pid, totals);

            out.push(ProcessInfo {
                pid,
                name: p.name().to_string_lossy().into_owned(),
                cpu: p.cpu_usage(),
                memory: p.memory(),
                read,
                write,
            });
        }
        i.io = seen;

        out.sort_by_key(|p| std::cmp::Reverse(p.memory));
        Ok(out)
    })
    .await
}
