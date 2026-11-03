use std::{collections::HashMap, str::FromStr};

use chrono::{NaiveDate, NaiveDateTime};
use serde::Serialize;

pub mod excel;

mod comments;

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
impl FromStr for EnergyDirection {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim() {
            "CONSUMPTION" => Ok(EnergyDirection::Consumption),
            "GENERATION" => Ok(EnergyDirection::Generation),
            _ => Err(format!("Unknown meter code: {}", s)),
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
impl FromStr for MeterCode {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "Gesamtverbrauch lt. Messung (bei Teilnahme gem. Erzeugung) [KWH]" => {
                Ok(MeterCode::TotalConsumption)
            }
            "Anteil gemeinschaftliche Erzeugung [KWH]" => Ok(MeterCode::ShareOnProduction),
            "Eigendeckung gemeinschaftliche Erzeugung [KWH]" => {
                Ok(MeterCode::ConsumptionOfProduction)
            }
            "Gesamte gemeinschaftliche Erzeugung [KWH]" => Ok(MeterCode::TotalProduction),
            "Gesamt/Überschusserzeugung, Gemeinschaftsüberschuss [KWH]" => {
                Ok(MeterCode::ProductionOvershoot)
            }
            _ => Err(format!("Unknown meter code: {}", s)),
        }
    }
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
    /// From the Summary sheet's "Daten vollständig? Ja/Nein" column.
    pub data_complete: bool,
    /// Quarter-hours with no measurement at all (L0).
    pub l0_count: u32,
    /// Quarter-hours filled with a reliable substitute value (L2).
    pub l2_count: u32,
    /// Quarter-hours filled with an unreliable / extrapolated value (L3).
    pub l3_count: u32,
    /// Days on which an L0 quarter-hour occurred, from the cell comment.
    pub l0_days: Vec<NaiveDate>,
    /// Days on which an L2 quarter-hour occurred, from the cell comment.
    pub l2_days: Vec<NaiveDate>,
    /// Days on which an L3 quarter-hour occurred, from the cell comment.
    pub l3_days: Vec<NaiveDate>,
}

#[derive(Debug, Clone, Serialize)]
pub struct EnergyReport {
    pub timeline: Vec<Timestamp>,
    pub measurements: Vec<Measurement>,
    pub measurements_complete: Option<bool>,
    pub missing_samples: Vec<MissingSample>,
    pub meter_points_stats: HashMap<String, EnergyReportMeterPointStats>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MemberType {
    Private,
    Business,
}
impl FromStr for MemberType {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim() {
            "Privat" => Ok(MemberType::Private),
            "Business" => Ok(MemberType::Business),
            _ => Err(format!("Unknown meter code: {}", s)),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum MeterPointStatus {
    Active,
    Inactive,
    Rejected,
    Invalid,
    Pending,
}
impl FromStr for MeterPointStatus {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.trim() {
            "ACTIVE" => Ok(MeterPointStatus::Active),
            "INACTIVE" => Ok(MeterPointStatus::Inactive),
            "REJECTED" => Ok(MeterPointStatus::Rejected),
            "INVALID" => Ok(MeterPointStatus::Invalid),
            "PENDING" => Ok(MeterPointStatus::Pending),
            _ => Err(format!("Unknown meter code: {}", s)),
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

                // HACK: Summertime 2026
                let summer_first_date = String::from("29.03.2026 02:00:00");
                let summer_last_date = String::from("29.03.2026 03:00:00");
                let naive_summer_date_time_first =
                    NaiveDateTime::parse_from_str(summer_first_date.as_str(), "%d.%m.%Y %H:%M:%S")
                        .unwrap();
                let naive_summer_date_time_last =
                    NaiveDateTime::parse_from_str(summer_last_date.as_str(), "%d.%m.%Y %H:%M:%S")
                        .unwrap();

                // need to check measurement for this timestamp?
                if measurement.period_start <= timestamp.timestamp
                    && measurement.period_end >= timestamp.timestamp
                    && !(timestamp.timestamp >= naive_summer_date_time_first
                        && timestamp.timestamp < naive_summer_date_time_last)
                {
                    // we also need to skip the missing hour transitioning from winter to summer time

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


#[derive(Debug, Clone, Serialize)]
pub struct PodList {
    pub meter_point_activations: HashMap<String, ActivationStats>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ActivationStats {
    pub activated: NaiveDate,
    pub active_since: NaiveDate,
    pub active_until: NaiveDate,
    pub participation_factor: i8,
}
