use std::io::Write;

use super::step_protocol::{
    format_sidecar_step_response, SidecarStateSnapshotResponse, SidecarStepResponse,
};
use crate::error::{BuddyError, BuddyResult};

const NATIVE_PET_SIDECAR_READY_EVENT: &str = "event:ready";
const NATIVE_PET_PRESET_BEHAVIOR_EVENT_PREFIX: &str = "event:preset_behavior:";

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(in crate::native_pet) struct NativePetPresetBehaviorEvent {
    pub preset_behavior_id: String,
    pub interaction_id: Option<String>,
    pub outcome: String,
    pub animation: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(in crate::native_pet) enum NativePetSidecarEvent {
    Ready,
    OpenChat,
    PresetBehavior(NativePetPresetBehaviorEvent),
    StepResponse(SidecarStepResponse),
    StateSnapshot(SidecarStateSnapshotResponse),
}

pub(in crate::native_pet) fn emit_native_pet_sidecar_event(
    event: NativePetSidecarEvent,
) -> BuddyResult<()> {
    let line = format_native_pet_sidecar_event(&event)?;
    println!("{line}");
    std::io::stdout()
        .flush()
        .map_err(|error| BuddyError::Runtime(error.to_string()))
}

fn format_native_pet_sidecar_event(event: &NativePetSidecarEvent) -> BuddyResult<String> {
    Ok(match event {
        NativePetSidecarEvent::Ready => NATIVE_PET_SIDECAR_READY_EVENT.to_owned(),
        NativePetSidecarEvent::OpenChat => "event:open_chat".to_owned(),
        NativePetSidecarEvent::PresetBehavior(event) => {
            format!(
                "{NATIVE_PET_PRESET_BEHAVIOR_EVENT_PREFIX}{}",
                serde_json::to_string(event)?
            )
        }
        NativePetSidecarEvent::StepResponse(response) => format_sidecar_step_response(response)?,
        NativePetSidecarEvent::StateSnapshot(response) => serde_json::to_string(response)?,
    })
}

#[cfg(test)]
#[path = "__tests__/events.rs"]
mod tests;
