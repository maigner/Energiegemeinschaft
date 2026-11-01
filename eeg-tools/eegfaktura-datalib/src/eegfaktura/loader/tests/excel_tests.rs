use chrono::{NaiveDate, NaiveDateTime};

use crate::eegfaktura::loader::{EnergyDirection, EnergyReport, Masterdata, MemberType, MeterPointStatus};

#[test]
fn test_parse_energy_file_summary() {
    let base_path = format!("{}", env!("CARGO_MANIFEST_DIR"));
    let member_list = "test-files/Energy-Report-small.xlsx";
    let path = format!("{}/{}", base_path, member_list);
    let energy_file = EnergyReport::new(path);

    let mp1 = energy_file
        .meter_points_stats
        .get("AT0030000000000000000000000118026")
        .unwrap();
    assert_eq!(mp1.meter_point_id, "AT0030000000000000000000000118026");
    // "Beginn der Daten" carries a trailing fractional-seconds padding
    // ("...0000") that isn't real sub-second precision (see
    // parse_ddmmyyyy_hms) - it must not affect the parsed timestamp.
    assert_eq!(
        mp1.timestamp_start,
        NaiveDateTime::parse_from_str("05.02.2024 00:00:00", "%d.%m.%Y %H:%M:%S").unwrap()
    );
    // "Ende der Daten" for this row has no trailing padding at all
    // ("...23:45:00") - the format that used to panic before the fix.
    assert_eq!(
        mp1.timestamp_end,
        NaiveDateTime::parse_from_str("25.09.2026 23:45:00", "%d.%m.%Y %H:%M:%S").unwrap()
    );

    assert_eq!(
        energy_file
            .meter_points_stats
            .get("AT0030000000000000000000030086569")
            .unwrap()
            .date_active_start,
        NaiveDate::parse_from_str("2025-10-01", "%Y-%m-%d").unwrap()
    );

    let mp3 = energy_file
        .meter_points_stats
        .get("AT0030000000000000000000030071976")
        .unwrap();
    assert_eq!(
        mp3.timestamp_start,
        NaiveDateTime::parse_from_str("10.10.2025 00:00:00", "%d.%m.%Y %H:%M:%S").unwrap()
    );
    // this row's "Ende der Daten" carries the padded format instead.
    assert_eq!(
        mp3.timestamp_end,
        NaiveDateTime::parse_from_str("05.09.2026 23:45:00", "%d.%m.%Y %H:%M:%S").unwrap()
    );

    // the meter point after the "Einspeisezählpunkt" marker (and the two
    // blank rows preceding it) is correctly picked up as GENERATION.
    let mp4 = energy_file
        .meter_points_stats
        .get("AT0030000000000000000000000415117")
        .unwrap();
    assert_eq!(mp4.energy_direction, EnergyDirection::Generation);
}

/// L0/L2/L3 quality now comes from the Summary sheet's F/G/H/I columns (the
/// export no longer has a separate "QoV Log" sheet): a per-meter-point count
/// plus, for non-zero counts, the affected days from that cell's comment.
#[test]
fn test_parse_energy_file_quality_counts() {
    let base_path = format!("{}", env!("CARGO_MANIFEST_DIR"));
    let member_list = "test-files/Energy-Report-small.xlsx";
    let path = format!("{}/{}", base_path, member_list);
    let energy_file = EnergyReport::new(path);

    let mp1 = energy_file
        .meter_points_stats
        .get("AT0030000000000000000000000118026")
        .unwrap();
    assert!(mp1.data_complete);
    assert_eq!(mp1.l0_count, 0);
    assert_eq!(mp1.l3_count, 2);
    assert_eq!(
        mp1.l3_days,
        vec![NaiveDate::parse_from_str("2025-10-01", "%Y-%m-%d").unwrap()]
    );

    let clean = energy_file
        .meter_points_stats
        .get("AT0030000000000000000000030086569")
        .unwrap();
    assert!(clean.data_complete);
    assert_eq!(clean.l0_count, 0);
    assert_eq!(clean.l2_count, 0);
    assert_eq!(clean.l3_count, 0);
    assert!(clean.l3_days.is_empty());
}

