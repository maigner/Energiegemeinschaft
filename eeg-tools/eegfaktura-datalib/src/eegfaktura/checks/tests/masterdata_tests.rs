use crate::eegfaktura::checks::MasterdataChecks;
use crate::eegfaktura::loader::Masterdata;

fn masterdata(file: &str) -> Masterdata {
    let base_path = format!("{}", env!("CARGO_MANIFEST_DIR"));
    Masterdata::new(format!("{}/test-files/{}", base_path, file))
}

/// The sample masterdata file is known to be incomplete: two meter points miss
/// a subscription and one active meter point misses an activation date. The ids
/// come back sorted.
#[test]
fn test_masterdata_reports_missing_subscriptions_and_activations() {
    let mut md = masterdata("EEG-Masterdata.xlsx");
    let checks = MasterdataChecks::run(&mut md);

    assert!(!checks.file_complete);

    assert_eq!(
        checks.missing_subscriptions,
        vec![
            "AT0030000000000000000000030040032".to_string(),
            "AT0030000000000000000000030112071".to_string(),
        ]
    );
    assert_eq!(
        checks.missing_activations,
        vec!["AT0030000000000000000000030112071".to_string()]
    );

    assert!(checks.has_issues());
}

/// Running the check twice must be stable — the underlying loader appends to
/// its collected id lists, so the check has to guard against double counting.
#[test]
fn test_masterdata_check_is_idempotent() {
    let mut md = masterdata("EEG-Masterdata.xlsx");

    let first = MasterdataChecks::run(&mut md);
    let second = MasterdataChecks::run(&mut md);

    assert_eq!(
        first.missing_subscriptions.len(),
        second.missing_subscriptions.len()
    );
    assert_eq!(
        first.missing_activations.len(),
        second.missing_activations.len()
    );
}

// ---- unit tests for the has_issues() decision logic ------------------------

#[test]
fn test_has_issues_matches_file_complete() {
    let complete = MasterdataChecks {
        file_complete: true,
        missing_subscriptions: vec![],
        missing_activations: vec![],
    };
    assert!(!complete.has_issues());

    let incomplete = MasterdataChecks {
        file_complete: false,
        missing_subscriptions: vec!["AT1".to_string()],
        missing_activations: vec![],
    };
    assert!(incomplete.has_issues());
}
