use std::{fs, path::PathBuf};

use glob::Pattern;


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
pub fn list_energy_report_files() -> Result<Vec<PathBuf>, String> {
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
pub fn list_masterdata_files() -> Result<Vec<PathBuf>, String> {
    match list_xlsx_files() {
        Ok(list) => {
            let pattern = Pattern::new("RC*-EEG-Masterdata-*").unwrap();
            let mut file_list: Vec<PathBuf> = list
                .into_iter()
                .filter(|path| {
                    path.file_name()
                        .and_then(|name| name.to_str())
                        .map(|name| pattern.matches(name))
                        .unwrap_or(false)
                })
                .collect();

            // sort by modification date
            file_list.sort_by_cached_key(|path| {
                fs::metadata(path)
                    .and_then(|m| m.modified())
                    .ok()
                    .map(|t| std::cmp::Reverse(t)) // Reverse for descending order
            });

            // last 10 only
            file_list.truncate(10);

            Ok(file_list)
        }
        Err(e) => Err(e.to_string()),
    }
}
