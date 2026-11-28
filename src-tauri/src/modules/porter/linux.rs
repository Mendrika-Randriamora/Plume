use std::{
    collections::HashMap,
    fs,
    net::{Ipv4Addr, Ipv6Addr},
    process::Command,
};
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, Signal, System};

use super::{wait_exit, PortEntry, StopStatus};

/// Processus critiques qui ne doivent jamais être arrêtés depuis Plume, même
/// lorsque leur UID n'est pas root (cas rare d'un service système non privilégié).
const CRITICAL: &[&str] = &[
    "systemd",
    "init",
    "kthreadd",
    "dbus-daemon",
    "systemd-journald",
    "systemd-logind",
    "systemd-udevd",
    "polkitd",
    "sshd",
    "cron",
    "crond",
    "rsyslogd",
    "auditd",
    "networkmanager",
    "xorg",
    "gnome-shell",
    "kwin_x11",
    "kwin_wayland",
    "pipewire",
    "wireplumber",
    "containerd",
    "dockerd",
    "avahi-daemon",
    "cupsd",
    "bluetoothd",
    "thermald",
    "irqbalance",
    "chronyd",
    "ntpd",
    "dhclient",
    "dhcpcd",
    "wpa_supplicant",
    "gdm",
    "gdm3",
    "sddm",
    "lightdm",
    "plymouthd",
    "udisksd",
    "upowerd",
    "accounts-daemon",
    "login",
    "getty",
];

/// Préfixes des threads du noyau, dont le nom varie (kworker/0:1, rcu_sched…).
/// `systemd-journal` couvre `systemd-journald`, tronqué à 15 caractères par
/// `/proc/<pid>/comm`.
const CRITICAL_PREFIXES: &[&str] = &[
    "kworker",
    "ksoftirqd",
    "migration",
    "rcu_",
    "watchdog",
    "systemd-journal",
];

struct ProcMeta {
    name: String,
    system: bool,
}

/// Lit les quatre tables TCP/UDP du noyau et associe chaque socket à son PID.
pub fn scan(include_outgoing: bool) -> Result<Vec<PortEntry>, String> {
    let owners = socket_owners();
    let mut meta_cache: HashMap<u32, ProcMeta> = HashMap::new();
    let mut entries = Vec::new();
    let mut readable = false;

    for (file, protocol) in [
        ("tcp", "tcp"),
        ("tcp6", "tcp"),
        ("udp", "udp"),
        ("udp6", "udp"),
    ] {
        let Ok(text) = fs::read_to_string(format!("/proc/net/{file}")) else {
            continue;
        };
        readable = true;

        for line in text.lines().skip(1) {
            let fields: Vec<&str> = line.split_whitespace().collect();
            if fields.len() < 10 {
                continue;
            }

            let Some(port) = parse_port(fields[1]) else {
                continue;
            };
            let state_hex = fields[3];
            let inode = fields[9].parse::<u64>().unwrap_or(0);
            let listening = protocol == "udp" || state_hex == "0A";

            if !listening && !include_outgoing {
                continue;
            }

            let owner_pid = if inode == 0 {
                None
            } else {
                owners.get(&inode).copied()
            };
            let (system, process) = match owner_pid {
                Some(pid) => {
                    let meta = meta_cache.entry(pid).or_insert_with(|| proc_meta(pid));
                    (meta.system, Some(meta.name.clone()))
                }
                None => (true, None),
            };

            entries.push(PortEntry {
                port,
                protocol: protocol.to_string(),
                address: decode_address(fields[1], file.ends_with('6')),
                remote: decode_address(fields[2], file.ends_with('6')),
                state: if protocol == "udp" {
                    "udp".to_string()
                } else {
                    tcp_state(state_hex).to_string()
                },
                listening,
                pid: owner_pid,
                process,
                system,
            });
        }
    }

    if !readable {
        return Err("porter_unavailable".into());
    }

    entries.sort_by(|a, b| {
        a.port
            .cmp(&b.port)
            .then_with(|| a.protocol.cmp(&b.protocol))
            .then_with(|| a.address.cmp(&b.address))
    });

    Ok(entries)
}

