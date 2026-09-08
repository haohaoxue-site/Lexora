pub(super) fn native_pet_event_time_ms(event_time: u32) -> u64 {
    u64::from(event_time)
}

pub(super) fn native_pet_button_press_opens_chat(button: u32, event_type: gdk::EventType) -> bool {
    button == 1 && event_type == gdk::EventType::DoubleButtonPress
}

#[cfg(test)]
#[path = "__tests__/window_events.rs"]
mod tests;
