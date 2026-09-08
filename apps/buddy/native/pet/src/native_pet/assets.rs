use gdk_pixbuf::prelude::*;
use std::collections::HashMap;

use crate::{
    action_registry::{
        ActionRegistry, ActionRuntimeCompletionFallbackProfile,
        ActionRuntimeLocalInteractionProfile, ActionRuntimeProfile, ActionRuntimeRenderProfile,
        ResolveContext,
    },
    error::{BuddyError, BuddyResult},
};

use super::animation::{
    NativePetAnimationCompletionFallbackProfile, NativePetAnimationKey,
    NativePetAnimationLocalInteractionProfile, NativePetAnimationRenderProfile,
    NativePetAnimationRuntimeProfile, NativePetAnimationSet, NativePetAnimationTarget,
    NativePetManifest,
};

const DEFAULT_PET_SPRITESHEET: &[u8] =
    include_bytes!("../../../../../../packages/assets/buddy/pets/default/spritesheet.webp");
const DEFAULT_PET_MANIFEST: &str =
    include_str!("../../../../../../packages/assets/buddy/pets/default/manifest.json");
const DEFAULT_APP_ICON: &[u8] = include_bytes!("../../../../resources/icons/app-icon.png");

pub(super) fn load_default_pet_spritesheet() -> BuddyResult<gdk_pixbuf::Pixbuf> {
    load_pixbuf_from_bytes(DEFAULT_PET_SPRITESHEET, "native pet spritesheet")
}

pub(super) fn load_default_app_icon() -> BuddyResult<gdk_pixbuf::Pixbuf> {
    load_pixbuf_from_bytes(DEFAULT_APP_ICON, "native pet app icon")
}

fn load_pixbuf_from_bytes(bytes: &[u8], name: &str) -> BuddyResult<gdk_pixbuf::Pixbuf> {
    let loader = gdk_pixbuf::PixbufLoader::new();
    loader
        .write(bytes)
        .map_err(|error| BuddyError::Runtime(error.to_string()))?;
    loader
        .close()
        .map_err(|error| BuddyError::Runtime(error.to_string()))?;
    loader
        .pixbuf()
        .ok_or_else(|| BuddyError::Runtime(format!("failed to load {name}")))
}

pub(super) fn load_default_pet_animation_set() -> BuddyResult<NativePetAnimationSet> {
    let manifest = load_default_pet_manifest()?;
    let runtime_profiles = load_default_pet_animation_runtime_profiles()?;

    NativePetAnimationSet::from_manifest_with_runtime_profiles(manifest, runtime_profiles)
}

fn load_default_pet_manifest() -> BuddyResult<NativePetManifest> {
    serde_json::from_str::<NativePetManifest>(DEFAULT_PET_MANIFEST)
        .map_err(|error| BuddyError::Runtime(error.to_string()))
}

fn load_default_pet_animation_runtime_profiles(
) -> BuddyResult<HashMap<String, NativePetAnimationRuntimeProfile>> {
    let registry = ActionRegistry::load_bundled()?;

    Ok(registry
        .runtime_profiles()
        .map(|(animation_ref, profile)| {
            (
                animation_ref.to_owned(),
                native_pet_runtime_profile_from_action_profile(profile),
            )
        })
        .collect())
}

fn native_pet_runtime_profile_from_action_profile(
    profile: ActionRuntimeProfile,
) -> NativePetAnimationRuntimeProfile {
    NativePetAnimationRuntimeProfile {
        render_profile: native_pet_render_profile_from_action_profile(profile.render_profile),
        local_interaction_profile: native_pet_local_interaction_profile_from_action_profile(
            profile.local_interaction_profile,
        ),
        completion_fallback_profile: native_pet_completion_fallback_profile_from_action_profile(
            profile.completion_fallback,
        ),
    }
}

