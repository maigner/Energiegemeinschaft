use std::collections::HashMap;

use chrono::NaiveDate;

use crate::eegfaktura::checks::ActivationConsistencyChecks;
use crate::eegfaktura::loader::{
    ActivationStats, EnergyDirection, EnergyReport, EnergyReportMeterPointStats, Masterdata, Member,
    MemberType, MeterPoint, MeterPointStatus, PodList,
};

fn d(s: &str) -> NaiveDate {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
}

/// (id, status, activated, deactivated)
fn masterdata_with(
    points: Vec<(&str, MeterPointStatus, Option<NaiveDate>, Option<NaiveDate>)>,
) -> Masterdata {
    let mut meter_points = HashMap::new();
    for (id, status, activated, deactivated) in points {
        meter_points.insert(
            id.to_string(),
            MeterPoint {
                id: id.to_string(),
                status,
                registered: d("2024-01-01"),
                energy_direction: EnergyDirection::Consumption,
                activated,
                deactivated,
                subscription_name: None,
            },
        );
    }
    let mut members = HashMap::new();
    members.insert(
        "001".to_string(),
        Member {
            member_number: "001".to_string(),
            first_name: None,
            last_name: None,
            company_name: None,
            email: "x@example.com".to_string(),
            member_type: MemberType::Private,
            meter_points,
        },
    );
    Masterdata {
        members,
        file_complete: None,
        missing_subscriptions: vec![],
        missing_activations: vec![],
    }
}

/// (id, activated, active_until)
fn podlist_with(points: Vec<(&str, NaiveDate, NaiveDate)>) -> PodList {
    let mut meter_point_activations = HashMap::new();
    for (id, activated, active_until) in points {
        meter_point_activations.insert(
            id.to_string(),
            ActivationStats {
                activated,
                active_since: activated,
                active_until,
                participation_factor: 100,
            },
        );
    }
    PodList {
        meter_point_activations,
    }
}

/// (id, active_start, active_end)
fn energy_report_with(points: Vec<(&str, NaiveDate, NaiveDate)>) -> EnergyReport {
    let mut meter_points_stats = HashMap::new();
    for (id, start, end) in points {
        meter_points_stats.insert(
            id.to_string(),
            EnergyReportMeterPointStats {
                meter_point_id: id.to_string(),
                energy_direction: EnergyDirection::Consumption,
                name: "test".to_string(),
                timestamp_start: start.and_hms_opt(0, 0, 0).unwrap(),
                timestamp_end: end.and_hms_opt(0, 0, 0).unwrap(),
                date_active_start: start,
                date_active_end: end,
            },
        );
    }
    EnergyReport {
        timeline: vec![],
        measurements: vec![],
        measurements_complete: None,
        missing_samples: vec![],
        meter_points_stats,
        qov_timeline: vec![],
        qov_samples: vec![],
    }
}

const OPEN: &str = "9999-12-31";

// ---- unit tests over hand-built inputs -------------------------------------

#[test]
fn test_matching_dates_produce_no_issue() {
    let md = masterdata_with(vec![(
        "AT1",
        MeterPointStatus::Active,
        Some(d("2024-05-27")),
        None,
    )]);
    let pod = podlist_with(vec![("AT1", d("2024-05-27"), d(OPEN))]);

    let checks = ActivationConsistencyChecks::run(&md, &pod, None);

    assert!(checks.mismatches.is_empty());
    assert!(checks.active_missing_from_podlist.is_empty());
    assert!(checks.missing_from_masterdata.is_empty());
    assert!(!checks.has_issues());
}

#[test]
fn test_differing_start_dates_are_flagged() {
    let md = masterdata_with(vec![(
        "AT1",
        MeterPointStatus::Active,
        Some(d("2024-09-24")),
        None,
    )]);
    let pod = podlist_with(vec![("AT1", d("2024-06-24"), d(OPEN))]);

    let checks = ActivationConsistencyChecks::run(&md, &pod, None);

    assert_eq!(checks.mismatches.len(), 1);
    let m = &checks.mismatches[0];
    assert_eq!(m.meter_point_id, "AT1");
    assert_eq!(m.status, Some(MeterPointStatus::Active));
    assert_eq!(m.masterdata_activated, Some(d("2024-09-24")));
    assert_eq!(m.podlist_activated, Some(d("2024-06-24")));
    assert!(!m.start_dates_agree);
    assert!(m.end_dates_agree);
    assert!(checks.has_issues());
}

