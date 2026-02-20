use eegfaktura_datalib::eegfaktura::loader::EnergyReport;
use glob::Pattern;
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri_plugin_window_state::{StateFlags};

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
async fn check_energy_report_complete(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<Option<bool>, String> {
    let state_clone = state.inner().clone(); // Extract Arc before spawn_blocking

    tokio::task::spawn_blocking(move || {
        println!("path: {}", path);

        let mut reports_guard = state_clone
            .energy_reports
            .lock()
            .map_err(|e| e.to_string())?;

        if let Some(existing_report) = reports_guard.get(&path) {
            println!("Report already in hashmap, ");

            if existing_report.measurements_complete.is_some() {
                println!("Report already checked, returning cached result");
                return Ok(existing_report.measurements_complete);
            }
        }

        let mut energy_report = EnergyReport::new(path.clone());

        energy_report.check_measurements_complete();

        let measurements_complete = energy_report.measurements_complete;

        reports_guard.insert(path, energy_report);

        Ok(measurements_complete)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn load_energy_report_file_details(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<EnergyReport, String> {
    let state_clone = state.inner().clone(); // Extract Arc before spawn_blocking

    tokio::task::spawn_blocking(move || {
        println!("path: {}", path);

        let reports = state_clone.energy_reports.lock().unwrap();

        let report = reports.get(&path).unwrap();

        Ok(report.clone())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Debug, Clone, Serialize)]
struct MeterpointSummary {
    pub name: String,
}

#[tauri::command]
async fn load_energy_report_file_dirty_meterpoints(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<HashMap<String, MeterpointSummary>, String> {
    let state_clone = state.inner().clone(); // Extract Arc before spawn_blocking

    println!("missing samples");

    tokio::task::spawn_blocking(move || {
        println!("path: {}", path);

        let mut reports = state_clone
            .energy_reports
            .lock()
            .map_err(|e| e.to_string())?;

        let report = reports
            .get_mut(&path)
            .ok_or_else(|| format!("Report not found: {}", path))?;

        // Calculate if not already done
        if report.missing_samples.is_empty() {
            report.get_missing_samples();
        }

        let mut result: HashMap<String, MeterpointSummary> = HashMap::new();

        for measurement in report.measurements.iter_mut() {
            if measurement.has_missing_samples {
                //println!("measurement has missing samples");

                if result.contains_key(&measurement.meter_point_id) == false {
                    result.insert(
                        measurement.meter_point_id.clone(),
                        MeterpointSummary {
                            name: measurement.name.clone(),
                        },
                    );
                }
            }
        }

        //let result = report.missing_samples.clone();

        println!("done");

        Ok(result)
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
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::all())
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            list_energy_report_files,
            check_energy_report_complete,
            load_energy_report_file_details,
            load_energy_report_file_dirty_meterpoints
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
