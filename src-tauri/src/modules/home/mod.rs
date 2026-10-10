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

#[derive(Serialize)]
pub struct App {
    name: String,
    memory: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStats {
    ram_total: u64,
    ram_used: u64,
    disk_total: u64,
    disk_free: u64,
    temps: Temps,
    top_apps: Vec<App>,
}

fn avg(v: Vec<f32>) -> Option<f32> {
    let v: Vec<f32> = v.into_iter().filter(|t| t.is_finite() && *t > 0.0 && *t < 125.0).collect();
    if v.is_empty() {
        None
    } else {
        Some(v.iter().sum::<f32>() / v.len() as f32)
    }
}

fn gpu_from_nvidia_smi() -> Option<f32> {
    let out = Command::new("nvidia-smi")
        .args(["--query-gpu=temperature.gpu", "--format=csv,noheader"])
        .output()
        .ok()?;
    let txt = String::from_utf8_lossy(&out.stdout);
    let vals: Vec<f32> = txt.lines().filter_map(|l| l.trim().parse().ok()).collect();
    avg(vals)
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
            *by_name.entry(p.name().to_string_lossy().into_owned()).or_insert(0) += p.memory();
        }
        let mut top_apps: Vec<App> =
            by_name.into_iter().map(|(name, memory)| App { name, memory }).collect();
        top_apps.sort_by(|a, b| b.memory.cmp(&a.memory));
        top_apps.truncate(5);

        // Températures
        let comps = Components::new_with_refreshed_list();
        let (mut cpu, mut gpu, mut ram) = (vec![], vec![], vec![]);
        for c in comps.iter() {
            let l = c.label().to_lowercase();
            let t = c.temperature();
            if ["amdgpu", "nouveau", "nvidia", "gpu"].iter().any(|k| l.contains(k)) {
                gpu.push(t);
            } else if ["spd", "jc42", "dimm", "ram"].iter().any(|k| l.contains(k)) {
                ram.push(t);
            } else if ["cpu", "core", "package", "tctl", "tdie", "k10temp", "coretemp"]
                .iter()
                .any(|k| l.contains(k))
            {
                cpu.push(t);
            }
        }
        let gpu = avg(gpu).or_else(gpu_from_nvidia_smi);

        // Disque qui contient /home
        let home = fsutil::home();
        let disks = Disks::new_with_refreshed_list();
        let disk = disks
            .iter()
            .filter(|d| home.starts_with(d.mount_point()))
            .max_by_key(|d| d.mount_point().as_os_str().len());
        let (disk_total, disk_free) =
            disk.map(|d| (d.total_space(), d.available_space())).unwrap_or((0, 0));

        Ok(SystemStats {
            ram_total: sys.total_memory(),
            ram_used: sys.used_memory(),
            disk_total,
            disk_free,
            temps: Temps { cpu: avg(cpu), gpu, ram: avg(ram) },
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
        heavy.sort_by(|a, b| b.size.cmp(&a.size));
        heavy.truncate(5);

        let mut unused: Vec<Entry> = all.into_iter().filter(|e| e.size >= 5_000_000).collect();
        unused.sort_by_key(|e| e.last_used);
        unused.truncate(5);

        Ok(Highlights { heavy, unused })
    })
    .await
}

/// Ouvre le dossier concerné dans le gestionnaire de fichiers.
#[tauri::command]
pub fn reveal(path: String) -> Result<(), String> {
    let p = std::path::PathBuf::from(&path);
    if !fsutil::is_inside(&fsutil::home(), &p) {
        return Err("Chemin en dehors de votre dossier personnel".into());
    }
    let target = if p.is_dir() { p } else { p.parent().map(|x| x.to_path_buf()).unwrap_or(p) };
    Command::new("xdg-open").arg(target).spawn().map_err(|e| e.to_string())?;
    Ok(())
}
