mod excel;

// unit tests
#[cfg(test)]
mod tests;


// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            excel::read_excel,
            excel::read_excel_sheet,
            excel::get_sheet_names
            ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
