use super::{
    drain_native_pet_control_requests, native_pet_control_capabilities_response,
    on_native_pet_stdin_closed, NativePetControlMessage, NativePetControlPoll,
    NativePetControlRequest, NativePetControlRequestKind,
};
use crate::native_pet::{animation::NativePetAnimationKey, assets::load_default_pet_animation_set};

#[test]
fn native_pet_capabilities_report_step_target_support() {
    let animations = load_default_pet_animation_set().expect("native pet animation manifest loads");
    let response = native_pet_control_capabilities_response(&animations);

    assert_eq!(
        response.get("targets"),
        Some(&serde_json::json!([
            "center",
            "home",
            "edge",
            "edgeAnchor",
            "position",
            "x",
            "windowAnchor"
        ]))
    );
    assert_eq!(
        response.get("stepProtocol"),
        Some(&serde_json::json!({
            "version": 1,
            "executeStep": true,
            "interruptStep": true,
            "targetSupport": {
                "center": true,
                "home": true,
                "edge": true,
                "edgeAnchor": true,
                "position": true,
                "x": true,
                "windowAnchor": true
            }
        }))
    );
}

#[test]
fn native_pet_capabilities_report_uses_manifest_animation_order() {
    let animations = load_default_pet_animation_set().expect("native pet animation manifest loads");
    let response = native_pet_control_capabilities_response(&animations);

    assert_eq!(
        response.get("animations"),
        Some(&serde_json::json!([
            "idle",
            "run_left",
            "run_right",
            "drag",
            "grab_start",
            "celebrate",
            "sleep_enter",
            "sleep",
            "wake",
            "thinking",
            "approval",
            "sad",
            "reassure",
            "working",
            "cast",
            "explain",
            "tap",
            "hover",
            "curious",
            "trip_fall_left",
            "fallen_idle_left",
            "fallen_get_up_left",
            "trip_fall_right",
            "fallen_idle_right",
            "fallen_get_up_right",
            "stumble_recover_left",
            "stumble_recover_right"
        ]))
    );
}

#[test]
fn detects_native_pet_control_channel_disconnect_after_draining_messages() {
    let (sender, receiver) = std::sync::mpsc::channel();
    sender
        .send(NativePetControlRequest::command(
            NativePetControlMessage::SetAnimation(
                NativePetAnimationKey::parse("working").expect("valid manifest key"),
            ),
        ))
        .expect("send control message");
    drop(sender);

    let mut messages = Vec::new();
    let poll = drain_native_pet_control_requests(&receiver, |request| {
        if let NativePetControlRequestKind::Command(message) = request.kind() {
            messages.push(message);
        }
    });

    assert_eq!(
        messages,
        vec![NativePetControlMessage::SetAnimation(
            NativePetAnimationKey::parse("working").expect("valid manifest key")
        )]
    );
    assert_eq!(poll, NativePetControlPoll::Disconnected);
}

#[test]
fn runtime_managed_native_pet_stops_after_parent_stdin_closes() {
    let (sender, receiver) = std::sync::mpsc::channel();

    on_native_pet_stdin_closed(&sender, true);

    assert_eq!(
        drain_native_pet_control_requests(&receiver, |_| {}),
        NativePetControlPoll::Disconnected
    );
}

#[test]
fn standalone_native_pet_stays_connected_after_stdin_closes() {
    let (sender, receiver) = std::sync::mpsc::channel();

    on_native_pet_stdin_closed(&sender, false);

    assert_eq!(
        drain_native_pet_control_requests(&receiver, |_| {}),
        NativePetControlPoll::Connected
    );
}
