//! High-level, client-facing logical checks over the parsed data structures.
//!
//! These consolidate the individual checks the Tauri client performs
//! (see `eegfaktura-client/src-tauri/src/commands`) into single entry points
//! that return structured, serializable results. Both the desktop client and
//! the `eegfaktura-checker` CLI can share this logic instead of re-deriving it.

use std::collections::{BTreeMap, HashMap};

use serde::Serialize;

use crate::eegfaktura::loader::{EnergyReport, Masterdata, QovSamples};

#[cfg(test)]
mod tests;

/// A meter point referenced by a check result.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct MeterPointRef {
    pub meter_point_id: String,
    pub name: String,
}

/// Consolidated result of all logical checks on an [`EnergyReport`].
#[derive(Debug, Clone, Serialize)]
pub struct EnergyReportChecks {
    /// `true` when every expected sample inside each meter point's active
    /// window is present.
    pub measurements_complete: bool,
    /// Meter points that have at least one missing sample in their active
    /// window (mirrors the client's "dirty meter points").
    pub meter_points_with_missing_samples: Vec<MeterPointRef>,
    /// Meter points that contain L3 (unreliable / extrapolated) values. L2
    /// substitute values are considered reliable and are not flagged.
    pub meter_points_with_l3_values: Vec<MeterPointRef>,
}

impl EnergyReportChecks {
    /// Run every energy-report check. Requires `&mut` because detecting missing
    /// samples populates the report's internal state (same as the client).
    pub fn run(report: &mut EnergyReport) -> Self {
        // Populate missing-sample state if it hasn't been computed yet.
        if report.missing_samples.is_empty() {
            report.get_missing_samples();
        }
        let measurements_complete = report.measurements_complete.unwrap_or(false);

        // Dedupe measurements down to the meter points that have gaps.
        let mut missing: BTreeMap<String, String> = BTreeMap::new();
        for measurement in &report.measurements {
            if measurement.has_missing_samples {
                missing
                    .entry(measurement.meter_point_id.clone())
                    .or_insert_with(|| measurement.name.clone());
            }
        }

        EnergyReportChecks {
            measurements_complete,
            meter_points_with_missing_samples: dedup_map_to_refs(missing),
            meter_points_with_l3_values: qov_map_to_refs(report.get_qov_l3_issues()),
        }
    }

    /// `true` if any check flags a problem that makes the report unsuitable for
    /// billing.
    pub fn has_issues(&self) -> bool {
        !self.measurements_complete
            || !self.meter_points_with_missing_samples.is_empty()
            || !self.meter_points_with_l3_values.is_empty()
    }
}

/// Consolidated result of all logical checks on a [`Masterdata`] file.
#[derive(Debug, Clone, Serialize)]
pub struct MasterdataChecks {
    /// `true` when no subscriptions and no activations are missing.
    pub file_complete: bool,
    /// Meter point ids that are missing a subscription (tariff).
    pub missing_subscriptions: Vec<String>,
    /// Active meter point ids that are missing an activation date.
    pub missing_activations: Vec<String>,
}

impl MasterdataChecks {
    /// Run every masterdata check.
    pub fn run(masterdata: &mut Masterdata) -> Self {
        // Avoid double-computing (which would duplicate the collected ids).
        if masterdata.file_complete.is_none() {
            masterdata.get_file_complete();
        }

        let mut missing_subscriptions = masterdata.missing_subscriptions.clone();
        missing_subscriptions.sort();
        let mut missing_activations = masterdata.missing_activations.clone();
        missing_activations.sort();

        MasterdataChecks {
            file_complete: masterdata.file_complete.unwrap_or(false),
            missing_subscriptions,
            missing_activations,
        }
    }

    /// `true` if the masterdata file has any missing subscriptions or
    /// activations.
    pub fn has_issues(&self) -> bool {
        !self.file_complete
    }
}

fn dedup_map_to_refs(map: BTreeMap<String, String>) -> Vec<MeterPointRef> {
    map.into_iter()
        .map(|(meter_point_id, name)| MeterPointRef {
            meter_point_id,
            name,
        })
        .collect()
}

fn qov_map_to_refs(map: HashMap<String, QovSamples>) -> Vec<MeterPointRef> {
    let mut refs: Vec<MeterPointRef> = map
        .into_iter()
        .map(|(meter_point_id, samples)| MeterPointRef {
            meter_point_id,
            name: samples.name,
        })
        .collect();
    refs.sort_by(|a, b| a.meter_point_id.cmp(&b.meter_point_id));
    refs
}
