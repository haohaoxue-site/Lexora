use serde_json::json;

use super::*;

#[test]
fn request_rejects_unknown_fields_empty_batches_and_unbounded_input() {
    for value in [
        json!({"paths":[]}),
        json!({"paths":["C:\\private"], "sddl":"D:NO_ACCESS_CONTROL"}),
        json!({"paths":vec!["C:\\private";65]}),
    ] {
        assert_eq!(
            read_request(serde_json::to_vec(&value).unwrap().as_slice()).unwrap_err(),
            DirectoryError::Invalid
        );
    }
    assert_eq!(
        run(vec![b' '; 256 * 1024 + 1].as_slice(), Vec::new()),
        Err(DirectoryError::Invalid)
    );
}

#[test]
fn paths_reject_roots_devices_streams_and_ambiguous_components() {
    for path in [
        "C:\\",
        "C:private",
        "relative",
        "\\\\server\\share",
        "\\\\?\\C:\\private",
        "\\\\.\\pipe\\private",
        "C:\\parent\\..\\private",
        "C:\\private.",
        "C:\\private ",
        "C:\\file:stream",
        "C:\\NUL.txt",
        "C:\\COM¹",
        "C:\\a\\\\b",
        "C:\\bad\0name",
    ] {
        assert!(directory_parts(path).is_err(), "{path}");
    }
    assert!(directory_parts(&format!("C:\\{}", "a".repeat(256))).is_err());
}

#[test]
fn directory_parts_preserve_unicode_and_distinguish_unc_roots() {
    assert_eq!(
        directory_parts("C:\\示例\\private").unwrap(),
        ("\\\\?\\C:\\".into(), vec!["示例", "private"])
    );
    assert_eq!(
        directory_parts("\\\\server\\share\\private\\").unwrap(),
        ("\\\\?\\UNC\\server\\share\\".into(), vec!["private"])
    );
}

#[test]
fn request_validates_every_path_in_the_batch() {
    let input = json!({"paths":["C:\\valid", "C:\\bad:stream"]});
    assert_eq!(
        read_request(serde_json::to_vec(&input).unwrap().as_slice()).unwrap_err(),
        DirectoryError::Invalid
    );
}
