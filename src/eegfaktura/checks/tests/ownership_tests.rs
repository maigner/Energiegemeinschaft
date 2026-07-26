use std::collections::HashMap;

use chrono::NaiveDate;

use crate::eegfaktura::checks::OwnershipChecks;
use crate::eegfaktura::loader::{
    ActivationStats, EnergyDirection, Masterdata, Member, MeterPoint, MeterPointStatus, PodList,
};

fn d(s: &str) -> NaiveDate {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
}

fn empty_podlist() -> PodList {
    PodList {
        meter_point_activations: HashMap::new(),
    }
}

fn podlist_with(id: &str, activated: NaiveDate) -> PodList {
    let mut meter_point_activations = HashMap::new();
    meter_point_activations.insert(
        id.to_string(),
        ActivationStats {
            activated,
            active_since: activated,
            active_until: d("9999-12-31"),
            participation_factor: 100,
        },
    );
    PodList {
        meter_point_activations,
    }
}

/// Build a masterdata where the given meter point id belongs to several members.
/// Each owner is (member_number, status, activated, deactivated).
fn masterdata_owners(
    meter_point_id: &str,
    owners: Vec<(&str, MeterPointStatus, Option<NaiveDate>, Option<NaiveDate>)>,
) -> Masterdata {
    let mut members = HashMap::new();
    for (member_number, status, activated, deactivated) in owners {
        let mut meter_points = HashMap::new();
        meter_points.insert(
            meter_point_id.to_string(),
            MeterPoint {
                id: meter_point_id.to_string(),
                status,
                registered: d("2024-01-01"),
                energy_direction: EnergyDirection::Consumption,
                activated,
                deactivated,
                subscription_name: None,
            },
        );
        members.insert(
            member_number.to_string(),
            Member {
                member_number: member_number.to_string(),
                first_name: None,
                last_name: None,
                company_name: None,
                email: "x@example.com".to_string(),
                member_type: crate::eegfaktura::loader::MemberType::Private,
                meter_points,
            },
        );
    }
    Masterdata {
        members,
        file_complete: None,
        missing_subscriptions: vec![],
        missing_activations: vec![],
    }
}

#[test]
fn test_single_owner_is_not_a_transfer() {
    let md = masterdata_owners(
        "AT1",
        vec![("001", MeterPointStatus::Active, Some(d("2024-01-01")), None)],
    );

    let checks = OwnershipChecks::run(&md, &empty_podlist(), None);

    assert!(checks.transfers.is_empty());
    assert!(!checks.has_issues());
}

#[test]
fn test_clean_transfer_is_valid() {
    // old owner deactivated before the new owner is activated
    let md = masterdata_owners(
        "AT1",
        vec![
            (
                "034",
                MeterPointStatus::Inactive,
                Some(d("2024-06-06")),
                Some(d("2025-07-17")),
            ),
            (
                "243",
                MeterPointStatus::Active,
                Some(d("2025-07-23")),
                None,
            ),
        ],
    );

    let checks = OwnershipChecks::run(&md, &empty_podlist(), None);

    assert_eq!(checks.transfers.len(), 1);
    let t = &checks.transfers[0];
    assert_eq!(t.meter_point_id, "AT1");
    assert_eq!(t.owners.len(), 2);
    // ordered by activation date: old owner first
    assert_eq!(t.owners[0].member_number, "034");
    assert_eq!(t.owners[1].member_number, "243");
    assert!(t.is_valid, "problems: {:?}", t.problems);
    assert!(!checks.has_issues());
}

#[test]
fn test_touching_dates_are_valid() {
    // deactivated the same day the next owner is activated: still clean
    let md = masterdata_owners(
        "AT1",
        vec![
            (
                "A",
                MeterPointStatus::Inactive,
                Some(d("2024-01-01")),
                Some(d("2024-06-01")),
            ),
            ("B", MeterPointStatus::Active, Some(d("2024-06-01")), None),
        ],
    );

    let checks = OwnershipChecks::run(&md, &empty_podlist(), None);

    assert!(checks.transfers[0].is_valid);
}

