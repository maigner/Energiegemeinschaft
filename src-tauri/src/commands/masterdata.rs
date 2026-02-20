use std::{collections::HashMap, sync::PoisonError};

use eegfaktura_datalib::eegfaktura::loader::Masterdata;

use crate::state::AppState;

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
            return Ok(Some(true));
        }

        let masterdata = Masterdata::new(path.clone());

        masterdata_guard.insert(path.clone(), masterdata);

        let masterdata = masterdata_guard.get_mut(&path).unwrap();

        masterdata.get_file_complete();

        match masterdata.file_complete {
            Some(true) => Ok(Some(true)),
            Some(false) => Ok(Some(false)),
            None => Ok(Some(false)),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
