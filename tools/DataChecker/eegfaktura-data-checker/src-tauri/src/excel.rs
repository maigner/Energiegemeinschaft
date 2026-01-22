use calamine::{open_workbook, Reader, Xlsx};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Serialize, Deserialize)]
pub struct ExcelData {
    pub sheets: Vec<SheetData>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SheetData {
    pub name: String,
    pub rows: Vec<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExcelError {
    pub message: String,
}

impl From<calamine::Error> for ExcelError {
    fn from(err: calamine::Error) -> Self {
        ExcelError {
            message: err.to_string(),
        }
    }
}

impl From<calamine::XlsxError> for ExcelError {
    fn from(err: calamine::XlsxError) -> Self {
        ExcelError {
            message: err.to_string(),
        }
    }
}

/// Read an Excel file and return all sheets with their data
#[tauri::command]
pub fn read_excel(path: String) -> Result<ExcelData, ExcelError> {
    let path = Path::new(&path);

    // Open the workbook
    let mut workbook: Xlsx<_> = open_workbook(path)?;

    let mut sheets = Vec::new();

    // Get all sheet names
    let sheet_names = workbook.sheet_names().to_owned();

    // Iterate through each sheet
    for sheet_name in sheet_names {
        if let Ok(range) = workbook.worksheet_range(&sheet_name) {
            let mut rows = Vec::new();

            // Convert each row to a vector of strings
            for row in range.rows() {
                let row_data: Vec<String> = row.iter().map(|cell| cell.to_string()).collect();

                rows.push(row_data);
            }

            sheets.push(SheetData {
                name: sheet_name,
                rows,
            });
        }
    }

    Ok(ExcelData { sheets })
}

/// Read a specific sheet from an Excel file
#[tauri::command]
pub fn read_excel_sheet(path: String, sheet_name: String) -> Result<SheetData, ExcelError> {
    let path = Path::new(&path);

    let mut workbook: Xlsx<_> = open_workbook(path)?;

    let range = workbook
        .worksheet_range(&sheet_name)
        .map_err(|e| ExcelError {
            message: format!("Failed to read sheet '{}': {}", sheet_name, e),
        })?;

    let mut rows = Vec::new();

    for row in range.rows() {
        let row_data: Vec<String> = row.iter().map(|cell| cell.to_string()).collect();

        rows.push(row_data);
    }

    Ok(SheetData {
        name: sheet_name,
        rows,
    })
}

/// Get all sheet names from an Excel file
#[tauri::command]
pub fn get_sheet_names(path: String) -> Result<Vec<String>, ExcelError> {
    let path = Path::new(&path);

    let workbook: Xlsx<_> = open_workbook(path)?;

    Ok(workbook.sheet_names().to_owned())
}
