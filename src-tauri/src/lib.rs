use glob::Pattern;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(serde::Serialize, Clone)]
struct AppData {
    welcome_message: &'static str,
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
            let energy_reports = list
                .into_iter()
                .filter(|path| {
                    path.file_name()
                        .and_then(|name| name.to_str())
                        .map(|name| pattern.matches(name))
                        .unwrap_or(false)
                })
                .collect();
            Ok(energy_reports)
        }
        Err(e) => Err(e.to_string()),
    }
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_welcome(state: State<'_, Mutex<AppData>>, app: AppHandle) -> String {
    let s = state.lock().unwrap();

    app.emit("energyfile-ready", s.welcome_message.to_string())
        .unwrap();

    s.welcome_message.to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            app.manage(Mutex::new(AppData {
                welcome_message: "FooBar",
            }));
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_welcome,
            list_energy_report_files
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
