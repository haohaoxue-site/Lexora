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
        Err(DirectoryFailure::new(
            DirectoryError::Invalid,
            DirectoryOperation::Request
        ))
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

#[test]
fn failure_protocol_preserves_classification_and_system_status_without_paths() {
    let failure = DirectoryFailure {
        code: DirectoryError::Failed,
        operation: DirectoryOperation::OpenDirectory,
        directory_index: Some(2),
        system_error: Some(SystemError {
            domain: SystemErrorDomain::Ntstatus,
            code: 0xc0000022,
        }),
        acl: None,
    };
    assert_eq!(
        serde_json::to_value(failure).unwrap(),
        json!({
            "code": "PRIVATE_DIRECTORIES_FAILED",
            "operation": "open_directory",
            "directoryIndex": 2,
            "systemError": { "domain": "ntstatus", "code": 0xc0000022u32 }
        })
    );
    let error = run(
        br#"{"paths":["C:\\fixture-secret:stream"]}"#.as_slice(),
        Vec::new(),
    )
    .unwrap_err();
    assert_eq!(
        serde_json::to_value(error).unwrap(),
        json!({
            "code": "PRIVATE_DIRECTORIES_INVALID",
            "operation": "request"
        })
    );
}
