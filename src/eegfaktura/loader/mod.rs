use chrono::NaiveDateTime;
use serde::Serialize;

pub mod excel;

#[cfg(test)]
mod tests;



#[derive(Debug, Clone, Serialize)]
pub struct Timestamp {
    pub timestamp: NaiveDateTime,
}

#[derive(Debug, Clone, Serialize)]
pub struct Sample {
    timestamp: NaiveDateTime,
    value: f64,
}

#[derive(Debug, Clone, Serialize)]
pub enum EnergyDirection {
    CONSUMPTION,
    GENERATION,
}

#[derive(Debug, Clone, Serialize)]
pub enum MeterCode {
    TotalConsumption,
    ShareOnProduction,
    ConsumptionOfProduction,
    TotalProduction,
    ProductionOvershoot,
}

#[derive(Debug, Clone, Serialize)]
pub struct Measurement {
    pub meter_point_id: String,
    pub name: String,
    pub period_start: NaiveDateTime,
    pub period_end: NaiveDateTime,
    pub direction: EnergyDirection,
    pub meter_code: MeterCode,
    pub values_over_time: Vec<Option<Sample>>,
    pub has_missing_samples: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct MissingSample {
    pub timestamp: Timestamp,
    pub measurement: Measurement,
}

#[derive(Debug, Clone, Serialize)]
pub struct EnergyReport {
    pub timeline: Vec<Timestamp>,
    pub measurements: Vec<Measurement>,
    pub measurements_complete: Option<bool>,
    pub missing_samples: Vec<MissingSample>,
}

impl EnergyReport {
    pub fn get_missing_samples(&mut self) {
        //let mut measurements = &self.measurements; // immutable borrow

        self.measurements_complete = Some(true);

        for i in 0..self.timeline.len() {
            let timestamp = self.timeline.get(i).unwrap();

            for measurement in self.measurements.iter_mut() {
                assert!(self.timeline.len() == measurement.values_over_time.len());

                // need to check measurement for this timestamp?
                if measurement.period_start <= timestamp.timestamp
                    && measurement.period_end >= timestamp.timestamp
                {
                    // then there should be a Some(sample)
                    let sample = measurement.values_over_time.get(i).unwrap();

                    if sample.is_none() {
                        self.measurements_complete = Some(false);

                        measurement.has_missing_samples = true;

                        self.missing_samples.push(MissingSample {
                            timestamp: timestamp.clone(),
                            measurement: measurement.clone(),
                        });
                    }
                }
            }
        }
    }

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
                    }
                }
            }
        }
        // still here? data complete it seems...
        self.measurements_complete = Some(true);
    }
}

