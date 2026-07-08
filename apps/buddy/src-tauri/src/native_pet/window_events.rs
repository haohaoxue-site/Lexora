pub(super) fn native_pet_event_time_ms(event_time: u32) -> u64 {
    u64::from(event_time)
}

pub(super) fn native_pet_button_press_opens_chat(button: u32, event_type: gdk::EventType) -> bool {
    button == 1 && event_type == gdk::EventType::DoubleButtonPress
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_gdk_event_time_to_runtime_time() {
        assert_eq!(native_pet_event_time_ms(1_250), 1_250);
    }

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
}
