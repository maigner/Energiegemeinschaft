mod commands;
mod state;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = AppState::new();

    tauri::Builder::default()
        .manage(state)
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::files::list_energy_report_files,
            commands::files::list_masterdata_files,
    
            commands::energy_reports::check_energy_report_complete,
            commands::energy_reports::load_energy_report_file_dirty_meterpoints,

            commands::masterdata::check_masterdata_complete,
            commands::masterdata::load_masterdata_missing_subscriptions,
            commands::masterdata::load_masterdata_missing_activations,
            

        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