#[test]
fn test_two_active_owners_is_invalid() {
    let md = masterdata_owners(
        "AT1",
        vec![
            ("A", MeterPointStatus::Active, Some(d("2024-01-01")), None),
            ("B", MeterPointStatus::Active, Some(d("2025-01-01")), None),
        ],
    );

    let checks = OwnershipChecks::run(&md, &empty_podlist(), None);

    let t = &checks.transfers[0];
    assert!(!t.is_valid);
    assert!(t.problems.iter().any(|p| p.contains("ACTIVE")));
    assert!(checks.has_issues());
}

#[test]
fn test_overlapping_periods_is_invalid() {
    // old owner never deactivated while the new owner is already active
    let md = masterdata_owners(
        "AT1",
        vec![
            (
                "old",
                MeterPointStatus::Inactive,
                Some(d("2024-01-01")),
                None,
            ),
            ("new", MeterPointStatus::Active, Some(d("2025-01-01")), None),
        ],
    );

    let checks = OwnershipChecks::run(&md, &empty_podlist(), None);

    let t = &checks.transfers[0];
    assert!(!t.is_valid);
    assert!(t.problems.iter().any(|p| p.contains("overlap")));
    assert!(checks.has_issues());
}

// ---- cross-source staleness ------------------------------------------------

fn transfer_masterdata() -> Masterdata {
    // clean transfer: old owner deactivated 2025-07-17, new owner active 2025-07-23
    masterdata_owners(
        "AT1",
        vec![
            (
                "034",
                MeterPointStatus::Inactive,
                Some(d("2024-06-06")),
                Some(d("2025-07-17")),
            ),
            ("243", MeterPointStatus::Active, Some(d("2025-07-23")), None),
        ],
    )
}

#[test]
fn test_podlist_pointing_at_current_owner_is_clean() {
    let md = transfer_masterdata();
    let pod = podlist_with("AT1", d("2025-07-23")); // matches new owner

    let checks = OwnershipChecks::run(&md, &pod, None);

    let t = &checks.transfers[0];
    assert!(t.stale_sources.is_empty());
    assert!(t.is_valid);
    assert!(!checks.has_issues());
}

#[test]
fn test_podlist_pointing_at_former_owner_is_flagged() {
    let md = transfer_masterdata();
    let pod = podlist_with("AT1", d("2024-06-06")); // still the OLD owner's date

    let checks = OwnershipChecks::run(&md, &pod, None);

    let t = &checks.transfers[0];
    assert_eq!(t.stale_sources.len(), 1);
    let stale = &t.stale_sources[0];
    assert_eq!(stale.source, "podlist");
    assert_eq!(stale.activation_date, d("2024-06-06"));
    assert_eq!(stale.former_owner.as_deref(), Some("034"));
    assert!(!t.is_valid);
    assert!(checks.has_issues());
}

// ---- integration over the real fixture -------------------------------------

/// The sample masterdata contains exactly one ownership transfer
/// (AT...30053293) and it is a clean one.
#[test]
fn test_ownership_over_fixture() {
    let base_path = format!("{}", env!("CARGO_MANIFEST_DIR"));
    let masterdata = Masterdata::new(format!("{}/test-files/EEG-Masterdata.xlsx", base_path));
    let podlist = PodList::new(format!("{}/test-files/ZP_PODLIST.xlsx", base_path));

    let checks = OwnershipChecks::run(&masterdata, &podlist, None);

    assert_eq!(checks.transfers.len(), 1);
    let t = &checks.transfers[0];
    assert_eq!(t.meter_point_id, "AT0030000000000000000000030053293");
    assert_eq!(t.owners.len(), 2);
    // the podlist carries the current owner's activation date, so it is clean
    assert!(t.is_valid, "problems: {:?} stale: {:?}", t.problems, t.stale_sources);
    assert!(t.stale_sources.is_empty());
    assert!(!checks.has_issues());
}
