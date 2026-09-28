use std::{collections::HashMap, str::FromStr};

use calamine::{Data, DataType, Error, Range, Reader, Xlsx, open_workbook};
use chrono::{NaiveDate, NaiveDateTime};

// access types from parent
use crate::eegfaktura::loader::{
    ActivationStats, EnergyDirection, EnergyReportMeterPointStats, Masterdata, Measurement, Member,
    MemberType, MeterCode, MeterPoint, MeterPointStatus, PodList, Sample, Timestamp,
};

use super::comments::{parse_affected_days, read_comments};

/// Parses a `dd.mm.yyyy HH:MM:SS` timestamp, ignoring any trailing digits
/// beyond the seconds field. The export inconsistently appends a few extra
/// zero digits after the seconds (e.g. `"...23:45:0000"` vs plain
/// `"...23:45:00"`); those digits don't encode real sub-second precision, so
/// rather than track exactly when the export does or doesn't add them, this
/// truncates to the fixed-width `dd.mm.yyyy HH:MM:SS` prefix and ignores
/// whatever follows.
fn parse_ddmmyyyy_hms(s: &str) -> Result<NaiveDateTime, chrono::ParseError> {
    let prefix = if s.len() > 19 { &s[..19] } else { s };
    NaiveDateTime::parse_from_str(prefix, "%d.%m.%Y %H:%M:%S")
}

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

        // member data from energy report. to compare with masterdata file for conflicts.
        // also carries the L0/L2/L3 quality counts per meter point (replaces the old,
        // now-removed "QoV Log" sheet - the export no longer includes it; quality is
        // now on the Energiedaten cells themselves as fill color, and aggregated here
        // in Summary as counts + comments listing the affected days).
        let member_range = match workbook.worksheet_range("Summary") {
            Ok(r) => r,
            Err(error) => panic!("Problem fetching Sheet Summary: {error:?}"),
        };
        let comments = read_comments(&path);
        let meter_points_stats = match parse_meter_point_data(&member_range, &comments) {
            Ok(m) => m,
            Err(error) => panic!("Problem parse_meter_point_data Summary: {error:?}"),
        };

        super::EnergyReport {
            timeline: timeline,
            measurements: measurements,
            measurements_complete: None,
            missing_samples: Vec::new(),
            meter_points_stats: meter_points_stats,
        }
    }
}

