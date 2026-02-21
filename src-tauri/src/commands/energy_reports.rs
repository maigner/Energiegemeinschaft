use crate::state::AppState;
use eegfaktura_datalib::eegfaktura::loader::EnergyReport;
use serde::Serialize;
use std::{collections::HashMap, sync::PoisonError};

#[derive(Debug, Clone, Serialize)]
pub struct MeterpointSummary {
    pub name: String,
}

#[tauri::command]
pub async fn load_energy_report_file_dirty_meterpoints(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<HashMap<String, MeterpointSummary>, String> {
    let state_clone = state.inner().clone(); // Extract Arc before spawn_blocking

    //println!("missing samples");

    tokio::task::spawn_blocking(move || {
        //println!("path: {}", path);

        let mut reports = state_clone.energy_reports.lock().map_err(
            |e: PoisonError<std::sync::MutexGuard<'_, HashMap<String, _>>>| e.to_string(),
        )?;

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

#[tauri::command]
pub async fn check_energy_report_complete(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<Option<bool>, String> {
    let state_clone = state.inner().clone(); // Extract Arc before spawn_blocking

    tokio::task::spawn_blocking(move || {
        //println!("path: {}", path);

        let mut reports_guard = state_clone.energy_reports.lock().map_err(
            |e: PoisonError<std::sync::MutexGuard<'_, HashMap<String, EnergyReport>>>| {
                e.to_string()
            },
        )?;

        if let Some(existing_report) = reports_guard.get(&path) {
            //println!("Report already in hashmap, ");

            if existing_report.measurements_complete.is_some() {
                //println!("Report already checked, returning cached result");
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
