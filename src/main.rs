use eegfaktura_datalib::eegfaktura::checks::{
    ActivationConsistencyChecks, EnergyReportChecks, MasterdataChecks, MeterPointRef,
};
use eegfaktura_datalib::eegfaktura::loader::{EnergyReport, Masterdata, PodList};
use std::{env, process::exit};

fn main() {
    let args: Vec<String> = env::args().collect();

    if args.len() < 2 {
        print_usage();
        exit(0);
    }

    let command = args.get(1).unwrap();

    match command.as_str() {
        "csc" => {
            let path = require_path(&args, "csc [path to Energy Report.xlsx]");
            check_samples_complete(&path);
        }
        "energy" => {
            let path = require_path(&args, "energy [path to Energy Report.xlsx]");
            check_energy_report(&path);
        }
        "masterdata" => {
            let path = require_path(&args, "masterdata [path to EEG Masterdata.xlsx]");
            check_masterdata(&path);
        }
        "activation" => {
            if args.len() < 4 {
                println!(
                    "usage: eegfaktura-checker activation [masterdata.xlsx] [podlist.xlsx]"
                );
                exit(0);
            }
            check_activation_consistency(&args[2], &args[3]);
        }
        _ => {
            println!("Unknown command: {}", command);
            print_usage();
            exit(0);
        }
    }
}

fn print_usage() {
    println!("usage: eegfaktura-checker [command] [args]");
    println!(" commands:");
    println!("  energy [path]      run all logical checks on an Energy Report");
    println!("  masterdata [path]  run all logical checks on a Masterdata file");
    println!("  activation [masterdata.xlsx] [podlist.xlsx]");
    println!("                     cross-check activation dates between masterdata and podlist");
    println!("  csc [path]         list every missing sample in an Energy Report");
    println!();
    println!(" exit code is 1 when a check finds an issue, 0 when clean.");
}

fn require_path(args: &[String], usage: &str) -> String {
    match args.get(2) {
        Some(p) => p.clone(),
        None => {
            println!("usage: eegfaktura-checker {}", usage);
            exit(0);
        }
    }
}

/// Run all logical energy-report checks and print a summary. Exits 1 on issues.
fn check_energy_report(path: &str) {
    let mut report = EnergyReport::new(path.to_string());
    let checks = EnergyReportChecks::run(&mut report);

    println!("Energy Report checks: {}", path);
    println!(
        "  measurements complete: {}",
        yes_no(checks.measurements_complete)
    );
    print_refs(
        "meter points with missing samples",
        &checks.meter_points_with_missing_samples,
    );
    print_refs(
        "meter points with L3 (unreliable) values",
        &checks.meter_points_with_l3_values,
    );

    if checks.has_issues() {
        println!("\nRESULT: issues found");
        exit(1);
    }
    println!("\nRESULT: ok");
}

/// Run all logical masterdata checks and print a summary. Exits 1 on issues.
fn check_masterdata(path: &str) {
    let mut masterdata = Masterdata::new(path.to_string());
    let checks = MasterdataChecks::run(&mut masterdata);

    println!("Masterdata checks: {}", path);
    println!("  file complete: {}", yes_no(checks.file_complete));
    print_ids(
        "meter points missing a subscription",
        &checks.missing_subscriptions,
    );
    print_ids(
        "active meter points missing an activation date",
        &checks.missing_activations,
    );

    if checks.has_issues() {
        println!("\nRESULT: issues found");
        exit(1);
    }
    println!("\nRESULT: ok");
}

/// Cross-check activation dates between a masterdata file and a podlist.
/// Exits 1 on any inconsistency.
fn check_activation_consistency(masterdata_path: &str, podlist_path: &str) {
    let masterdata = Masterdata::new(masterdata_path.to_string());
    let podlist = PodList::new(podlist_path.to_string());
    let checks = ActivationConsistencyChecks::run(&masterdata, &podlist);

    println!("Activation consistency checks:");
    println!("  masterdata: {}", masterdata_path);
    println!("  podlist:    {}", podlist_path);

    println!("  activation date mismatches ({}):", checks.mismatches.len());
    for m in &checks.mismatches {
        let masterdata_date = m
            .masterdata_activated
            .map(|d| d.to_string())
            .unwrap_or_else(|| "none".to_string());
        println!(
            "    {}\t{:?}\tmasterdata={}\tpodlist={}",
            m.meter_point_id, m.status, masterdata_date, m.podlist_activated
        );
    }
    print_ids(
        "ACTIVE meter points missing from podlist",
        &checks.active_missing_from_podlist,
    );
    print_ids(
        "podlist meter points missing from masterdata",
        &checks.missing_from_masterdata,
    );

    if checks.has_issues() {
        println!("\nRESULT: issues found");
        exit(1);
    }
    println!("\nRESULT: ok");
}

fn yes_no(b: bool) -> &'static str {
    if b {
        "yes"
    } else {
        "no"
    }
}

fn print_refs(label: &str, refs: &[MeterPointRef]) {
    println!("  {} ({}):", label, refs.len());
    for r in refs {
        println!("    {}\t{}", r.meter_point_id, r.name);
    }
}

fn print_ids(label: &str, ids: &[String]) {
    println!("  {} ({}):", label, ids.len());
    for id in ids {
        println!("    {}", id);
    }
}

/// Detailed listing: every individual missing sample (timestamp granularity).
fn check_samples_complete(path: &str) {
    let energy_report = EnergyReport::new(path.to_string());
    let measurements = energy_report.measurements; // immutable borrow
    let timeline = energy_report.timeline;

    for i in 0..timeline.len() {
        let timestamp = timeline.get(i).unwrap();
        for measurement in &measurements {
            assert!(timeline.len() == measurement.values_over_time.len());
            // need to check measurement for this timestamp?
            if measurement.period_start <= timestamp.timestamp
                && measurement.period_end >= timestamp.timestamp
            {
                // then there should be a Some(sample)
                let sample = measurement.values_over_time.get(i).unwrap();
                if sample.is_none() {
                    println!(
                        "{}\t{}\t{:<12}\t{:<23}\t{}",
                        timestamp.timestamp,
                        measurement.meter_point_id,
                        format!("{:?}", measurement.direction),
                        format!("{:?}", measurement.meter_code),
                        measurement.name
                    );
                }
            }
        }
    }
}
