use chrono::{NaiveDate, NaiveDateTime};

use crate::eegfaktura::loader::{
    EnergyDirection, EnergyReport, Masterdata, MemberType, MeterPointStatus, QoV,
};

#[test]
fn test_parse_energy_file_summary() {
    let base_path = format!("{}", env!("CARGO_MANIFEST_DIR"));
    let member_list = "test-files/Energy-Report-small.xlsx";
    let path = format!("{}/{}", base_path, member_list);
    let energy_file = EnergyReport::new(path);

    assert_eq!(
        energy_file
            .meter_points_stats
            .get("AT0030000000000000000000000118026")
            .unwrap()
            .meter_point_id,
        "AT0030000000000000000000000118026"
    );

    assert_eq!(
        energy_file
            .meter_points_stats
            .get("AT0030000000000000000000000118026")
            .unwrap()
            .timestamp_start,
        NaiveDateTime::parse_from_str("05.02.2024 00:00:00", "%d.%m.%Y %H:%M:%S").unwrap()
    );

    assert_eq!(
        energy_file
            .meter_points_stats
            .get("AT0030000000000000000000000122361")
            .unwrap()
            .timestamp_start,
        NaiveDateTime::parse_from_str("09.10.2025 00:00:00", "%d.%m.%Y %H:%M:%S").unwrap()
    );

    assert_eq!(
        energy_file
            .meter_points_stats
            .get("AT0030000000000000000000030112071")
            .unwrap()
            .timestamp_start,
        NaiveDateTime::parse_from_str("05.09.2025 00:00:00", "%d.%m.%Y %H:%M:%S").unwrap()
    );

    assert_eq!(
        energy_file
            .meter_points_stats
            .get("AT0030000000000000000000030071976")
            .unwrap()
            .timestamp_start,
        NaiveDateTime::parse_from_str("10.10.2025 00:00:00", "%d.%m.%Y %H:%M:%S").unwrap()
    );
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
fn test_parse_energy_file_qov_timeline() {
    let base_path = format!("{}", env!("CARGO_MANIFEST_DIR"));
    let member_list = "test-files/Energy-Report-small.xlsx";
    let path = format!("{}/{}", base_path, member_list);
    let energy_file = EnergyReport::new(path);

    let first_date = String::from("01.10.2025 09:30:00");
    let naive_date_time_first =
        NaiveDateTime::parse_from_str(first_date.as_str(), "%d.%m.%Y %H:%M:%S").unwrap();

    assert_eq!(
        energy_file.qov_timeline.first().unwrap().timestamp,
        naive_date_time_first
    );

    let last_date = String::from("31.10.2025 23:45:00");
    let naive_date_time_last =
        NaiveDateTime::parse_from_str(last_date.as_str(), "%d.%m.%Y %H:%M:%S").unwrap();

    assert_eq!(
        energy_file.qov_timeline.last().unwrap().timestamp,
        naive_date_time_last
    );
}

#[test]
fn test_parse_qov_samples() {
    let base_path = format!("{}", env!("CARGO_MANIFEST_DIR"));
    let member_list = "test-files/Energy-Report-small.xlsx";
    let path = format!("{}/{}", base_path, member_list);
    let energy_file = EnergyReport::new(path);

    assert_eq!(energy_file.qov_samples.len(), 7);
    assert_eq!(energy_file.qov_timeline.len(), 578);

    let qov_sample = energy_file
        .qov_samples
        .first()
        .unwrap()
        .samples
        .first()
        .unwrap()
        .as_ref()
        .unwrap();
    assert_eq!(qov_sample.qov, QoV::L1);
    assert_eq!(qov_sample.value.unwrap(), 0.001);

    let qov_sample = energy_file
        .qov_samples
        .first()
        .unwrap()
        .samples
        .last()
        .unwrap()
        .as_ref()
        .unwrap();
    assert_eq!(qov_sample.qov, QoV::L2);
    assert_eq!(qov_sample.value.unwrap(), 0.002);

    let qov_sample = energy_file
        .qov_samples
        .last()
        .unwrap()
        .samples
        .first()
        .unwrap()
        .as_ref();
    assert!(qov_sample.is_none());
    let qov_sample = energy_file
        .qov_samples
        .last()
        .unwrap()
        .samples
        .last()
        .unwrap()
        .as_ref()
        .unwrap();
    assert_eq!(qov_sample.qov, QoV::L1);
    assert_eq!(qov_sample.value.unwrap(), 0.0);
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
