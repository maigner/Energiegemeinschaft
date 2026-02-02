use calamine::{Data, DataType, Error, Range, Reader, Xlsx, open_workbook};
use chrono::NaiveDateTime;

// access types from parent
use super::*;

// use calamine to parse excel and create a generic data structure for processing
// that does not depend on calamine methods
// i.e. get rid of excel complexity to make it compatible with data from faktura API
// i.e. hide excel lib dependencies to call site





pub struct EnergyFile {
    path: String,
    pub timeline: Vec<Timestamp>,
}

impl EnergyFile {
    pub fn new(path: String) -> Self {
        let mut workbook: Xlsx<_> = match open_workbook(&path) {
            Ok(wb) => wb,
            Err(error) => panic!("Problem opening the workbook: {error:?}"),
        };

        let range = match workbook.worksheet_range("Energiedaten") {
            Ok(r) => r,
            Err(error) => panic!("Problem fetching Sheet Energiedaten: {error:?}"),
        };

        let timeline = match parse_timeline(&range) {
            Ok(t) => t,
            Err(error) => panic!("Problem parsing timeline: {error:?}"),
        };

        EnergyFile {
            path,
            timeline: timeline,
        }
    }
}

fn parse_timeline(range: &Range<Data>) -> Result<Vec<Timestamp>, Error> {
    let mut timeline: Vec<Timestamp> = Vec::new();

    // get sub-range from range
    let mut timeline_range_start = range.start().unwrap();
    timeline_range_start.0 = 10; // start row index
    let mut timeline_range_end = range.end().unwrap();
    timeline_range_end.1 = 0; // single column

    // slice range
    let timeline_range = range.range(timeline_range_start, timeline_range_end);

    for row in timeline_range.rows() {
        // timestamp is stored as string in excel
        let ts_string = row[0].as_string().unwrap();
        let timestamp = Timestamp {
            timestamp: ts_string.clone(),
            naive_date_time: NaiveDateTime::parse_from_str(ts_string.as_str(), "%d.%m.%Y %H:%M:%S")
                .expect("Failed to parse date"),
        };
        timeline.push(timestamp);
    }

    Ok(timeline)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_energy_file_timeline() {
        let base_path = format!("{}", env!("CARGO_MANIFEST_DIR"));
        let member_list = "test-files/Energy-Report-small.xlsx";
        let path = format!("{}/{}", base_path, member_list);
        let energy_file = EnergyFile::new(path);

        let first_date = String::from("01.10.2025 00:00:00");
        let naive_date_time_first =
            NaiveDateTime::parse_from_str(first_date.as_str(), "%d.%m.%Y %H:%M:%S").unwrap();
        assert_eq!(energy_file.timeline.first().unwrap().timestamp, first_date);
        assert_eq!(
            energy_file.timeline.first().unwrap().naive_date_time,
            naive_date_time_first
        );

        let last_date = String::from("01.10.2025 01:00:00");
        let naive_date_time_last =
            NaiveDateTime::parse_from_str(last_date.as_str(), "%d.%m.%Y %H:%M:%S").unwrap();
        assert_eq!(energy_file.timeline.last().unwrap().timestamp, last_date);
        assert_eq!(
            energy_file.timeline.last().unwrap().naive_date_time,
            naive_date_time_last
        );
    }

    #[test]
    fn test_parse_energy_file() {
        let base_path = format!("{}", env!("CARGO_MANIFEST_DIR"));
        let member_list = "test-files/Energy-Report-small.xlsx";
        let path = format!("{}/{}", base_path, member_list);

        let energy_file = EnergyFile::new(path.clone());

        assert_eq!(energy_file.path, path.clone());
    }
}