#[test]
fn test_parse_member_list_meter_points_eof() {
    let base_path = format!("{}", env!("CARGO_MANIFEST_DIR"));
    let member_list = "test-files/EEG-Masterdata.xlsx";
    let path = format!("{}/{}", base_path, member_list);
    let masterdata = Masterdata::new(path);
    assert_eq!(masterdata.members.len(), 311);
    assert_eq!(masterdata.members.get("318").unwrap().member_number, "318");

    // grab a meter_point
    let meter_point = masterdata
        .members
        .get("318")
        .unwrap()
        .meter_points
        .get("AT0030000000000000000000030040032")
        .unwrap();

    assert_eq!(meter_point.id, "AT0030000000000000000000030040032");
    assert_eq!(meter_point.status, MeterPointStatus::Pending);

    let naive_date_time_first = NaiveDate::parse_from_str("2026-02-15", "%Y-%m-%d").unwrap();

    assert_eq!(meter_point.registered, naive_date_time_first);

    assert_eq!(meter_point.energy_direction, EnergyDirection::Generation);

    assert!(meter_point.activated.is_none());
    assert!(meter_point.deactivated.is_none());
    assert!(meter_point.subscription_name.as_deref().is_none());
}

#[test]
fn test_parse_member_list_meter_points() {
    let base_path = format!("{}", env!("CARGO_MANIFEST_DIR"));
    let member_list = "test-files/EEG-Masterdata.xlsx";
    let path = format!("{}/{}", base_path, member_list);
    let mut masterdata = Masterdata::new(path);
    assert_eq!(masterdata.members.len(), 311);
    assert_eq!(masterdata.members.get("005").unwrap().member_number, "005");

    // grab a meter_point
    let meter_point = masterdata
        .members
        .get("005")
        .unwrap()
        .meter_points
        .get("AT0030000000000000000000000118026")
        .unwrap();

    assert_eq!(meter_point.id, "AT0030000000000000000000000118026");
    assert_eq!(meter_point.status, MeterPointStatus::Active);

    let naive_date_time_first = NaiveDate::parse_from_str("2024-02-05", "%Y-%m-%d").unwrap();

    assert_eq!(meter_point.registered, naive_date_time_first);

    assert_eq!(meter_point.energy_direction, EnergyDirection::Consumption);

    assert_eq!(
        meter_point.activated.unwrap(),
        NaiveDate::parse_from_str("2024-02-05", "%Y-%m-%d").unwrap()
    );
    assert_eq!(
        meter_point.deactivated.unwrap(),
        NaiveDate::parse_from_str("2999-12-31", "%Y-%m-%d").unwrap()
    );

    assert_eq!(
        meter_point.subscription_name.as_deref().unwrap(),
        "Tarif Verbrauch"
    );

    // grab another meter_point
    let meter_point = masterdata
        .members
        .get("005")
        .unwrap()
        .meter_points
        .get("AT0030000000000000000000030112071")
        .unwrap();
    assert_eq!(meter_point.id, "AT0030000000000000000000030112071");
    assert!(meter_point.activated.is_none());
    assert_eq!(meter_point.status, MeterPointStatus::Active);
    assert_eq!(
        meter_point.status == MeterPointStatus::Active && meter_point.activated.is_none(),
        true
    );

    masterdata.get_file_complete();

    assert_eq!(masterdata.missing_activations.len(), 1);
}

