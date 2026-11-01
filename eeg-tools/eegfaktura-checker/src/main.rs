use chrono::{Duration, NaiveDate};
use eegfaktura_datalib::eegfaktura::checks::{
    ActivationConsistencyChecks, EnergyReportChecks, L3MeterPoint, MasterdataChecks,
    MissingSamplesMeterPoint, OwnershipChecks,
};
use eegfaktura_datalib::eegfaktura::loader::{EnergyReport, Masterdata, PodList};
use serde::Serialize;
use std::{
    collections::BTreeMap,
    env, fs,
    path::{Path, PathBuf},
    process::exit,
};

/// How the results are printed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Output {
    /// Human-readable sections (default).
    Text,
    /// The complete check results as one JSON document.
    Json,
    /// Only the meter points and days to re-request from the grid operator.
    Nachforderung,
}

#[derive(Debug, PartialEq, Eq)]
struct Options {
    folder: String,
    output: Output,
}

fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    let options = match parse_args(&args) {
        Ok(Some(o)) => o,
        Ok(None) => {
            print_usage();
            exit(0);
        }
        Err(message) => {
            eprintln!("error: {message}");
            eprintln!();
            print_usage();
            exit(2);
        }
    };

    let report = run_all_checks(&options.folder);

    match options.output {
        Output::Text => print_text(&report),
        Output::Json => println!(
            "{}",
            serde_json::to_string_pretty(&report).expect("check results serialize to JSON")
        ),
        Output::Nachforderung => {
            for line in nachforderung_lines(&report.energy) {
                println!("{line}");
            }
        }
    }

    if report.has_issues {
        exit(1);
    }
}

/// Parse the command line. `Ok(None)` means help was requested.
fn parse_args(args: &[String]) -> Result<Option<Options>, String> {
    let mut folder: Option<String> = None;
    let mut output = Output::Text;
    let mut i = 0;
    while i < args.len() {
        let arg = args[i].as_str();
        match arg {
            "-h" | "--help" => return Ok(None),
            "--nachforderung" => output = Output::Nachforderung,
            "--format" => {
                i += 1;
                let value = args.get(i).ok_or("--format needs a value: text or json")?;
                output = parse_format(value)?;
            }
            _ if arg.starts_with("--format=") => {
                output = parse_format(&arg["--format=".len()..])?;
            }
            _ if arg.starts_with('-') && arg.len() > 1 => {
                return Err(format!("unknown option '{arg}'"));
            }
            _ => {
                if folder.replace(arg.to_string()).is_some() {
                    return Err("more than one folder given".to_string());
                }
            }
        }
        i += 1;
    }
    let folder = folder.ok_or("missing <folder>")?;
    Ok(Some(Options { folder, output }))
}

fn parse_format(value: &str) -> Result<Output, String> {
    match value {
        "text" => Ok(Output::Text),
        "json" => Ok(Output::Json),
        _ => Err(format!("unknown format '{value}' (expected text or json)")),
    }
}

fn print_usage() {
    println!("usage: eegfaktura-checker [--format text|json] [--nachforderung] <folder>");
    println!();
    println!("Runs all checks on the latest matching files found in <folder>:");
    println!("  masterdata:    *EEG-Masterdata-<date>.xlsx");
    println!("  podlist:       *ZP_PODLIST.xlsx");
    println!("  energy report: *Energy-Report-<start>_<end>.xlsx");
    println!();
    println!("Options:");
    println!("  --format text    human-readable sections (default)");
    println!("  --format json    the complete check results as one JSON document");
    println!("  --nachforderung  one line per meter point with missing or L3 days,");
    println!("                   ready for the data request to the grid operator");
    println!();
    println!("Exit code is 1 when any check finds an issue, 0 when all are clean,");
    println!("2 on a usage error or when a file is missing or not a directory.");
}

/// The input files the checks ran on.
#[derive(Debug, Clone, Serialize)]
struct InputFiles {
    masterdata: String,
    podlist: String,
    energy_report: String,
}

/// Everything one run of the checker produces; this is what `--format json`
/// prints.
#[derive(Debug, Clone, Serialize)]
struct CheckReport {
    folder: String,
    files: InputFiles,
    masterdata: MasterdataChecks,
    ownership: OwnershipChecks,
    energy: EnergyReportChecks,
    activation: ActivationConsistencyChecks,
    has_issues: bool,
}

