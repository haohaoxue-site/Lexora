use super::*;

const TEST_TOKEN: &str = "lexora-buddy-active-window:test-query:";

#[test]
fn parses_plain_kwin_journal_payload() {
    let output = r#"
Jul 10 17:06:55 shanyuhai kwin_wayland[2020]: lexora-buddy-active-window:test-query:{"x":400,"y":200,"width":800,"height":600}
"#;

    assert_eq!(
        native_pet_parse_kwin_active_window_rect_output(output, TEST_TOKEN),
        Some(Some(NativePetLogicalRect::new(400, 200, 800, 600)))
    );
}

#[test]
fn parses_escaped_output_payload() {
    let output = r#"
string "lexora-buddy-active-window:test-query:{\"x\":-120,\"y\":64,\"width\":1024,\"height\":720}"
"#;

    assert_eq!(
        native_pet_parse_kwin_active_window_rect_output(output, TEST_TOKEN),
        Some(Some(NativePetLogicalRect::new(-120, 64, 1024, 720)))
    );
}

#[test]
fn ignores_stale_query_tokens() {
    let output = r#"
Jul 10 17:06:55 shanyuhai kwin_wayland[2020]: lexora-buddy-active-window:old-query:{"x":1,"y":2,"width":3,"height":4}
"#;

    assert_eq!(
        native_pet_parse_kwin_active_window_rect_output(output, TEST_TOKEN),
        None
    );
}

#[test]
fn rejects_missing_or_invalid_active_window_geometry() {
    assert_eq!(
        native_pet_parse_kwin_active_window_rect_output(
            r#"string "lexora-buddy-active-window:test-query:null""#,
            TEST_TOKEN,
        ),
        Some(None)
    );
    assert_eq!(
        native_pet_parse_kwin_active_window_rect_output(
            r#"string "lexora-buddy-active-window:test-query:{\"x\":1,\"y\":2,\"width\":0,\"height\":720}""#,
            TEST_TOKEN,
        ),
        None
    );
}

#[test]
fn kwin_active_window_script_filters_self_and_non_normal_windows_without_title_matching() {
    let script = native_pet_kwin_active_window_script(TEST_TOKEN);

    assert!(script.contains("selfWindowMarkers"));
    assert!(script.contains("lexora-buddy"));
    assert!(script.contains("resourceClass"));
    assert!(script.contains("desktopFileName"));
    assert!(script.contains("window.normalWindow === false"));
    assert!(script.contains("window.dock"));
    assert!(!script.contains("caption"));
}

#[test]
fn kwin_active_window_script_filters_windows_outside_current_desktop_or_activity() {
    let script = native_pet_kwin_active_window_script(TEST_TOKEN);

    assert!(script.contains("window.onCurrentDesktop === false"));
    assert!(script.contains("window.onCurrentActivity === false"));
}

#[test]
fn active_window_provider_selection_uses_kwin_only_for_kde_or_plasma_desktops() {
    assert_eq!(
        native_pet_active_window_provider_for_desktop(Some("KDE"), None),
        NativePetActiveWindowProvider::KWin
    );
    assert_eq!(
        native_pet_active_window_provider_for_desktop(Some("X-Cinnamon:KDE"), None),
        NativePetActiveWindowProvider::KWin
    );
    assert_eq!(
        native_pet_active_window_provider_for_desktop(None, Some("plasma")),
        NativePetActiveWindowProvider::KWin
    );
    assert_eq!(
        native_pet_active_window_provider_for_desktop(Some("GNOME"), Some("gnome")),
        NativePetActiveWindowProvider::Unsupported
    );
    assert_eq!(
        native_pet_active_window_provider_for_desktop(None, None),
        NativePetActiveWindowProvider::Unsupported
    );
}
