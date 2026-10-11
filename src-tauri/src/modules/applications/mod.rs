use serde::{Serialize, Deserialize};
use std::process::Command;
use std::fs;

#[derive(Debug, Serialize, Deserialize)]
pub struct Application {
    pub name: String,
    pub package_name: String,
    pub version: Option<String>,
    pub size: Option<u64>,
    pub source: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ApplicationDetails {
    pub name: String,
    pub package_name: String,
    pub version: Option<String>,
    pub size: Option<u64>,
    pub source: String,
    pub desktop_file: Option<String>,
    pub desktop_content: Option<String>,
    pub description: Option<String>,
    pub icon: Option<String>,
    pub categories: Option<Vec<String>>,
    pub exec: Option<String>,
}

#[tauri::command]
pub async fn list_applications() -> Result<Vec<Application>, String> {
    let mut applications = Vec::new();
    applications.extend(get_apt_applications().await?);
    applications.extend(get_snap_applications().await?);
    applications.extend(get_flatpak_applications().await?);
    Ok(applications)
}

#[tauri::command]
pub async fn search_applications(query: String) -> Result<Vec<Application>, String> {
    let all_apps = list_applications().await?;
    let query_lower = query.to_lowercase();
    Ok(all_apps.into_iter()
        .filter(|app| app.name.to_lowercase().contains(&query_lower) || app.package_name.to_lowercase().contains(&query_lower))
        .collect())
}

#[tauri::command]
pub async fn get_application_details(package_name: String, source: String) -> Result<ApplicationDetails, String> {
    match source.as_str() {
        "apt" => get_apt_details(&package_name).await,
        "snap" => get_snap_details(&package_name).await,
        "flatpak" => get_flatpak_details(&package_name).await,
        _ => Err(format!("Unknown source: {}", source)),
    }
}

#[tauri::command]
pub async fn uninstall_application(package_name: String, source: String) -> Result<bool, String> {
    match source.as_str() {
        "apt" => uninstall_apt(&package_name).await,
        "snap" => uninstall_snap(&package_name).await,
        "flatpak" => uninstall_flatpak(&package_name).await,
        _ => Err(format!("Unknown source: {}", source)),
    }
}

async fn get_apt_applications() -> Result<Vec<Application>, String> {
    let output = Command::new("sh")
        .arg("-c")
        .arg("dpkg-query -W -f='${Package}\t${Version}\t${Installed-Size}\n' 2>/dev/null | grep -v deinstall | head -200")
        .output()
        .map_err(|e| format!("Failed to run dpkg-query: {}", e))?;
    
    if !output.status.success() {
        return Ok(Vec::new());
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut applications = Vec::new();
    
    for line in stdout.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() >= 3 {
            let package_name = parts[0].to_string();
            let version = Some(parts[1].to_string());
            let size = parts[2].trim().parse::<u64>().ok();
            let name = get_apt_display_name(&package_name);
            
            applications.push(Application {
                name,
                package_name,
                version,
                size,
                source: "apt".to_string(),
            });
        }
    }
    Ok(applications)
}

fn get_apt_display_name(package_name: &str) -> String {
    let output = Command::new("sh")
        .arg("-c")
        .arg(format!("apt-cache show {} 2>/dev/null | grep '^Description:' | head -1 | sed 's/^Description: //'", package_name))
        .output()
        .ok();
    
    if let Some(output) = output {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let desc = stdout.trim();
            if !desc.is_empty() {
                return desc.split('\n').next().unwrap_or(package_name).to_string();
            }
        }
    }
    package_name.to_string()
}