#[test]
fn test_missing_masterdata_date_is_not_a_conflict() {
    // Present in both, but masterdata has no start date (pending point). Only
    // concrete dates are compared, so a single present date never conflicts.
    let md = masterdata_with(vec![("AT1", MeterPointStatus::Pending, None, None)]);
    let pod = podlist_with(vec![("AT1", d("2026-02-16"), d(OPEN))]);

    let checks = ActivationConsistencyChecks::run(&md, &pod, None);

    assert!(checks.mismatches.is_empty());
    assert!(!checks.has_issues());
}

#[test]
fn test_end_date_open_sentinels_agree() {
    // masterdata uses 2999-12-31, podlist uses 9999-12-31: both mean "open".
    let md = masterdata_with(vec![(
        "AT1",
        MeterPointStatus::Active,
        Some(d("2024-01-01")),
        Some(d("2999-12-31")),
    )]);
    let pod = podlist_with(vec![("AT1", d("2024-01-01"), d("9999-12-31"))]);

    let checks = ActivationConsistencyChecks::run(&md, &pod, None);

    assert!(checks.mismatches.is_empty());
    assert!(!checks.has_issues());
}

#[test]
fn test_end_date_conflict_is_flagged() {
    let md = masterdata_with(vec![(
        "AT1",
        MeterPointStatus::Active,
        Some(d("2024-01-01")),
        Some(d("2025-06-30")),
    )]);
    let pod = podlist_with(vec![("AT1", d("2024-01-01"), d(OPEN))]);

    let checks = ActivationConsistencyChecks::run(&md, &pod, None);

    assert_eq!(checks.mismatches.len(), 1);
    let m = &checks.mismatches[0];
    assert!(m.start_dates_agree);
    assert!(!m.end_dates_agree);
    assert_eq!(m.masterdata_deactivated, Some(d("2025-06-30")));
    assert_eq!(m.podlist_active_until, Some(d(OPEN)));
}

#[test]
fn test_active_point_missing_from_podlist_is_flagged() {
    let md = masterdata_with(vec![(
        "AT1",
        MeterPointStatus::Active,
        Some(d("2024-05-27")),
        None,
    )]);
    let pod = podlist_with(vec![]);

    let checks = ActivationConsistencyChecks::run(&md, &pod, None);

    assert_eq!(checks.active_missing_from_podlist, vec!["AT1".to_string()]);
    assert!(checks.mismatches.is_empty());
    assert!(checks.has_issues());
}

#[test]
fn test_non_active_point_missing_from_podlist_is_ignored() {
    let md = masterdata_with(vec![
        ("AT1", MeterPointStatus::Inactive, Some(d("2024-05-27")), None),
        ("AT2", MeterPointStatus::Pending, None, None),
        ("AT3", MeterPointStatus::Rejected, None, None),
    ]);
    let pod = podlist_with(vec![]);

    let checks = ActivationConsistencyChecks::run(&md, &pod, None);

    assert!(checks.active_missing_from_podlist.is_empty());
    assert!(!checks.has_issues());
}

#[test]
fn test_podlist_point_missing_from_masterdata_is_flagged() {
    let md = masterdata_with(vec![]);
    let pod = podlist_with(vec![("AT9", d("2025-01-01"), d(OPEN))]);

    let checks = ActivationConsistencyChecks::run(&md, &pod, None);

    assert_eq!(checks.missing_from_masterdata, vec!["AT9".to_string()]);
    assert!(checks.has_issues());
}

/// When a meter point id appears under two members, the ACTIVE record is used
/// deterministically. Here the active record (2025-07-23) matches the podlist,
/// so there must be no mismatch regardless of hash map iteration order.
#[test]
fn test_duplicate_meter_point_prefers_active_record() {
    let mut members = HashMap::new();
    for (member_no, status, activated) in [
        ("034", MeterPointStatus::Inactive, d("2024-06-06")),
        ("243", MeterPointStatus::Active, d("2025-07-23")),
    ] {
        let mut meter_points = HashMap::new();
        meter_points.insert(
            "AT1".to_string(),
            MeterPoint {
                id: "AT1".to_string(),
                status,
                registered: d("2024-01-01"),
                energy_direction: EnergyDirection::Consumption,
                activated: Some(activated),
                deactivated: None,
                subscription_name: None,
            },
        );
        members.insert(
            member_no.to_string(),
            Member {
                member_number: member_no.to_string(),
                first_name: None,
                last_name: None,
                company_name: None,
                email: "x@example.com".to_string(),
                member_type: MemberType::Private,
                meter_points,
            },
        );
    }
    let md = Masterdata {
        members,
        file_complete: None,
        missing_subscriptions: vec![],
        missing_activations: vec![],
    };
    let pod = podlist_with(vec![("AT1", d("2025-07-23"), d(OPEN))]);

    let checks = ActivationConsistencyChecks::run(&md, &pod, None);

    assert!(
        checks.mismatches.is_empty(),
        "active record matches podlist, expected no mismatch, got {:?}",
        checks.mismatches
    );
    assert!(!checks.has_issues());
}

