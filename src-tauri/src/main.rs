#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod modules;
mod shared;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            modules::home::system_stats,
            modules::home::home_highlights,
            modules::home::reveal,
            modules::updates::check_updates,
            modules::updates::apply_updates,
            modules::updates::list_obsolete,
            modules::updates::remove_obsolete,
            modules::clean::scan_clean,
            modules::clean::delete_to_trash,
            modules::clean::scan_temp,
            modules::clean::clear_temp,
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de Plume");
}