async fn get_apt_details(package_name: &str) -> Result<ApplicationDetails, String> {
    let output = Command::new("sh")
        .arg("-c")
        .arg(format!("dpkg-query -W -f='${{Version}}\n${{Installed-Size}}\n' {} 2>/dev/null", package_name))
        .output()
        .map_err(|e| format!("Failed to get apt details: {}", e))?;
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let lines: Vec<&str> = stdout.lines().collect();
    let version = lines.get(0).map(|s| s.to_string());
    let size = lines.get(1).and_then(|s| s.trim().parse::<u64>().ok());
    let name = get_apt_display_name(package_name);
    
    let (desktop_file, desktop_content, description, categories, exec) = find_desktop_info(package_name);
    
    Ok(ApplicationDetails {
        name,
        package_name: package_name.to_string(),
        version,
        size,
        source: "apt".to_string(),
        desktop_file,
        desktop_content,
        description,
        icon,
        categories,
        exec,
    })
}

async fn uninstall_apt(package_name: &str) -> Result<bool, String> {
    let status = Command::new("sh")
        .arg("-c")
        .arg(format!("sudo apt-get remove -y {} 2>&1", package_name))
        .status()
        .map_err(|e| format!("Failed to uninstall: {}", e))?;
    Ok(status.success())
}

async fn get_snap_applications() -> Result<Vec<Application>, String> {
    let output = Command::new("sh")
        .arg("-c")
        .arg("snap list 2>/dev/null | tail -n +2 | awk '{print $1\"\\t\"$2\"\\t\"$4}'")
        .output()
        .map_err(|e| format!("Failed to run snap list: {}", e))?;
    
    if !output.status.success() {
        return Ok(Vec::new());
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut applications = Vec::new();
    
    for line in stdout.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() >= 3 {
            let name = parts[0].to_string();
            let version = Some(parts[1].to_string());
            let size = parse_human_size(parts[2].trim());
            
            applications.push(Application {
                name: name.clone(),
                package_name: name,
                version,
                size,
                source: "snap".to_string(),
            });
        }
    }
    Ok(applications)
}

async fn get_snap_details(package_name: &str) -> Result<ApplicationDetails, String> {
    let output = Command::new("sh")
        .arg("-c")
        .arg(format!("snap info {} 2>/dev/null", package_name))
        .output()
        .map_err(|e| format!("Failed to get snap details: {}", e))?;
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut description: Option<String> = None;
    let mut version: Option<String> = None;
    
    for line in stdout.lines() {
        let line = line.trim();
        if line.starts_with("description:") {
            description = Some(line.trim_start_matches("description:").trim().to_string());
        } else if line.starts_with("version:") {
            version = Some(line.trim_start_matches("version:").trim().to_string());
        }
    }
    
    let (desktop_file, desktop_content, description, categories, exec) = find_desktop_info(package_name);
    
    Ok(ApplicationDetails {
        name: package_name.to_string(),
        package_name: package_name.to_string(),
        version,
        size: None,
        source: "snap".to_string(),
        desktop_file,
        desktop_content,
        description,
        icon,
        categories,
        exec,
    })
}

async fn uninstall_snap(package_name: &str) -> Result<bool, String> {
    let status = Command::new("sh")
        .arg("-c")
        .arg(format!("sudo snap remove {} 2>&1", package_name))
        .status()
        .map_err(|e| format!("Failed to uninstall snap: {}", e))?;
    Ok(status.success())
}

