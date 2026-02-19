use eegfaktura_datalib::eegfaktura::loader::EnergyReport;
use glob::Pattern;
use std::fs;
use std::path::PathBuf;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

#[derive(Clone)]
struct AppState {
    energy_reports: Arc<Mutex<HashMap<String, EnergyReport>>>,
}

fn list_xlsx_files() -> Result<Vec<PathBuf>, Box<dyn std::error::Error>> {
    // Get the Downloads folder path
    let downloads = dirs::download_dir().ok_or("Could not find Downloads directory")?;

    // Read directory and filter for .xlsx files
    let xlsx_files: Vec<PathBuf> = fs::read_dir(downloads)?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| {
            path.extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.eq_ignore_ascii_case("xlsx"))
                .unwrap_or(false)
        })
        .collect();

    Ok(xlsx_files)
}

#[tauri::command]
fn list_energy_report_files() -> Result<Vec<PathBuf>, String> {
    match list_xlsx_files() {
        Ok(list) => {
            let pattern = Pattern::new("RC*-Energy-Report*").unwrap();
            let mut energy_reports: Vec<PathBuf> = list
                .into_iter()
                .filter(|path| {
                    path.file_name()
                        .and_then(|name| name.to_str())
                        .map(|name| pattern.matches(name))
                        .unwrap_or(false)
                })
                .collect();

            // sort by modification date
            energy_reports.sort_by_cached_key(|path| {
                fs::metadata(path)
                    .and_then(|m| m.modified())
                    .ok()
                    .map(|t| std::cmp::Reverse(t)) // Reverse for descending order
            });

            // last 10 only
            energy_reports.truncate(10);

            Ok(energy_reports)
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn load_energy_report_file(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<Option<bool>, String> {
    let state_clone = state.inner().clone(); // Extract Arc before spawn_blocking

    tokio::task::spawn_blocking(move || {
        println!("path: {}", path);
        let mut energy_report = EnergyReport::new(path.clone());
        energy_report.check_measurements_complete();

        let measurements_complete = energy_report.measurements_complete;

        let mut reports_guard = state_clone
            .energy_reports
            .lock()
            .map_err(|e| e.to_string())?;

        reports_guard.insert(path, energy_report);

        Ok(measurements_complete)
    })
    .await
    .map_err(|e| e.to_string())?
}




#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = AppState {
        energy_reports: Arc::new(Mutex::new(HashMap::new())),
    };

    tauri::Builder::default()
        .manage(state)
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            list_energy_report_files,
            load_energy_report_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
