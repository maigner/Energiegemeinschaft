use std::collections::HashMap;

use calamine::{Data, DataType, Error, Range, Reader, Xlsx, open_workbook};
use chrono::{NaiveDate, NaiveDateTime};

// access types from parent
use crate::eegfaktura::loader::{
    EnergyDirection, Masterdata, Measurement, Member, MemberType, MeterCode, MeterPoint,
    MeterPointStatus, Sample, Timestamp,
};

// use calamine to parse excel and create a generic data structure for processing
// that does not depend on calamine methods
// i.e. get rid of excel complexity to make it compatible with data from faktura API
// i.e. hide excel lib dependencies to call site

impl super::EnergyReport {
    pub fn new(path: String) -> Self {
        let mut workbook: Xlsx<_> = match open_workbook(&path) {
            Ok(wb) => wb,
            Err(error) => panic!("Problem opening the workbook: {error:?}"),
        };

        // read "Summary" to get the correct start and end dates from "Aktiviert"

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

        super::EnergyReport {
            timeline: timeline,
            measurements: measurements,
            measurements_complete: None,
            missing_samples: Vec::new(),
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
                "CONSUMPTION" => EnergyDirection::Consumption,
                "GENERATION" => EnergyDirection::Generation,
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
            has_missing_samples: false,
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
                        timestamp: timeline.get(timestamp_index).unwrap().timestamp,
                        value: v,
                    })
                }
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

//TODO: implement member list somehow

impl super::Masterdata {
    pub fn new(path: String) -> Self {
        let mut workbook: Xlsx<_> = match open_workbook(&path) {
            Ok(wb) => wb,
            Err(error) => panic!("Problem opening the workbook: {error:?}"),
        };

        let range = match workbook.worksheet_range("Mitglieder") {
            Ok(r) => r,
            Err(error) => panic!("Problem fetching Sheet Energiedaten: {error:?}"),
        };

        //let h = range.headers();
        //println!("{:?}", h);

        let mut members: HashMap<String, Member> = HashMap::new();

        for row in range.rows().skip(1) {
            let member_number = match row.get(0) {
                Some(v) if !v.is_empty() => v.as_string(),
                _ => None,
            }
            .unwrap();

            if members.contains_key(&member_number) {
                //println!("membernumber found");
            } else {
                let first_name = match row.get(1) {
                    Some(v) if !v.is_empty() => v.as_string().map(|s| s.trim().to_string()),
                    _ => None,
                };
                let last_name = match row.get(2) {
                    Some(v) if !v.is_empty() => v.as_string().map(|s| s.trim().to_string()),
                    _ => None,
                };
                let company_name = match row.get(1) {
                    Some(v) if !v.is_empty() => v.as_string().map(|s| s.trim().to_string()),
                    _ => None,
                };
                let email = match row.get(6) {
                    Some(v) if !v.is_empty() => v.as_string().map(|s| s.trim().to_string()),
                    _ => None,
                }
                .unwrap();

                //22: teilnahme als
                let member_type = row
                    .get(22)
                    .and_then(|v| v.as_string())
                    .and_then(|s| MemberType::from_str(&s))
                    .unwrap_or(MemberType::Private);

                members.insert(
                    member_number.clone(),
                    Member {
                        member_number: member_number.clone(),
                        first_name: first_name,
                        last_name: last_name,
                        company_name: company_name,
                        email: email,
                        member_type: member_type,
                        meter_points: HashMap::new(),
                    },
                );
            }

            // we have basic user data. now for the meter point specific stuff

            if let Some(member) = members.get_mut(&member_number) {
                //member.first_name = Some("Updated".to_string());
                //member.email = "new@email.com".to_string();
                // Changes ARE preserved in the HashMap

                // index 25 is meter point number
                let meter_point_id = match row.get(25) {
                    Some(v) if !v.is_empty() => v.as_string().map(|s| s.trim().to_string()),
                    _ => None,
                }
                .unwrap();

                //println!("meter point id {}", meter_point_id);

                //26: meter point status
                let meter_point_status = row
                    .get(26)
                    .and_then(|v| v.as_string())
                    .and_then(|s| MeterPointStatus::from_str(&s))
                    .unwrap_or(MeterPointStatus::Invalid);

                //println!("meter_point_status {:?}", meter_point_status);

                //29 "registriert"
                let meter_point_registered = row
                    .get(29)
                    .filter(|v| !v.is_empty())
                    .and_then(|v| {
                        let s = v.as_string()?;
                        //println!("Raw date string: '{}'", s);
                        NaiveDate::parse_from_str(s.trim(), "%Y-%m-%d")
                            .map_err(|e| println!("Parse error: {}", e))
                            .ok()
                    })
                    .expect("Failed to parse meter_point_registered date");

                //println!("meter_point_registered {:?}", meter_point_registered);

                //30: direction
                let energy_direction = row
                    .get(30)
                    .and_then(|v| v.as_string())
                    .and_then(|s| EnergyDirection::from_str(&s))
                    .unwrap();

                //println!("energy_direction {:?}", energy_direction);

                //37 "aktiviert"
                let meter_point_activated = row.get(37).filter(|v| !v.is_empty()).and_then(|v| {
                    let s = v.as_string()?;
                    //println!("Raw date string: '{}'", s);
                    NaiveDate::parse_from_str(s.trim(), "%Y-%m-%d")
                        .map_err(|e| println!("Parse error: {}", e))
                        .ok()
                });

                //println!("meter_point_activated {:?}", meter_point_activated);

                //38 "deaktiviert"
                let meter_point_deactivated = row.get(38).filter(|v| !v.is_empty()).and_then(|v| {
                    let s = v.as_string()?;
                    //println!("Raw date string: '{}'", s);
                    NaiveDate::parse_from_str(s.trim(), "%Y-%m-%d")
                        .map_err(|e| println!("Parse error meter_point_deactivated: {}", e))
                        .ok()
                });

                //println!("meter_point_deactivated {:?}", meter_point_deactivated);

                // index 39 is "Tarif Name"
                let subscription = match row.get(39) {
                    Some(v) if !v.is_empty() => v.as_string().map(|s| s.trim().to_string()),
                    _ => None,
                };

                //println!("subscription {:?}", subscription);

                let meter_point = MeterPoint {
                    id: meter_point_id.clone(),
                    status: meter_point_status,
                    registered: meter_point_registered,
                    energy_direction: energy_direction,
                    activated: meter_point_activated,
                    deactivated: meter_point_deactivated,
                    subscription_name: subscription,
                };

                member
                    .meter_points
                    .insert(meter_point_id.clone(), meter_point);
            }

            // update meter point data to member
        }

        Masterdata {
            members: members,
            file_complete: None,
            missing_activations: Vec::new(),
            missing_subscriptions: Vec::new(),
        }
    }
}
