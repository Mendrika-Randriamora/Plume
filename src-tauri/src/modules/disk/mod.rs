use serde::Serialize;
use sysinfo::{DiskKind, Disks};

use crate::shared::blocking;

/// Une partition montée, interne ou externe.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Partition {
    device: String,
    mount_point: String,
    file_system: String,
    kind: String,
    total: u64,
    available: u64,
    used: u64,
    removable: bool,
    read_only: bool,
}

fn kind_label(kind: DiskKind) -> &'static str {
    match kind {
        DiskKind::SSD => "SSD",
        DiskKind::HDD => "HDD",
        DiskKind::Unknown(_) => "Unknown",
    }
}

fn is_external(disk: &sysinfo::Disk) -> bool {
    let mount = disk.mount_point().to_string_lossy();
    disk.is_removable() || mount.starts_with("/media/") || mount.starts_with("/run/media/")
}

fn sort_rank(p: &Partition) -> u8 {
    if p.mount_point == "/" {
        0
    } else if p.mount_point.to_lowercase().contains("efi") {
        1
    } else if p.removable {
        3
    } else {
        2
    }
}

/// Liste toutes les partitions montées (EFI, /, /data, disques externes...).
#[tauri::command]
pub async fn list_partitions() -> Result<Vec<Partition>, String> {
    blocking(|| {
        let disks = Disks::new_with_refreshed_list();
        let mut partitions: Vec<Partition> = disks
            .iter()
            .filter(|d| d.total_space() > 0)
            .filter(|d| {
                // Les montages snap (squashfs en lecture seule) ne sont pas des
                // partitions physiques : on les masque pour garder la liste claire.
                let fs = d.file_system().to_string_lossy().to_lowercase();
                let mount = d.mount_point().to_string_lossy();
                fs != "squashfs" && !mount.starts_with("/snap/")
            })
            .map(|d| {
                let total = d.total_space();
                let available = d.available_space();
                Partition {
                    device: d.name().to_string_lossy().into_owned(),
                    mount_point: d.mount_point().to_string_lossy().into_owned(),
                    file_system: d.file_system().to_string_lossy().into_owned(),
                    kind: kind_label(d.kind()).to_string(),
                    total,
                    available,
                    used: total.saturating_sub(available),
                    removable: is_external(d),
                    read_only: d.is_read_only(),
                }
            })
            .collect();

        partitions.sort_by(|a, b| {
            sort_rank(a)
                .cmp(&sort_rank(b))
                .then_with(|| a.mount_point.cmp(&b.mount_point))
        });

        Ok(partitions)
    })
    .await
}
