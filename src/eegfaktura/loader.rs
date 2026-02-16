pub mod api;
pub mod excel;

use chrono::NaiveDateTime;

#[derive(Debug)]
pub struct Timestamp {
    pub timestamp: NaiveDateTime
}

#[derive(Debug)]
pub struct Sample {
    timestamp: NaiveDateTime,
    value: f64,
}

#[derive(Debug)]
pub enum EnergyDirection {
    CONSUMPTION,
    GENERATION,
}

#[derive(Debug)]
pub enum MeterCode {
    TotalConsumption,
    ShareOnProduction,
    ConsumptionOfProduction,
    TotalProduction,
    ProductionOvershoot,
}

#[derive(Debug)]
pub struct Measurement {
    pub meter_point_id: String,
    pub name: String,
    pub period_start: NaiveDateTime,
    pub period_end: NaiveDateTime,
    pub direction: EnergyDirection,
    pub meter_code: MeterCode,
    pub values_over_time: Vec<Option<Sample>>,
}

pub struct EnergyReport {
    pub timeline: Vec<Timestamp>,
    pub measurements: Vec<Measurement>,
    pub measurements_complete: Option<bool>,
}

impl EnergyReport {
    pub fn check_measurements_complete(&mut self) {
        let measurements = &self.measurements; // immutable borrow
        for i in 0..self.timeline.len() {
            let timestamp = self.timeline.get(i).unwrap();
            for measurement in measurements {
                assert!(self.timeline.len() == measurement.values_over_time.len());
                // need to check measurement for this timestamp?
                if measurement.period_start <= timestamp.timestamp
                    && measurement.period_end >= timestamp.timestamp
                {
                    // then there should be a Some(sample)
                    let sample = measurement.values_over_time.get(i).unwrap();
                    if sample.is_none() {
                        self.measurements_complete = Some(false);
                        return;

                        // TODO: get the actial list of errors somewhere else
                        /*
                        println!(
                            "{}\t{}\t{:<12}\t{:<23}\t{}",
                            timestamp.timestamp,
                            measurement.meter_point_id,
                            format!("{:?}", measurement.direction),
                            format!("{:?}", measurement.meter_code),
                            measurement.name
                        );
                        */
                    }
                }
            }
        }
        // still here? data complete it seems...
        self.measurements_complete = Some(true);
    }
}

#[cfg(test)]
mod tests {
    use crate::eegfaktura::loader::EnergyReport;

    #[test]
    fn test_check_missing_data() {
        let base_path = format!("{}", env!("CARGO_MANIFEST_DIR"));
        let member_list = "test-files/Energy-Report-small-missing-data.xlsx";
        let path = format!("{}/{}", base_path, member_list);
        let mut energy_report = EnergyReport::new(path);
        energy_report.check_measurements_complete();
        assert_eq!(energy_report.measurements_complete, Some(false));

        let member_list = "test-files/Energy-Report-small.xlsx";
        let path = format!("{}/{}", base_path, member_list);
        let mut energy_report = EnergyReport::new(path);
        energy_report.check_measurements_complete();
        assert_eq!(energy_report.measurements_complete, Some(true));
    }
}
