use eegfaktura_datalib::eegfaktura::loader::{excel::EnergyFile};
use std::{env, process::exit};

fn main() {
    let args: Vec<String> = env::args().collect();
    
    if args.len() < 2 {
        println!("usage: eegfaktura-checker [command] [args]");
        println!(" commands:");
        println!("  csc: check samples complete");
        

        exit(0);
    }

    let command = args.get(1).unwrap();

    match command.as_str() {
        "csc" => {
            if args.len() < 3 {
                println!("usage: eegfaktura-checker csc [path to Energy Report.xlsx]");
                exit(0);
            }
            check_samples_complete(args.get(2).unwrap())
        }
        _ => {
            println!("Unknown command");
            exit(0);
        }
    }

    
}

fn check_samples_complete(path: &String) {
    let energy_file = EnergyFile::new(path.to_string());
    let timeline = energy_file.get_timeline();

    for i in 0..timeline.len() {
        let timestamp = timeline.get(i).unwrap();
        for measurement in energy_file.get_measurements() {
            assert!(timeline.len() == measurement.values_over_time.len());
            // need to check measurement for this timestamp?
            if measurement.period_start <= timestamp.timestamp
                && measurement.period_end >= timestamp.timestamp
            {
                // then there should be a Some(sample)
                let sample = measurement.values_over_time.get(i).unwrap();
                if sample.is_none() {
                    println!(
                        "No Data,{},{},{:?}",
                        timestamp.timestamp, measurement.meter_point_id, measurement.meter_code,
                    );
                }
            }
        }
    }
}
