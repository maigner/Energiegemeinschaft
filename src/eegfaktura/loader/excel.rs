use calamine::{Data, DataType, Error, Range, Reader, Xlsx, open_workbook};
use chrono::NaiveDateTime;

// access types from parent
use crate::eegfaktura::loader::{EnergyDirection, Measurement, MeterCode, Sample, Timestamp};

// use calamine to parse excel and create a generic data structure for processing
// that does not depend on calamine methods
// i.e. get rid of excel complexity to make it compatible with data from faktura API
// i.e. hide excel lib dependencies to call site

pub struct EnergyFile {
    path: String,
    timeline: Vec<Timestamp>,
    measurements: Vec<Measurement>,
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

        let measurements = match parse_meter_points(&range, &timeline) {
            Ok(m) => m,
            Err(error) => panic!("Problem parsing measurements: {error:?}"),
        };

        EnergyFile {
            path,
            timeline: timeline,
            measurements: measurements,
        }
    }

    pub fn get_timeline(&self) -> &Vec<Timestamp> {
        &self.timeline
    }

    pub fn get_measurements(&self) -> &Vec<Measurement> {
        &self.measurements
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
            timestamp: NaiveDateTime::parse_from_str(ts_string.as_str(), "%d.%m.%Y %H:%M:%S")
                .expect("Failed to parse date"),
        };
        timeline.push(timestamp);
    }

    Ok(timeline)
}

fn parse_meter_points(
    range: &Range<Data>,
    timeline: &Vec<Timestamp>,
) -> Result<Vec<Measurement>, Error> {
    let mut measurements: Vec<Measurement> = Vec::new();

    // get sub-range from range
    let mut data_range_start = range.start().unwrap();
    data_range_start.1 = 1; // start col index
    let data_range_end = range.end().unwrap();
    let data_range = range.range(data_range_start, data_range_end);

    let mut col_index = 0;
    while col_index < data_range.width() {
        let point_nr = data_range.get((0, col_index)).unwrap().as_string().unwrap();
        let name = data_range.get((1, col_index)).unwrap().as_string().unwrap();
        let energy_direction = data_range.get((2, col_index)).unwrap().as_string().unwrap();
        let period_start = data_range.get((3, col_index)).unwrap().as_string().unwrap();
        let period_end = data_range.get((4, col_index)).unwrap().as_string().unwrap();
        let meter_code = data_range.get((5, col_index)).unwrap().as_string().unwrap();

        // setup measurement. values are added later
        let mut measurement = Measurement {
            meter_point_id: point_nr,
            period_start: NaiveDateTime::parse_from_str(period_start.as_str(), "%d.%m.%Y %H:%M:%S")
                .expect("Failed to parse date"),
            period_end: NaiveDateTime::parse_from_str(period_end.as_str(), "%d.%m.%Y %H:%M:%S")
                .expect("Failed to parse date"),
            name: name,
            direction: match energy_direction.as_str() {
                "CONSUMPTION" => EnergyDirection::CONSUMPTION,
                "GENERATION" => EnergyDirection::GENERATION,
                _ => panic!("unknown energy direction"),
            },
            meter_code: match meter_code.as_str() {
                "Gesamtverbrauch lt. Messung (bei Teilnahme gem. Erzeugung) [KWH]" => {
                    MeterCode::TotalConsumption
                }
                "Anteil gemeinschaftliche Erzeugung [KWH]" => MeterCode::ShareOnProduction,
                "Eigendeckung gemeinschaftliche Erzeugung [KWH]" => {
                    MeterCode::ConsumptionOfProduction
                }
                "Gesamte gemeinschaftliche Erzeugung [KWH]" => MeterCode::TotalProduction,
                "Gesamt/Überschusserzeugung, Gemeinschaftsüberschuss [KWH]" => {
                    MeterCode::ProductionOvershoot
                }
                _ => panic!("unknown meter code"),
            },
            values_over_time: Vec::new(),
        };

        // starting at row index 9, we can scroll down the column
        let data_row_offset = 9;
        let mut row_index = data_row_offset;
        while row_index < data_range.height() {
            // index into timeline to fetch dateTime
            let timestamp_index = row_index - data_row_offset;

            // convert cell content to Sample
            let sample: Option<Sample> = match data_range.get((row_index, col_index)) {
                Some(v) => {
                    // parse cell value, if any
                    let value: Option<f64> = if v.is_empty() { None } else { v.as_f64() };

                    value.map(|v| Sample {
                        timeline_index: timestamp_index,
                        timestamp: timeline.get(timestamp_index).unwrap().timestamp,
                        value: v,
                    })
                },
                None => None,
            };
            //println!("row_index {}, value {:?}", row_index, sample);

            measurement.values_over_time.push(sample);

            row_index += 1;
        }

        measurements.push(measurement);

        col_index += 1;
    }

    Ok(measurements)
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
        
        assert_eq!(
            energy_file.get_timeline().first().unwrap().timestamp,
            naive_date_time_first
        );

        let last_date = String::from("01.10.2025 01:00:00");
        let naive_date_time_last =
            NaiveDateTime::parse_from_str(last_date.as_str(), "%d.%m.%Y %H:%M:%S").unwrap();

        assert_eq!(
            energy_file.get_timeline().last().unwrap().timestamp,
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
