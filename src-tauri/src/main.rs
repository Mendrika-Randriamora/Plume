#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod modules;
mod shared;

fn main() {
    // Sous Wayland, GNOME résout l'icône depuis le fichier .desktop dès
    // l'apparition de la fenêtre : l'entrée doit donc exister avant Tauri.
    #[cfg(target_os = "linux")]
    modules::appearance::prepare_desktop_entry();

    let mut builder = tauri::Builder::default()
        .manage(modules::applications::ApplicationsState::default())
        .manage(modules::config::ConfigState::default())
        .manage(modules::home::HomeState::default())
        .manage(modules::resources::ResourcesState::default())
        .manage(modules::processes::ProcessesState::default())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init());

    // Les mises à jour automatiques ne concernent que les bureaux (Linux, Windows, macOS).
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    // Sous Wayland, GTK ne renégocie pas les décorations d'une fenêtre déjà
    // créée : le mode de barre de titre doit donc être choisi avant la
    // construction de la fenêtre, depuis la préférence enregistrée.
    let mut context = tauri::generate_context!();
    let native_title_bar = modules::appearance::stored_title_bar_native();
    for window in &mut context.config_mut().app.windows {
        if window.label == "main" {
            window.decorations = native_title_bar;
        }
    }

    builder
        .invoke_handler(tauri::generate_handler![
            modules::appearance::title_bar_mode,
            modules::appearance::set_title_bar_mode,
            modules::appearance::sync_app_icon,
            modules::home::system_stats,
            modules::settings::system_info,
            modules::home::home_highlights,
            modules::home::reveal,
            modules::resources::resource_snapshot,
            modules::processes::list_processes,
            modules::processes::process_details,
            modules::processes::stop_process,
            modules::processes::restart_process,
            modules::porter::list_ports,
            modules::porter::stop_port_process,
            modules::porter::open_porter_credit,
            modules::disk::list_partitions,
            modules::repositories::list_repositories,
            modules::repositories::add_repository,
            modules::repositories::update_repository,
            modules::repositories::remove_repository,
            modules::repositories::set_repository_enabled,
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
            modules::startup::list_startup_entries,
            modules::startup::create_startup_entry,
            modules::startup::set_startup_entry_enabled,
            modules::startup::remove_startup_entry,
            modules::config::config_supported,
            modules::config::list_known_configs,
            modules::config::read_config,
            modules::config::write_config,
            modules::config::list_dir,
            modules::config::start_index,
            modules::config::index_status,
            modules::config::search_configs,
            modules::config::list_backups,
            modules::config::restore_backup,
            modules::config::list_favorites,
            modules::config::add_favorite,
            modules::config::remove_favorite,
        ])
        .run(context)
        .expect("erreur au lancement de Plume");
}
