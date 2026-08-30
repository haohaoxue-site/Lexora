use gdk_pixbuf::prelude::*;
use serde::Serialize;
use std::collections::HashMap;

use crate::{
    action_registry::{
        ActionRegistry, ActionRuntimeCompletionFallbackProfile,
        ActionRuntimeLocalInteractionProfile, ActionRuntimeProfile, ActionRuntimeRenderProfile,
        ResolveContext,
    },
    error::{BuddyError, BuddyResult},
};

use super::{
    animation::{
        NativePetAnimationCompletionFallbackProfile, NativePetAnimationKey,
        NativePetAnimationLocalInteractionProfile, NativePetAnimationRenderProfile,
        NativePetAnimationRuntimeProfile, NativePetAnimationSet, NativePetAnimationTarget,
        NativePetManifest, NativePetSpritesheetGeometry,
    },
    process::{parse_native_pet_control_message, NativePetControlMessage},
};

const DEFAULT_PET_SPRITESHEET: &[u8] =
    include_bytes!("../../../../../packages/assets/buddy/pets/default/spritesheet.webp");
const DEFAULT_PET_MANIFEST: &str =
    include_str!("../../../../../packages/assets/buddy/pets/default/manifest.json");
const DEFAULT_APP_ICON: &[u8] = include_bytes!("../../../resources/icons/app-icon.png");

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct NativePetSmokeCheckReport {
    animation_count: usize,
    frame_height: i32,
    frame_width: i32,
    ok: bool,
    sheet_columns: usize,
    sheet_frame_count: usize,
    sheet_rows: usize,
    validated_animations: Vec<String>,
}

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

pub(super) fn create_native_pet_smoke_check_report() -> BuddyResult<NativePetSmokeCheckReport> {
    let manifest = load_default_pet_manifest()?;
    let geometry = NativePetSpritesheetGeometry::from_manifest(&manifest)?;
    let sheet_columns = geometry.sheet_columns();
    let sheet_rows = geometry.sheet_rows();
    let (sheet_width, sheet_height) = default_pet_spritesheet_size_from_webp()?;
    let animations = NativePetAnimationSet::from_manifest(manifest)?;
    let validated_animations = validate_native_pet_control_messages(&animations)?;

    if sheet_width != geometry.sheet_pixel_width()? {
        return Err(BuddyError::Runtime(
            "native pet spritesheet width does not match manifest".to_owned(),
        ));
    }
    if sheet_height != geometry.sheet_pixel_height()? {
        return Err(BuddyError::Runtime(
            "native pet spritesheet height does not match manifest".to_owned(),
        ));
    }

    Ok(NativePetSmokeCheckReport {
        animation_count: animations.len(),
        frame_height: geometry.frame_height(),
        frame_width: geometry.frame_width(),
        ok: true,
        sheet_columns,
        sheet_frame_count: sheet_columns * sheet_rows,
        sheet_rows,
        validated_animations,
    })
}

fn validate_native_pet_control_messages(
    animations: &NativePetAnimationSet,
) -> BuddyResult<Vec<String>> {
    let mut validated_animations = Vec::with_capacity(animations.len());

    for animation in animations.animation_names() {
        let line = format!("animation:{animation}");
        match parse_native_pet_control_message(&line) {
            Some(NativePetControlMessage::SetAnimation(parsed))
                if parsed.manifest_key() == animation =>
            {
                validated_animations.push(animation.to_owned());
            }
            _ => {
                return Err(BuddyError::Runtime(format!(
                    "native pet animation control message failed: {animation}",
                )));
            }
        }
    }

    Ok(validated_animations)
}

fn default_pet_spritesheet_size_from_webp() -> BuddyResult<(i32, i32)> {
    parse_webp_size(DEFAULT_PET_SPRITESHEET)
}

fn parse_webp_size(bytes: &[u8]) -> BuddyResult<(i32, i32)> {
    if bytes.len() < 20 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WEBP" {
        return Err(BuddyError::Runtime(
            "native pet spritesheet is not a WebP RIFF container".to_owned(),
        ));
    }

    let mut offset = 12;
    while offset + 8 <= bytes.len() {
        let chunk = &bytes[offset..offset + 4];
        let chunk_size = u32::from_le_bytes([
            bytes[offset + 4],
            bytes[offset + 5],
            bytes[offset + 6],
            bytes[offset + 7],
        ]) as usize;
        let data_start = offset + 8;
        let data_end = data_start.saturating_add(chunk_size);
        if data_end > bytes.len() {
            return Err(BuddyError::Runtime(
                "native pet spritesheet has truncated WebP chunk".to_owned(),
            ));
        }

        match chunk {
            b"VP8L" => return parse_lossless_webp_size(&bytes[data_start..data_end]),
            b"VP8X" => return parse_extended_webp_size(&bytes[data_start..data_end]),
            b"VP8 " => return parse_lossy_webp_size(&bytes[data_start..data_end]),
            _ => {}
        }

        offset = data_end + (chunk_size % 2);
    }

    Err(BuddyError::Runtime(
        "native pet spritesheet has no supported WebP image chunk".to_owned(),
    ))
}

fn parse_lossless_webp_size(chunk: &[u8]) -> BuddyResult<(i32, i32)> {
    if chunk.len() < 5 || chunk[0] != 0x2f {
        return Err(BuddyError::Runtime(
            "native pet spritesheet has invalid VP8L header".to_owned(),
        ));
    }

    let bits = u32::from_le_bytes([chunk[1], chunk[2], chunk[3], chunk[4]]);
    Ok((
        ((bits & 0x3fff) + 1) as i32,
        (((bits >> 14) & 0x3fff) + 1) as i32,
    ))
}

fn parse_extended_webp_size(chunk: &[u8]) -> BuddyResult<(i32, i32)> {
    if chunk.len() < 10 {
        return Err(BuddyError::Runtime(
            "native pet spritesheet has invalid VP8X header".to_owned(),
        ));
    }

    Ok((
        read_le24(&chunk[4..7]) as i32 + 1,
        read_le24(&chunk[7..10]) as i32 + 1,
    ))
}

fn parse_lossy_webp_size(chunk: &[u8]) -> BuddyResult<(i32, i32)> {
    if chunk.len() < 10 || chunk[3..6] != [0x9d, 0x01, 0x2a] {
        return Err(BuddyError::Runtime(
            "native pet spritesheet has invalid VP8 header".to_owned(),
        ));
    }

    Ok((
        (u16::from_le_bytes([chunk[6], chunk[7]]) & 0x3fff) as i32,
        (u16::from_le_bytes([chunk[8], chunk[9]]) & 0x3fff) as i32,
    ))
}

fn read_le24(bytes: &[u8]) -> u32 {
    bytes[0] as u32 | ((bytes[1] as u32) << 8) | ((bytes[2] as u32) << 16)
}
