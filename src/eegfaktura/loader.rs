pub mod excel;
pub mod api;

use chrono::NaiveDateTime;


#[derive(Debug)]
pub struct Timestamp {
    pub timestamp: NaiveDateTime, // parsed date_time object
}

#[derive(Debug)]
pub struct Sample {
    timeline_index: usize,
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
    ProductionOvershoot
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