//! High-level, client-facing logical checks over the parsed data structures.
//!
//! These consolidate the individual checks the Tauri client performs
//! (see `eegfaktura-client/src-tauri/src/commands`) into single entry points
//! that return structured, serializable results. Both the desktop client and
//! the `eegfaktura-checker` CLI can share this logic instead of re-deriving it.

use std::collections::{BTreeMap, HashMap, HashSet};

use chrono::{Datelike, NaiveDate, NaiveDateTime};
use serde::Serialize;

use crate::eegfaktura::loader::{
    EnergyReport, EnergyReportMeterPointStats, Masterdata, Member, MeterPoint, MeterPointStatus,
    PodList,
};

#[cfg(test)]
mod tests;

/// A meter point that carries L3 (unreliable / extrapolated) values, with the
/// count of affected quarter-hours and the days on which they occurred. The
/// export only reports this at day granularity (a comment listing the
/// affected days), not exact quarter-hour timestamps.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct L3MeterPoint {
    pub meter_point_id: String,
    pub name: String,
    /// Number of L3 quarter-hours.
    pub count: u32,
    /// Days on which at least one L3 quarter-hour occurred, chronological.
    pub affected_days: Vec<NaiveDate>,
}

/// A meter point with missing samples, together with the timestamps of the gaps.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct MissingSamplesMeterPoint {
    pub meter_point_id: String,
    pub name: String,
    /// Timestamps of the missing samples, chronological and de-duplicated.
    pub occurrences: Vec<NaiveDateTime>,
}

/// Consolidated result of all logical checks on an [`EnergyReport`].
#[derive(Debug, Clone, Serialize)]
pub struct EnergyReportChecks {
    /// `true` when every expected sample inside each meter point's active
    /// window is present.
    pub measurements_complete: bool,
    /// Meter points that have at least one missing sample in their active
    /// window, with the timestamps of the gaps (mirrors the client's "dirty
    /// meter points").
    pub meter_points_with_missing_samples: Vec<MissingSamplesMeterPoint>,
    /// Meter points that contain L3 (unreliable / extrapolated) values, with the
    /// timestamps at which they occur. L2 substitute values are considered
    /// reliable and are not flagged.
    pub meter_points_with_l3_values: Vec<L3MeterPoint>,
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

        // Collect the timestamps of every missing sample, grouped by meter point.
        // A meter point can have several measurements (columns), so the same
        // timestamp may show up more than once — de-duplicate per meter point.
        let mut missing: BTreeMap<String, (String, Vec<NaiveDateTime>)> = BTreeMap::new();
        for ms in &report.missing_samples {
            let entry = missing
                .entry(ms.measurement.meter_point_id.clone())
                .or_insert_with(|| (ms.measurement.name.clone(), Vec::new()));
            entry.1.push(ms.timestamp.timestamp);
        }

