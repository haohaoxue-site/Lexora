use super::*;

#[test]
fn missing_pet_section_uses_enabled_core_defaults() {
    let config = parse_native_pet_config("[desktop]\ntheme = \"dark\"\n")
        .expect("parse config without pet section");

    assert_eq!(config, NativePetConfig::default());
}

#[test]
fn parses_core_pet_preferences_from_shared_config() {
    let config = parse_native_pet_config(
        "[pet]\nenabled = false\nalways_on_top = false\nremember_position = false\n",
    )
    .expect("parse pet config");

    assert_eq!(
        config,
        NativePetConfig {
            always_on_top: false,
            enabled: false,
            remember_position: false,
        }
    );
}
