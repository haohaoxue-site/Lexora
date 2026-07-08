use std::{
    io::{BufRead, BufReader, Write},
    thread,
    time::{Duration, Instant},
};

#[cfg(unix)]
use std::os::unix::net::UnixStream;

use crate::error::{BuddyError, BuddyResult};

use super::{
    control_protocol::{
        parse_native_pet_json_control_request_kind, NativePetControlMessage,
        NativePetControlRequestKind,
    },
    native_pet_control_socket_path, NativePetSidecarProcess,
};
use crate::native_pet::animation::NativePetAnimationName;

pub(super) fn execute_native_pet_host_action(
    process: &NativePetSidecarProcess,
    action: &serde_json::Value,
) -> BuddyResult<()> {
    let object = action.as_object().ok_or_else(|| {
        BuddyError::Validation("native pet host action must be an object".to_owned())
    })?;

    match read_native_pet_host_action_kind(object, "action")? {
        "animation" => {
            process.send_control_message(compile_native_pet_host_animation_action(object)?)
        }
        "move" => process.send_control_message(compile_native_pet_host_move_action(object)?),
        "sequence" => execute_native_pet_host_sequence_action(process, object),
        action => Err(BuddyError::Validation(format!(
            "unsupported native pet host action: {action}"
        ))),
    }
}

fn execute_native_pet_host_sequence_action(
    process: &NativePetSidecarProcess,
    object: &serde_json::Map<String, serde_json::Value>,
) -> BuddyResult<()> {
    let steps = read_native_pet_host_sequence_steps(object)?;

    for (index, step) in steps.iter().enumerate() {
        let step_object = step.as_object().ok_or_else(|| {
            BuddyError::Validation("native pet sequence step must be an object".to_owned())
        })?;
        match read_native_pet_host_action_kind(step_object, "type")
            .or_else(|_| read_native_pet_host_action_kind(step_object, "action"))?
        {
            "animation" => {
                process
                    .send_control_message(compile_native_pet_host_animation_action(step_object)?)?;
                if let Some(duration) = read_native_pet_host_action_duration(step_object) {
                    thread::sleep(duration);
                }
            }
            "move" => {
                process.send_control_message(compile_native_pet_host_move_action(step_object)?)?;
                if index + 1 < steps.len() {
                    wait_native_pet_motion_idle()?;
                }
            }
            step_type => {
                return Err(BuddyError::Validation(format!(
                    "unsupported native pet sequence step: {step_type}"
                )));
            }
        }
    }

    Ok(())
}

fn read_native_pet_host_sequence_steps(
    object: &serde_json::Map<String, serde_json::Value>,
) -> BuddyResult<&Vec<serde_json::Value>> {
    let steps = object
        .get("steps")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| {
            BuddyError::Validation("native pet sequence action requires steps".to_owned())
        })?;
    if steps.is_empty() || steps.len() > 8 {
        return Err(BuddyError::Validation(
            "native pet sequence action requires 1 to 8 steps".to_owned(),
        ));
    }

    Ok(steps)
}

#[cfg(test)]
fn compile_native_pet_host_action(
    action: &serde_json::Value,
) -> BuddyResult<Vec<NativePetControlMessage>> {
    let object = action.as_object().ok_or_else(|| {
        BuddyError::Validation("native pet host action must be an object".to_owned())
    })?;
    match read_native_pet_host_action_kind(object, "action")? {
        "animation" => Ok(vec![compile_native_pet_host_animation_action(object)?]),
        "move" => Ok(vec![compile_native_pet_host_move_action(object)?]),
        "sequence" => read_native_pet_host_sequence_steps(object)?
            .iter()
            .map(compile_native_pet_host_sequence_step)
            .collect(),
        action => Err(BuddyError::Validation(format!(
            "unsupported native pet host action: {action}"
        ))),
    }
}

#[cfg(test)]
fn compile_native_pet_host_sequence_step(
    step: &serde_json::Value,
) -> BuddyResult<NativePetControlMessage> {
    let object = step.as_object().ok_or_else(|| {
        BuddyError::Validation("native pet sequence step must be an object".to_owned())
    })?;
    match read_native_pet_host_action_kind(object, "type")
        .or_else(|_| read_native_pet_host_action_kind(object, "action"))?
    {
        "animation" => compile_native_pet_host_animation_action(object),
        "move" => compile_native_pet_host_move_action(object),
        step_type => Err(BuddyError::Validation(format!(
            "unsupported native pet sequence step: {step_type}"
        ))),
    }
}

