pub mod eegfaktura;

#[cfg(test)]
mod tests {
    //use super::*;
    use chrono::NaiveDateTime;


    #[test]
    fn test_samples_complete() {
        let base_path = format!("{}", env!("CARGO_MANIFEST_DIR"));
        let member_list = "test-files/Energy-Report-Errors.xlsx";
        let path = format!("{}/{}", base_path, member_list);
        let energy_file = crate::eegfaktura::loader::excel::EnergyFile::new(path);

        let timeline = energy_file.get_timeline();

        for i in 0..timeline.len() {
            println!("i: {:?}", i);
            let timestamp = timeline.get(i).unwrap();
            println!("timestamp : {:?}", timestamp);

            for measurement in energy_file.get_measurements() {
                // need to check measurement for this timestamp?
                if measurement.period_start <= timestamp.timestamp
                    && measurement.period_end >= timestamp.timestamp
                {
                    // then there should be a Some(sample)

                    println!(" meter_point_id : {:?}", measurement.meter_point_id);

                    let sample = measurement.values_over_time.get(i).unwrap();

                    assert!(sample.is_none() == false);
                }
            }
        }
    }

    // tests on large files are slow under debug. run only once in a while
    // use small module tests instead
    #[test]
    fn it_works() {
        //Energy-Report-large
        let base_path = format!("{}", env!("CARGO_MANIFEST_DIR"));
        let member_list = "test-files/Energy-Report-Errors.xlsx";
        let path = format!("{}/{}", base_path, member_list);

        let energy_file = crate::eegfaktura::loader::excel::EnergyFile::new(path);

        let first_date = String::from("01.10.2025 00:00:00");
        let naive_date_time_first =
            NaiveDateTime::parse_from_str(first_date.as_str(), "%d.%m.%Y %H:%M:%S").unwrap();

        //TODO: refactor EnergyFile to getters for timeline etc. and make fields private
        assert_eq!(
            energy_file.get_timeline().first().unwrap().timestamp,
            naive_date_time_first
        );

        let last_date = String::from("31.10.2025 23:45:00");
        let naive_date_time_last =
            NaiveDateTime::parse_from_str(last_date.as_str(), "%d.%m.%Y %H:%M:%S").unwrap();
        assert_eq!(
            energy_file.get_timeline().last().unwrap().timestamp,
            naive_date_time_last
        );

        // iterate all generation points. sum up the generation per day
        // sum up the overshoot per day
        // the difference should be the same as the consumption of the production

        let sum_of_generation_per_day: f64 = 0.0;
        let sum_of_overshoot_per_day: f64 = 0.0;
        let sum_of_shared_energy_per_day: f64 = 0.0;

        let first_timestamp = energy_file.get_timeline().first().unwrap().timestamp;
        let last_timestamp = energy_file.get_timeline().last().unwrap().timestamp;

        for timestamp in energy_file.get_timeline() {
            println!("Timestamp: {:?}", timestamp);
            assert!(first_timestamp <= timestamp.timestamp);
            assert!(timestamp.timestamp <= last_timestamp);

            // iterate all points and get sample of timestamp
            // check if there should be a sample at timestamp

            for measurement in energy_file.get_measurements() {
                /*
                println!(" point: {:?}", measurement.meter_point_id);
                println!(
                    " measurement start: {:?} measurement end: {:?}",
                    measurement.period_start, measurement.period_end
                );
                 */

                assert!(first_timestamp <= measurement.period_start);
                assert!(last_timestamp >= measurement.period_end);
                /*
                for sample in &measurement.values_over_time {
                    match sample {
                        Some(s) => {}
                        None => {
                            //println!(" measurement: {:?}", measurement);

                            // none could be an error if timestamp are fine
                            if timestamp.timestamp >= measurement.period_start
                                && timestamp.timestamp <= measurement.period_end
                            {
                                println!(" invalid None Sample for point: {:?}", measurement.meter_point_id);
                            }

                            assert!(
                                timestamp.timestamp < measurement.period_start
                                    || timestamp.timestamp > measurement.period_end
                            );
                        }
                    }
                }
                 */
            }
        }
    }
}
