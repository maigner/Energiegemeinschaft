use std::collections::HashMap;

use chrono::{NaiveDate, NaiveDateTime};
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

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub enum EnergyDirection {
    Consumption,
    Generation,
}
impl EnergyDirection {
    pub fn from_str(s: &str) -> Option<Self> {
        match s.trim() {
            "CONSUMPTION" => Some(EnergyDirection::Consumption),
            "GENERATION" => Some(EnergyDirection::Generation),
            _ => None,
        }
    }
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
pub struct EnergyReportMeterPointStats {
    pub meter_point_id: String, //same as key of containing hashmap
    pub energy_direction: EnergyDirection,
    pub name: String,
    pub timestamp_start: NaiveDateTime,
    pub timestamp_end: NaiveDateTime,
    pub date_active_start: NaiveDate,
    pub date_active_end: NaiveDate,
}

#[derive(Debug, Clone, Serialize)]
pub enum QoV {
    L0,
    L1,
    L2,
    L3
}
impl QoV {
    pub fn from_str(s: &str) -> Option<Self> {
        match s.trim() {
            "L0" => Some(QoV::L0),
            "L1" => Some(QoV::L1),
            "L2" => Some(QoV::L2),
            "L3" => Some(QoV::L3),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct QovSample {
    timestamp: NaiveDateTime,
    value: Option<f64>,
    qov: QoV
}

#[derive(Debug, Clone, Serialize)]
pub struct QovSamples {
    pub meter_point_id: String,
    pub name: String,
    pub direction: EnergyDirection,
    pub meter_code: MeterCode,
    pub samples: Vec<Option<QovSample>>,
}

#[derive(Debug, Clone, Serialize)]
pub struct EnergyReport {
    pub timeline: Vec<Timestamp>,
    pub measurements: Vec<Measurement>,
    pub measurements_complete: Option<bool>,
    pub missing_samples: Vec<MissingSample>,
    pub meter_points_stats: HashMap<String, EnergyReportMeterPointStats>,
    pub qov_timeline: Vec<Timestamp>,
    pub qov_samples: Vec<QovSamples>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MemberType {
    Private,
    Business,
}
impl MemberType {
    pub fn from_str(s: &str) -> Option<Self> {
        match s.trim() {
            "Privat" => Some(MemberType::Private),
            "Business" => Some(MemberType::Business),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MeterPointStatus {
    Active,
    Inactive,
    Rejected,
    Invalid,
    Pending,
}
impl MeterPointStatus {
    pub fn from_str(s: &str) -> Option<Self> {
        match s.trim() {
            "ACTIVE" => Some(MeterPointStatus::Active),
            "INACTIVE" => Some(MeterPointStatus::Inactive),
            "REJECTED" => Some(MeterPointStatus::Rejected),
            "INVALID" => Some(MeterPointStatus::Invalid),
            "PENDING" => Some(MeterPointStatus::Pending),
            _ => None,
        }
    }
}

pub struct MeterPoint {
    pub id: String,
    pub status: MeterPointStatus,
    pub registered: NaiveDate,
    pub energy_direction: EnergyDirection,
    pub activated: Option<NaiveDate>,
    pub deactivated: Option<NaiveDate>,
    pub subscription_name: Option<String>,
}

pub struct Member {
    pub member_number: String,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub company_name: Option<String>,
    pub email: String,
    pub member_type: MemberType,
    pub meter_points: HashMap<String, MeterPoint>,
}

pub struct Masterdata {
    pub members: HashMap<String, Member>,
    pub file_complete: Option<bool>,
    pub missing_subscriptions: Vec<String>,
    pub missing_activations: Vec<String>,
}

impl Masterdata {
    fn check_subscription_complete(&mut self) -> bool {
        //println!("check_subscription");
        let mut complete = true;
        for (_member_number, member) in &self.members {
            for (id, meter_point) in &member.meter_points {
                if meter_point.subscription_name.is_none() {
                    //println!("missing subscription{} {}", id, meter_point.id);
                    complete = false;
                    self.missing_subscriptions.push(id.clone());
                }
            }
        }
        complete
    }

    /**
     * list points that are active but have no (or wrong???, how?) activation date
     */
    fn check_activated_complete(&mut self) -> bool {
        //println!("check_activated");
        let mut complete = true;
        for (_member_number, member) in &self.members {
            for (id, meter_point) in &member.meter_points {
                //println!("checking activation: {} {:?}", id, meter_point.status);

                if meter_point.status == MeterPointStatus::Active && meter_point.activated.is_none()
                {
                    //println!("missing activation{} {}", id, meter_point.id);
                    complete = false;
                    self.missing_activations.push(id.clone());
                }
            }
        }
        complete
    }

    pub fn get_file_complete(&mut self) {
        //println!("get_file_complete");

        let r1 = self.check_subscription_complete();
        let r2 = self.check_activated_complete();

        self.file_complete = Some(r1 && r2);
    }
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
