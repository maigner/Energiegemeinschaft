pub mod excel;

use chrono::NaiveDateTime;


#[derive(Debug)]
pub struct Timestamp {
    pub timestamp: String,              // original string. is it needed?
    pub naive_date_time: NaiveDateTime, // parsed date_time object
}

struct Sample {
    timestamp: Timestamp,
    value: f64,
}

enum EnergyDirection {
    CONSUMPTION,
    GENERATION,
}

struct Measurement {
    meter_point_id: String,
    direction: EnergyDirection,
    values_over_time: Vec<Sample>,
}