fn native_pet_render_profile_from_action_profile(
    profile: ActionRuntimeRenderProfile,
) -> NativePetAnimationRenderProfile {
    match profile {
        ActionRuntimeRenderProfile::Idle => NativePetAnimationRenderProfile::Idle,
        ActionRuntimeRenderProfile::GrabStart => NativePetAnimationRenderProfile::GrabStart,
        ActionRuntimeRenderProfile::Drag => NativePetAnimationRenderProfile::Drag,
        ActionRuntimeRenderProfile::RunLeft => NativePetAnimationRenderProfile::RunLeft,
        ActionRuntimeRenderProfile::RunRight => NativePetAnimationRenderProfile::RunRight,
        ActionRuntimeRenderProfile::Hover => NativePetAnimationRenderProfile::Hover,
        ActionRuntimeRenderProfile::Wake => NativePetAnimationRenderProfile::Wake,
        ActionRuntimeRenderProfile::Sleep => NativePetAnimationRenderProfile::Sleep,
        ActionRuntimeRenderProfile::Approval => NativePetAnimationRenderProfile::Approval,
        ActionRuntimeRenderProfile::Thinking => NativePetAnimationRenderProfile::Thinking,
        ActionRuntimeRenderProfile::Working => NativePetAnimationRenderProfile::Working,
        ActionRuntimeRenderProfile::Celebrate => NativePetAnimationRenderProfile::Celebrate,
        ActionRuntimeRenderProfile::Dance => NativePetAnimationRenderProfile::Dance,
        ActionRuntimeRenderProfile::Cast => NativePetAnimationRenderProfile::Cast,
        ActionRuntimeRenderProfile::Sad => NativePetAnimationRenderProfile::Sad,
        ActionRuntimeRenderProfile::Reassure => NativePetAnimationRenderProfile::Reassure,
        ActionRuntimeRenderProfile::Explain => NativePetAnimationRenderProfile::Explain,
        ActionRuntimeRenderProfile::Curious => NativePetAnimationRenderProfile::Curious,
        ActionRuntimeRenderProfile::Tap => NativePetAnimationRenderProfile::Tap,
        ActionRuntimeRenderProfile::TripFall => NativePetAnimationRenderProfile::TripFall,
        ActionRuntimeRenderProfile::Fallen => NativePetAnimationRenderProfile::Fallen,
        ActionRuntimeRenderProfile::FallenGetUp => NativePetAnimationRenderProfile::FallenGetUp,
        ActionRuntimeRenderProfile::StumbleRecover => {
            NativePetAnimationRenderProfile::StumbleRecover
        }
    }
}

fn native_pet_completion_fallback_profile_from_action_profile(
    profile: ActionRuntimeCompletionFallbackProfile,
) -> NativePetAnimationCompletionFallbackProfile {
    match profile {
        ActionRuntimeCompletionFallbackProfile::Default => {
            NativePetAnimationCompletionFallbackProfile::Default
        }
        ActionRuntimeCompletionFallbackProfile::Idle => {
            NativePetAnimationCompletionFallbackProfile::Idle
        }
        ActionRuntimeCompletionFallbackProfile::Sleep => {
            NativePetAnimationCompletionFallbackProfile::Sleep
        }
        ActionRuntimeCompletionFallbackProfile::FallenIdleLeft => {
            NativePetAnimationCompletionFallbackProfile::FallenIdleLeft
        }
        ActionRuntimeCompletionFallbackProfile::FallenIdleRight => {
            NativePetAnimationCompletionFallbackProfile::FallenIdleRight
        }
    }
}

fn native_pet_local_interaction_profile_from_action_profile(
    profile: ActionRuntimeLocalInteractionProfile,
) -> NativePetAnimationLocalInteractionProfile {
    match profile {
        ActionRuntimeLocalInteractionProfile::None => {
            NativePetAnimationLocalInteractionProfile::None
        }
        ActionRuntimeLocalInteractionProfile::FallenIdleLeft => {
            NativePetAnimationLocalInteractionProfile::FallenIdleLeft
        }
        ActionRuntimeLocalInteractionProfile::FallenIdleRight => {
            NativePetAnimationLocalInteractionProfile::FallenIdleRight
        }
        ActionRuntimeLocalInteractionProfile::FiniteScriptedAction => {
            NativePetAnimationLocalInteractionProfile::FiniteScriptedAction
        }
    }
}

pub(in crate::native_pet) fn native_pet_action_target_from_registry(
    registry: &ActionRegistry,
    animations: &NativePetAnimationSet,
    action_id: &str,
) -> BuddyResult<NativePetAnimationTarget> {
    let resolution = registry.resolve_play_action(action_id, &ResolveContext::default())?;
    let animation = NativePetAnimationKey::parse(&resolution.animation_ref).ok_or_else(|| {
        BuddyError::Runtime(format!(
            "native pet action resolved invalid animationRef: {} -> {}",
            action_id, resolution.animation_ref
        ))
    })?;

    animations.animation_target_for_key(&animation)
}

#[cfg(test)]
#[path = "__tests__/asset_checks.rs"]
pub(super) mod checks;
