use std::{
    env,
    process::Command,
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use crate::{error::BuddyResult, kwin_scripting::run_temporary_kwin_script};

use super::{
    coordinates::NativePetLogicalRect,
    process::{NativePetWindowAnchorSelector, NativePetWindowAnchorSelectorKind},
};

const NATIVE_PET_KWIN_ACTIVE_WINDOW_OUTPUT_PREFIX: &str = "lexora-buddy-active-window:";
const NATIVE_PET_KWIN_ACTIVE_WINDOW_QUERY_TIMEOUT: Duration = Duration::from_millis(650);
const NATIVE_PET_KWIN_ACTIVE_WINDOW_POLL_INTERVAL: Duration = Duration::from_millis(50);
const NATIVE_PET_KWIN_SELF_WINDOW_MARKERS_JSON: &str = r#"["lexora-buddy","lexora buddy"]"#;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum NativePetActiveWindowProvider {
    KWin,
    Unsupported,
}

pub(super) fn native_pet_active_window_rect(
    selector: NativePetWindowAnchorSelector,
) -> BuddyResult<Option<NativePetLogicalRect>> {
    let current_desktop = env::var("XDG_CURRENT_DESKTOP").ok();
    let desktop_session = env::var("DESKTOP_SESSION").ok();
    let provider = native_pet_active_window_provider_for_desktop(
        current_desktop.as_deref(),
        desktop_session.as_deref(),
    );
    native_pet_active_window_rect_with_provider(selector, provider)
}

fn native_pet_active_window_rect_with_provider(
    selector: NativePetWindowAnchorSelector,
    provider: NativePetActiveWindowProvider,
) -> BuddyResult<Option<NativePetLogicalRect>> {
    match selector.kind() {
        NativePetWindowAnchorSelectorKind::ActiveWindow => match provider {
            NativePetActiveWindowProvider::KWin => Ok(native_pet_kwin_active_window_rect()),
            NativePetActiveWindowProvider::Unsupported => Ok(None),
        },
    }
}

fn native_pet_active_window_provider_for_desktop(
    current_desktop: Option<&str>,
    desktop_session: Option<&str>,
) -> NativePetActiveWindowProvider {
    if current_desktop.is_some_and(native_pet_desktop_value_matches_kde_or_plasma)
        || desktop_session.is_some_and(native_pet_desktop_value_matches_kde_or_plasma)
    {
        NativePetActiveWindowProvider::KWin
    } else {
        NativePetActiveWindowProvider::Unsupported
    }
}

fn native_pet_desktop_value_matches_kde_or_plasma(value: &str) -> bool {
    value
        .split([':', ';', ','])
        .map(|part| part.trim().to_ascii_lowercase())
        .any(|part| part == "kde" || part.contains("plasma"))
}

fn native_pet_kwin_active_window_rect() -> Option<NativePetLogicalRect> {
    let plugin_name = native_pet_kwin_active_window_plugin_name();
    let output_token = format!("{NATIVE_PET_KWIN_ACTIVE_WINDOW_OUTPUT_PREFIX}{plugin_name}:");
    let script = native_pet_kwin_active_window_script(&output_token);

    if run_temporary_kwin_script(
        &plugin_name,
        &script,
        "qdbus6 failed to query KWin active window",
    )
    .is_ok()
    {
        native_pet_poll_kwin_active_window_journal(&output_token).flatten()
    } else {
        None
    }
}

fn native_pet_poll_kwin_active_window_journal(
    output_token: &str,
) -> Option<Option<NativePetLogicalRect>> {
    let deadline = Instant::now() + NATIVE_PET_KWIN_ACTIVE_WINDOW_QUERY_TIMEOUT;
    loop {
        if let Some(rect) = native_pet_read_kwin_active_window_journal(output_token) {
            return Some(rect);
        }
        if Instant::now() >= deadline {
            return None;
        }
        thread::sleep(NATIVE_PET_KWIN_ACTIVE_WINDOW_POLL_INTERVAL);
    }
}

fn native_pet_read_kwin_active_window_journal(
    output_token: &str,
) -> Option<Option<NativePetLogicalRect>> {
    let output = Command::new("journalctl")
        .args([
            "--user",
            "-u",
            "plasma-kwin_wayland.service",
            "-n",
            "80",
            "--no-pager",
        ])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    native_pet_parse_kwin_active_window_rect_output(&stdout, output_token)
}