async fn get_flatpak_applications() -> Result<Vec<Application>, String> {
    let output = Command::new("sh")
        .arg("-c")
        .arg("flatpak list --app 2>/dev/null | tail -n +2 | awk '{print $1\"\\t\"$2\"\\t\"$4}'")
        .output()
        .map_err(|e| format!("Failed to run flatpak list: {}", e))?;
    
    if !output.status.success() {
        return Ok(Vec::new());
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut applications = Vec::new();
    
    for line in stdout.lines() {
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() >= 3 {
            let name = parts[0].to_string();
            let version = Some(parts[1].to_string());
            let size = parse_human_size(parts[2].trim());
            
            applications.push(Application {
                name: name.clone(),
                package_name: name,
                version,
                size,
                source: "flatpak".to_string(),
            });
        }
    }
    Ok(applications)
}

async fn get_flatpak_details(package_name: &str) -> Result<ApplicationDetails, String> {
    let output = Command::new("sh")
        .arg("-c")
        .arg(format!("flatpak info {} 2>/dev/null", package_name))
        .output()
        .map_err(|e| format!("Failed to get flatpak details: {}", e))?;
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut description: Option<String> = None;
    
    for line in stdout.lines() {
        let line = line.trim();
        if line.starts_with("Description:") {
            description = Some(line.trim_start_matches("Description:").trim().to_string());
        }
    }
    
    let (desktop_file, desktop_content, description, categories, exec) = find_desktop_info(package_name);
    
    Ok(ApplicationDetails {
        name: package_name.to_string(),
        package_name: package_name.to_string(),
        version: None,
        size: None,
        source: "flatpak".to_string(),
        desktop_file,
        desktop_content,
        description,
        icon,
        categories,
        exec,
    })
}

async fn uninstall_flatpak(package_name: &str) -> Result<bool, String> {
    let status = Command::new("sh")
        .arg("-c")
        .arg(format!("sudo flatpak uninstall -y {} 2>&1", package_name))
        .status()
        .map_err(|e| format!("Failed to uninstall flatpak: {}", e))?;
    Ok(status.success())
}

fn find_desktop_info(package_name: &str) -> (Option<String>, Option<String>, Option<String>, Option<Vec<String>>, Option<String>) {
    let desktop_dirs = [
        "/usr/share/applications",
        "/usr/local/share/applications",
        "/var/lib/snapd/desktop/applications",
        "/var/lib/flatpak/exports/share/applications",
    ];
    
    for dir in desktop_dirs.iter() {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                if let Some(path_str) = entry.path().to_str() {
                    if path_str.ends_with(".desktop") {
                        if let Ok(content) = fs::read_to_string(path_str) {
                            let mut has_match = false;
                            let mut icon: Option<String> = None;
                            let mut categories: Option<Vec<String>> = None;
                            let mut exec: Option<String> = None;
                            let mut description: Option<String> = None;
                            
                            for line in content.lines() {
                                let line = line.trim();
                                if line.starts_with("Exec=") {
                                    let exec_line = line.trim_start_matches("Exec=");
                                    if exec_line.contains(package_name) {
                                        has_match = true;
                                        exec = Some(exec_line.to_string());
                                    }
                                }
                                if line.starts_with("Icon=") {
                                    icon = Some(line.trim_start_matches("Icon=").to_string());
                                }
                                if line.starts_with("Categories=") {
                                    categories = Some(line.trim_start_matches("Categories=").split(';').map(|s| s.to_string()).collect());
                                }
                                if line.starts_with("Name=") && description.is_none() {
                                    description = Some(line.trim_start_matches("Name=").to_string());
                                }
                                if line.starts_with("Comment=") && description.is_none() {
                                    description = Some(line.trim_start_matches("Comment=").to_string());
                                }
                            }
                            
                            if has_match || path_str.contains(package_name) {
                                return (Some(path_str.to_string()), Some(content), description, categories, exec);
                            }
                        }
                    }
                }
            }
        }
    }
    (None, None, None, None, None)
}

fn parse_human_size(size_str: &str) -> Option<u64> {
    let size_str = size_str.trim().to_uppercase();
    if size_str.ends_with("KB") {
        size_str.trim_end_matches("KB").parse::<f64>().ok().map(|s| (s * 1024.0) as u64)
    } else if size_str.ends_with("MB") {
        size_str.trim_end_matches("MB").parse::<f64>().ok().map(|s| (s * 1024.0 * 1024.0) as u64)
    } else if size_str.ends_with("GB") {
        size_str.trim_end_matches("GB").parse::<f64>().ok().map(|s| (s * 1024.0 * 1024.0 * 1024.0) as u64)
    } else if size_str.ends_with("TB") {
        size_str.trim_end_matches("TB").parse::<f64>().ok().map(|s| (s * 1024.0 * 1024.0 * 1024.0 * 1024.0) as u64)
    } else {
        size_str.parse::<u64>().ok()
    }
}
