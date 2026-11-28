use std::{collections::HashMap, os::windows::process::CommandExt, process::Command};
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, Signal, System};

use super::{wait_exit, PortEntry, StopStatus};

/// Empêche l'ouverture d'une fenêtre de console pour netstat, taskkill et
/// PowerShell. Le prompt UAC reste, lui, affiché par le système.
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Processus noyau ou services critiques de Windows : jamais arrêtables.
const CRITICAL: &[&str] = &[
    "system",
    "system idle process",
    "registry",
    "memory compression",
    "smss.exe",
    "csrss.exe",
    "wininit.exe",
    "winlogon.exe",
    "services.exe",
    "lsass.exe",
    "svchost.exe",
    "spoolsv.exe",
    "dwm.exe",
    "fontdrvhost.exe",
    "sihost.exe",
];

/// Lit `netstat -ano` (repli documenté par Windows) et associe chaque ligne à
/// son nom de processus via sysinfo.
pub fn scan(include_outgoing: bool) -> Result<Vec<PortEntry>, String> {
    let text = netstat()?;
    let names = process_names();
    let mut entries = Vec::new();

    for line in text.lines() {
        let fields: Vec<&str> = line.split_whitespace().collect();
        if fields.len() < 4 {
            continue;
        }

        let protocol = fields[0].to_ascii_lowercase();
        if protocol != "tcp" && protocol != "udp" {
            continue;
        }

        let (local, foreign, state, pid_field) = if protocol == "tcp" {
            if fields.len() < 5 {
                continue;
            }
            (fields[1], fields[2], fields[3], fields[4])
        } else {
            (fields[1], fields[2], "udp", fields[3])
        };

        let Some(port) = parse_port(local) else {
            continue;
        };
        let listening = protocol == "udp" || is_listening(state, foreign);

        if !listening && !include_outgoing {
            continue;
        }

        let pid = pid_field.parse::<u32>().ok().filter(|pid| *pid != 0);
        let process = pid.and_then(|pid| names.get(&pid).cloned());
        let system = match (pid, process.as_deref()) {
            (None, _) => true,
            (Some(pid), Some(name)) => is_system(pid, name),
            (Some(pid), None) => is_system(pid, ""),
        };

        entries.push(PortEntry {
            port,
            protocol,
            address: host(local).to_string(),
            remote: host(foreign).to_string(),
            state: state.to_ascii_lowercase(),
            listening,
            pid,
            process,
            system,
        });
    }

    entries.sort_by(|a, b| {
        a.port
            .cmp(&b.port)
            .then_with(|| a.protocol.cmp(&b.protocol))
            .then_with(|| a.address.cmp(&b.address))
    });

    Ok(entries)
}

/// Termine le processus avec taskkill (via sysinfo) ou demande une élévation
/// explicite par le biais du prompt UAC de Windows.
pub fn terminate(pid: u32, elevate: bool) -> Result<StopStatus, String> {
    if elevate {
        match elevate_kill(pid) {
            Ok(0) => {}
            Ok(_) => return Ok(StopStatus::ElevationCancelled),
            Err(_) => return Ok(StopStatus::ElevationUnavailable),
        }
    } else {
        match signal(pid) {
            SignalResult::Sent => {}
            SignalResult::Denied => return Ok(StopStatus::PermissionDenied),
            SignalResult::Missing => return Ok(StopStatus::NotFound),
            SignalResult::Unsupported => return Ok(StopStatus::Unsupported),
        }
    }

    Ok(if wait_exit(pid) {
        StopStatus::Stopped
    } else {
        StopStatus::Timeout
    })
}

pub fn open_credit() -> Result<(), String> {
    const URL: &str = "https://github.com/t21dev/porter-app";

    Command::new("rundll32.exe")
        .args(["url.dll,FileProtocolHandler", URL])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .map(|_| ())
        .map_err(|error| {
            eprintln!("Impossible d'ouvrir le navigateur : {error}");
            "open_failed".to_string()
        })
}

enum SignalResult {
    Sent,
    Denied,
    Missing,
    Unsupported,
}

fn signal(pid: u32) -> SignalResult {
    let pid = Pid::from_u32(pid);
    let mut sys = System::new();
    sys.refresh_processes_specifics(
        ProcessesToUpdate::Some(&[pid]),
        true,
        ProcessRefreshKind::new(),
    );

    match sys.process(pid) {
        None => SignalResult::Missing,
        // Windows ne connaît que Signal::Kill ; sysinfo lance taskkill /F sans console.
        Some(process) => match process.kill_with(Signal::Kill) {
            Some(true) => SignalResult::Sent,
            Some(false) => SignalResult::Denied,
            None => SignalResult::Unsupported,
        },
    }
}

fn elevate_kill(pid: u32) -> Result<i32, String> {
    let script = format!(
        "Start-Process -FilePath taskkill.exe -ArgumentList '/PID','{pid}','/F' -Verb RunAs -WindowStyle Hidden -Wait"
    );

    let status = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-Command",
            &script,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map_err(|error| {
            eprintln!("Impossible de demander l'élévation de droits : {error}");
            "command_failed".to_string()
        })?;

    Ok(status.code().unwrap_or(-1))
}

fn netstat() -> Result<String, String> {
    let output = Command::new("netstat")
        .args(["-ano"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|error| {
            eprintln!("Impossible de lire les ports (netstat) : {error}");
            "porter_scan_failed".to_string()
        })?;

    if !output.status.success() {
        return Err("porter_scan_failed".into());
    }

    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

fn process_names() -> HashMap<u32, String> {
    let mut sys = System::new();
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::new());

    sys.processes()
        .values()
        .map(|process| {
            (
                process.pid().as_u32(),
                process.name().to_string_lossy().into_owned(),
            )
        })
        .collect()
}

fn is_system(pid: u32, name: &str) -> bool {
    if pid == 0 || pid == 4 || pid == std::process::id() || name.is_empty() {
        return true;
    }

    let name = name.to_ascii_lowercase();
    CRITICAL.contains(&name.as_str())
}

fn is_listening(state: &str, foreign: &str) -> bool {
    let state = state.to_ascii_uppercase();
    if state.contains("LISTEN") || state.contains("ÉCOUTE") || state.contains("ECOUTE") {
        return true;
    }

    foreign == "0.0.0.0:0" || foreign == "[::]:0" || foreign == "*:*"
}

fn parse_port(local: &str) -> Option<u16> {
    let (_, port) = local.rsplit_once(':')?;
    port.parse::<u16>().ok().filter(|port| *port != 0)
}

/// Retire le port d'une adresse `hôte:port` pour exposer la même forme que
/// sous Linux (adresse seule).
fn host(endpoint: &str) -> &str {
    endpoint
        .rsplit_once(':')
        .map(|(address, _)| address)
        .unwrap_or(endpoint)
}
