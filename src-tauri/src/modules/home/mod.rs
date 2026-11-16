use serde::Serialize;
use std::{collections::HashMap, process::Command};
use sysinfo::{Components, Disks, ProcessesToUpdate, System};

use crate::shared::{blocking, fsutil, scanner, scanner::Entry};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Temps {
    cpu: Option<f32>,
    gpu: Option<f32>,
    ram: Option<f32>,
}

#[derive(Serialize, Debug)]
pub struct App {
    name: String,
    memory: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStats {
    ram_total: f64,
    ram_used: f64,
    disk_total: u64,
    disk_free: u64,
    temps: Temps,
    top_apps: Vec<App>,
}

fn avg(v: Vec<f32>) -> Option<f32> {
    let v: Vec<f32> = v
        .into_iter()
        .filter(|t| t.is_finite() && *t > 0.0 && *t < 125.0)
        .collect();
    if v.is_empty() {
        None
    } else {
        Some(v.iter().sum::<f32>() / v.len() as f32)
    }
}

fn gpu_from_nvidia_smi() -> Option<f32> {
    let mut cmd = Command::new("nvidia-smi");
    cmd.args(["--query-gpu=temperature.gpu", "--format=csv,noheader"]);

    // Windows : évite qu'une fenêtre de console ne clignote à chaque appel
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }

    let out = cmd.output().ok()?;
    let txt = String::from_utf8_lossy(&out.stdout);
    let vals: Vec<f32> = txt.lines().filter_map(|l| l.trim().parse().ok()).collect();
    avg(vals)
}

fn bytes_to_go(bytes: u64) -> f64 {
    let go_converter = 1024_i32.pow(3);
    (bytes as f64) / (go_converter as f64)
}

// ---------------------------------------------------------------------------
// Mémoire "réelle" d'un processus, sans compter plusieurs fois les pages
// partagées. Renvoie None si la mesure est impossible (processus protégé,
// appartenant à un autre utilisateur...) : l'appelant retombe alors sur la RSS.
// ---------------------------------------------------------------------------

/// Linux : PSS (Proportional Set Size), lue dans /proc/<pid>/smaps_rollup.
#[cfg(target_os = "linux")]
fn real_memory(pid: u32) -> Option<u64> {
    let s = std::fs::read_to_string(format!("/proc/{pid}/smaps_rollup")).ok()?;
    let kb: u64 = s
        .lines()
        .find(|l| l.starts_with("Pss:"))?
        .split_whitespace()
        .nth(1)?
        .parse()
        .ok()?;
    Some(kb * 1024)
}

/// Windows : private working set (la colonne « Mémoire » du Gestionnaire des tâches).
#[cfg(target_os = "windows")]
fn real_memory(pid: u32) -> Option<u64> {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::ProcessStatus::{
        GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS, PROCESS_MEMORY_COUNTERS_EX2,
    };
    use windows::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};

    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let mut counters = PROCESS_MEMORY_COUNTERS_EX2::default();
        let size = std::mem::size_of::<PROCESS_MEMORY_COUNTERS_EX2>() as u32;
        counters.cb = size;
        let ok = GetProcessMemoryInfo(
            handle,
            &mut counters as *mut _ as *mut PROCESS_MEMORY_COUNTERS,
            size,
        )
        .is_ok();
        let _ = CloseHandle(handle);
        ok.then_some(counters.PrivateWorkingSetSize as u64)
    }
}

/// macOS : physical footprint (la colonne « Mémoire » du Moniteur d'activité).
#[cfg(target_os = "macos")]
#[repr(C)]
#[derive(Default)]
struct RusageInfoV2 {
    ri_uuid: [u8; 16],
    ri_user_time: u64,
    ri_system_time: u64,
    ri_pkg_idle_wkups: u64,
    ri_interrupt_wkups: u64,
    ri_pageins: u64,
    ri_wired_size: u64,
    ri_resident_size: u64,
    ri_phys_footprint: u64,
    ri_proc_start_abstime: u64,
    ri_proc_exit_abstime: u64,
    ri_child_user_time: u64,
    ri_child_system_time: u64,
    ri_child_pkg_idle_wkups: u64,
    ri_child_interrupt_wkups: u64,
    ri_child_pageins: u64,
    ri_child_elapsed_abstime: u64,
    ri_diskio_bytesread: u64,
    ri_diskio_byteswritten: u64,
}

#[cfg(target_os = "macos")]
unsafe extern "C" {
    fn proc_pid_rusage(pid: i32, flavor: i32, buffer: *mut std::ffi::c_void) -> i32;
}

