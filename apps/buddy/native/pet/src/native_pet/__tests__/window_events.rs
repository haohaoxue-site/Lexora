use super::*;

#[test]
fn opens_chat_for_primary_double_button_press() {
    assert!(native_pet_button_press_opens_chat(
        1,
        gdk::EventType::DoubleButtonPress,
    ));
}

#[test]
fn ignores_non_primary_double_button_press_for_open_chat() {
    assert!(!native_pet_button_press_opens_chat(
        2,
        gdk::EventType::DoubleButtonPress,
    ));
}

#[test]
fn ignores_primary_single_button_press_for_open_chat() {
    assert!(!native_pet_button_press_opens_chat(
        1,
        gdk::EventType::ButtonPress,
    ));
}
