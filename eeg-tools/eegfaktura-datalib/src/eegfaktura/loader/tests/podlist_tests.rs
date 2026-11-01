use chrono::NaiveDate;

use crate::eegfaktura::loader::PodList;

fn load() -> PodList {
    let base_path = format!("{}", env!("CARGO_MANIFEST_DIR"));
    let path = format!("{}/fixtures/ZP_PODLIST.xlsx", base_path);
    PodList::new(path)
}

fn date(s: &str) -> NaiveDate {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
}

/// The sheet has 607 data rows but only 592 distinct meter point ids.
/// Since the map is keyed by meter point id, duplicate ids collapse:
/// the resulting map must hold exactly the distinct ids.
#[test]
fn test_podlist_parses_distinct_meter_points() {
    let podlist = load();
    assert_eq!(podlist.meter_point_activations.len(), 592);
}

/// First data row (Nr. 1): a GENERATION point activated 27.05.2024 with a
/// 100% participation factor and the open-ended "aktiv bis" sentinel.
#[test]
fn test_podlist_parses_activation_stats() {
    let podlist = load();

    let stats = podlist
        .meter_point_activations
        .get("AT9990000000000000000000026720954")
        .expect("meter point from first row should be present");

    assert_eq!(stats.activated, date("2024-05-27"));
    assert_eq!(stats.active_since, date("2024-05-27"));
    assert_eq!(stats.active_until, date("9999-12-31"));
    assert_eq!(stats.participation_factor, 100);
}

/// Excel serial dates (numFmt 14) must be decoded, not read as raw numbers.
/// This row (Nr. 9) also carries a non-default participation factor of 60%.
#[test]
fn test_podlist_parses_serial_dates_and_partial_factor() {
    let podlist = load();

    let stats = podlist
        .meter_point_activations
        .get("AT9990000000000000000000017089920")
        .expect("meter point with partial factor should be present");

    assert_eq!(stats.activated, date("2026-03-12"));
    assert_eq!(stats.participation_factor, 60);
}

/// The far-future sentinel 9999-12-31 encodes an open-ended "aktiv bis".
///
/// In this file EVERY entry that survives deduplication is open-ended: the ~15
/// rows that carry a real end date share a meter point id with a sentinel row,
/// and the later (sentinel) row overwrites them in the map. This asserts the
/// current keyed-by-meter-point behavior — see the module note in excel.rs; if
/// real end dates must be preserved, the map needs a composite key.
#[test]
fn test_podlist_active_until_all_open_ended_after_dedup() {
    let podlist = load();

    let sentinel = date("9999-12-31");
    let open_ended = podlist
        .meter_point_activations
        .values()
        .filter(|s| s.active_until == sentinel)
        .count();

    assert_eq!(open_ended, podlist.meter_point_activations.len());
}

/// Sanity: participation factors are within the valid 0..=100 percent range.
#[test]
fn test_podlist_participation_factor_in_range() {
    let podlist = load();

    for (id, stats) in &podlist.meter_point_activations {
        assert!(
            (0..=100).contains(&stats.participation_factor),
            "participation factor out of range for {}: {}",
            id,
            stats.participation_factor
        );
    }
}
