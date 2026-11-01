use std::panic::AssertUnwindSafe;
use std::path::Path;

use serde::Serialize;

use eegfaktura_datalib::eegfaktura::checks::{
    ActivationConsistencyChecks, EnergyReportChecks, MasterdataChecks, OwnershipChecks,
};
use eegfaktura_datalib::eegfaktura::loader::{EnergyReport, Masterdata, PodList};

use super::files::{
    is_energy_report_name, is_masterdata_name, is_podlist_name, latest_matching, latest_n_matching,
};

/// Result of running all checks for a single energy report file.
#[derive(Debug, Clone, Serialize)]
pub struct EnergyReportResult {
    pub file_name: String,
    pub path: String,
    /// Set when the file could not be parsed; the checks are then `None`.
    pub error: Option<String>,
    pub energy: Option<EnergyReportChecks>,
    pub activation: Option<ActivationConsistencyChecks>,
    pub has_issues: bool,
}

/// Everything the dashboard needs, computed from the files in ~/Downloads.
#[derive(Debug, Clone, Serialize)]
pub struct Dashboard {
    pub downloads_dir: String,
    pub masterdata_file: Option<String>,
    pub podlist_file: Option<String>,
    pub masterdata: Option<MasterdataChecks>,
    pub ownership: Option<OwnershipChecks>,
    pub energy_reports: Vec<EnergyReportResult>,
    /// Non-fatal problems (missing files, unreadable files, ...).
    pub warnings: Vec<String>,
}

#[tauri::command]
pub async fn run_dashboard() -> Result<Dashboard, String> {
    tokio::task::spawn_blocking(build_dashboard)
        .await
        .map_err(|e| e.to_string())?
}

fn build_dashboard() -> Result<Dashboard, String> {
    let downloads = dirs::download_dir().ok_or("Could not find Downloads directory")?;
    let downloads_dir = downloads.to_string_lossy().to_string();

    let mut warnings: Vec<String> = Vec::new();

    let masterdata_path = latest_matching(&downloads, is_masterdata_name);
    let podlist_path = latest_matching(&downloads, is_podlist_name);
    let energy_paths = latest_n_matching(&downloads, is_energy_report_name, 10);

    if masterdata_path.is_none() {
        warnings.push("No masterdata file (*EEG-Masterdata-*.xlsx) found in Downloads".to_string());
    }
    if podlist_path.is_none() {
        warnings.push("No podlist file (*ZP_PODLIST.xlsx) found in Downloads".to_string());
    }
    if energy_paths.is_empty() {
        warnings
            .push("No energy report files (*Energy-Report-*.xlsx) found in Downloads".to_string());
    }

    // Load masterdata & podlist once (loaders panic on malformed files, so guard).
    let mut masterdata =
        masterdata_path.as_ref().and_then(|p| {
            match try_load(|| Masterdata::new(p.to_string_lossy().to_string())) {
                Some(md) => Some(md),
                None => {
                    warnings.push(format!("Could not read masterdata file {}", file_name(p)));
                    None
                }
            }
        });
    let podlist = podlist_path.as_ref().and_then(|p| {
        match try_load(|| PodList::new(p.to_string_lossy().to_string())) {
            Some(pl) => Some(pl),
            None => {
                warnings.push(format!("Could not read podlist file {}", file_name(p)));
                None
            }
        }
    });

    let masterdata_checks = masterdata.as_mut().map(MasterdataChecks::run);
    let ownership = match (masterdata.as_ref(), podlist.as_ref()) {
        (Some(md), Some(pl)) => Some(OwnershipChecks::run(md, pl, None)),
        _ => None,
    };

    let mut energy_reports: Vec<EnergyReportResult> = Vec::new();
    for path in &energy_paths {
        let path_str = path.to_string_lossy().to_string();
        let name = file_name(path);

        let report = try_load(|| EnergyReport::new(path_str.clone()));
        let Some(mut report) = report else {
            energy_reports.push(EnergyReportResult {
                file_name: name,
                path: path_str,
                error: Some("Could not read energy report file".to_string()),
                energy: None,
                activation: None,
                has_issues: true,
            });
            continue;
        };

        let energy = EnergyReportChecks::run(&mut report);
        let activation = match (masterdata.as_ref(), podlist.as_ref()) {
            (Some(md), Some(pl)) => Some(ActivationConsistencyChecks::run(md, pl, Some(&report))),
            _ => None,
        };

        let has_issues = energy.has_issues()
            || activation.as_ref().map(|a| a.has_issues()).unwrap_or(false);

        energy_reports.push(EnergyReportResult {
            file_name: name,
            path: path_str,
            error: None,
            energy: Some(energy),
            activation,
            has_issues,
        });
    }

    Ok(Dashboard {
        downloads_dir,
        masterdata_file: masterdata_path.as_ref().map(|p| file_name(p)),
        podlist_file: podlist_path.as_ref().map(|p| file_name(p)),
        masterdata: masterdata_checks,
        ownership,
        energy_reports,
        warnings,
    })
}

/// Run a loader that may `panic!` (the datalib loaders do) without bringing down
/// the whole dashboard; returns `None` if it panicked.
fn try_load<T>(f: impl FnOnce() -> T) -> Option<T> {
    std::panic::catch_unwind(AssertUnwindSafe(f)).ok()
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string()
}
