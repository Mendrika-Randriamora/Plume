use serde::Serialize;
use std::{
    collections::HashMap,
    ffi::OsString,
    path::PathBuf,
    process::Command,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use sysinfo::{Pid, ProcessRefreshKind, ProcessStatus, ProcessesToUpdate, Signal, System, Users};

use crate::{modules::updates::exec_root, shared::blocking};

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
            .map_err(|_| "processes_unavailable".to_string())?;

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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessDetails {
    pid: u32,
    parent: Option<u32>,
    name: String,
    exe: String,
    cmd: String,
    cwd: String,
    status: String,
    start_time: u64,
    run_time: u64,
    cpu: f32,
    memory: u64,
    read: u64,
    write: u64,
    user: String,
    user_id: Option<String>,
}

struct RestartCommand {
    program: OsString,
    args: Vec<OsString>,
    cwd: Option<PathBuf>,
    env: Vec<(OsString, OsString)>,
}

/// Un processus système ou Plume lui-même ne doit pas être arrêté depuis la page.
fn is_protected(pid: u32) -> bool {
    pid <= 1 || pid == std::process::id()
}

fn refresh_one(i: &mut Inner, pid: Pid, kind: ProcessRefreshKind) {
    i.sys
        .refresh_processes_specifics(ProcessesToUpdate::Some(&[pid]), true, kind);
}

fn wait_for_exit(i: &mut Inner, pid: Pid, timeout: Duration) -> bool {
    let start = Instant::now();
    while start.elapsed() < timeout {
        refresh_one(i, pid, ProcessRefreshKind::new());
        match i.sys.process(pid) {
            None => return true,
            Some(process)
                if matches!(
                    process.status(),
                    ProcessStatus::Zombie | ProcessStatus::Dead
                ) =>
            {
                return true;
            }
            Some(_) => std::thread::sleep(Duration::from_millis(50)),
        }
    }
    false
}

fn resolve_user(id: Option<&sysinfo::Uid>) -> String {
    let Some(id) = id else {
        return String::new();
    };
    let users = Users::new_with_refreshed_list();
    users
        .list()
        .iter()
        .find(|user| user.id() == id)
        .map(|user| user.name().to_string())
        .unwrap_or_else(|| format!("{id:?}"))
}

/// Détails complets d'un processus (nom, commande, utilisateur, statut…).
#[tauri::command]
pub async fn process_details(
    state: tauri::State<'_, ProcessesState>,
    pid: u32,
) -> Result<ProcessDetails, String> {
    let inner = state.inner.clone();
    blocking(move || {
        let pid = Pid::from_u32(pid);
        let mut i = inner
            .lock()
            .map_err(|_| "processes_unavailable".to_string())?;
        refresh_one(&mut i, pid, ProcessRefreshKind::everything());
        let process = i.sys.process(pid).ok_or("process_not_found")?;
        let io = process.disk_usage();

        Ok(ProcessDetails {
            pid: process.pid().as_u32(),
            parent: process.parent().map(|parent| parent.as_u32()),
            name: process.name().to_string_lossy().into_owned(),
            exe: process
                .exe()
                .map(|path| path.display().to_string())
                .unwrap_or_default(),
            cmd: process
                .cmd()
                .iter()
                .map(|arg| arg.to_string_lossy())
                .collect::<Vec<_>>()
                .join(" "),
            cwd: process
                .cwd()
                .map(|path| path.display().to_string())
                .unwrap_or_default(),
            status: format!("{:?}", process.status()),
            start_time: process.start_time(),
            run_time: process.run_time(),
            cpu: process.cpu_usage(),
            memory: process.memory(),
            read: io.total_read_bytes,
            write: io.total_written_bytes,
            user: resolve_user(process.user_id()),
            user_id: process.user_id().map(|id| format!("{id:?}")),
        })
    })
    .await
}

/// Envoie SIGTERM au processus ; les processus d'un autre utilisateur passent
/// par pkexec pour demander l'autorisation système.
#[tauri::command]
pub async fn stop_process(state: tauri::State<'_, ProcessesState>, pid: u32) -> Result<(), String> {
    let inner = state.inner.clone();
    blocking(move || {
        if is_protected(pid) {
            return Err("protected_process".into());
        }
        let pid = Pid::from_u32(pid);

        let direct = {
            let mut i = inner
                .lock()
                .map_err(|_| "processes_unavailable".to_string())?;
            refresh_one(&mut i, pid, ProcessRefreshKind::new());
            let process = i.sys.process(pid).ok_or("process_not_found")?;
            process.kill_with(Signal::Term)
        };

        match direct {
            Some(true) => Ok(()),
            Some(false) => {
                let pid_arg = pid.as_u32().to_string();
                let out = exec_root(&["kill", "-TERM", &pid_arg])?;
                if out.success {
                    Ok(())
                } else {
                    out.log_failure();
                    Err("permission_denied".into())
                }
            }
            None => Err("unsupported_operation".into()),
        }
    })
    .await
}

/// Arrête le processus puis relance la même commande, avec son répertoire et
/// son environnement d'origine.
#[tauri::command]
pub async fn restart_process(
    state: tauri::State<'_, ProcessesState>,
    pid: u32,
) -> Result<(), String> {
    let inner = state.inner.clone();
    blocking(move || {
        if is_protected(pid) {
            return Err("protected_process".into());
        }
        let pid = Pid::from_u32(pid);

        let command = {
            let mut i = inner
                .lock()
                .map_err(|_| "processes_unavailable".to_string())?;
            refresh_one(&mut i, pid, ProcessRefreshKind::everything());
            let process = i.sys.process(pid).ok_or("process_not_found")?;
            let cmd = process.cmd();
            let program = cmd
                .first()
                .cloned()
                .or_else(|| process.exe().map(|exe| exe.as_os_str().to_owned()))
                .ok_or("restart_unsupported")?;

            let env = process
                .environ()
                .iter()
                .filter_map(|entry| {
                    let text = entry.to_string_lossy();
                    let (key, value) = text.split_once('=')?;
                    Some((OsString::from(key), OsString::from(value)))
                })
                .collect();

            let command = RestartCommand {
                program,
                args: cmd.iter().skip(1).cloned().collect(),
                cwd: process.cwd().map(PathBuf::from),
                env,
            };

            match process.kill_with(Signal::Term) {
                Some(true) => command,
                Some(false) => return Err("permission_denied".into()),
                None => return Err("unsupported_operation".into()),
            }
        };

        {
            let mut i = inner
                .lock()
                .map_err(|_| "processes_unavailable".to_string())?;
            if !wait_for_exit(&mut i, pid, Duration::from_secs(3)) {
                return Err("stop_timeout".into());
            }
        }

        let mut child = Command::new(&command.program);
        child.args(&command.args);
        if let Some(cwd) = command.cwd {
            if cwd.is_dir() {
                child.current_dir(cwd);
            }
        }
        if !command.env.is_empty() {
            child.env_clear();
            child.envs(command.env);
        }
        child.spawn().map_err(|e| {
            eprintln!("Impossible de relancer le processus : {e}");
            "restart_failed".to_string()
        })?;

        Ok(())
    })
    .await
}