        EnergyReportChecks {
            measurements_complete,
            meter_points_with_missing_samples: missing_samples_meter_points(missing),
            meter_points_with_l3_values: l3_meter_points(&report.meter_points_stats),
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

/// A meter point whose activation window disagrees across the sources it
/// appears in. Every field carries the value from its source (`None` when the
/// meter point is absent from that source, or the source has no such date).
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ActivationMismatch {
    pub meter_point_id: String,
    /// Status from masterdata; `None` when the point is not in the masterdata.
    pub status: Option<MeterPointStatus>,
    /// Member number of the owning member in masterdata; `None` when the point
    /// is not in the masterdata.
    pub member_number: Option<String>,
    /// Display name of the owning member in masterdata; `None` when the point is
    /// not in the masterdata.
    pub member_name: Option<String>,

    /// Activation (start) date per source.
    pub masterdata_activated: Option<NaiveDate>,
    pub podlist_activated: Option<NaiveDate>,
    pub energy_active_start: Option<NaiveDate>,

    /// Deactivation (end) date per source. Open-ended windows (year >= 2999,
    /// e.g. the 2999-12-31 / 9999-12-31 sentinels) are treated as equal.
    pub masterdata_deactivated: Option<NaiveDate>,
    pub podlist_active_until: Option<NaiveDate>,
    pub energy_active_end: Option<NaiveDate>,

    /// `false` when the concrete start dates from different sources disagree.
    pub start_dates_agree: bool,
    /// `false` when the (sentinel-normalized) end dates from different sources
    /// disagree.
    pub end_dates_agree: bool,
}

/// Cross-source consistency of meter point activation windows between the
/// masterdata file, the podlist and (optionally) an energy report.
///
/// The start date a meter point carries in the masterdata (`aktiviert`) must
/// match the podlist `aktiviert` and the energy report's active-from date;
/// likewise for the end date (`deaktiviert` / `aktiv bis` / active-until).
/// Only concrete dates are compared — a source that has no date for a point
/// (e.g. masterdata has no `aktiviert` for a pending point) is not counted as a
/// disagreement. Open-ended end dates are normalized so the differing sentinels
/// (2999-12-31 vs 9999-12-31) do not register as conflicts.
///
/// Only ACTIVE meter points are expected to appear in the podlist; other
/// statuses legitimately may not, so their absence is not reported.
#[derive(Debug, Clone, Serialize)]
pub struct ActivationConsistencyChecks {
    /// Meter points present in >= 2 sources whose start or end dates disagree.
    pub mismatches: Vec<ActivationMismatch>,
    /// ACTIVE meter points from masterdata that are absent from the podlist.
    pub active_missing_from_podlist: Vec<String>,
    /// Meter points listed in the podlist but absent from masterdata.
    pub missing_from_masterdata: Vec<String>,
}

impl ActivationConsistencyChecks {
    pub fn run(
        masterdata: &Masterdata,
        podlist: &PodList,
        energy_report: Option<&EnergyReport>,
    ) -> Self {
        // Flatten masterdata meter points into id -> meter point. A meter point
        // id can appear under more than one member (e.g. after an ownership
        // change), so pick a deterministic winner instead of relying on hash
        // map iteration order.
        let mut masterdata_points: HashMap<&str, (&Member, &MeterPoint)> = HashMap::new();
        for member in masterdata.members.values() {
            for meter_point in member.meter_points.values() {
                masterdata_points
                    .entry(meter_point.id.as_str())
                    .and_modify(|existing| {
                        if meter_point_rank(meter_point) > meter_point_rank(existing.1) {
                            *existing = (member, meter_point);
                        }
                    })
                    .or_insert((member, meter_point));
            }
        }
        let energy_stats = energy_report.map(|r| &r.meter_points_stats);

        // Union of all meter point ids across the provided sources.
        let mut all_ids: HashSet<&str> = HashSet::new();
        all_ids.extend(masterdata_points.keys().copied());
        all_ids.extend(podlist.meter_point_activations.keys().map(String::as_str));
        if let Some(stats) = energy_stats {
            all_ids.extend(stats.keys().map(String::as_str));
        }

        let mut mismatches: Vec<ActivationMismatch> = Vec::new();
        let mut active_missing_from_podlist: Vec<String> = Vec::new();
        let mut missing_from_masterdata: Vec<String> = Vec::new();

        for id in all_ids {
            let md_entry = masterdata_points.get(id).copied();
            let md = md_entry.map(|(_, mp)| mp);
            let member = md_entry.map(|(m, _)| m);
            let pod = podlist.meter_point_activations.get(id);
            let en = energy_stats.and_then(|s| s.get(id));

            // presence checks (masterdata <-> podlist)
            match (md, pod) {
                (Some(mp), None) if mp.status == MeterPointStatus::Active => {
                    active_missing_from_podlist.push(id.to_string());
                }
                (None, Some(_)) => {
                    missing_from_masterdata.push(id.to_string());
                }
                _ => {}
            }

            // date consistency across every source that has this point
            let masterdata_activated = md.and_then(|m| m.activated);
            let podlist_activated = pod.map(|s| s.activated);
            let energy_active_start = en.map(|s| s.date_active_start);

            let masterdata_deactivated = md.and_then(|m| m.deactivated);
            let podlist_active_until = pod.map(|s| s.active_until);
            let energy_active_end = en.map(|s| s.date_active_end);

            let source_count =
                md.is_some() as u8 + pod.is_some() as u8 + en.is_some() as u8;
            if source_count < 2 {
                continue; // nothing to cross-check
            }

            let start_dates_agree = starts_agree(&[
                masterdata_activated,
                podlist_activated,
                energy_active_start,
            ]);
            let end_dates_agree = ends_agree(&[
                masterdata_deactivated,
                podlist_active_until,
                energy_active_end,
            ]);

            if !start_dates_agree || !end_dates_agree {
                mismatches.push(ActivationMismatch {
                    meter_point_id: id.to_string(),
                    status: md.map(|m| m.status),
                    member_number: member.map(|m| m.member_number.clone()),
                    member_name: member.map(member_display_name),
                    masterdata_activated,
                    podlist_activated,
                    energy_active_start,
                    masterdata_deactivated,
                    podlist_active_until,
                    energy_active_end,
                    start_dates_agree,
                    end_dates_agree,
                });
            }
        }

        mismatches.sort_by(|a, b| a.meter_point_id.cmp(&b.meter_point_id));
        active_missing_from_podlist.sort();
        missing_from_masterdata.sort();

        ActivationConsistencyChecks {
            mismatches,
            active_missing_from_podlist,
            missing_from_masterdata,
        }
    }

    /// `true` if any activation inconsistency was found.
    pub fn has_issues(&self) -> bool {
        !self.mismatches.is_empty()
            || !self.active_missing_from_podlist.is_empty()
            || !self.missing_from_masterdata.is_empty()
    }
}

/// One owner's record of a meter point (a single masterdata row).
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct OwnerRecord {
    pub member_number: String,
    pub member_name: String,
    pub status: MeterPointStatus,
    pub activated: Option<NaiveDate>,
    pub deactivated: Option<NaiveDate>,
}

/// An external source (podlist or energy report) that still carries a former
/// owner's activation date for a transferred meter point.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct StaleSource {
    /// Which source is stale, e.g. "podlist" or "energy report".
    pub source: String,
    /// The activation date that source carries.
    pub activation_date: NaiveDate,
    /// The former owner whose active period covers that date, if identifiable.
    pub former_owner: Option<String>,
}

/// A meter point that appears under more than one member — i.e. its ownership
/// changed over time.
#[derive(Debug, Clone, Serialize)]
pub struct MeterPointOwnership {
    pub meter_point_id: String,
    /// All owners, ordered by activation date (earliest first).
    pub owners: Vec<OwnerRecord>,
    /// `true` for a clean transfer (each owner deactivated before the next was
    /// activated, at most one currently active) with no stale external sources.
    pub is_valid: bool,
    /// Human-readable descriptions of what makes the transfer invalid; empty
    /// when `is_valid`.
    pub problems: Vec<String>,
    /// External sources still pointing at a former owner after the transfer.
    pub stale_sources: Vec<StaleSource>,
}

/// Ownership-change consistency across the masterdata, podlist and energy report.
///
/// A meter point can legitimately change owner: it is deactivated for the old
/// owner and later activated for the new one. Such a meter point appears under
/// several members. A transfer is clean when the owners' active periods do not
/// overlap, only one owner is currently active, and every external source
/// (podlist, energy report) carries the current owner's activation date rather
/// than a former owner's.
#[derive(Debug, Clone, Serialize)]
pub struct OwnershipChecks {
    /// Meter points that appear under more than one member.
    pub transfers: Vec<MeterPointOwnership>,
}

impl OwnershipChecks {
    pub fn run(
        masterdata: &Masterdata,
        podlist: &PodList,
        energy_report: Option<&EnergyReport>,
    ) -> Self {
        // Collect every (member, meter point) record grouped by meter point id.
        let mut by_id: HashMap<&str, Vec<(&Member, &MeterPoint)>> = HashMap::new();
        for member in masterdata.members.values() {
            for meter_point in member.meter_points.values() {
                by_id
                    .entry(meter_point.id.as_str())
                    .or_default()
                    .push((member, meter_point));
            }
        }
        let energy_stats = energy_report.map(|r| &r.meter_points_stats);

        let mut transfers: Vec<MeterPointOwnership> = Vec::new();
        for (id, mut records) in by_id {
            if records.len() < 2 {
                continue; // single owner, not a transfer
            }

            // order by activation date (points without one sort first), then by
            // member number for a stable result
            records.sort_by(|a, b| {
                a.1.activated
                    .cmp(&b.1.activated)
                    .then_with(|| a.0.member_number.cmp(&b.0.member_number))
            });

            let mut problems: Vec<String> = Vec::new();

            let active_count = records
                .iter()
                .filter(|(_, mp)| mp.status == MeterPointStatus::Active)
                .count();
            if active_count > 1 {
                problems.push(format!("{} owners are simultaneously ACTIVE", active_count));
            }

            if owners_overlap(&records) {
                problems.push(
                    "owner active periods overlap (old owner not deactivated before the next was activated)"
                        .to_string(),
                );
            }

            // The current owner is the active one (latest activation if several),
            // else simply the latest-activated record.
            let current = records
                .iter()
                .filter(|(_, mp)| mp.status == MeterPointStatus::Active)
                .max_by_key(|(_, mp)| mp.activated)
                .or_else(|| records.iter().max_by_key(|(_, mp)| mp.activated));
            let current_member = current.map(|(m, _)| m.member_number.as_str());
            let current_activation = current.and_then(|(_, mp)| mp.activated);

            // A source is stale if its activation date predates the current
            // owner's activation, i.e. it still reflects a former owner.
            let mut stale_sources: Vec<StaleSource> = Vec::new();
            if let Some(current_start) = current_activation {
                let podlist_date = podlist.meter_point_activations.get(id).map(|s| s.activated);
                let energy_date = energy_stats
                    .and_then(|s| s.get(id))
                    .map(|s| s.date_active_start);

                for (source, date) in [("podlist", podlist_date), ("energy report", energy_date)]
                {
                    if let Some(date) = date {
                        if date < current_start {
                            stale_sources.push(StaleSource {
                                source: source.to_string(),
                                activation_date: date,
                                former_owner: former_owner_at(&records, current_member, date),
                            });
                        }
                    }
                }
            }

            let owners: Vec<OwnerRecord> = records
                .iter()
                .map(|(member, mp)| OwnerRecord {
                    member_number: member.member_number.clone(),
                    member_name: member_display_name(member),
                    status: mp.status,
                    activated: mp.activated,
                    deactivated: mp.deactivated,
                })
                .collect();

            let is_valid = problems.is_empty() && stale_sources.is_empty();
            transfers.push(MeterPointOwnership {
                meter_point_id: id.to_string(),
                owners,
                is_valid,
                problems,
                stale_sources,
            });
        }

        transfers.sort_by(|a, b| a.meter_point_id.cmp(&b.meter_point_id));
        OwnershipChecks { transfers }
    }

