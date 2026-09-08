use std::path::Path;

use super::*;

#[test]
fn start_failure_still_unloads_the_temporary_kwin_plugin() {
    let mut methods = Vec::new();

    let error = run_kwin_script_with(
        Path::new("/tmp/lexora-buddy-kwin-test.js"),
        "lexora-buddy-test",
        "KWin script failed",
        |args, _| {
            methods.push(args[2].to_owned());
            if args[2] == KWIN_SCRIPTING_START_METHOD {
                return Err(BuddyError::Runtime("KWin start failed".to_owned()));
            }
            Ok(String::new())
        },
    )
    .expect_err("start failure should be returned");

    assert_eq!(error.to_string(), "runtime failed: KWin start failed");
    assert_eq!(
        methods,
        vec![
            KWIN_SCRIPTING_UNLOAD_SCRIPT_METHOD,
            KWIN_SCRIPTING_LOAD_SCRIPT_METHOD,
            KWIN_SCRIPTING_START_METHOD,
            KWIN_SCRIPTING_UNLOAD_SCRIPT_METHOD,
        ]
    );
}
