use crate::eegfaktura::checks::{EnergyReportChecks, MeterPointRef};
use crate::eegfaktura::loader::EnergyReport;

fn report(file: &str) -> EnergyReport {
    let base_path = format!("{}", env!("CARGO_MANIFEST_DIR"));
    EnergyReport::new(format!("{}/test-files/{}", base_path, file))
}

fn ids(refs: &[MeterPointRef]) -> Vec<String> {
    refs.iter().map(|r| r.meter_point_id.clone()).collect()
}

// ---- integration tests over the sample fixtures ----------------------------

/// A complete report has no missing samples and reports as complete.
#[test]
fn test_complete_report_has_no_missing_samples() {
    let mut r = report("Energy-Report-small.xlsx");
    let checks = EnergyReportChecks::run(&mut r);

    assert!(checks.measurements_complete);
    assert!(checks.meter_points_with_missing_samples.is_empty());
}

/// Only L3 values are flagged; L2 substitute values are treated as reliable and
/// must never appear in the result.
#[test]
fn test_report_flags_only_l3_meter_points() {
    let mut r = report("Energy-Report-small.xlsx");
    let checks = EnergyReportChecks::run(&mut r);

    // Sorted by meter point id (see qov_map_to_refs).
    assert_eq!(
        ids(&checks.meter_points_with_l3_values),
        vec![
            "AT0030000000000000000000000118026".to_string(),
            "AT0030000000000000000000030071976".to_string(),
        ]
    );

    // Even a complete report is unsuitable for billing when L3 values exist.
    assert!(checks.has_issues());
}

/// A report with gaps is reported incomplete and lists the affected meter
/// point(s) exactly once each.
#[test]
fn test_incomplete_report_flags_missing_samples() {
    let mut r = report("Energy-Report-small-missing-data.xlsx");
    let checks = EnergyReportChecks::run(&mut r);

    assert!(!checks.measurements_complete);
    assert!(
        ids(&checks.meter_points_with_missing_samples)
            .contains(&"AT0030000000000000000000000118026".to_string())
    );
    // no duplicate meter point ids in the dirty list
    let mut deduped = ids(&checks.meter_points_with_missing_samples);
    deduped.sort();
    deduped.dedup();
    assert_eq!(deduped.len(), checks.meter_points_with_missing_samples.len());
    assert!(checks.has_issues());
}

// ---- unit tests for the has_issues() decision logic ------------------------

fn point(id: &str) -> MeterPointRef {
    MeterPointRef {
        meter_point_id: id.to_string(),
        name: "test".to_string(),
    }
}

#[test]
fn test_has_issues_false_when_clean() {
    let clean = EnergyReportChecks {
        measurements_complete: true,
        meter_points_with_missing_samples: vec![],
        meter_points_with_l3_values: vec![],
    };
    assert!(!clean.has_issues());
}

#[test]
fn test_has_issues_true_for_each_dimension() {
    let incomplete = EnergyReportChecks {
        measurements_complete: false,
        meter_points_with_missing_samples: vec![],
        meter_points_with_l3_values: vec![],
    };
    assert!(incomplete.has_issues());

    let missing = EnergyReportChecks {
        measurements_complete: true,
        meter_points_with_missing_samples: vec![point("AT1")],
        meter_points_with_l3_values: vec![],
    };
    assert!(missing.has_issues());

    let l3 = EnergyReportChecks {
        measurements_complete: true,
        meter_points_with_missing_samples: vec![],
        meter_points_with_l3_values: vec![point("AT2")],
    };
    assert!(l3.has_issues());
}
