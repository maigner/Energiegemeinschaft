use std::collections::HashMap;

use chrono::NaiveDate;

use crate::eegfaktura::checks::ActivationConsistencyChecks;
use crate::eegfaktura::loader::{
    ActivationStats, EnergyDirection, Masterdata, Member, MemberType, MeterPoint, MeterPointStatus,
    PodList,
};

fn d(s: &str) -> NaiveDate {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
}

fn masterdata_with(points: Vec<(&str, MeterPointStatus, Option<NaiveDate>)>) -> Masterdata {
    let mut meter_points = HashMap::new();
    for (id, status, activated) in points {
        meter_points.insert(
            id.to_string(),
            MeterPoint {
                id: id.to_string(),
                status,
                registered: d("2024-01-01"),
                energy_direction: EnergyDirection::Consumption,
                activated,
                deactivated: None,
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

fn podlist_with(points: Vec<(&str, NaiveDate)>) -> PodList {
    let mut meter_point_activations = HashMap::new();
    for (id, activated) in points {
        meter_point_activations.insert(
            id.to_string(),
            ActivationStats {
                activated,
                active_since: activated,
                active_until: d("9999-12-31"),
                participation_factor: 100,
            },
        );
    }
    PodList {
        meter_point_activations,
    }
}

// ---- unit tests over hand-built inputs -------------------------------------

#[test]
fn test_matching_dates_produce_no_issue() {
    let md = masterdata_with(vec![("AT1", MeterPointStatus::Active, Some(d("2024-05-27")))]);
    let pod = podlist_with(vec![("AT1", d("2024-05-27"))]);

    let checks = ActivationConsistencyChecks::run(&md, &pod);

    assert!(checks.mismatches.is_empty());
    assert!(checks.active_missing_from_podlist.is_empty());
    assert!(checks.missing_from_masterdata.is_empty());
    assert!(!checks.has_issues());
}

#[test]
fn test_differing_dates_are_flagged() {
    let md = masterdata_with(vec![("AT1", MeterPointStatus::Active, Some(d("2024-09-24")))]);
    let pod = podlist_with(vec![("AT1", d("2024-06-24"))]);

    let checks = ActivationConsistencyChecks::run(&md, &pod);

    assert_eq!(checks.mismatches.len(), 1);
    let m = &checks.mismatches[0];
    assert_eq!(m.meter_point_id, "AT1");
    assert_eq!(m.status, MeterPointStatus::Active);
    assert_eq!(m.masterdata_activated, Some(d("2024-09-24")));
    assert_eq!(m.podlist_activated, d("2024-06-24"));
    assert!(checks.has_issues());
}

#[test]
fn test_missing_masterdata_date_is_a_mismatch() {
    // present in both, but masterdata has no activation date while the podlist does
    let md = masterdata_with(vec![("AT1", MeterPointStatus::Pending, None)]);
    let pod = podlist_with(vec![("AT1", d("2026-02-16"))]);

    let checks = ActivationConsistencyChecks::run(&md, &pod);

    assert_eq!(checks.mismatches.len(), 1);
    assert_eq!(checks.mismatches[0].masterdata_activated, None);
    assert_eq!(checks.mismatches[0].podlist_activated, d("2026-02-16"));
}

#[test]
fn test_active_point_missing_from_podlist_is_flagged() {
    let md = masterdata_with(vec![("AT1", MeterPointStatus::Active, Some(d("2024-05-27")))]);
    let pod = podlist_with(vec![]);

    let checks = ActivationConsistencyChecks::run(&md, &pod);

    assert_eq!(checks.active_missing_from_podlist, vec!["AT1".to_string()]);
    assert!(checks.mismatches.is_empty());
    assert!(checks.has_issues());
}

#[test]
fn test_non_active_point_missing_from_podlist_is_ignored() {
    // Inactive/pending/etc. points are not required to be in the podlist.
    let md = masterdata_with(vec![
        ("AT1", MeterPointStatus::Inactive, Some(d("2024-05-27"))),
        ("AT2", MeterPointStatus::Pending, None),
        ("AT3", MeterPointStatus::Rejected, None),
    ]);
    let pod = podlist_with(vec![]);

    let checks = ActivationConsistencyChecks::run(&md, &pod);

    assert!(checks.active_missing_from_podlist.is_empty());
    assert!(!checks.has_issues());
}

#[test]
fn test_podlist_point_missing_from_masterdata_is_flagged() {
    let md = masterdata_with(vec![]);
    let pod = podlist_with(vec![("AT9", d("2025-01-01"))]);

    let checks = ActivationConsistencyChecks::run(&md, &pod);

    assert_eq!(checks.missing_from_masterdata, vec!["AT9".to_string()]);
    assert!(checks.has_issues());
}

// ---- integration test over the real fixtures -------------------------------

/// The two sample files come from the same EEG (475 shared meter points) and
/// contain known inconsistencies. This pins the current behavior end to end.
#[test]
fn test_activation_consistency_over_fixtures() {
    let base_path = format!("{}", env!("CARGO_MANIFEST_DIR"));
    let masterdata = Masterdata::new(format!("{}/test-files/EEG-Masterdata.xlsx", base_path));
    let podlist = PodList::new(format!("{}/test-files/ZP_PODLIST.xlsx", base_path));

    let checks = ActivationConsistencyChecks::run(&masterdata, &podlist);

    assert_eq!(checks.mismatches.len(), 23);
    assert_eq!(checks.active_missing_from_podlist.len(), 8);
    assert_eq!(checks.missing_from_masterdata.len(), 117);
    assert!(checks.has_issues());

    // Sorted by id, so the lowest id comes first: a real ACTIVE date conflict.
    let first = &checks.mismatches[0];
    assert_eq!(first.meter_point_id, "AT0030000000000000000000000010001");
    assert_eq!(first.status, MeterPointStatus::Active);
    assert_eq!(first.masterdata_activated, Some(d("2024-09-24")));
    assert_eq!(first.podlist_activated, d("2024-06-24"));
}