fn compile_native_pet_host_animation_action(
    object: &serde_json::Map<String, serde_json::Value>,
) -> BuddyResult<NativePetControlMessage> {
    let animation = read_native_pet_host_action_kind(object, "animation")?;
    let animation = NativePetAnimationName::from_manifest_key(animation).ok_or_else(|| {
        BuddyError::Validation(format!("unknown native pet animation: {animation}"))
    })?;
    Ok(NativePetControlMessage::SetAnimation(animation))
}

fn compile_native_pet_host_move_action(
    object: &serde_json::Map<String, serde_json::Value>,
) -> BuddyResult<NativePetControlMessage> {
    let target = object
        .get("target")
        .ok_or_else(|| BuddyError::Validation("native pet move action requires target".to_owned()))?
        .clone();
    let mut request = serde_json::json!({
        "type": "move",
        "target": target,
    });
    if let Some(after) = object.get("after") {
        request["after"] = after.clone();
    }

    let line = serde_json::to_string(&request)?;
    match parse_native_pet_json_control_request_kind(&line) {
        Some(NativePetControlRequestKind::Command(message)) => Ok(message),
        _ => Err(BuddyError::Validation(
            "invalid native pet move action".to_owned(),
        )),
    }
}

fn read_native_pet_host_action_kind<'a>(
    object: &'a serde_json::Map<String, serde_json::Value>,
    key: &str,
) -> BuddyResult<&'a str> {
    object
        .get(key)
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| BuddyError::Validation(format!("native pet host action requires {key}")))
}

fn read_native_pet_host_action_duration(
    object: &serde_json::Map<String, serde_json::Value>,
) -> Option<Duration> {
    object
        .get("durationMs")
        .and_then(serde_json::Value::as_u64)
        .filter(|duration_ms| (100..=30_000).contains(duration_ms))
        .map(Duration::from_millis)
}

#[cfg(unix)]
fn wait_native_pet_motion_idle() -> BuddyResult<()> {
    let started_at = Instant::now();
    thread::sleep(Duration::from_millis(120));
    loop {
        let state = request_native_pet_control_socket_json(serde_json::json!({ "type": "state" }))?;
        let is_active = state
            .get("motion")
            .and_then(|motion| motion.get("active"))
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(false);
        if !is_active {
            return Ok(());
        }
        if started_at.elapsed() > Duration::from_secs(15) {
            return Err(BuddyError::Runtime(
                "native pet motion did not settle before host action timeout".to_owned(),
            ));
        }

        thread::sleep(Duration::from_millis(120));
    }
}

#[cfg(not(unix))]
fn wait_native_pet_motion_idle() -> BuddyResult<()> {
    Ok(())
}

#[cfg(unix)]
fn request_native_pet_control_socket_json(
    request: serde_json::Value,
) -> BuddyResult<serde_json::Value> {
    let socket_path = native_pet_control_socket_path()?;
    let mut stream = UnixStream::connect(&socket_path).map_err(|error| {
        BuddyError::Runtime(format!(
            "failed to connect native pet control socket {}: {error}",
            socket_path.display()
        ))
    })?;
    let serialized = serde_json::to_string(&request)?;
    stream.write_all(serialized.as_bytes())?;
    stream.write_all(b"\n")?;
    stream.flush()?;

    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    reader.read_line(&mut line)?;
    let response = serde_json::from_str::<serde_json::Value>(&line)?;
    if response.get("ok").and_then(serde_json::Value::as_bool) == Some(true) {
        return Ok(response);
    }

    Err(BuddyError::Runtime(format!(
        "native pet control socket rejected host action: {}",
        response
            .get("error")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("unknown_error")
    )))
}

#[cfg(test)]
mod tests {
    use super::compile_native_pet_host_action;
    use crate::native_pet::{
        animation::NativePetAnimationName,
        process::{NativePetControlMessage, NativePetWalkTarget},
    };

    #[test]
    fn compiles_native_pet_host_action_sequence_to_control_messages() {
        let messages = compile_native_pet_host_action(&serde_json::json!({
            "action": "sequence",
            "steps": [
                { "type": "move", "target": { "kind": "center" } },
                { "type": "animation", "animation": "celebrate", "durationMs": 3000 },
                { "type": "move", "target": { "kind": "home" }, "after": "sleep" }
            ]
        }))
        .expect("compile host action");

        assert_eq!(
            messages,
            vec![
                NativePetControlMessage::WalkToTarget {
                    target: NativePetWalkTarget::Center,
                    after: None,
                },
                NativePetControlMessage::SetAnimation(NativePetAnimationName::Celebrate),
                NativePetControlMessage::WalkToTarget {
                    target: NativePetWalkTarget::Home,
                    after: Some(NativePetAnimationName::Sleep),
                },
            ]
        );
    }
}