fn native_pet_parse_kwin_active_window_rect_output(
    output: &str,
    output_token: &str,
) -> Option<Option<NativePetLogicalRect>> {
    output
        .lines()
        .rev()
        .find_map(|line| native_pet_parse_kwin_active_window_rect_output_line(line, output_token))
}

fn native_pet_parse_kwin_active_window_rect_output_line(
    line: &str,
    output_token: &str,
) -> Option<Option<NativePetLogicalRect>> {
    let token_index = line.find(output_token)?;
    let payload = &line[token_index + output_token.len()..];
    if native_pet_kwin_active_window_payload_is_null(payload) {
        return Some(None);
    }

    let x = native_pet_extract_kwin_output_number(payload, "x")?;
    let y = native_pet_extract_kwin_output_number(payload, "y")?;
    let width = native_pet_extract_kwin_output_number(payload, "width")?;
    let height = native_pet_extract_kwin_output_number(payload, "height")?;
    if width <= 0 || height <= 0 {
        return None;
    }

    Some(Some(NativePetLogicalRect::new(x, y, width, height)))
}

fn native_pet_extract_kwin_output_number(payload: &str, key: &str) -> Option<i32> {
    [
        format!("\"{key}\":"),
        format!(r#"\"{key}\":"#),
        format!("{key}:"),
    ]
    .iter()
    .find_map(|marker| {
        let marker_index = payload.find(marker)?;
        native_pet_parse_output_number(&payload[marker_index + marker.len()..])
    })
}

fn native_pet_parse_output_number(value: &str) -> Option<i32> {
    let start = value.find(|character: char| character == '-' || character.is_ascii_digit())?;
    let raw = value[start..]
        .chars()
        .take_while(|character| {
            character.is_ascii_digit() || *character == '-' || *character == '.'
        })
        .collect::<String>();
    let number = raw.parse::<f64>().ok()?;
    if !number.is_finite() {
        return None;
    }

    let rounded = number.round();
    if rounded < f64::from(i32::MIN) || rounded > f64::from(i32::MAX) {
        return None;
    }
    Some(rounded as i32)
}

fn native_pet_kwin_active_window_payload_is_null(payload: &str) -> bool {
    payload
        .trim_start_matches(|character: char| {
            character.is_whitespace()
                || character == '"'
                || character == '\''
                || character == '\\'
                || character == '('
                || character == ','
        })
        .starts_with("null")
}

fn native_pet_kwin_active_window_script(output_token: &str) -> String {
    let self_window_markers = NATIVE_PET_KWIN_SELF_WINDOW_MARKERS_JSON;
    format!(
        r#"
(function () {{
    const token = "{output_token}";
    const selfWindowMarkers = {self_window_markers};

    function normalized(value) {{
        if (value === undefined || value === null) {{
            return "";
        }}
        return String(value).toLowerCase();
    }}

    function isSelfWindow(window) {{
        const identity = [
            window.resourceClass,
            window.resourceName,
            window.desktopFileName,
            window.windowRole
        ].map(normalized).join(" ");
        return selfWindowMarkers.some((marker) => identity.includes(marker));
    }}

    function isUsableTargetWindow(window) {{
        if (!window) {{
            return false;
        }}
        if (window.deleted || window.minimized) {{
            return false;
        }}
        if (window.normalWindow === false) {{
            return false;
        }}
        if (window.onCurrentDesktop === false || window.onCurrentActivity === false) {{
            return false;
        }}
        if (window.dock || window.desktopWindow || window.splash || window.toolbar || window.menu) {{
            return false;
        }}
        return !isSelfWindow(window);
    }}

    const activeWindow = workspace.activeWindow;
    if (!isUsableTargetWindow(activeWindow)) {{
        print(token + "null");
        return;
    }}

    const geometry = activeWindow.frameGeometry;
    if (!geometry || geometry.width <= 0 || geometry.height <= 0) {{
        print(token + "null");
        return;
    }}

    print(token + JSON.stringify({{
        x: Math.round(geometry.x),
        y: Math.round(geometry.y),
        width: Math.round(geometry.width),
        height: Math.round(geometry.height)
    }}));
}})();
"#
    )
}

fn native_pet_kwin_active_window_plugin_name() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    format!("lexora-buddy-active-window-{}-{millis}", std::process::id())
}

#[cfg(test)]
mod tests {
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
}
