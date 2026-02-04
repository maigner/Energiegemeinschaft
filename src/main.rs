use eegfaktura_datalib::eegfaktura::loader::{excel::EnergyFile};
use std::env;

fn main() {
    let args: Vec<String> = env::args().collect();
    dbg!(args);
    
    check_samples_complete();
}

fn check_samples_complete() {
    let base_path = format!("{}", env!("CARGO_MANIFEST_DIR"));
    let member_list = "test-files/RC101533-Energy-Report-20251001_20251031 (2).xlsx";
    let path = format!("{}/{}", base_path, member_list);
    let energy_file = EnergyFile::new(path);

    let timeline = energy_file.get_timeline();

    for i in 0..timeline.len() {
        //println!("i: {:?}", i);
        let timestamp = timeline.get(i).unwrap();
        //println!("timestamp : {:?}", timestamp);

        for measurement in energy_file.get_measurements() {
            // need to check measurement for this timestamp?
            if measurement.period_start <= timestamp.timestamp
                && measurement.period_end >= timestamp.timestamp
            {
                // then there should be a Some(sample)

                //println!(" meter_point_id : {:?}", measurement.meter_point_id);

                let sample = measurement.values_over_time.get(i).unwrap();

                if sample.is_none() {
                    println!(
                        "No Data at {} for {} {:?}",
                        timestamp.timestamp, measurement.meter_point_id, measurement.meter_code,
                    );
                }
            }
        }
    }
}