#[cfg(target_os = "macos")]
fn real_memory(pid: u32) -> Option<u64> {
    const RUSAGE_INFO_V2: i32 = 2;
    let mut info = RusageInfoV2::default();
    let r = unsafe { proc_pid_rusage(pid as i32, RUSAGE_INFO_V2, &mut info as *mut _ as *mut _) };
    (r == 0).then_some(info.ri_phys_footprint)
}

/// Autres systèmes : pas de mesure spécifique.
#[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
fn real_memory(_pid: u32) -> Option<u64> {
    None
}

#[tauri::command]
pub async fn system_stats() -> Result<SystemStats, String> {
    blocking(|| {
        let mut sys = System::new();
        sys.refresh_memory();
        sys.refresh_processes(ProcessesToUpdate::All, true);

        // Mémoire par application (les processus du même nom sont regroupés)
        let mut by_name: HashMap<String, u64> = HashMap::new();
        for p in sys.processes().values() {
            if p.thread_kind().is_some() {
                continue; // ignorer les threads (Linux)
            }
            // Mesure réelle si disponible, sinon RSS / working set en secours
            let mem = real_memory(p.pid().as_u32()).unwrap_or_else(|| p.memory());
            *by_name
                .entry(p.name().to_string_lossy().into_owned())
                .or_insert(0) += mem;
        }

        let mut top_apps: Vec<App> = by_name
            .into_iter()
            .map(|(name, memory)| App { name, memory })
            .collect();

        top_apps.sort_by_key(|a| std::cmp::Reverse(a.memory));
        top_apps.truncate(5);

        // Températures
        let comps = Components::new_with_refreshed_list();
        let (mut cpu, mut gpu, mut ram) = (vec![], vec![], vec![]);
        for c in comps.iter() {
            let l = c.label().to_lowercase();
            let t = c.temperature();
            if ["amdgpu", "nouveau", "nvidia", "gpu"]
                .iter()
                .any(|k| l.contains(k))
            {
                gpu.push(t);
            } else if ["spd", "jc42", "dimm", "ram"].iter().any(|k| l.contains(k)) {
                ram.push(t);
            } else if [
                "cpu", "core", "package", "tctl", "tdie", "k10temp", "coretemp",
            ]
            .iter()
            .any(|k| l.contains(k))
            {
                cpu.push(t);
            }
        }
        let gpu = avg(gpu).or_else(gpu_from_nvidia_smi);

        // Disque qui contient le dossier personnel
        let home = fsutil::home();
        let disks = Disks::new_with_refreshed_list();
        let disk = disks
            .iter()
            .filter(|d| home.starts_with(d.mount_point()))
            .max_by_key(|d| d.mount_point().as_os_str().len());
        let (disk_total, disk_free) = disk
            .map(|d| (d.total_space(), d.available_space()))
            .unwrap_or((0, 0));

        Ok(SystemStats {
            ram_total: bytes_to_go(sys.total_memory()),
            ram_used: bytes_to_go(sys.used_memory()),
            disk_total,
            disk_free,
            temps: Temps {
                cpu: avg(cpu),
                gpu,
                ram: avg(ram),
            },
            top_apps,
        })
    })
    .await
}

#[derive(Serialize)]
pub struct Highlights {
    heavy: Vec<Entry>,
    unused: Vec<Entry>,
}

/// Plus gros fichiers, et fichiers volumineux que vous n'ouvrez plus.
#[tauri::command]
pub async fn home_highlights() -> Result<Highlights, String> {
    blocking(|| {
        let all = scanner::scan(false);

        let mut heavy = all.clone();
        heavy.sort_by_key(|a| std::cmp::Reverse(a.size));
        heavy.truncate(5);

        let mut unused: Vec<Entry> = all.into_iter().filter(|e| e.size >= 5_000_000).collect();
        unused.sort_by_key(|e| e.last_used);
        unused.truncate(5);

        Ok(Highlights { heavy, unused })
    })
    .await
}

/// Ouvre un dossier dans le gestionnaire de fichiers du système.
fn open_in_file_manager(target: &std::path::Path) -> std::io::Result<()> {
    #[cfg(target_os = "windows")]
    let mut cmd = Command::new("explorer");
    #[cfg(target_os = "macos")]
    let mut cmd = Command::new("open");
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let mut cmd = Command::new("xdg-open");

    cmd.arg(target).spawn().map(|_| ())
}

/// Ouvre le dossier concerné dans le gestionnaire de fichiers.
#[tauri::command]
pub fn reveal(path: String) -> Result<(), String> {
    let p = std::path::PathBuf::from(&path);
    if !fsutil::is_inside(&fsutil::home(), &p) {
        return Err("Chemin en dehors de votre dossier personnel".into());
    }
    let target = if p.is_dir() {
        p
    } else {
        p.parent().map(|x| x.to_path_buf()).unwrap_or(p)
    };
    open_in_file_manager(&target).map_err(|e| e.to_string())
}
