use std::{collections::HashMap, sync::PoisonError};

use eegfaktura_datalib::eegfaktura::loader::Masterdata;

use crate::state::AppState;

#[tauri::command]
pub async fn load_masterdata_missing_activations(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let state_clone = state.inner().clone(); // Extract Arc before spawn_blocking

    tokio::task::spawn_blocking(move || {
        //println!("path: {}", path);

        let mut masterdata_guard = state_clone.masterdata_reports.lock().map_err(
            |e: PoisonError<std::sync::MutexGuard<'_, HashMap<String, Masterdata>>>| e.to_string(),
        )?;

        let masterdata = masterdata_guard.get_mut(&path).unwrap();

        println!("{:?}", masterdata.missing_activations);

        Ok(masterdata.missing_activations.clone())
    })
    .await
    .map_err(|e| e.to_string())?
}


#[tauri::command]
pub async fn load_masterdata_missing_subscriptions(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let state_clone = state.inner().clone(); // Extract Arc before spawn_blocking

    tokio::task::spawn_blocking(move || {
        //println!("path: {}", path);

        let mut masterdata_guard = state_clone.masterdata_reports.lock().map_err(
            |e: PoisonError<std::sync::MutexGuard<'_, HashMap<String, Masterdata>>>| e.to_string(),
        )?;

        let masterdata = masterdata_guard.get_mut(&path).unwrap();

        println!("{:?}", masterdata.missing_subscriptions);

        Ok(masterdata.missing_subscriptions.clone())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn check_masterdata_complete(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<Option<bool>, String> {
    let state_clone = state.inner().clone(); // Extract Arc before spawn_blocking

    tokio::task::spawn_blocking(move || {
        //println!("path: {}", path);

        let mut masterdata_guard = state_clone.masterdata_reports.lock().map_err(
            |e: PoisonError<std::sync::MutexGuard<'_, HashMap<String, Masterdata>>>| e.to_string(),
        )?;

        if let Some(existing_masterdata) = masterdata_guard.get(&path) {
            println!("Masterdata already in hashmap, ");
            return Ok(existing_masterdata.file_complete);
        }

        let masterdata = Masterdata::new(path.clone());

        masterdata_guard.insert(path.clone(), masterdata);

        let masterdata = masterdata_guard.get_mut(&path).unwrap();

        masterdata.get_file_complete();

        Ok(masterdata.file_complete.clone())
    })
    .await
    .map_err(|e| e.to_string())?
}
