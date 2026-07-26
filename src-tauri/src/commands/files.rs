use std::{
    fs,
    path::{Path, PathBuf},
};

/// All files in `dir` whose name matches `matches`, newest (by modification
/// time) first.
fn matching_files(dir: &Path, matches: impl Fn(&str) -> bool) -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = match fs::read_dir(dir) {
        Ok(entries) => entries
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.path())
            .filter(|path| {
                path.file_name()
                    .and_then(|n| n.to_str())
                    .map(&matches)
                    .unwrap_or(false)
            })
            .collect(),
        Err(_) => Vec::new(),
    };

    // newest first
    files.sort_by_cached_key(|path| {
        std::cmp::Reverse(fs::metadata(path).and_then(|m| m.modified()).ok())
    });
    files
}

/// The newest matching file, if any.
pub fn latest_matching(dir: &Path, matches: impl Fn(&str) -> bool) -> Option<PathBuf> {
    matching_files(dir, matches).into_iter().next()
}

/// The newest `n` matching files.
pub fn latest_n_matching(dir: &Path, matches: impl Fn(&str) -> bool, n: usize) -> Vec<PathBuf> {
    let mut files = matching_files(dir, matches);
    files.truncate(n);
    files
}

/// `...EEG-Masterdata-<date>.xlsx` (optional prefix such as `RC101533-`).
pub fn is_masterdata_name(name: &str) -> bool {
    name.contains("EEG-Masterdata-") && name.ends_with(".xlsx")
}

/// `...ZP_PODLIST.xlsx` (optional prefix).
pub fn is_podlist_name(name: &str) -> bool {
    name.ends_with("ZP_PODLIST.xlsx")
}

/// `...Energy-Report-*.xlsx` (optional prefix).
pub fn is_energy_report_name(name: &str) -> bool {
    name.contains("Energy-Report-") && name.ends_with(".xlsx")
}
