use serde::Serialize;
use std::{
    cmp::Ordering,
    collections::{BinaryHeap, HashMap},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use walkdir::WalkDir;

use super::fsutil::home;

/// Dossiers de dépendances / build ignorés (les dossiers cachés le sont aussi).
const SKIP: &[&str] = &[
    "node_modules",
    "vendor",
    "venv",
    "env",
    "__pycache__",
    "target",
    "dist",
    "build",
    "site-packages",
    "snap",
];

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub path: String,
    pub name: String,
    pub parent: String,
    pub is_dir: bool,
    pub size: u64,
    /// Dernière utilisation (secondes Unix) = max(accès, modification)
    pub last_used: u64,
}

fn secs(t: std::io::Result<SystemTime>) -> u64 {
    t.ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn entry(path: &Path, is_dir: bool, size: u64, last_used: u64) -> Entry {
    Entry {
        path: path.to_string_lossy().into_owned(),
        name: path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default(),
        parent: path
            .parent()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_default(),
        is_dir,
        size,
        last_used,
    }
}

// ---------------------------------------------------------------------------
// Sélection bornée
// ---------------------------------------------------------------------------

/// Critère de classement des fichiers retenus.
#[derive(Clone, Copy)]
pub enum Rank {
    /// Les plus volumineux d'abord.
    Largest,
    /// Les moins récemment utilisés d'abord.
    Oldest,
}

/// Candidat dont l'ordre est inversé : le plus « grand » au sens de `Ord` est
/// le moins intéressant, ce qui permet de l'écarter en premier du tas.
struct Candidate {
    path: PathBuf,
    size: u64,
    last: u64,
    is_dir: bool,
    rank: Rank,
}

impl Ord for Candidate {
    fn cmp(&self, other: &Self) -> Ordering {
        let by_key = match self.rank {
            Rank::Largest => other.size.cmp(&self.size),
            Rank::Oldest => other.last.cmp(&self.last),
        };
        by_key.then_with(|| other.path.cmp(&self.path))
    }
}

impl PartialOrd for Candidate {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl PartialEq for Candidate {
    fn eq(&self, other: &Self) -> bool {
        self.cmp(other) == Ordering::Equal
    }
}

impl Eq for Candidate {}

/// Ne garde que les `limit` meilleurs fichiers au fil du parcours : la mémoire
/// reste constante même quand le dossier contient des centaines de milliers
/// de fichiers (contrairement à un `Vec` de toutes les entrées).
struct Top {
    limit: usize,
    min_size: u64,
    rank: Rank,
    heap: BinaryHeap<Candidate>,
}

impl Top {
    fn new(limit: usize, min_size: u64, rank: Rank) -> Self {
        Self {
            limit,
            min_size,
            rank,
            heap: BinaryHeap::with_capacity(limit),
        }
    }

    fn push(&mut self, path: &Path, size: u64, last: u64, is_dir: bool) {
        if self.limit == 0 || size < self.min_size {
            return;
        }

        let worse = match self.heap.peek() {
            Some(worst) => match self.rank {
                Rank::Largest => size <= worst.size,
                Rank::Oldest => last >= worst.last,
            },
            None => false,
        };
        let full = self.heap.len() >= self.limit;
        if full && worse {
            return;
        }

        if full {
            self.heap.pop();
        }
        self.heap.push(Candidate {
            path: path.to_path_buf(),
            size,
            last,
            is_dir,
            rank: self.rank,
        });
    }

    /// Les meilleurs candidats, du plus pertinent au moins pertinent.
    fn into_entries(self) -> Vec<Entry> {
        let mut cands = self.heap.into_vec();
        cands.sort();
        cands
            .into_iter()
            .map(|c| entry(&c.path, c.is_dir, c.size, c.last))
            .collect()
    }
}

/// Parcourt les fichiers du dossier personnel en ignorant les dossiers cachés
/// et ceux listés dans `SKIP`.
fn walk_files(root: &Path, mut visit: impl FnMut(&Path, u64, u64)) {
    let walker = WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            if e.depth() == 0 {
                return true;
            }
            let name = e.file_name().to_string_lossy();
            if name.starts_with('.') {
                return false;
            }
            !(e.file_type().is_dir() && SKIP.contains(&&*name))
        });

    for e in walker.flatten() {
        if !e.file_type().is_file() {
            continue;
        }
        let Ok(md) = e.metadata() else { continue };
        let last = secs(md.accessed()).max(secs(md.modified()));
        visit(e.path(), md.len(), last);
    }
}

/// Plus gros fichiers et fichiers volumineux que vous n'ouvrez plus, en un
/// seul parcours du dossier personnel.
pub fn highlights(limit: usize, unused_min: u64) -> (Vec<Entry>, Vec<Entry>) {
    let root = home();
    let mut heavy = Top::new(limit, 0, Rank::Largest);
    let mut unused = Top::new(limit, unused_min, Rank::Oldest);

    walk_files(&root, |path, size, last| {
        heavy.push(path, size, last, false);
        unused.push(path, size, last, false);
    });

    (heavy.into_entries(), unused.into_entries())
}

/// Les `limit` entrées correspondant au filtre de la page Nettoyage. Si
/// `include_dirs`, les dossiers des deux premiers niveaux sont classés selon
/// leur taille cumulée.
pub fn top(limit: usize, min_size: u64, rank: Rank, include_dirs: bool) -> Vec<Entry> {
    let root = home();
    let mut top = Top::new(limit, min_size, rank);
    let mut dirs: HashMap<PathBuf, (u64, u64)> = HashMap::new();

    walk_files(&root, |path, size, last| {
        top.push(path, size, last, false);
        if !include_dirs {
            return;
        }
        let Ok(rel) = path.strip_prefix(&root) else {
            return;
        };
        let comps: Vec<_> = rel.components().collect();
        for depth in 1..=2usize {
            if comps.len() > depth {
                let mut p = root.clone();
                for c in &comps[..depth] {
                    p.push(c.as_os_str());
                }
                let slot = dirs.entry(p).or_insert((0, 0));
                slot.0 += size;
                slot.1 = slot.1.max(last);
            }
        }
    });

    for (p, (size, last)) in dirs {
        top.push(&p, size, last, true);
    }
    top.into_entries()
}