fn parse_meter_point_data(
    range: &Range<Data>,
    comments: &HashMap<String, String>,
) -> Result<HashMap<String, EnergyReportMeterPointStats>, Error> {
    let mut result: HashMap<String, EnergyReportMeterPointStats> = HashMap::new();

    // get sub-range from range
    let mut timeline_range_start = range.start().unwrap();
    let data_start_row = 12; // start row index below "Verbrauchszählpunkt"
    timeline_range_start.0 = data_start_row;
    let timeline_range_end = range.end().unwrap();
    //timeline_range_end.1 = 0; // single column

    let meter_point_range = range.range(timeline_range_start, timeline_range_end);

    // first come consumption points until a blank row
    let mut current_energy_direction = EnergyDirection::Consumption;

    // then there are in total two blank rows in excel
    // then there is "Einspeisezählpunkt"
    // then the rest

    for (i, row) in meter_point_range.rows().enumerate() {
        // 1-based Excel row number of this row, needed to look up its L0/L2/L3
        // comments (e.g. "H13") by cell reference.
        let row_no = data_start_row as usize + 1 + i;

        // timestamp is stored as string in excel

        match row[0].as_string() {
            Some(v) => {
                match v.as_str() {
                    "Einspeisezählpunkt" => {
                        // swith direction from now on
                        current_energy_direction = EnergyDirection::Generation;
                        // but no actual value
                    }
                    _ => {
                        // this is a good row. parse it. add result to final data structure
                        // v is meter_point id now
                        let meter_point_id = v;

                        let name = row[1].as_string().unwrap();

                        // datetime format varies: "05.02.2024 00:00:0000" or
                        // "25.09.2026 23:45:00" - trailing digits after the
                        // seconds field are inconsistent padding, not real
                        // sub-second precision (see parse_ddmmyyyy_hms).
                        // col index 2
                        let datetime_start =
                            parse_ddmmyyyy_hms(row[2].as_string().unwrap().as_str())
                                .expect("Failed to parse Beginn der Daten");

                        // col index 3
                        let datetime_end =
                            parse_ddmmyyyy_hms(row[3].as_string().unwrap().as_str())
                                .expect("Failed to parse Ende der Daten");

                        // col 4
                        // format: 04-08-2025 - 31-12-2999
                        // split start and end
                        let date_active_string = row[4].as_string().unwrap();
                        let date_active_parts: Vec<&str> =
                            date_active_string.split(" - ").collect();

                        let date_active_start =
                            NaiveDate::parse_from_str(date_active_parts[0].trim(), "%d-%m-%Y")
                                .unwrap();
                        let date_active_end =
                            NaiveDate::parse_from_str(date_active_parts[1].trim(), "%d-%m-%Y")
                                .unwrap();

                        //println!("Start: {}", date_active_start); // 2025-10-09
                        //println!("End: {}", date_active_end); // 2999-12-31

                        // col 5 (F): "Daten vollständig? Ja/Nein" as 1/0.
                        let data_complete = row
                            .get(5)
                            .and_then(|c| c.as_f64())
                            .map(|v| v != 0.0)
                            .unwrap_or(true);

                        // cols 6-8 (G/H/I): L0/L2/L3 quarter-hour counts, blank when
                        // zero. Non-zero cells carry a comment naming the affected
                        // days (col letters are fixed by the export's layout).
                        let l0_count = row.get(6).and_then(|c| c.as_f64()).unwrap_or(0.0) as u32;
                        let l2_count = row.get(7).and_then(|c| c.as_f64()).unwrap_or(0.0) as u32;
                        let l3_count = row.get(8).and_then(|c| c.as_f64()).unwrap_or(0.0) as u32;

                        let affected_days = |col: &str| -> Vec<NaiveDate> {
                            comments
                                .get(&format!("{col}{row_no}"))
                                .map(|text| parse_affected_days(text))
                                .unwrap_or_default()
                        };
                        let l0_days = affected_days("G");
                        let l2_days = affected_days("H");
                        let l3_days = affected_days("I");

                        let meter_point_stats = EnergyReportMeterPointStats {
                            meter_point_id: meter_point_id.clone(),
                            energy_direction: current_energy_direction.clone(),
                            name: name,
                            timestamp_start: datetime_start,
                            timestamp_end: datetime_end,
                            date_active_start: date_active_start,
                            date_active_end: date_active_end,
                            data_complete,
                            l0_count,
                            l2_count,
                            l3_count,
                            l0_days,
                            l2_days,
                            l3_days,
                        };

                        result.insert(meter_point_id.clone(), meter_point_stats);
                    }
                }
            }
            None => {
                //skipping
                //println!("skipping");
            }
        }

        //println!("{:?}", meter_point_id);
    }

    Ok(result)
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
            timestamp: parse_ddmmyyyy_hms(ts_string.as_str()).expect("Failed to parse date"),
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
            period_start: parse_ddmmyyyy_hms(period_start.as_str()).expect("Failed to parse date"),
            period_end: parse_ddmmyyyy_hms(period_end.as_str()).expect("Failed to parse date"),
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
                    .and_then(|s| MemberType::from_str(&s).ok())
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
                    .and_then(|s| MeterPointStatus::from_str(&s).ok())
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
                let energy_direction: EnergyDirection = row
                    .get(30)
                    .and_then(|v| v.as_string())
                    .and_then(|s| Some(EnergyDirection::from_str(&s)))
                    .unwrap()
                    .unwrap();

                //println!("energy_direction {:?}", energy_direction);

                //37 "aktiviert"
                let meter_point_activated = row.get(37).filter(|v| !v.is_empty()).and_then(|v| {
                    let s = v.as_string()?;
                    //println!("Raw date string: '{}'", s);
                    NaiveDate::parse_from_str(s.trim(), "%Y-%m-%d")
                        .map_err(|e| e.to_string())
                        .ok()
                });

                //println!("meter_point_activated {:?}", meter_point_activated);

                //38 "deaktiviert"
                let meter_point_deactivated = row.get(38).filter(|v| !v.is_empty()).and_then(|v| {
                    let s = v.as_string()?;
                    //println!("Raw date string: '{}'", s);
                    NaiveDate::parse_from_str(s.trim(), "%Y-%m-%d")
                        .map_err(|e| e.to_string())
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

// Parse the ZP_PODLIST export (single sheet "ZP-List").
//
// Layout (header in row 0, data from row 1):
//   [0] Nr.               (row counter, ignored)
//   [1] Zählpunktname     (meter point id -> map key)
//   [2] ConsentID         (ignored)
//   [3] Bezugsrichtung    (CONSUMPTION / GENERATION, not kept in ActivationStats)
//   [4] Teilnahme-faktor  (participation factor, 0..=100)
//   [5] statische Aufteilung (ignored)
//   [6] aktiviert         (Excel serial date)
//   [7] aktiv seit        (Excel serial date)
//   [8] aktiv bis         (Excel serial date, sentinel 9999-12-31 = "open")
//
// NOTE: a meter point may appear on more than one row (e.g. as both a
// consumption and a generation point). Because the key is the meter point id,
// later rows overwrite earlier ones in the returned map.
impl super::PodList {
    pub fn new(path: String) -> Self {
        let mut workbook: Xlsx<_> = match open_workbook(&path) {
            Ok(wb) => wb,
            Err(error) => panic!("Problem opening the workbook: {error:?}"),
        };

        let range = match workbook.worksheet_range("ZP-List") {
            Ok(r) => r,
            Err(error) => panic!("Problem fetching Sheet ZP-List: {error:?}"),
        };

        let mut meter_point_activations: HashMap<String, ActivationStats> = HashMap::new();

        for row in range.rows().skip(1) {
            // skip blank rows (no meter point id in column 1)
            let meter_point_id = match row.get(1) {
                Some(v) if !v.is_empty() => v.as_string().map(|s| s.trim().to_string()),
                _ => None,
            };
            let meter_point_id = match meter_point_id {
                Some(id) => id,
                None => continue,
            };

            let participation_factor = row
                .get(4)
                .and_then(|v| v.as_f64())
                .map(|f| f as i8)
                .unwrap_or(0);

            // dates are stored as Excel serial numbers (numFmt 14), not text
            let activated = row
                .get(6)
                .and_then(|v| v.as_date())
                .expect("Failed to parse 'aktiviert' date");
            let active_since = row
                .get(7)
                .and_then(|v| v.as_date())
                .expect("Failed to parse 'aktiv seit' date");
            let active_until = row
                .get(8)
                .and_then(|v| v.as_date())
                .expect("Failed to parse 'aktiv bis' date");

            meter_point_activations.insert(
                meter_point_id,
                ActivationStats {
                    activated,
                    active_since,
                    active_until,
                    participation_factor,
                },
            );
        }

        PodList {
            meter_point_activations,
        }
    }
}