/// Discover the latest masterdata, podlist and energy-report files in `folder`,
/// then run every check in a single pass. Exits 2 when a file is missing.
fn run_all_checks(folder: &str) -> CheckReport {
    let dir = Path::new(folder);
    if !dir.is_dir() {
        eprintln!("error: not a directory: {}", folder);
        exit(2);
    }

    // masterdata:    *EEG-Masterdata-<date>.xlsx
    // podlist:       *ZP_PODLIST.xlsx
    // energy report: *Energy-Report-<start>_<end>.xlsx
    let masterdata_path = require_found(
        find_latest(dir, |n| {
            n.contains("EEG-Masterdata-") && n.ends_with(".xlsx")
        }),
        "*EEG-Masterdata-<date>.xlsx",
        folder,
    );
    let podlist_path = require_found(
        find_latest(dir, |n| n.ends_with("ZP_PODLIST.xlsx")),
        "*ZP_PODLIST.xlsx",
        folder,
    );
    let energy_report_path = require_found(
        find_latest(dir, is_energy_report_name),
        "*Energy-Report-<start>_<end>.xlsx",
        folder,
    );

    let files = InputFiles {
        masterdata: masterdata_path.to_string_lossy().to_string(),
        podlist: podlist_path.to_string_lossy().to_string(),
        energy_report: energy_report_path.to_string_lossy().to_string(),
    };

    // Load each file once and share it across the checks.
    let mut masterdata = Masterdata::new(files.masterdata.clone());
    let podlist = PodList::new(files.podlist.clone());
    let mut energy_report = EnergyReport::new(files.energy_report.clone());

    let masterdata_checks = MasterdataChecks::run(&mut masterdata);
    let ownership = OwnershipChecks::run(&masterdata, &podlist, Some(&energy_report));
    let energy = EnergyReportChecks::run(&mut energy_report);
    let activation =
        ActivationConsistencyChecks::run(&masterdata, &podlist, Some(&energy_report));

    let has_issues = masterdata_checks.has_issues()
        || ownership.has_issues()
        || energy.has_issues()
        || activation.has_issues();

    CheckReport {
        folder: folder.to_string(),
        files,
        masterdata: masterdata_checks,
        ownership,
        energy,
        activation,
        has_issues,
    }
}

fn print_text(report: &CheckReport) {
    println!("eegfaktura-checker: {}", report.folder);
    println!("  masterdata: {}", report.files.masterdata);
    println!("  podlist:    {}", report.files.podlist);
    println!("  energy:     {}", report.files.energy_report);

    print_masterdata_section(&report.masterdata);
    print_ownership_section(&report.ownership);
    print_energy_section(&report.energy);
    print_activation_section(&report.activation);

    if report.has_issues {
        println!("\n=== RESULT: issues found ===");
    } else {
        println!("\n=== RESULT: ok ===");
    }
}

/// One line per meter point that needs data from the grid operator: the
/// meter point id, the name from the energy report and the affected days
/// (missing samples and L3 values) compressed into ranges, e.g.
/// `AT003... Max Mustermann 2026-10-01..2026-10-03, 2026-10-17`.
fn nachforderung_lines(energy: &EnergyReportChecks) -> Vec<String> {
    // meter point id -> (name, days), sorted by id
    let mut points: BTreeMap<&str, (&str, Vec<NaiveDate>)> = BTreeMap::new();
    for mp in &energy.meter_points_with_missing_samples {
        let entry = points
            .entry(mp.meter_point_id.as_str())
            .or_insert_with(|| (mp.name.as_str(), Vec::new()));
        entry.1.extend(mp.occurrences.iter().map(|ts| ts.date()));
    }
    for mp in &energy.meter_points_with_l3_values {
        let entry = points
            .entry(mp.meter_point_id.as_str())
            .or_insert_with(|| (mp.name.as_str(), Vec::new()));
        entry.1.extend(mp.affected_days.iter().copied());
    }

    points
        .into_iter()
        .map(|(id, (name, days))| format!("{id} {name} {}", day_ranges(&days)))
        .collect()
}

/// Compress days into `start..end` ranges of consecutive days, single days
/// stay single; chronological and de-duplicated, joined with `, `.
fn day_ranges(days: &[NaiveDate]) -> String {
    let mut days: Vec<NaiveDate> = days.to_vec();
    days.sort();
    days.dedup();

    let mut ranges: Vec<String> = Vec::new();
    let mut i = 0;
    while i < days.len() {
        let start = days[i];
        let mut end = start;
        while i + 1 < days.len() && days[i + 1] == end + Duration::days(1) {
            i += 1;
            end = days[i];
        }
        if start == end {
            ranges.push(start.to_string());
        } else {
            ranges.push(format!("{start}..{end}"));
        }
        i += 1;
    }
    ranges.join(", ")
}

