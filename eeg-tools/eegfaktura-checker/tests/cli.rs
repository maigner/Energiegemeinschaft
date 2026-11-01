//! The checker binary over the anonymized fixtures in
//! `eegfaktura-datalib/fixtures/`.

use std::{fs, path::PathBuf, process::Command};

fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../eegfaktura-datalib/fixtures")
}

fn run(dir: &std::path::Path, extra: &[&str]) -> std::process::Output {
    Command::new(env!("CARGO_BIN_EXE_eegfaktura-checker"))
        .args(extra)
        .arg(dir)
        .output()
        .expect("checker binary runs")
}

#[test]
fn json_output_is_one_document_with_every_section() {
    let out = run(&fixtures_dir(), &["--format", "json"]);
    // the fixtures are known to contain issues
    assert_eq!(out.status.code(), Some(1));

    let stdout = String::from_utf8(out.stdout).unwrap();
    let json: serde_json::Value = serde_json::from_str(&stdout).expect("stdout is JSON");
    for key in ["folder", "files", "masterdata", "ownership", "energy", "activation"] {
        assert!(json.get(key).is_some(), "missing key {key}");
    }
    assert_eq!(json["has_issues"], serde_json::Value::Bool(true));
    assert_eq!(json["masterdata"]["file_complete"], false);
    assert_eq!(json["energy"]["measurements_complete"], true);
    assert_eq!(json["energy"]["meter_points_with_l3_values"].as_array().unwrap().len(), 2);
    assert_eq!(json["activation"]["mismatches"].as_array().unwrap().len(), 2);
}

#[test]
fn nachforderung_lists_missing_and_l3_days_per_meter_point() {
    // The complete report only has L3 days.
    let out = run(&fixtures_dir(), &["--nachforderung"]);
    assert_eq!(out.status.code(), Some(1));
    let stdout = String::from_utf8(out.stdout).unwrap();
    let lines: Vec<&str> = stdout.lines().collect();
    assert_eq!(
        lines,
        vec![
            "AT9990000000000000000000011935985 Hugo Ipsum 2025-10-01",
            "AT9990000000000000000000074360078 Karla Entwurfner 2025-10-01",
        ]
    );

    // The report with a gap: copy it under a name the checker picks up.
    let dir = std::env::temp_dir().join(format!(
        "eegfaktura-checker-test-{}",
        std::process::id()
    ));
    fs::create_dir_all(&dir).unwrap();
    for (from, to) in [
        ("EEG-Masterdata-20260315.xlsx", "EEG-Masterdata-20260315.xlsx"),
        ("ZP_PODLIST.xlsx", "ZP_PODLIST.xlsx"),
        ("Energy-Report-missing-data.xlsx", "Energy-Report-20251001_20251001.xlsx"),
    ] {
        fs::copy(fixtures_dir().join(from), dir.join(to)).unwrap();
    }
    let out = run(&dir, &["--nachforderung"]);
    fs::remove_dir_all(&dir).unwrap();
    assert_eq!(out.status.code(), Some(1));
    let stdout = String::from_utf8(out.stdout).unwrap();
    assert_eq!(
        stdout.lines().collect::<Vec<_>>(),
        vec!["AT9990000000000000000000011935985 Hugo Ipsum 2025-10-01"]
    );
}

#[test]
fn usage_errors_exit_with_2() {
    let out = Command::new(env!("CARGO_BIN_EXE_eegfaktura-checker"))
        .output()
        .unwrap();
    assert_eq!(out.status.code(), Some(2));

    let out = run(&fixtures_dir().join("does-not-exist"), &[]);
    assert_eq!(out.status.code(), Some(2));
}
