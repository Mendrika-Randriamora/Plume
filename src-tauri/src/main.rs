#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod modules;
mod shared;

fn main() {
    let mut builder = tauri::Builder::default()
        .manage(modules::applications::ApplicationsState::default())
        .manage(modules::home::HomeState::default())
        .manage(modules::resources::ResourcesState::default())
        .manage(modules::processes::ProcessesState::default())
        .plugin(tauri_plugin_process::init());

    // Les mises à jour automatiques ne concernent que les bureaux (Linux, Windows, macOS).
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .invoke_handler(tauri::generate_handler![
            modules::home::system_stats,
            modules::home::home_highlights,
            modules::home::reveal,
            modules::resources::resource_snapshot,
            modules::processes::list_processes,
            modules::disk::list_partitions,
            modules::updates::check_updates,
            modules::updates::apply_updates,
            modules::updates::list_obsolete,
            modules::updates::remove_obsolete,
            modules::clean::scan_clean,
            modules::clean::delete_to_trash,
            modules::clean::scan_temp,
            modules::clean::clear_temp,
            modules::applications::list_applications,
            modules::applications::refresh_applications,
            modules::applications::search_applications,
            modules::applications::get_application_details,
            modules::applications::uninstall_application,
            modules::applications::launch_application,
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de Plume");
}
