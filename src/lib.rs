pub mod eegfaktura;

#[cfg(test)]
mod tests {
    //use super::*;
    use chrono::NaiveDateTime;

    // tests on large files are slow under debug. run only once in a while
    // use small module tests instead
    #[test]
    fn it_works() {
        //Energy-Report-large
        let base_path = format!("{}", env!("CARGO_MANIFEST_DIR"));
        let member_list = "test-files/Energy-Report-Errors.xlsx";
        let path = format!("{}/{}", base_path, member_list);

        let energy_file = crate::eegfaktura::loader::EnergyReport::new(path);

        let first_date = String::from("01.10.2025 00:00:00");
        let naive_date_time_first =
            NaiveDateTime::parse_from_str(first_date.as_str(), "%d.%m.%Y %H:%M:%S").unwrap();

        //TODO: refactor EnergyFile to getters for timeline etc. and make fields private
        assert_eq!(
            energy_file.get_timeline().first().unwrap().timestamp,
            naive_date_time_first
        );

        let last_date = String::from("31.10.2025 23:45:00");
        let naive_date_time_last =
            NaiveDateTime::parse_from_str(last_date.as_str(), "%d.%m.%Y %H:%M:%S").unwrap();
        assert_eq!(
            energy_file.get_timeline().last().unwrap().timestamp,
            naive_date_time_last
        );
    }
}
