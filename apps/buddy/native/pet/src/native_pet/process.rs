use std::path::PathBuf;

use crate::error::BuddyResult;

mod control_channel;
mod control_protocol;
mod events;
mod socket_control;
pub(crate) mod step_protocol;

use super::{
    config::{load_native_pet_config, resolve_native_pet_config_path, NativePetConfig},
    position_state::resolve_native_pet_position_state_path,
    window::run_native_pet_sidecar,
};
pub(super) use control_channel::{
    create_native_pet_control_channel, drain_native_pet_control_requests,
    native_pet_control_capabilities_response, native_pet_control_ok_response, NativePetControlPoll,
    NativePetControlRequest,
};
#[cfg(test)]
pub(super) use control_protocol::parse_native_pet_control_message;
pub(super) use control_protocol::{
    compile_execute_step_control_message, NativePetAnchorReveal, NativePetControlMessage,
    NativePetControlRequestKind, NativePetWalkEdge, NativePetWalkTarget, NativePetWindowAnchorEdge,
    NativePetWindowAnchorReveal, NativePetWindowAnchorSelector, NativePetWindowAnchorSelectorKind,
};
pub(super) use events::{
    emit_native_pet_sidecar_event, NativePetPresetBehaviorEvent, NativePetSidecarEvent,
};

const NATIVE_PET_MODE_ARG: &str = "--native-pet";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum NativePetLayer {
    AlwaysOnTop,
    Normal,
}

impl NativePetLayer {
    pub(super) fn from_always_on_top(always_on_top: bool) -> Self {
        if always_on_top {
            Self::AlwaysOnTop
        } else {
            Self::Normal
        }
    }

    pub(super) fn keep_above(self) -> bool {
        matches!(self, Self::AlwaysOnTop)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct NativePetLaunchConfig {
    pub(super) config_path: PathBuf,
    pub(super) position_state_path: PathBuf,
    pub(super) preferences: NativePetConfig,
}

fn is_native_pet_sidecar_mode<I, S>(args: I) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter()
        .any(|arg| arg.as_ref() == NATIVE_PET_MODE_ARG)
}

pub fn run_native_pet_sidecar_from_env() -> Option<BuddyResult<()>> {
    let args = std::env::args().collect::<Vec<_>>();
    if !is_native_pet_sidecar_mode(&args) {
        return None;
    }

    Some((|| {
        let config_path = resolve_native_pet_config_path()?;
        let preferences = load_native_pet_config(&config_path)?;
        if !preferences.enabled {
            return Ok(());
        }
        run_native_pet_sidecar(NativePetLaunchConfig {
            config_path,
            position_state_path: resolve_native_pet_position_state_path()?,
            preferences,
        })
    })())
}
