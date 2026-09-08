use std::{io::BufRead, sync::mpsc, thread, time::Duration};

use crate::error::BuddyResult;
use crate::native_pet::animation::NativePetAnimationSet;

use super::{
    control_protocol::{
        parse_native_pet_stdin_control_request_kind, NativePetControlMessage,
        NativePetControlRequestKind,
    },
    events::{emit_native_pet_sidecar_event, NativePetSidecarEvent},
    socket_control::spawn_native_pet_socket_control_reader,
    step_protocol::{self, SidecarStateSnapshotResponse, SIDECAR_PROTOCOL_VERSION},
};

const NATIVE_PET_EXIT_ON_STDIN_CLOSE_ENV: &str = "LEXORA_BUDDY_PET_EXIT_ON_STDIN_CLOSE";

pub(in crate::native_pet) struct NativePetControlRequest {
    kind: NativePetControlRequestKind,
    response_sender: Option<mpsc::Sender<serde_json::Value>>,
}

impl NativePetControlRequest {
    fn command(message: NativePetControlMessage) -> Self {
        Self {
            kind: NativePetControlRequestKind::Command(message),
            response_sender: None,
        }
    }

    fn step(kind: NativePetControlRequestKind) -> Self {
        Self {
            kind,
            response_sender: None,
        }
    }

    fn parent_disconnected() -> Self {
        Self {
            kind: NativePetControlRequestKind::ParentDisconnected,
            response_sender: None,
        }
    }

    pub(super) fn socket(
        kind: NativePetControlRequestKind,
    ) -> (Self, mpsc::Receiver<serde_json::Value>) {
        let (sender, receiver) = mpsc::channel();
        (
            Self {
                kind,
                response_sender: Some(sender),
            },
            receiver,
        )
    }

    pub(in crate::native_pet) fn kind(&self) -> NativePetControlRequestKind {
        self.kind.clone()
    }

    pub(in crate::native_pet) fn respond(self, response: serde_json::Value) {
        if let Some(sender) = self.response_sender {
            let _ = sender.send(response);
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::native_pet) enum NativePetControlPoll {
    Connected,
    Disconnected,
}

pub(in crate::native_pet) fn create_native_pet_control_channel(
) -> BuddyResult<mpsc::Receiver<NativePetControlRequest>> {
    let (sender, receiver) = mpsc::channel();
    spawn_native_pet_socket_control_reader(sender.clone())?;
    spawn_native_pet_stdin_control_reader(
        sender.clone(),
        std::env::var(NATIVE_PET_EXIT_ON_STDIN_CLOSE_ENV).is_ok_and(|value| value == "1"),
    );

    Ok(receiver)
}

fn spawn_native_pet_stdin_control_reader(
    sender: mpsc::Sender<NativePetControlRequest>,
    exit_on_stdin_close: bool,
) {
    thread::spawn(move || {
        let stdin = std::io::stdin();
        for line in stdin.lock().lines().map_while(Result::ok) {
            let kind = match parse_native_pet_stdin_control_request_kind(&line) {
                Ok(Some(kind)) => kind,
                Ok(None) => continue,
                Err(response) => {
                    let _ = emit_native_pet_sidecar_event(NativePetSidecarEvent::StepResponse(
                        *response,
                    ));
                    continue;
                }
            };
            let request = match kind {
                NativePetControlRequestKind::Command(message) => {
                    NativePetControlRequest::command(message)
                }
                NativePetControlRequestKind::QueryStateSnapshot(query) => {
                    let (request, receiver) = NativePetControlRequest::socket(
                        NativePetControlRequestKind::QueryStateSnapshot(query.clone()),
                    );
                    if sender.send(request).is_err() {
                        break;
                    }
                    if let Ok(response) = receiver.recv_timeout(Duration::from_millis(1_000)) {
                        if let Some(snapshot) = native_pet_state_snapshot_from_control_response(
                            query.message_id.as_str(),
                            query.request_id.as_str(),
                            &response,
                        ) {
                            let _ = emit_native_pet_sidecar_event(
                                NativePetSidecarEvent::StateSnapshot(snapshot),
                            );
                        }
                    }
                    continue;
                }
                NativePetControlRequestKind::ExecuteStep(_)
                | NativePetControlRequestKind::InterruptStep(_)
                | NativePetControlRequestKind::ReloadConfig => NativePetControlRequest::step(kind),
                NativePetControlRequestKind::QueryState
                | NativePetControlRequestKind::QueryCapabilities
                | NativePetControlRequestKind::ParentDisconnected => continue,
            };
            if sender.send(request).is_err() {
                break;
            }
        }
        on_native_pet_stdin_closed(&sender, exit_on_stdin_close);
    });
}

fn on_native_pet_stdin_closed(
    sender: &mpsc::Sender<NativePetControlRequest>,
    exit_on_stdin_close: bool,
) {
    if exit_on_stdin_close {
        let _ = sender.send(NativePetControlRequest::parent_disconnected());
    }
}

fn native_pet_state_snapshot_from_control_response(
    correlation_id: &str,
    request_id: &str,
    response: &serde_json::Value,
) -> Option<SidecarStateSnapshotResponse> {
    let position = response.get("position")?;
    let x = position
        .get("x")?
        .as_i64()
        .and_then(|x| i32::try_from(x).ok())?;
    let y = position
        .get("y")?
        .as_i64()
        .and_then(|y| i32::try_from(y).ok())?;

    Some(step_protocol::state_snapshot_response_for_correlation(
        correlation_id,
        request_id,
        x,
        y,
    ))
}

pub(in crate::native_pet) fn drain_native_pet_control_requests<F>(
    receiver: &mpsc::Receiver<NativePetControlRequest>,
    mut on_request: F,
) -> NativePetControlPoll
where
    F: FnMut(NativePetControlRequest),
{
    loop {
        match receiver.try_recv() {
            Ok(request) => {
                if matches!(
                    request.kind(),
                    NativePetControlRequestKind::ParentDisconnected
                ) {
                    return NativePetControlPoll::Disconnected;
                }
                on_request(request);
            }
            Err(mpsc::TryRecvError::Empty) => return NativePetControlPoll::Connected,
            Err(mpsc::TryRecvError::Disconnected) => return NativePetControlPoll::Disconnected,
        }
    }
}

pub(in crate::native_pet) fn native_pet_control_ok_response() -> serde_json::Value {
    serde_json::json!({ "ok": true })
}

pub(in crate::native_pet) fn native_pet_control_capabilities_response(
    animations: &NativePetAnimationSet,
) -> serde_json::Value {
    serde_json::json!({
        "ok": true,
        "protocolVersion": 1,
        "commands": ["state", "capabilities", "animation", "move"],
        "targets": ["center", "home", "edge", "edgeAnchor", "position", "x", "windowAnchor"],
        "stepProtocol": {
            "version": SIDECAR_PROTOCOL_VERSION,
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
        },
        "edges": ["left", "right", "top", "bottom"],
        "animations": animations
            .animation_names()
            .collect::<Vec<_>>(),
        "sequence": {
            "script": "lexora-buddy-pet.mjs",
            "waitsOn": "state.motion.active"
        }
    })
}

#[cfg(test)]
#[path = "__tests__/control_channel.rs"]
mod tests;