fn print_masterdata_section(checks: &MasterdataChecks) {
    println!("\n--- Masterdata ---");
    println!("  file complete: {}", yes_no(checks.file_complete));
    print_ids(
        "meter points missing a subscription",
        &checks.missing_subscriptions,
    );
    print_ids(
        "active meter points missing an activation date",
        &checks.missing_activations,
    );
}

fn print_ownership_section(checks: &OwnershipChecks) {
    println!("\n--- Ownership transfers ---");
    let invalid = checks.transfers.iter().filter(|t| !t.is_valid).count();
    println!(
        "  meter points with multiple owners ({} total, {} invalid):",
        checks.transfers.len(),
        invalid
    );
    for t in &checks.transfers {
        let verdict = if t.is_valid {
            "ok".to_string()
        } else {
            let mut reasons = t.problems.clone();
            for s in &t.stale_sources {
                let owner = s
                    .former_owner
                    .as_deref()
                    .map(|m| format!(" (former owner {})", m))
                    .unwrap_or_default();
                reasons.push(format!(
                    "{} still points at {}{}",
                    s.source, s.activation_date, owner
                ));
            }
            format!("INVALID: {}", reasons.join("; "))
        };
        println!("    {} [{}]", t.meter_point_id, verdict);
        for o in &t.owners {
            println!(
                "      member {} ({})\t{:?}\tactivated={}\tdeactivated={}",
                o.member_number,
                o.member_name,
                o.status,
                fmt_date(o.activated),
                fmt_date(o.deactivated),
            );
        }
    }
}

fn print_energy_section(checks: &EnergyReportChecks) {
    println!("\n--- Energy Report ---");
    println!(
        "  measurements complete: {}",
        yes_no(checks.measurements_complete)
    );
    print_missing_samples(
        "meter points with missing samples",
        &checks.meter_points_with_missing_samples,
    );
    print_l3(
        "meter points with L3 (unreliable) values",
        &checks.meter_points_with_l3_values,
    );
}

fn print_missing_samples(label: &str, mps: &[MissingSamplesMeterPoint]) {
    println!("  {} ({}):", label, mps.len());
    for mp in mps {
        // distinct days on which values are missing (occurrences are chronological)
        let mut days: Vec<String> = Vec::new();
        for ts in &mp.occurrences {
            let day = ts.date().to_string();
            if days.last().map(|last| last != &day).unwrap_or(true) {
                days.push(day);
            }
        }
        println!(
            "    {}\t{}\t{} fehlende Werte an {} Tagen: {}",
            mp.meter_point_id,
            mp.name,
            mp.occurrences.len(),
            days.len(),
            days.join(", "),
        );
    }
}

fn print_l3(label: &str, l3: &[L3MeterPoint]) {
    println!("  {} ({}):", label, l3.len());
    for mp in l3 {
        let dates: Vec<String> = mp.affected_days.iter().map(|d| d.to_string()).collect();
        println!(
            "    {}\t{}\t{} L3-Werte an {} Tagen: {}",
            mp.meter_point_id,
            mp.name,
            mp.count,
            dates.len(),
            dates.join(", "),
        );
    }
}

fn print_activation_section(checks: &ActivationConsistencyChecks) {
    println!("\n--- Activation consistency ---");
    println!("  date mismatches ({}):", checks.mismatches.len());
    for m in &checks.mismatches {
        let status = m
            .status
            .map(|s| format!("{:?}", s))
            .unwrap_or_else(|| "-".to_string());
        let owner = m.member_name.as_deref().unwrap_or("-");
        if !m.start_dates_agree {
            println!(
                "    [start] {} ({}, {})\tmd={}\tpod={}\tenergy={}",
                m.meter_point_id,
                status,
                owner,
                fmt_date(m.masterdata_activated),
                fmt_date(m.podlist_activated),
                fmt_date(m.energy_active_start),
            );
        }
        if !m.end_dates_agree {
            println!(
                "    [end]   {} ({}, {})\tmd={}\tpod={}\tenergy={}",
                m.meter_point_id,
                status,
                owner,
                fmt_date(m.masterdata_deactivated),
                fmt_date(m.podlist_active_until),
                fmt_date(m.energy_active_end),
            );
        }
    }
    print_ids(
        "ACTIVE meter points missing from podlist",
        &checks.active_missing_from_podlist,
    );
    print_ids(
        "podlist meter points missing from masterdata",
        &checks.missing_from_masterdata,
    );
}