// ---- energy report as a third source ---------------------------------------

#[test]
fn test_energy_report_start_date_joins_comparison() {
    // No masterdata entry; podlist and energy report disagree on the start.
    let md = masterdata_with(vec![]);
    let pod = podlist_with(vec![("AT1", d("2024-01-01"), d(OPEN))]);
    let energy = energy_report_with(vec![("AT1", d("2024-05-01"), d(OPEN))]);

    let checks = ActivationConsistencyChecks::run(&md, &pod, Some(&energy));

    assert_eq!(checks.mismatches.len(), 1);
    let m = &checks.mismatches[0];
    assert_eq!(m.status, None); // not in masterdata
    assert_eq!(m.podlist_activated, Some(d("2024-01-01")));
    assert_eq!(m.energy_active_start, Some(d("2024-05-01")));
    assert!(!m.start_dates_agree);
}

#[test]
fn test_energy_report_agreeing_produces_no_issue() {
    let md = masterdata_with(vec![(
        "AT1",
        MeterPointStatus::Active,
        Some(d("2024-01-01")),
        None,
    )]);
    let pod = podlist_with(vec![("AT1", d("2024-01-01"), d(OPEN))]);
    let energy = energy_report_with(vec![("AT1", d("2024-01-01"), d(OPEN))]);

    let checks = ActivationConsistencyChecks::run(&md, &pod, Some(&energy));

    assert!(checks.mismatches.is_empty());
    assert!(!checks.has_issues());
}

// ---- integration tests over the real fixtures ------------------------------

/// masterdata + podlist only. Only concrete-date conflicts remain (2), plus the
/// presence gaps.
#[test]
fn test_activation_consistency_over_fixtures() {
    let base_path = format!("{}", env!("CARGO_MANIFEST_DIR"));
    let masterdata = Masterdata::new(format!("{}/test-files/EEG-Masterdata.xlsx", base_path));
    let podlist = PodList::new(format!("{}/test-files/ZP_PODLIST.xlsx", base_path));

    let checks = ActivationConsistencyChecks::run(&masterdata, &podlist, None);

    assert_eq!(checks.mismatches.len(), 2);
    assert_eq!(checks.active_missing_from_podlist.len(), 8);
    assert_eq!(checks.missing_from_masterdata.len(), 117);
    assert!(checks.has_issues());

    // Sorted by id: a real ACTIVE start-date conflict.
    let first = &checks.mismatches[0];
    assert_eq!(first.meter_point_id, "AT0030000000000000000000000010001");
    assert_eq!(first.status, Some(MeterPointStatus::Active));
    assert_eq!(first.masterdata_activated, Some(d("2024-09-24")));
    assert_eq!(first.podlist_activated, Some(d("2024-06-24")));
    assert!(!first.start_dates_agree);
    assert!(first.end_dates_agree);
    assert_eq!(first.energy_active_start, None); // no energy report provided
}

/// Adding the energy report corroborates masterdata against the podlist: for
/// AT...30086569 the energy report and masterdata agree, the podlist is the
/// outlier.
#[test]
fn test_activation_consistency_with_energy_report() {
    let base_path = format!("{}", env!("CARGO_MANIFEST_DIR"));
    let masterdata = Masterdata::new(format!("{}/test-files/EEG-Masterdata.xlsx", base_path));
    let podlist = PodList::new(format!("{}/test-files/ZP_PODLIST.xlsx", base_path));
    let energy = EnergyReport::new(format!("{}/test-files/Energy-Report-small.xlsx", base_path));

    let checks = ActivationConsistencyChecks::run(&masterdata, &podlist, Some(&energy));

    let mismatch = checks
        .mismatches
        .iter()
        .find(|m| m.meter_point_id == "AT0030000000000000000000030086569")
        .expect("known mismatch should be present");

    assert_eq!(mismatch.masterdata_activated, Some(d("2025-10-01")));
    assert_eq!(mismatch.energy_active_start, Some(d("2025-10-01")));
    assert_eq!(mismatch.podlist_activated, Some(d("2026-02-17")));
    assert!(!mismatch.start_dates_agree);
}

