use crate::eegfaktura::checks::{EnergyReportChecks, L3MeterPoint, MissingSamplesMeterPoint};
use crate::eegfaktura::loader::EnergyReport;

fn report(file: &str) -> EnergyReport {
    let base_path = format!("{}", env!("CARGO_MANIFEST_DIR"));
    EnergyReport::new(format!("{}/fixtures/{}", base_path, file))
}

// ---- integration tests over the sample fixtures ----------------------------

/// A complete report has no missing samples and reports as complete.
#[test]
fn test_complete_report_has_no_missing_samples() {
    let mut r = report("Energy-Report-20251001_20251001.xlsx");
    let checks = EnergyReportChecks::run(&mut r);

    assert!(checks.measurements_complete);
    assert!(checks.meter_points_with_missing_samples.is_empty());
}

/// Only L3 values are flagged; L2 substitute values are treated as reliable and
/// must never appear in the result.
#[test]
fn test_report_flags_only_l3_meter_points() {
    let mut r = report("Energy-Report-20251001_20251001.xlsx");
    let checks = EnergyReportChecks::run(&mut r);

    // Sorted by meter point id.
    let l3_ids: Vec<String> = checks
        .meter_points_with_l3_values
        .iter()
        .map(|m| m.meter_point_id.clone())
        .collect();
    assert_eq!(
        l3_ids,
        vec![
            "AT9990000000000000000000011935985".to_string(),
            "AT9990000000000000000000074360078".to_string(),
        ]
    );

    // Each flagged meter point records its L3 count and affected days.
    for mp in &checks.meter_points_with_l3_values {
        assert!(mp.count > 0, "expected L3 count for {}", mp.meter_point_id);
        assert!(
            !mp.affected_days.is_empty(),
            "expected affected days for {}",
            mp.meter_point_id
        );
    }

    // Even a complete report is unsuitable for billing when L3 values exist.
    assert!(checks.has_issues());
}

/// A report with gaps is reported incomplete and lists the affected meter
/// point(s) exactly once each.
#[test]
fn test_incomplete_report_flags_missing_samples() {
    let mut r = report("Energy-Report-missing-data.xlsx");
    let checks = EnergyReportChecks::run(&mut r);

    assert!(!checks.measurements_complete);

    let dirty = &checks.meter_points_with_missing_samples;
    let affected = dirty
        .iter()
        .find(|mp| mp.meter_point_id == "AT9990000000000000000000011935985")
        .expect("known dirty meter point should be present");
    // it records when values are missing, and never duplicates a timestamp
    assert!(!affected.occurrences.is_empty());
    let mut deduped = affected.occurrences.clone();
    deduped.dedup();
    assert_eq!(deduped.len(), affected.occurrences.len());

    // no duplicate meter point ids in the dirty list
    let ids: Vec<&String> = dirty.iter().map(|mp| &mp.meter_point_id).collect();
    let mut unique = ids.clone();
    unique.sort();
    unique.dedup();
    assert_eq!(unique.len(), ids.len());
    assert!(checks.has_issues());
}

// ---- unit tests for the has_issues() decision logic ------------------------

fn missing_point(id: &str) -> MissingSamplesMeterPoint {
    MissingSamplesMeterPoint {
        meter_point_id: id.to_string(),
        name: "test".to_string(),
        occurrences: vec![],
    }
}

fn l3_point(id: &str) -> L3MeterPoint {
    L3MeterPoint {
        meter_point_id: id.to_string(),
        name: "test".to_string(),
        count: 1,
        affected_days: vec![],
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
        meter_points_with_missing_samples: vec![missing_point("AT1")],
        meter_points_with_l3_values: vec![],
    };
    assert!(missing.has_issues());

    let l3 = EnergyReportChecks {
        measurements_complete: true,
        meter_points_with_missing_samples: vec![],
        meter_points_with_l3_values: vec![l3_point("AT2")],
    };
    assert!(l3.has_issues());
}
