use crate::eegfaktura::loader::Masterdata;

#[test]
fn test_check_masterdata_complete() {
    let base_path = format!("{}", env!("CARGO_MANIFEST_DIR"));
    let member_list = "test-files/EEG-Masterdata.xlsx";
    let path = format!("{}/{}", base_path, member_list);
    let mut masterdata = Masterdata::new(path);

    assert_eq!(masterdata.file_complete, None);

    masterdata.get_file_complete();

    assert!(masterdata.file_complete.is_some());
    assert_eq!(masterdata.file_complete.unwrap(), false);

    assert_eq!(masterdata.missing_activations.len(), 35);
    assert_eq!(masterdata.missing_subscriptions.len(), 2);
}