#[test]
fn test_parse_member_list() {
    let base_path = format!("{}", env!("CARGO_MANIFEST_DIR"));
    let member_list = "test-files/EEG-Masterdata.xlsx";
    let path = format!("{}/{}", base_path, member_list);
    let masterdata = Masterdata::new(path);
    assert_eq!(masterdata.members.len(), 311);
    assert_eq!(masterdata.members.get("005").unwrap().member_number, "005");
    assert!(masterdata.members.get("005").unwrap().first_name.is_some());
    assert_eq!(
        masterdata.members.get("005").unwrap().first_name.as_deref(),
        Some("Markus")
    );
    assert_eq!(
        masterdata.members.get("006").unwrap().first_name.as_deref(),
        Some("Thomas")
    );
    assert_eq!(
        masterdata.members.get("318").unwrap().first_name.as_deref(),
        Some("Valentin")
    );
    assert_eq!(
        masterdata.members.get("005").unwrap().member_type,
        MemberType::Private
    );
    assert_eq!(
        masterdata.members.get("057").unwrap().member_type,
        MemberType::Business
    );
}

#[test]
fn test_parse_energy_file_timeline() {
    let base_path = format!("{}", env!("CARGO_MANIFEST_DIR"));
    let member_list = "test-files/Energy-Report-small.xlsx";
    let path = format!("{}/{}", base_path, member_list);
    let energy_file = EnergyReport::new(path);

    let first_date = String::from("01.10.2025 00:00:00");
    let naive_date_time_first =
        NaiveDateTime::parse_from_str(first_date.as_str(), "%d.%m.%Y %H:%M:%S").unwrap();

    assert_eq!(
        energy_file.timeline.first().unwrap().timestamp,
        naive_date_time_first
    );

    let last_date = String::from("01.10.2025 01:00:00");
    let naive_date_time_last =
        NaiveDateTime::parse_from_str(last_date.as_str(), "%d.%m.%Y %H:%M:%S").unwrap();

    assert_eq!(
        energy_file.timeline.last().unwrap().timestamp,
        naive_date_time_last
    );
}

#[test]
fn test_check_missing_data() {
    let base_path = format!("{}", env!("CARGO_MANIFEST_DIR"));
    let member_list = "test-files/Energy-Report-small-missing-data.xlsx";
    let path = format!("{}/{}", base_path, member_list);
    let mut energy_report = EnergyReport::new(path);
    energy_report.check_measurements_complete();
    assert_eq!(energy_report.measurements_complete, Some(false));

    let member_list = "test-files/Energy-Report-small.xlsx";
    let path = format!("{}/{}", base_path, member_list);
    let mut energy_report = EnergyReport::new(path);
    energy_report.check_measurements_complete();
    assert_eq!(energy_report.measurements_complete, Some(true));
}

#[test]
fn test_check_missing_samples() {
    let base_path = format!("{}", env!("CARGO_MANIFEST_DIR"));
    let member_list = "test-files/Energy-Report-small-missing-data.xlsx";
    let path = format!("{}/{}", base_path, member_list);
    let mut energy_report = EnergyReport::new(path);
    energy_report.get_missing_samples();
    assert_eq!(energy_report.measurements_complete, Some(false));
    assert!(energy_report.missing_samples.len() > 0);

    let member_list = "test-files/Energy-Report-small.xlsx";
    let path = format!("{}/{}", base_path, member_list);
    let mut energy_report = EnergyReport::new(path);
    energy_report.get_missing_samples();
    assert_eq!(energy_report.measurements_complete, Some(true));
    assert!(energy_report.missing_samples.len() == 0);
}

#[test]
fn test_check_missing_data_reports_l0_count() {
    let base_path = format!("{}", env!("CARGO_MANIFEST_DIR"));
    let member_list = "test-files/Energy-Report-small-missing-data.xlsx";
    let path = format!("{}/{}", base_path, member_list);
    let energy_file = EnergyReport::new(path);

    let mp = energy_file
        .meter_points_stats
        .get("AT0030000000000000000000000118026")
        .unwrap();
    assert!(!mp.data_complete);
    assert_eq!(mp.l0_count, 1);
    assert_eq!(
        mp.l0_days,
        vec![NaiveDate::parse_from_str("2025-10-01", "%Y-%m-%d").unwrap()]
    );
}