/// The energy report file name is `...Energy-Report-<start>_<end>.xlsx`: an
/// optional prefix (e.g. `RC101533-`), then two date placeholders separated by
/// an underscore.
fn is_energy_report_name(name: &str) -> bool {
    if !name.ends_with(".xlsx") {
        return false;
    }
    match name.find("Energy-Report-") {
        Some(idx) => {
            let after = &name[idx + "Energy-Report-".len()..];
            let middle = after.strip_suffix(".xlsx").unwrap_or(after);
            middle.contains('_')
        }
        None => false,
    }
}

/// Return the matching file with the most recent modification time.
fn find_latest(dir: &Path, matches: impl Fn(&str) -> bool) -> Option<PathBuf> {
    fs::read_dir(dir)
        .ok()?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|n| n.to_str())
                .map(&matches)
                .unwrap_or(false)
        })
        .max_by_key(|path| fs::metadata(path).and_then(|m| m.modified()).ok())
}

fn require_found(path: Option<PathBuf>, pattern: &str, folder: &str) -> PathBuf {
    match path {
        Some(p) => p,
        None => {
            eprintln!("error: no file matching '{}' found in {}", pattern, folder);
            exit(2);
        }
    }
}

fn fmt_date(date: Option<chrono::NaiveDate>) -> String {
    date.map(|d| d.to_string())
        .unwrap_or_else(|| "none".to_string())
}

fn yes_no(b: bool) -> &'static str {
    if b {
        "yes"
    } else {
        "no"
    }
}

fn print_ids(label: &str, ids: &[String]) {
    println!("  {} ({}):", label, ids.len());
    for id in ids {
        println!("    {}", id);
    }
}

#[cfg(test)]
mod tests {
    use super::{Options, Output, day_ranges, is_energy_report_name, parse_args};
    use chrono::NaiveDate;

    fn d(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn matches_energy_report_with_and_without_prefix() {
        assert!(is_energy_report_name("Energy-Report-20260401_20260404.xlsx"));
        assert!(is_energy_report_name(
            "RC101533-Energy-Report-20260401_20260404.xlsx"
        ));
    }

    #[test]
    fn rejects_non_energy_report_names() {
        // no underscore between the two dates
        assert!(!is_energy_report_name("RC101533-Energy-Report-small.xlsx"));
        assert!(!is_energy_report_name("Energy-Report-missing-data.xlsx"));
        // not an xlsx
        assert!(!is_energy_report_name("RC101533-Energy-Report-a_b.csv"));
        // other file kinds
        assert!(!is_energy_report_name("RC101533-EEG-Masterdata-20260726.xlsx"));
        assert!(!is_energy_report_name("ZP_PODLIST.xlsx"));
    }

    #[test]
    fn parses_folder_and_output_mode() {
        assert_eq!(
            parse_args(&args(&["exports"])).unwrap(),
            Some(Options {
                folder: "exports".to_string(),
                output: Output::Text
            })
        );
        assert_eq!(
            parse_args(&args(&["--format", "json", "exports"])).unwrap(),
            Some(Options {
                folder: "exports".to_string(),
                output: Output::Json
            })
        );
        assert_eq!(
            parse_args(&args(&["exports", "--format=json"])).unwrap(),
            Some(Options {
                folder: "exports".to_string(),
                output: Output::Json
            })
        );
        assert_eq!(
            parse_args(&args(&["--nachforderung", "exports"])).unwrap(),
            Some(Options {
                folder: "exports".to_string(),
                output: Output::Nachforderung
            })
        );
        assert_eq!(parse_args(&args(&["--help"])).unwrap(), None);
    }

    #[test]
    fn rejects_bad_arguments() {
        assert!(parse_args(&args(&[])).is_err());
        assert!(parse_args(&args(&["--format"])).is_err());
        assert!(parse_args(&args(&["--format", "xml", "exports"])).is_err());
        assert!(parse_args(&args(&["--bogus", "exports"])).is_err());
        assert!(parse_args(&args(&["a", "b"])).is_err());
    }

    #[test]
    fn compresses_consecutive_days_into_ranges() {
        assert_eq!(day_ranges(&[]), "");
        assert_eq!(day_ranges(&[d("2026-10-17")]), "2026-10-17");
        assert_eq!(
            day_ranges(&[
                d("2026-10-03"),
                d("2026-10-01"),
                d("2026-10-02"),
                d("2026-10-17"),
                d("2026-10-02"), // duplicate
                d("2026-10-31"),
                d("2026-11-01"), // month boundary
            ]),
            "2026-10-01..2026-10-03, 2026-10-17, 2026-10-31..2026-11-01"
        );
    }
}
