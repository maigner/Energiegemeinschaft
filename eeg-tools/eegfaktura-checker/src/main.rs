use eegfaktura_datalib::eegfaktura::checks::{
    ActivationConsistencyChecks, EnergyReportChecks, L3MeterPoint, MasterdataChecks,
    MissingSamplesMeterPoint, OwnershipChecks,
};
use eegfaktura_datalib::eegfaktura::loader::{EnergyReport, Masterdata, PodList};
use std::{
    env, fs,
    path::{Path, PathBuf},
    process::exit,
};

fn main() {
    let args: Vec<String> = env::args().collect();

    let folder = match args.get(1) {
        Some(f) => f,
        None => {
            print_usage();
            exit(2);
        }
    };

    run_all_checks(folder);
}

fn print_usage() {
    println!("usage: eegfaktura-checker <folder>");
    println!();
    println!("Runs all checks on the latest matching files found in <folder>:");
    println!("  masterdata:    *EEG-Masterdata-<date>.xlsx");
    println!("  podlist:       *ZP_PODLIST.xlsx");
    println!("  energy report: *Energy-Report-<start>_<end>.xlsx");
    println!();
    println!("Exit code is 1 when any check finds an issue, 0 when all are clean.");
}

/// Discover the latest masterdata, podlist and energy-report files in `folder`,
/// then run every check in a single pass. Exits 1 if any check finds an issue.
fn run_all_checks(folder: &str) {
    let dir = Path::new(folder);
    if !dir.is_dir() {
        println!("error: not a directory: {}", folder);
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

    println!("eegfaktura-checker: {}", folder);
    println!("  masterdata: {}", masterdata_path.to_string_lossy());
    println!("  podlist:    {}", podlist_path.to_string_lossy());
    println!("  energy:     {}", energy_report_path.to_string_lossy());

    // Load each file once and share it across the checks.
    let mut masterdata = Masterdata::new(masterdata_path.to_string_lossy().to_string());
    let podlist = PodList::new(podlist_path.to_string_lossy().to_string());
    let mut energy_report = EnergyReport::new(energy_report_path.to_string_lossy().to_string());

    let masterdata_checks = MasterdataChecks::run(&mut masterdata);
    let ownership_checks = OwnershipChecks::run(&masterdata, &podlist, Some(&energy_report));
    let energy_checks = EnergyReportChecks::run(&mut energy_report);
    let activation_checks =
        ActivationConsistencyChecks::run(&masterdata, &podlist, Some(&energy_report));

    print_masterdata_section(&masterdata_checks);
    print_ownership_section(&ownership_checks);
    print_energy_section(&energy_checks);
    print_activation_section(&activation_checks);

    let has_issues = masterdata_checks.has_issues()
        || ownership_checks.has_issues()
        || energy_checks.has_issues()
        || activation_checks.has_issues();

    if has_issues {
        println!("\n=== RESULT: issues found ===");
        exit(1);
    }
    println!("\n=== RESULT: ok ===");
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
            println!("error: no file matching '{}' found in {}", pattern, folder);
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
    use super::is_energy_report_name;

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
        // not an xlsx
        assert!(!is_energy_report_name("RC101533-Energy-Report-a_b.csv"));
        // other file kinds
        assert!(!is_energy_report_name("RC101533-EEG-Masterdata-20260726.xlsx"));
        assert!(!is_energy_report_name("ZP_PODLIST.xlsx"));
    }
}
