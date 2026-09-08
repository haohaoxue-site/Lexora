#[cfg(test)]
use lexora_buddy_host::file_reader::{ReadError, read_request, run};

#[test]
fn accepts_zero_byte_limit() {
    let request =
        read_request(br#"{"root":"C:\\data","path":"C:\\data\\empty","maxBytes":0}"#.as_slice())
            .unwrap();
    assert_eq!(request.max_bytes, 0);
}

#[test]
fn rejects_invalid_or_unbounded_requests_without_output() {
    for input in [
        r#"{"root":"C:\\data","path":"C:\\data\\file","maxBytes":-1}"#,
        r#"{"root":"C:\\data","path":"C:\\data\\file","maxBytes":1.5}"#,
        r#"{"root":"C:\\data","path":"C:\\data\\file","maxBytes":67108865}"#,
        r#"{"root":"C:\\data","path":"C:\\data\\file","maxBytes":0,"command":"whoami"}"#,
        "{}",
    ] {
        let mut output = Vec::new();
        assert!(run(input.as_bytes(), &mut output).is_err());
        assert!(output.is_empty());
    }
}

#[test]
fn errors_do_not_disclose_host_paths() {
    assert_eq!(
        ReadError::ReadFailed.to_string(),
        "BOUNDED_FILE_READ_FAILED"
    );
    assert_eq!(
        ReadError::OutputLimit.to_string(),
        "BOUNDED_FILE_OUTPUT_LIMIT"
    );
    assert_eq!(
        ReadError::Unavailable.to_string(),
        "BOUNDED_FILE_READER_UNAVAILABLE"
    );
}

#[test]
fn rejects_oversized_request() {
    assert!(read_request(vec![b' '; 256 * 1024 + 1].as_slice()).is_err());
}
