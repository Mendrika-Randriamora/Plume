use std::{
    env, fs,
    path::{Path, PathBuf},
};

/// Sous-dossiers de `src/modules/settings/logos` ; la clé générée est
/// `<dossier>/<nom de fichier sans extension>`.
const GROUPS: [&str; 3] = ["linux", "windows", "macos"];

fn main() {
    tauri_build::build();
    bundle_logos();
}

/// Embarque les SVG déposés dans `logos/` sous forme de table dans `OUT_DIR`.
/// Ainsi, ajouter un logo ne demande aucune modification du code Rust.
fn bundle_logos() {
    let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let root = manifest
        .join("src")
        .join("modules")
        .join("settings")
        .join("logos");
    println!("cargo:rerun-if-changed={}", root.display());
    for group in GROUPS {
        println!("cargo:rerun-if-changed={}", root.join(group).display());
    }

    let mut entries: Vec<(String, PathBuf)> = Vec::new();
    for group in GROUPS {
        let Ok(read) = fs::read_dir(root.join(group)) else {
            continue;
        };
        let mut files: Vec<PathBuf> = read
            .flatten()
            .map(|entry| entry.path())
            .filter(|path| is_svg(path))
            .collect();
        files.sort();
        for path in files {
            let Some(stem) = path.file_stem().and_then(|stem| stem.to_str()) else {
                continue;
            };
            entries.push((format!("{group}/{stem}"), path));
        }
    }

    let mut code = String::from(
        "/// Table des logos SVG embarqués, générée par `build.rs`.\n\
         #[allow(dead_code)]\n\
         const BUNDLED_LOGOS: &[(&str, &str)] = &[\n",
    );
    for (key, path) in &entries {
        code.push_str(&format!("    ({key:?}, include_str!({path:?})),\n"));
    }
    code.push_str(
        "];\n\n\
         #[allow(dead_code)]\n\
         fn bundled_logo(key: &str) -> Option<&'static str> {\n\
         \x20   BUNDLED_LOGOS\n\
         \x20       .iter()\n\
         \x20       .find(|(name, _)| *name == key)\n\
         \x20       .map(|(_, svg)| *svg)\n\
         }\n",
    );

    let out = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR")).join("logos.rs");
    fs::write(&out, code).expect("écriture de logos.rs");
}

fn is_svg(path: &Path) -> bool {
    path.extension()
        .is_some_and(|ext| ext.eq_ignore_ascii_case("svg"))
}
