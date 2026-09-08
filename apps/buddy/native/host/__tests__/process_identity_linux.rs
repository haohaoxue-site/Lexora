use super::*;

#[test]
fn parses_names_with_parentheses_and_large_start_ticks() {
    let fields = [
        "S",
        "123",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "0",
        "18446744073709551600",
    ];
    let stat = parse_stat(&format!(
        "456 (name (with) parentheses)) {}",
        fields.join(" ")
    ))
    .unwrap();
    assert_eq!(stat.parent, 123);
    assert_eq!(stat.ticks, 18446744073709551600);
    assert_eq!(stat.state, b'S');
    assert!(parse_stat("invalid").is_none());
    assert!(parse_stat("123 (name) S 0").is_none());
}
