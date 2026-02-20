use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use eegfaktura_datalib::eegfaktura::loader::EnergyReport;

#[derive(Clone)]
pub struct AppState {
    pub energy_reports: Arc<Mutex<HashMap<String, EnergyReport>>>,
}

impl AppState {
    pub fn new() -> Self {
        AppState {
            energy_reports: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}
