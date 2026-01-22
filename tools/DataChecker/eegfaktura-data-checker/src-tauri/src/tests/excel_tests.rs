#[cfg(test)]
mod excel_tests {
    use crate::excel::{read_excel};

    #[test]
    fn test_read_excel_energydata_structure() {

        let test_file = "test-files/Test1.xlsx";

        // Test reading all sheets
        let result = read_excel(test_file.to_string());

        // reading the file works
        assert!(result.is_ok());

        let data = result.unwrap();
        assert_eq!(data.sheets.len(), 3);

        // Verify sheet names
        assert_eq!(data.sheets[0].name, "Summary");
        assert_eq!(data.sheets[1].name, "Energiedaten");
        assert_eq!(data.sheets[2].name, "QoV Log");
        

        // first empty row is skipped by read_excel
        assert_eq!(data.sheets[0].rows[0][0], "Gemeinschafts-ID");

    }

    /*

        #[test]
    fn test_read_excel_all_sheets() {
        let test_file = "test-files/RC101533-Energy-Report-20260107_20260108.xlsx";

        // Test reading all sheets
        let result = read_excel(test_file.to_string());

        assert!(result.is_ok());
        let data = result.unwrap();
        assert_eq!(data.sheets.len(), 3);

        // Verify first sheet
        assert_eq!(data.sheets[0].name, "Sheet1");
        assert_eq!(data.sheets[0].rows.len(), 3);
        assert_eq!(data.sheets[0].rows[0][0], "Name");
        assert_eq!(data.sheets[0].rows[1][0], "Alice");

        // Verify second sheet
        assert_eq!(data.sheets[1].name, "Sheet2");
        assert_eq!(data.sheets[1].rows.len(), 2);

        // Cleanup
        fs::remove_file(test_file).ok();
    }


    #[test]
    fn test_read_excel_specific_sheet() {
        let test_file = "test_specific_sheet.xlsx";


        // Test reading specific sheet
        let result = read_excel_sheet(test_file.to_string(), "Sheet1".to_string());

        assert!(result.is_ok());
        let sheet = result.unwrap();
        assert_eq!(sheet.name, "Sheet1");
        assert_eq!(sheet.rows.len(), 3);
        assert_eq!(sheet.rows[0].len(), 3); // 3 columns

        // Cleanup
        fs::remove_file(test_file).ok();
    }

    #[test]
    fn test_read_excel_nonexistent_sheet() {
        let test_file = "test_nonexistent_sheet.xlsx";


        // Test reading non-existent sheet
        let result = read_excel_sheet(test_file.to_string(), "NonExistent".to_string());

        assert!(result.is_err());
        let error = result.unwrap_err();
        assert!(error.message.contains("NonExistent"));

        // Cleanup
        fs::remove_file(test_file).ok();
    }

    #[test]
    fn test_get_sheet_names() {
        let test_file = "test_sheet_names.xlsx";


        // Test getting sheet names
        let result = get_sheet_names(test_file.to_string());

        assert!(result.is_ok());
        let names = result.unwrap();
        assert_eq!(names.len(), 2);
        assert!(names.contains(&"Sheet1".to_string()));
        assert!(names.contains(&"Sheet2".to_string()));

        // Cleanup
        fs::remove_file(test_file).ok();
    }

    #[test]
    fn test_read_excel_invalid_file() {
        // Test with non-existent file
        let result = read_excel("nonexistent_file.xlsx".to_string());

        assert!(result.is_err());
        let error = result.unwrap_err();
        assert!(!error.message.is_empty());
    }

     */

    /*
    #[test]
    fn test_read_excel_data_types() {
        let test_file = "test_data_types.xlsx";

        // Create file with various data types
        let mut workbook = Xlsx::new();
        let mut sheet = Vec::new();
        sheet.push(vec![
            DataType::String("Text".to_string()),
            DataType::Float(123.45),
            DataType::Bool(true),
            DataType::Empty,
        ]);

        workbook
            .write_sheet("DataTypes", &sheet)
            .expect("Failed to write sheet");
        workbook.save(test_file).expect("Failed to save workbook");

        // Read and verify
        let result = read_excel(test_file.to_string());
        assert!(result.is_ok());

        let data = result.unwrap();
        assert_eq!(data.sheets[0].rows[0].len(), 4);
        assert_eq!(data.sheets[0].rows[0][0], "Text");
        assert!(data.sheets[0].rows[0][2].contains("true"));

        // Cleanup
        fs::remove_file(test_file).ok();
    }
     */
}
