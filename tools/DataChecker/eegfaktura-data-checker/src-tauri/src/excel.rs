// src-tauri/src/excel.rs

use serde::Serialize;
use std::path::Path;

#[derive(Serialize)]
pub struct XlsxRow(pub Vec<Option<String>>);

#[derive(Serialize)]
pub struct XlsxSheet {
    pub name: String,
    pub data: Vec<XlsxRow>,
}

#[derive(Serialize)]
pub struct XlsxError {
    pub message: String,
}

impl From<String> for XlsxError {
    fn from(msg: String) -> Self {
        Self { message: msg }
    }
}

impl From<anyhow::Error> for XlsxError {
    fn from(err: anyhow::Error) -> Self {
        Self {
            message: err.to_string(),
        }
    }
}

pub async fn read_xlsx_file(path: String) -> Result<Vec<XlsxSheet>, XlsxError> {
    use calamine::{ExcelReader, Reader};

    let path = Path::new(&path);

    if !path.exists() {
        return Err(format!("File does not exist: {}", path.display()).into());
    }

    let mut excel: ExcelReader<_> = calamine::open_workbook_auto(&path)
        .map_err(|e| format!("Failed to open Excel file: {}", e))?;

    let mut sheets = Vec::new();

    for (sheet_name, mut worksheet) in excel.worksheets() {
        let mut rows = Vec::new();

        if let Some(cell_range) = worksheet.rows() {
            for row in cell_range {
                let row_vec: Vec<Option<String>> = row
                    .iter()
                    .map(|cell| {
                        Some(match cell {
                            calamine::DataType::Empty => "".to_string(),
                            calamine::DataType::String(s) => s.to_string(),
                            calamine::DataType::Float(f) => f.to_string(),
                            calamine::DataType::Int(i) => i.to_string(),
                            calamine::DataType::Bool(b) => b.to_string(),
                            calamine::DataType::Error(e) => format!("#ERROR: {}", e),
                            calamine::DataType::DateTime(d) => format!("DATE: {}", d),
                        })
                    })
                    .collect();

                rows.push(XlsxRow(row_vec));
            }
        }

        sheets.push(XlsxSheet {
            name: sheet_name.to_string(),
            data: rows,
        });
    }

    Ok(sheets)
}