    /// `true` if any ownership transfer is invalid. Clean transfers are normal
    /// and do not count as an issue.
    pub fn has_issues(&self) -> bool {
        self.transfers.iter().any(|t| !t.is_valid)
    }
}

/// The display name of the former owner (not the current one) whose active
/// period covers `date`, if any.
fn former_owner_at(
    records: &[(&Member, &MeterPoint)],
    current_member: Option<&str>,
    date: NaiveDate,
) -> Option<String> {
    records
        .iter()
        .filter(|(member, _)| Some(member.member_number.as_str()) != current_member)
        .find(|(_, mp)| {
            let start = mp.activated.unwrap_or(NaiveDate::MIN);
            let end = mp
                .deactivated
                .filter(|d| !is_open_ended(*d))
                .unwrap_or(NaiveDate::MAX);
            start <= date && date <= end
        })
        .map(|(member, _)| member_display_name(member))
}

/// Do any two owners' active periods overlap? Each period runs from `activated`
/// (open start if absent) to `deactivated` (open end if absent or an open-ended
/// sentinel). Touching endpoints (deactivate on the day the next activates) do
/// not count as an overlap.
fn owners_overlap(records: &[(&Member, &MeterPoint)]) -> bool {
    let intervals: Vec<(NaiveDate, NaiveDate)> = records
        .iter()
        .map(|(_, mp)| {
            let start = mp.activated.unwrap_or(NaiveDate::MIN);
            let end = match mp.deactivated {
                Some(d) if !is_open_ended(d) => d,
                _ => NaiveDate::MAX,
            };
            (start, end)
        })
        .collect();

    for i in 0..intervals.len() {
        for j in (i + 1)..intervals.len() {
            let (a_start, a_end) = intervals[i];
            let (b_start, b_end) = intervals[j];
            if a_start < b_end && b_start < a_end {
                return true;
            }
        }
    }
    false
}

/// Preference order when a meter point id appears under multiple masterdata
/// members: the ACTIVE record wins, then one that has an activation date, then
/// the most recent activation / deactivation / registration. This is a total,
/// deterministic order so the flattened result never depends on hash map
/// iteration order.
fn meter_point_rank(
    mp: &MeterPoint,
) -> (bool, bool, Option<NaiveDate>, Option<NaiveDate>, NaiveDate) {
    (
        mp.status == MeterPointStatus::Active,
        mp.activated.is_some(),
        mp.activated,
        mp.deactivated,
        mp.registered,
    )
}

/// A human-readable name for a member: "first last", falling back to the
/// company name, then to the member number.
fn member_display_name(member: &Member) -> String {
    let full = [member.first_name.as_deref(), member.last_name.as_deref()]
        .into_iter()
        .flatten()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    if !full.is_empty() {
        return full;
    }
    if let Some(company) = member.company_name.as_deref() {
        let company = company.trim();
        if !company.is_empty() {
            return company.to_string();
        }
    }
    member.member_number.clone()
}

/// An end date at or beyond year 2999 is an open-ended sentinel (both
/// 2999-12-31 and 9999-12-31 are used in practice).
fn is_open_ended(date: NaiveDate) -> bool {
    date.year() >= 2999
}

/// Concrete start dates present across sources must all be equal.
fn starts_agree(dates: &[Option<NaiveDate>]) -> bool {
    let present: Vec<NaiveDate> = dates.iter().flatten().copied().collect();
    present.windows(2).all(|w| w[0] == w[1])
}

/// End dates present across sources must all be equal after normalizing
/// open-ended sentinels to a single value.
fn ends_agree(dates: &[Option<NaiveDate>]) -> bool {
    let present: Vec<Option<NaiveDate>> = dates
        .iter()
        .flatten()
        .map(|&d| if is_open_ended(d) { None } else { Some(d) })
        .collect();
    present.windows(2).all(|w| w[0] == w[1])
}

fn missing_samples_meter_points(
    map: BTreeMap<String, (String, Vec<NaiveDateTime>)>,
) -> Vec<MissingSamplesMeterPoint> {
    map.into_iter()
        .map(|(meter_point_id, (name, mut occurrences))| {
            occurrences.sort();
            occurrences.dedup();
            MissingSamplesMeterPoint {
                meter_point_id,
                name,
                occurrences,
            }
        })
        .collect()
}

fn l3_meter_points(stats: &HashMap<String, EnergyReportMeterPointStats>) -> Vec<L3MeterPoint> {
    let mut result: Vec<L3MeterPoint> = stats
        .values()
        .filter(|s| s.l3_count > 0)
        .map(|s| L3MeterPoint {
            meter_point_id: s.meter_point_id.clone(),
            name: s.name.clone(),
            count: s.l3_count,
            affected_days: s.l3_days.clone(),
        })
        .collect();
    result.sort_by(|a, b| a.meter_point_id.cmp(&b.meter_point_id));
    result
}
