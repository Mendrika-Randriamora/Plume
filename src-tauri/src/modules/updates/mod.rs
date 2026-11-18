use serde::Serialize;
use std::process::Command;

use crate::shared::blocking;

#[derive(Serialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Manager {
    Apt,
    Pacman,
    Dnf,
    None,
}

fn has(cmd: &str) -> bool {
    Command::new("sh")
        .arg("-c")
        .arg(format!("command -v {cmd}"))
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

pub(crate) fn detect() -> Manager {
    if has("apt-get") {
        Manager::Apt
    } else if has("pacman") {
        Manager::Pacman
    } else if has("dnf") {
        Manager::Dnf
    } else {
        Manager::None
    }
}

fn run(cmd: &str, args: &[&str]) -> Result<(String, i32), String> {
    let out = Command::new(cmd)
        .args(args)
        .env("LC_ALL", "C")
        .output()
        .map_err(|e| {
            eprintln!("Impossible de lancer {cmd} : {e}");
            "command_failed".to_string()
        })?;
    Ok((
        String::from_utf8_lossy(&out.stdout).into_owned(),
        out.status.code().unwrap_or(-1),
    ))
}

/// Sortie d'une commande administrateur, conservée pour les appelants qui
/// doivent réagir à un message précis (ex. suppression de snap déjà en cours).
pub(crate) struct RootOutput {
    pub success: bool,
    pub code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

impl RootOutput {
    pub(crate) fn log_failure(&self) {
        eprintln!(
            "Commande administrateur échouée : {}",
            self.stderr.lines().last().unwrap_or("erreur inconnue")
        );
    }
}

/// Lance une commande administrateur via pkexec (fenêtre de mot de passe du système).
pub(crate) fn exec_root(args: &[&str]) -> Result<RootOutput, String> {
    if !has("pkexec") {
        return Err("pkexec_missing".into());
    }
    let out = Command::new("pkexec")
        .arg("env")
        .arg("DEBIAN_FRONTEND=noninteractive")
        .arg("LC_ALL=C")
        .args(args)
        .output()
        .map_err(|e| {
            eprintln!("Impossible de lancer pkexec : {e}");
            "command_failed".to_string()
        })?;

    Ok(RootOutput {
        success: out.status.success(),
        code: out.status.code(),
        stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
    })
}

pub(crate) fn run_root(args: &[&str]) -> Result<String, String> {
    let out = exec_root(args)?;
    match out.code {
        Some(0) => Ok(out.stdout),
        Some(126) | Some(127) => Err("permission_denied".into()),
        _ => {
            out.log_failure();
            Err("command_failed".into())
        }
    }
}

// ---------- Mises à jour ----------

#[derive(Serialize)]
pub struct Pkg {
    name: String,
    from: Option<String>,
    to: Option<String>,
}

#[derive(Serialize)]
pub struct UpdateInfo {
    manager: Manager,
    items: Vec<Pkg>,
}

#[tauri::command]
pub async fn check_updates(refresh: bool) -> Result<UpdateInfo, String> {
    blocking(move || {
        let manager = detect();
        let mut items = Vec::new();
        match manager {
            Manager::Apt => {
                if refresh {
                    run_root(&["apt-get", "update"])?;
                }
                let (out, _) = run("apt", &["list", "--upgradable"])?;
                for l in out.lines().filter(|l| l.contains("upgradable from")) {
                    let name = l.split('/').next().unwrap_or("").to_string();
                    let to = l.split_whitespace().nth(1).map(String::from);
                    let from = l
                        .split("upgradable from: ")
                        .nth(1)
                        .map(|s| s.trim_end_matches(']').to_string());
                    items.push(Pkg { name, from, to });
                }
            }
            Manager::Pacman => {
                let (out, _) = if has("checkupdates") {
                    run("checkupdates", &[])?
                } else {
                    run("pacman", &["-Qu"])?
                };
                for l in out.lines() {
                    let p: Vec<&str> = l.split_whitespace().collect();
                    if p.len() >= 4 {
                        items.push(Pkg {
                            name: p[0].into(),
                            from: Some(p[1].into()),
                            to: Some(p[3].into()),
                        });
                    }
                }
            }
            Manager::Dnf => {
                let (out, _) = run("dnf", &["-q", "check-update"])?;
                for l in out.lines() {
                    if l.starts_with("Obsoleting") {
                        break;
                    }
                    let p: Vec<&str> = l.split_whitespace().collect();
                    if p.len() == 3 {
                        items.push(Pkg {
                            name: p[0].into(),
                            from: None,
                            to: Some(p[1].into()),
                        });
                    }
                }
            }
            Manager::None => {}
        }
        Ok(UpdateInfo { manager, items })
    })
    .await
}

#[tauri::command]
pub async fn apply_updates() -> Result<(), String> {
    blocking(|| {
        match detect() {
            Manager::Apt => run_root(&["apt-get", "-y", "upgrade"])?,
            Manager::Pacman => run_root(&["pacman", "-Syu", "--noconfirm"])?,
            Manager::Dnf => run_root(&["dnf", "-y", "upgrade"])?,
            Manager::None => return Err("unsupported_package_manager".into()),
        };
        Ok(())
    })
    .await
}

// ---------- Paquets obsolètes ----------

#[derive(Serialize)]
pub struct ObsoleteInfo {
    manager: Manager,
    items: Vec<String>,
}

fn obsolete_names(m: Manager) -> Result<Vec<String>, String> {
    Ok(match m {
        Manager::Apt => run("apt-get", &["-s", "autoremove"])?
            .0
            .lines()
            .filter(|l| l.starts_with("Remv "))
            .filter_map(|l| l.split_whitespace().nth(1).map(String::from))
            .collect(),
        Manager::Pacman => run("pacman", &["-Qdtq"])?
            .0
            .lines()
            .map(String::from)
            .collect(),
        Manager::Dnf => run("dnf", &["-q", "repoquery", "--unneeded"])?
            .0
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .collect(),
        Manager::None => vec![],
    })
}

#[tauri::command]
pub async fn list_obsolete() -> Result<ObsoleteInfo, String> {
    blocking(|| {
        let manager = detect();
        Ok(ObsoleteInfo {
            manager,
            items: obsolete_names(manager)?,
        })
    })
    .await
}

#[tauri::command]
pub async fn remove_obsolete() -> Result<(), String> {
    blocking(|| {
        let m = detect();
        match m {
            Manager::Apt => run_root(&["apt-get", "-y", "autoremove"])?,
            Manager::Dnf => run_root(&["dnf", "-y", "autoremove"])?,
            Manager::Pacman => {
                let names = obsolete_names(m)?;
                if names.is_empty() {
                    return Ok(());
                }
                let mut args = vec!["pacman", "-Rns", "--noconfirm"];
                args.extend(names.iter().map(|s| s.as_str()));
                run_root(&args)?
            }
            Manager::None => return Err("unsupported_package_manager".into()),
        };
        Ok(())
    })
    .await
}
