use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use eegfaktura_datalib::eegfaktura::loader::{EnergyReport, Masterdata};

#[derive(Clone)]
pub struct AppState {
    pub energy_reports: Arc<Mutex<HashMap<String, EnergyReport>>>,
    pub masterdata_reports: Arc<Mutex<HashMap<String, Masterdata>>>,
}

impl AppState {
    pub fn new() -> Self {
        AppState {
            energy_reports: Arc::new(Mutex::new(HashMap::new())),
            masterdata_reports: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}
