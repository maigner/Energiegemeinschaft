use chrono::NaiveDateTime;

use crate::eegfaktura::loader::{EnergyReport, excel::*};

#[test]
fn test_parse_member_list() {
    let base_path = format!("{}", env!("CARGO_MANIFEST_DIR"));
    let member_list = "test-files/EEG-Masterdata.xlsx";
    let path = format!("{}/{}", base_path, member_list);
    let masterdata = Masterdata::new(path);
    assert_eq!(masterdata.members.len(), 312);
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