/// Envoie SIGTERM, ou demande l'élévation via pkexec si elle a été choisie.
pub fn terminate(pid: u32, elevate: bool) -> Result<StopStatus, String> {
    if elevate {
        let pid_arg = pid.to_string();
        match crate::modules::updates::exec_root(&["kill", "-TERM", &pid_arg]) {
            Ok(out) if out.success => {}
            Ok(out) => {
                return Ok(match out.code {
                    Some(126) | Some(127) => StopStatus::ElevationCancelled,
                    _ => StopStatus::PermissionDenied,
                });
            }
            Err(code) if code == "pkexec_missing" => {
                return Ok(StopStatus::ElevationUnavailable);
            }
            Err(_) => return Ok(StopStatus::Failed),
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

    for (program, args) in [("xdg-open", vec![URL]), ("gio", vec!["open", URL])] {
        if Command::new(program).args(args).spawn().is_ok() {
            return Ok(());
        }
    }

    Err("open_failed".into())
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
        Some(process) => match process.kill_with(Signal::Term) {
            Some(true) => SignalResult::Sent,
            Some(false) => SignalResult::Denied,
            None => SignalResult::Unsupported,
        },
    }
}

/// Construit la correspondance inode de socket → PID en lisant les descripteurs
/// de fichiers de chaque processus accessible à l'utilisateur courant.
fn socket_owners() -> HashMap<u64, u32> {
    let mut owners = HashMap::new();
    let Ok(processes) = fs::read_dir("/proc") else {
        return owners;
    };

    for entry in processes.flatten() {
        let Some(pid) = entry
            .file_name()
            .to_str()
            .and_then(|name| name.parse::<u32>().ok())
        else {
            continue;
        };
        let Ok(fds) = fs::read_dir(entry.path().join("fd")) else {
            continue;
        };

        for fd in fds.flatten() {
            let Ok(target) = fs::read_link(fd.path()) else {
                continue;
            };
            let link = target.to_string_lossy();
            let Some(inode) = link
                .strip_prefix("socket:[")
                .and_then(|rest| rest.strip_suffix(']'))
                .and_then(|inode| inode.parse::<u64>().ok())
            else {
                continue;
            };
            owners.insert(inode, pid);
        }
    }

    owners
}

fn proc_meta(pid: u32) -> ProcMeta {
    let name = fs::read_to_string(format!("/proc/{pid}/comm"))
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| format!("PID {pid}"));

    ProcMeta {
        system: is_system(pid, &name),
        name,
    }
}

/// Un processus noyau ou un service critique est considéré comme système : il
/// n'est jamais arrêté depuis Plume. Les processus root ordinaires ne sont pas
/// marqués système : lorsque Plume tourne sans privilèges, leurs ports restent
/// sans PID lisible et sont donc déjà protégés.
fn is_system(pid: u32, name: &str) -> bool {
    if pid <= 1 || pid == std::process::id() {
        return true;
    }

    let name = name.to_ascii_lowercase();
    CRITICAL.contains(&name.as_str())
        || CRITICAL_PREFIXES
            .iter()
            .any(|prefix| name.starts_with(prefix))
}

fn parse_port(local: &str) -> Option<u16> {
    let (_, port) = local.rsplit_once(':')?;
    u16::from_str_radix(port, 16).ok().filter(|port| *port != 0)
}

fn decode_address(local: &str, ipv6: bool) -> String {
    let Some((address, _)) = local.rsplit_once(':') else {
        return local.to_string();
    };

    if ipv6 {
        decode_ipv6(address).unwrap_or_else(|| address.to_string())
    } else {
        decode_ipv4(address).unwrap_or_else(|| address.to_string())
    }
}

fn decode_ipv4(hex: &str) -> Option<String> {
    let value = u32::from_str_radix(hex, 16).ok()?;
    Some(Ipv4Addr::from(value.to_le_bytes()).to_string())
}

fn decode_ipv6(hex: &str) -> Option<String> {
    if hex.len() != 32 {
        return None;
    }

    let mut segments = [0u16; 8];
    for index in 0..4 {
        let start = index * 8;
        let word = u32::from_str_radix(&hex[start..start + 8], 16).ok()?;
        let bytes = word.to_le_bytes();
        segments[index * 2] = u16::from_be_bytes([bytes[0], bytes[1]]);
        segments[index * 2 + 1] = u16::from_be_bytes([bytes[2], bytes[3]]);
    }

    Some(Ipv6Addr::from(segments).to_string())
}

fn tcp_state(hex: &str) -> &'static str {
    match hex {
        "01" => "established",
        "02" => "synSent",
        "03" => "synRecv",
        "04" => "finWait1",
        "05" => "finWait2",
        "06" => "timeWait",
        "07" => "close",
        "08" => "closeWait",
        "09" => "lastAck",
        "0A" => "listen",
        "0B" => "closing",
        "0C" => "newSynRecv",
        _ => "unknown",
    }
}
