use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

use crate::{
    error::{BuddyError, BuddyResult},
    native_pet::{
        native_pet_manifest_animation_key_is_valid, step_protocol::SidecarInterruptPolicy,
    },
};

use super::affective_types::{AffectiveContext, AffectiveEnergy, AffectiveMood, ResolveContext};

const DEFAULT_ACTION_REGISTRY: &str = include_str!("action_registry.json");
const DEFAULT_PET_MANIFEST: &str =
    include_str!("../../../../../packages/assets/buddy/pets/default/manifest.json");
pub(crate) const REGISTRY_FALLBACK_RESOLUTION_REASON_CODE: &str = "fallback.registrySelected";

#[derive(Debug)]
pub(crate) struct ActionRegistry {
    actions: HashMap<String, ActionRegistryEntry>,
    animation_profiles: HashMap<String, ActionRuntimeProfile>,
    manifest_animations: HashMap<String, RuntimeManifestAnimation>,
    version: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ActionRegistryDocument {
    registry_version: String,
    actions: Vec<ActionRegistryEntry>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ActionRegistryEntry {
    action_id: String,
    animation_ref: String,
    aliases: Vec<String>,
    category: String,
    playback_kind: ActionPlaybackKind,
    placement: String,
    movement: String,
    start_pose: String,
    end_pose: String,
    idle_compatible: bool,
    facing: String,
    locomotion_profile: Option<serde_json::Value>,
    interrupt_policy: SidecarInterruptPolicy,
    fallback_chain: Vec<String>,
    mood_energy_affinity: MoodEnergyAffinity,
    ai_visibility: String,
    preset_visibility: String,
    required_capabilities: Vec<String>,
    deterministic_sort_weight: i64,
    runtime_profile: ActionRuntimeProfile,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
enum ActionPlaybackKind {
    IdleLoop,
    LoopForDuration,
    Once,
}

impl ActionPlaybackKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::IdleLoop => "idleLoop",
            Self::LoopForDuration => "loopForDuration",
            Self::Once => "once",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ActionRuntimeProfile {
    pub(crate) render_profile: ActionRuntimeRenderProfile,
    pub(crate) local_interaction_profile: ActionRuntimeLocalInteractionProfile,
    #[serde(default)]
    pub(crate) completion_fallback: ActionRuntimeCompletionFallbackProfile,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ActionRuntimeRenderProfile {
    Idle,
    GrabStart,
    Drag,
    RunLeft,
    RunRight,
    Hover,
    Wake,
    Sleep,
    Approval,
    Thinking,
    Working,
    Celebrate,
    Dance,
    Cast,
    Sad,
    Reassure,
    Explain,
    Curious,
    Tap,
    TripFall,
    Fallen,
    FallenGetUp,
    StumbleRecover,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ActionRuntimeLocalInteractionProfile {
    None,
    FallenIdleLeft,
    FallenIdleRight,
    FiniteScriptedAction,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ActionRuntimeCompletionFallbackProfile {
    #[default]
    Default,
    Idle,
    Sleep,
    FallenIdleLeft,
    FallenIdleRight,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MoodEnergyAffinity {
    mood: Vec<AffectiveMood>,
    energy: Vec<AffectiveEnergy>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeManifest {
    sheet: RuntimeManifestSheet,
    animations: Vec<RuntimeManifestAnimation>,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeManifestSheet {
    columns: usize,
    rows: usize,
}

impl RuntimeManifestSheet {
    fn frame_count(self) -> BuddyResult<usize> {
        if self.columns == 0 || self.rows == 0 {
            return Err(BuddyError::Runtime(
                "runtime manifest sheet requires positive columns and rows".to_owned(),
            ));
        }

        self.columns.checked_mul(self.rows).ok_or_else(|| {
            BuddyError::Runtime("runtime manifest sheet frame count overflowed".to_owned())
        })
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeManifestAnimation {
    fps: Option<u32>,
    frames: Vec<RuntimeManifestAnimationFrame>,
    #[serde(rename = "loop")]
    loop_animation: bool,
    name: String,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(untagged)]
enum RuntimeManifestAnimationFrame {
    Index(usize),
    Timed(RuntimeManifestTimedAnimationFrame),
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RuntimeManifestTimedAnimationFrame {
    index: usize,
    duration_ms: Option<u64>,
}

impl RuntimeManifestAnimationFrame {
    fn index(self) -> usize {
        match self {
            Self::Index(index) => index,
            Self::Timed(frame) => frame.index,
        }
    }

    fn duration_ms(self, fps: Option<u32>) -> BuddyResult<u64> {
        match self {
            Self::Timed(RuntimeManifestTimedAnimationFrame {
                duration_ms: Some(duration_ms),
                ..
            }) if duration_ms > 0 => Ok(duration_ms),
            Self::Timed(RuntimeManifestTimedAnimationFrame { duration_ms, .. })
                if duration_ms.is_some() =>
            {
                Err(BuddyError::Runtime(
                    "runtime manifest frame duration must be positive".to_owned(),
                ))
            }
            _ => {
                let fps = fps.ok_or_else(|| {
                    BuddyError::Runtime(
                        "runtime manifest frame must use durationMs when fps is absent".to_owned(),
                    )
                })?;
                if fps == 0 {
                    return Err(BuddyError::Runtime(
                        "runtime manifest animation fps must be positive".to_owned(),
                    ));
                }
                Ok((1000 / u64::from(fps)).max(1))
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StepResolution {
    pub(crate) action_id: String,
    pub(crate) animation_ref: String,
    pub(crate) playback_kind: String,
    pub(crate) duration_ms: u64,
    #[serde(rename = "loop")]
    pub(crate) loop_animation: bool,
    pub(crate) interrupt_policy: SidecarInterruptPolicy,
    pub(crate) resolved_from_registry_version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) fallback: Option<StepResolutionFallback>,
    #[serde(skip)]
    pub(crate) clip_duration_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StepResolutionFallback {
    pub(crate) requested_action_id: String,
    pub(crate) fallback_action_id: String,
    pub(crate) reason_code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) unsupported_capability: Option<String>,
}

impl StepResolution {
    fn with_registry_fallback(
        mut self,
        requested_action_id: impl Into<String>,
        fallback_action_id: impl Into<String>,
        unsupported_capability: impl Into<String>,
    ) -> Self {
        self.fallback = Some(StepResolutionFallback {
            requested_action_id: requested_action_id.into(),
            fallback_action_id: fallback_action_id.into(),
            reason_code: REGISTRY_FALLBACK_RESOLUTION_REASON_CODE.to_owned(),
            unsupported_capability: Some(unsupported_capability.into()),
        });
        self
    }
}

impl ActionRegistry {
    pub(crate) fn load_bundled() -> BuddyResult<Self> {
        Self::from_documents(DEFAULT_ACTION_REGISTRY, DEFAULT_PET_MANIFEST)
    }

    fn from_documents(registry_json: &str, manifest_json: &str) -> BuddyResult<Self> {
        let document = serde_json::from_str::<ActionRegistryDocument>(registry_json)?;
        let manifest = serde_json::from_str::<RuntimeManifest>(manifest_json)?;
        let sheet_frame_count = manifest.sheet.frame_count()?;
        validate_manifest_animation_frames(&manifest.animations, sheet_frame_count)?;
        let manifest_animations = manifest
            .animations
            .into_iter()
            .map(|animation| (animation.name.clone(), animation))
            .collect::<HashMap<_, _>>();

        let mut seen_action_ids = HashSet::new();
        let mut actions = HashMap::new();
        for action in document.actions {
            validate_action_entry(&action, &manifest_animations)?;
            if !seen_action_ids.insert(action.action_id.clone()) {
                return Err(BuddyError::Runtime(format!(
                    "action registry has duplicate actionId: {}",
                    action.action_id
                )));
            }
            actions.insert(action.action_id.clone(), action);
        }
        validate_action_fallback_refs(&actions)?;
        let animation_profiles = validate_action_runtime_profile_consistency(&actions)?;

        Ok(Self {
            actions,
            animation_profiles,
            manifest_animations,
            version: document.registry_version,
        })
    }

    pub(crate) fn resolve_play_action(
        &self,
        action_id: &str,
        context: &ResolveContext,
    ) -> BuddyResult<StepResolution> {
        if let Some(action) = self.actions.get(action_id) {
            return self.resolve_action_entry_with_registry_fallback(action_id, action, context);
        }

        let action = self
            .select_alias_candidate(action_id, context.affective_context)
            .ok_or_else(|| {
                BuddyError::Validation(format!("unknown buddy actionId or selector: {action_id}"))
            })?;

        self.resolve_action_entry_with_registry_fallback(action_id, action, context)
    }

    pub(crate) fn runtime_profiles(
        &self,
    ) -> impl Iterator<Item = (&str, ActionRuntimeProfile)> + '_ {
        self.animation_profiles
            .iter()
            .map(|(animation_ref, profile)| (animation_ref.as_str(), *profile))
    }

    fn select_alias_candidate(
        &self,
        action_selector: &str,
        affective_context: AffectiveContext,
    ) -> Option<&ActionRegistryEntry> {
        self.actions
            .values()
            .filter(|action| action_matches_selector(action, action_selector))
            .min_by(|left, right| {
                selector_sort_key(left, affective_context)
                    .cmp(&selector_sort_key(right, affective_context))
            })
    }

    fn resolve_action_entry(&self, action: &ActionRegistryEntry) -> BuddyResult<StepResolution> {
        let animation = self
            .manifest_animations
            .get(&action.animation_ref)
            .ok_or_else(|| {
                BuddyError::Runtime(format!(
                    "action registry references missing animation: {}",
                    action.animation_ref
                ))
            })?;

        let duration_ms = animation.total_duration_ms()?;
        Ok(StepResolution {
            action_id: action.action_id.clone(),
            animation_ref: action.animation_ref.clone(),
            playback_kind: action.playback_kind.as_str().to_owned(),
            duration_ms,
            loop_animation: animation.loop_animation,
            interrupt_policy: action.interrupt_policy,
            resolved_from_registry_version: self.version.clone(),
            fallback: None,
            clip_duration_ms: duration_ms,
        })
    }

    fn resolve_action_entry_with_registry_fallback(
        &self,
        requested_action_id: &str,
        action: &ActionRegistryEntry,
        context: &ResolveContext,
    ) -> BuddyResult<StepResolution> {
        let Some(unsupported_capability) = first_unsupported_capability(action, context) else {
            return self.resolve_action_entry(action);
        };
        let unsupported_capability = unsupported_capability.to_owned();

        for fallback_action_id in &action.fallback_chain {
            let Some(fallback_action) = self.actions.get(fallback_action_id) else {
                continue;
            };
            if first_unsupported_capability(fallback_action, context).is_some() {
                continue;
            }

            return self
                .resolve_action_entry(fallback_action)
                .map(|resolution| {
                    resolution.with_registry_fallback(
                        requested_action_id,
                        fallback_action.action_id.as_str(),
                        unsupported_capability.as_str(),
                    )
                });
        }

        Err(BuddyError::UnsupportedCapability {
            scope: "buddy action registry".to_owned(),
            capability: unsupported_capability,
        })
    }
}

fn action_matches_selector(action: &ActionRegistryEntry, action_selector: &str) -> bool {
    action.action_id == action_selector
        || action
            .aliases
            .iter()
            .any(|alias| alias.as_str() == action_selector)
}

fn first_unsupported_capability<'a>(
    action: &'a ActionRegistryEntry,
    context: &ResolveContext,
) -> Option<&'a str> {
    action
        .required_capabilities
        .iter()
        .find(|capability| !context.supports_capability(capability))
        .map(String::as_str)
}

impl MoodEnergyAffinity {
    fn score(&self, context: AffectiveContext) -> u8 {
        let mood_score = u8::from(self.mood.contains(&context.mood));
        let energy_score = u8::from(self.energy.contains(&context.energy));

        mood_score + energy_score
    }
}

fn selector_sort_key(
    action: &ActionRegistryEntry,
    affective_context: AffectiveContext,
) -> (u8, i64, &str) {
    (
        2 - action.mood_energy_affinity.score(affective_context),
        action.deterministic_sort_weight,
        action.action_id.as_str(),
    )
}

impl RuntimeManifestAnimation {
    fn total_duration_ms(&self) -> BuddyResult<u64> {
        self.frames.iter().try_fold(0_u64, |total, frame| {
            total
                .checked_add(frame.duration_ms(self.fps)?)
                .ok_or_else(|| BuddyError::Runtime("animation duration overflowed".to_owned()))
        })
    }
}

fn validate_manifest_animation_frames(
    animations: &[RuntimeManifestAnimation],
    sheet_frame_count: usize,
) -> BuddyResult<()> {
    let mut seen_animation_names = HashSet::new();
    for animation in animations {
        if animation.name.trim().is_empty() {
            return Err(BuddyError::Runtime(
                "runtime manifest animation requires name".to_owned(),
            ));
        }
        if !native_pet_manifest_animation_key_is_valid(&animation.name) {
            return Err(BuddyError::Runtime(format!(
                "runtime manifest has invalid animation key: {}",
                animation.name
            )));
        }
        if !seen_animation_names.insert(animation.name.as_str()) {
            return Err(BuddyError::Runtime(format!(
                "runtime manifest has duplicate animation: {}",
                animation.name
            )));
        }
        if animation.frames.is_empty() {
            return Err(BuddyError::Runtime(format!(
                "runtime manifest animation has no frames: {}",
                animation.name
            )));
        }

        for frame in &animation.frames {
            if frame.index() >= sheet_frame_count {
                return Err(BuddyError::Runtime(format!(
                    "runtime manifest animation frame is outside sheet: {}#{}",
                    animation.name,
                    frame.index()
                )));
            }
            frame.duration_ms(animation.fps)?;
        }
    }

    Ok(())
}

fn validate_action_entry(
    action: &ActionRegistryEntry,
    manifest_animations: &HashMap<String, RuntimeManifestAnimation>,
) -> BuddyResult<()> {
    if action.action_id.trim().is_empty() {
        return Err(BuddyError::Runtime(
            "action registry entry requires actionId".to_owned(),
        ));
    }
    let animation = manifest_animations
        .get(&action.animation_ref)
        .ok_or_else(|| {
            BuddyError::Runtime(format!(
                "action registry references missing animation: {}",
                action.animation_ref
            ))
        })?;
    for required in [
        action.category.as_str(),
        action.playback_kind.as_str(),
        action.placement.as_str(),
        action.movement.as_str(),
        action.start_pose.as_str(),
        action.end_pose.as_str(),
        action.facing.as_str(),
        action.interrupt_policy.as_str(),
        action.ai_visibility.as_str(),
        action.preset_visibility.as_str(),
    ] {
        if required.trim().is_empty() {
            return Err(BuddyError::Runtime(format!(
                "action registry entry has empty semantic field: {}",
                action.action_id
            )));
        }
    }
    validate_non_empty_values(&action.action_id, "aliases", &action.aliases)?;
    validate_non_empty_values(&action.action_id, "fallbackChain", &action.fallback_chain)?;
    validate_non_empty_values(
        &action.action_id,
        "requiredCapabilities",
        &action.required_capabilities,
    )?;
    validate_action_playback_contract(action, animation)?;
    if action.playback_kind == ActionPlaybackKind::IdleLoop && !action.idle_compatible {
        return Err(BuddyError::Runtime(format!(
            "action registry idleLoop action must be idle compatible: {}",
            action.action_id
        )));
    }
    if action.movement != "none" && action.locomotion_profile.is_none() {
        return Err(BuddyError::Runtime(format!(
            "action registry moving action requires locomotionProfile: {}",
            action.action_id
        )));
    }
    if action.deterministic_sort_weight < 0 {
        return Err(BuddyError::Runtime(format!(
            "action registry deterministicSortWeight must be non-negative: {}",
            action.action_id
        )));
    }
    if action.mood_energy_affinity.mood.is_empty() || action.mood_energy_affinity.energy.is_empty()
    {
        return Err(BuddyError::Runtime(format!(
            "action registry moodEnergyAffinity requires mood and energy values: {}",
            action.action_id
        )));
    }

    Ok(())
}

fn validate_action_playback_contract(
    action: &ActionRegistryEntry,
    animation: &RuntimeManifestAnimation,
) -> BuddyResult<()> {
    match action.playback_kind {
        ActionPlaybackKind::Once if animation.loop_animation => {
            return Err(BuddyError::Runtime(format!(
                "action registry once action requires a non-looping manifest animation: {} -> {}",
                action.action_id, action.animation_ref
            )));
        }
        ActionPlaybackKind::IdleLoop | ActionPlaybackKind::LoopForDuration
            if !animation.loop_animation =>
        {
            return Err(BuddyError::Runtime(format!(
                "action registry loop action requires a looping manifest animation: {} -> {}",
                action.action_id, action.animation_ref
            )));
        }
        _ => {}
    }

    if action.playback_kind == ActionPlaybackKind::Once
        && action.interrupt_policy == SidecarInterruptPolicy::FinishStep
        && action.runtime_profile.local_interaction_profile
            != ActionRuntimeLocalInteractionProfile::FiniteScriptedAction
    {
        return Err(BuddyError::Runtime(format!(
            "action registry finishStep once action requires finiteScriptedAction: {}",
            action.action_id
        )));
    }

    if action.runtime_profile.local_interaction_profile
        == ActionRuntimeLocalInteractionProfile::FiniteScriptedAction
        && action.runtime_profile.completion_fallback
            == ActionRuntimeCompletionFallbackProfile::Default
    {
        return Err(BuddyError::Runtime(format!(
            "action registry finiteScriptedAction requires an explicit completionFallback: {}",
            action.action_id
        )));
    }

    Ok(())
}

fn validate_action_fallback_refs(
    actions: &HashMap<String, ActionRegistryEntry>,
) -> BuddyResult<()> {
    for action in actions.values() {
        for fallback_action_id in &action.fallback_chain {
            if !actions.contains_key(fallback_action_id) {
                return Err(BuddyError::Runtime(format!(
                    "action registry fallbackChain references unknown action: {} -> {}",
                    action.action_id, fallback_action_id
                )));
            }
        }
    }

    Ok(())
}

fn validate_action_runtime_profile_consistency(
    actions: &HashMap<String, ActionRegistryEntry>,
) -> BuddyResult<HashMap<String, ActionRuntimeProfile>> {
    let mut profiles = HashMap::<String, ActionRuntimeProfile>::new();
    for action in actions.values() {
        if let Some(existing_profile) =
            profiles.insert(action.animation_ref.clone(), action.runtime_profile)
        {
            if existing_profile != action.runtime_profile {
                return Err(BuddyError::Runtime(format!(
                    "action registry has conflicting runtimeProfile for animationRef: {}",
                    action.animation_ref
                )));
            }
        }
    }

    Ok(profiles)
}

fn validate_non_empty_values(
    action_id: &str,
    field_name: &str,
    values: &[String],
) -> BuddyResult<()> {
    for value in values {
        if value.trim().is_empty() {
            return Err(BuddyError::Runtime(format!(
                "action registry entry has empty {field_name}: {action_id}"
            )));
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use serde_json::json;

    use super::{
        ActionRegistry, ActionRegistryDocument, RuntimeManifest, DEFAULT_ACTION_REGISTRY,
        DEFAULT_PET_MANIFEST,
    };
    use crate::action_registry::affective_types::{
        AffectiveContext, AffectiveContextSource, AffectiveEnergy, AffectiveMood, ResolveContext,
    };

    #[test]
    fn resolve_play_action_selects_alias_candidate_from_affective_context() {
        let registry = ActionRegistry::from_documents(
            &json!({
                "registryVersion": "selector-test",
                "actions": [
                    action_entry(
                        "move.run",
                        "run_right",
                        vec!["move"],
                        vec!["happy"],
                        vec!["high"],
                        20,
                    ),
                    action_entry(
                        "move.walk",
                        "sad",
                        vec!["move"],
                        vec!["sad"],
                        vec!["low"],
                        10,
                    )
                ]
            })
            .to_string(),
            &json!({
                "sheet": { "columns": 2, "rows": 2 },
                "animations": [
                    {
                        "name": "run_right",
                        "fps": 10,
                        "frames": [0, 1],
                        "loop": true
                    },
                    {
                        "name": "sad",
                        "fps": 5,
                        "frames": [2],
                        "loop": true
                    }
                ]
            })
            .to_string(),
        )
        .expect("load selector registry");

        let happy_resolution = registry
            .resolve_play_action(
                "move",
                &resolve_context(AffectiveMood::Happy, AffectiveEnergy::High),
            )
            .expect("resolve happy move");
        let sad_resolution = registry
            .resolve_play_action(
                "move",
                &resolve_context(AffectiveMood::Sad, AffectiveEnergy::Low),
            )
            .expect("resolve sad move");

        assert_eq!(happy_resolution.action_id, "move.run");
        assert_eq!(happy_resolution.animation_ref, "run_right");
        assert_eq!(sad_resolution.action_id, "move.walk");
        assert_eq!(sad_resolution.animation_ref, "sad");
    }

    #[test]
    fn resolve_play_action_uses_registry_fallback_chain_for_unsupported_capability() {
        let mut cast_entry = one_shot_action_entry("cast", "explain", true);
        cast_entry["requiredCapabilities"] = json!(["particleEffects"]);
        cast_entry["fallbackChain"] = json!(["celebrate"]);

        let registry = ActionRegistry::from_documents(
            &json!({
                "registryVersion": "registry-fallback-test",
                "actions": [
                    cast_entry,
                    one_shot_action_entry("celebrate", "celebrate", true)
                ]
            })
            .to_string(),
            &json!({
                "sheet": { "columns": 2, "rows": 2 },
                "animations": [
                    {
                        "name": "explain",
                        "fps": 10,
                        "frames": [0, 1],
                        "loop": false
                    },
                    {
                        "name": "celebrate",
                        "fps": 10,
                        "frames": [2, 3],
                        "loop": false
                    }
                ]
            })
            .to_string(),
        )
        .expect("load registry fallback test registry");
        let resolve_context = resolve_context(AffectiveMood::Neutral, AffectiveEnergy::Medium)
            .with_unsupported_capability("particleEffects");

        let resolution = registry
            .resolve_play_action("cast", &resolve_context)
            .expect("resolve through registry fallback");

        assert_eq!(resolution.action_id, "celebrate");
        assert_eq!(
            serde_json::to_value(&resolution.fallback).expect("serialize fallback"),
            json!({
                "requestedActionId": "cast",
                "fallbackActionId": "celebrate",
                "reasonCode": "fallback.registrySelected",
                "unsupportedCapability": "particleEffects"
            })
        );
    }

    #[test]
    fn bundled_action_registry_covers_every_runtime_animation() {
        let registry = serde_json::from_str::<ActionRegistryDocument>(DEFAULT_ACTION_REGISTRY)
            .expect("parse bundled action registry");
        let manifest = serde_json::from_str::<RuntimeManifest>(DEFAULT_PET_MANIFEST)
            .expect("parse bundled runtime manifest");
        let registered_animation_refs = registry
            .actions
            .iter()
            .map(|action| action.animation_ref.as_str())
            .collect::<HashSet<_>>();
        let missing_animation_refs = manifest
            .animations
            .iter()
            .filter_map(|animation| {
                (!registered_animation_refs.contains(animation.name.as_str()))
                    .then_some(animation.name.as_str())
            })
            .collect::<Vec<_>>();

        assert!(
            missing_animation_refs.is_empty(),
            "action registry is missing runtime animation refs: {missing_animation_refs:?}"
        );
    }

    #[test]
    fn action_registry_rejects_once_action_for_looping_manifest_animation() {
        let action = one_shot_action_entry("celebrate", "celebrate", true);
        let error = ActionRegistry::from_documents(
            &json!({
                "registryVersion": "once-loop-mismatch-test",
                "actions": [action]
            })
            .to_string(),
            &json!({
                "sheet": { "columns": 2, "rows": 1 },
                "animations": [{
                    "name": "celebrate",
                    "fps": 10,
                    "frames": [0, 1],
                    "loop": true
                }]
            })
            .to_string(),
        )
        .expect_err("once action must reject a looping manifest animation");

        assert!(
            error
                .to_string()
                .contains("once action requires a non-looping manifest animation"),
            "unexpected error: {error}"
        );
    }

    #[test]
    fn action_registry_rejects_loop_action_for_non_looping_manifest_animation() {
        let error = ActionRegistry::from_documents(
            &json!({
                "registryVersion": "loop-once-mismatch-test",
                "actions": [action_entry(
                    "run.right",
                    "run_right",
                    vec!["run"],
                    vec!["neutral"],
                    vec!["medium"],
                    10,
                )]
            })
            .to_string(),
            &json!({
                "sheet": { "columns": 2, "rows": 1 },
                "animations": [{
                    "name": "run_right",
                    "fps": 10,
                    "frames": [0, 1],
                    "loop": false
                }]
            })
            .to_string(),
        )
        .expect_err("loop action must reject a non-looping manifest animation");

        assert!(
            error
                .to_string()
                .contains("loop action requires a looping manifest animation"),
            "unexpected error: {error}"
        );
    }

    #[test]
    fn action_registry_rejects_finish_step_once_without_finite_runtime_profile() {
        let action = one_shot_action_entry("celebrate", "celebrate", false);
        let error = ActionRegistry::from_documents(
            &json!({
                "registryVersion": "once-runtime-profile-test",
                "actions": [action]
            })
            .to_string(),
            &json!({
                "sheet": { "columns": 2, "rows": 1 },
                "animations": [{
                    "name": "celebrate",
                    "fps": 10,
                    "frames": [0, 1],
                    "loop": false
                }]
            })
            .to_string(),
        )
        .expect_err("finishStep once action must require a finite runtime profile");

        assert!(
            error
                .to_string()
                .contains("finishStep once action requires finiteScriptedAction"),
            "unexpected error: {error}"
        );
    }

    #[test]
    fn action_registry_rejects_finite_runtime_profile_without_completion_fallback() {
        let mut action = one_shot_action_entry("celebrate", "celebrate", true);
        action["runtimeProfile"]["completionFallback"] = json!("default");
        let error = ActionRegistry::from_documents(
            &json!({
                "registryVersion": "finite-fallback-test",
                "actions": [action]
            })
            .to_string(),
            &json!({
                "sheet": { "columns": 2, "rows": 1 },
                "animations": [{
                    "name": "celebrate",
                    "fps": 10,
                    "frames": [0, 1],
                    "loop": false
                }]
            })
            .to_string(),
        )
        .expect_err("finite runtime profile must require an explicit completion fallback");

        assert!(
            error
                .to_string()
                .contains("finiteScriptedAction requires an explicit completionFallback"),
            "unexpected error: {error}"
        );
    }

    #[test]
    fn action_registry_rejects_manifest_animation_keys_that_runtime_cannot_address() {
        let error = ActionRegistry::from_documents(
            &json!({
                "registryVersion": "invalid-animation-key-test",
                "actions": [
                    action_entry(
                        "future.clip",
                        "Future Clip!",
                        vec!["future"],
                        vec!["neutral"],
                        vec!["medium"],
                        10,
                    )
                ]
            })
            .to_string(),
            &json!({
                "sheet": { "columns": 1, "rows": 1 },
                "animations": [
                    {
                        "name": "Future Clip!",
                        "fps": 10,
                        "frames": [0],
                        "loop": false
                    }
                ]
            })
            .to_string(),
        )
        .expect_err("registry should reject manifest keys outside control protocol");

        assert_eq!(
            error.to_string(),
            "runtime failed: runtime manifest has invalid animation key: Future Clip!"
        );
    }

    #[test]
    fn action_registry_rejects_unknown_fallback_action_refs() {
        let mut entry = action_entry(
            "cast",
            "explain",
            vec!["magic"],
            vec!["neutral"],
            vec!["medium"],
            20,
        );
        entry["fallbackChain"] = json!(["missing.action"]);

        let error = ActionRegistry::from_documents(
            &json!({
                "registryVersion": "unknown-fallback-test",
                "actions": [entry]
            })
            .to_string(),
            &json!({
                "sheet": { "columns": 1, "rows": 1 },
                "animations": [
                    {
                        "name": "explain",
                        "fps": 10,
                        "frames": [0],
                        "loop": true
                    }
                ]
            })
            .to_string(),
        )
        .expect_err("registry should reject fallback refs that do not resolve to actions");

        assert_eq!(
            error.to_string(),
            "runtime failed: action registry fallbackChain references unknown action: cast -> missing.action"
        );
    }

    #[test]
    fn action_registry_rejects_unknown_action_entry_fields() {
        let mut entry = action_entry(
            "celebrate",
            "celebrate",
            vec!["success"],
            vec!["neutral"],
            vec!["medium"],
            10,
        );
        entry["motionStyle"] = json!("big-step");

        let error = ActionRegistry::from_documents(
            &json!({
                "registryVersion": "strict-action-entry-test",
                "actions": [entry]
            })
            .to_string(),
            &json!({
                "sheet": { "columns": 1, "rows": 1 },
                "animations": [
                    {
                        "name": "celebrate",
                        "fps": 10,
                        "frames": [0],
                        "loop": false
                    }
                ]
            })
            .to_string(),
        )
        .expect_err("registry should reject fields outside the action entry schema");

        assert!(
            error.to_string().contains("unknown field"),
            "unexpected error: {error}"
        );
    }

    #[test]
    fn action_registry_rejects_unknown_runtime_manifest_frame_fields() {
        let error = ActionRegistry::from_documents(
            &json!({
                "registryVersion": "strict-runtime-manifest-test",
                "actions": [
                    action_entry(
                        "celebrate",
                        "celebrate",
                        vec!["success"],
                        vec!["neutral"],
                        vec!["medium"],
                        10,
                    )
                ]
            })
            .to_string(),
            &json!({
                "id": "test-pet",
                "name": "Test Pet",
                "kind": "sprite-sheet",
                "source": "test",
                "image": "spritesheet.webp",
                "frame": { "width": 192, "height": 208 },
                "sheet": { "columns": 1, "rows": 1 },
                "animations": [
                    {
                        "name": "celebrate",
                        "fps": 10,
                        "frames": [
                            { "index": 0, "durationMs": 100, "easing": "easeOut" }
                        ],
                        "loop": false
                    }
                ]
            })
            .to_string(),
        )
        .expect_err("registry should reject manifest frame fields outside runtime asset schema");

        assert!(
            error.to_string().contains("data did not match any variant"),
            "unexpected error: {error}"
        );
    }

    fn resolve_context(mood: AffectiveMood, energy: AffectiveEnergy) -> ResolveContext {
        ResolveContext {
            affective_context: AffectiveContext { mood, energy },
            affective_context_source: AffectiveContextSource::StateFile,
            unsupported_capabilities: Vec::new(),
        }
    }

    fn action_entry(
        action_id: &str,
        animation_ref: &str,
        aliases: Vec<&str>,
        moods: Vec<&str>,
        energies: Vec<&str>,
        deterministic_sort_weight: i64,
    ) -> serde_json::Value {
        json!({
            "actionId": action_id,
            "animationRef": animation_ref,
            "aliases": aliases,
            "category": "locomotion",
            "playbackKind": "loopForDuration",
            "placement": "currentPosition",
            "movement": "locomotion",
            "startPose": "idleCompatible",
            "endPose": "idleCompatible",
            "idleCompatible": true,
            "facing": "right",
            "locomotionProfile": { "speed": "test" },
            "interruptPolicy": "interruptible",
            "fallbackChain": [],
            "moodEnergyAffinity": {
                "mood": moods,
                "energy": energies
            },
            "aiVisibility": "macroOnly",
            "presetVisibility": "enabled",
            "requiredCapabilities": [],
            "deterministicSortWeight": deterministic_sort_weight,
            "runtimeProfile": {
                "renderProfile": "runRight",
                "localInteractionProfile": "none",
                "completionFallback": "default"
            }
        })
    }

    fn one_shot_action_entry(
        action_id: &str,
        animation_ref: &str,
        finite_runtime_profile: bool,
    ) -> serde_json::Value {
        let mut action = action_entry(
            action_id,
            animation_ref,
            vec!["reaction"],
            vec!["neutral"],
            vec!["medium"],
            10,
        );
        action["category"] = json!("oneShotReaction");
        action["playbackKind"] = json!("once");
        action["movement"] = json!("none");
        action["locomotionProfile"] = serde_json::Value::Null;
        action["interruptPolicy"] = json!("finishStep");
        action["runtimeProfile"] = if finite_runtime_profile {
            json!({
                "renderProfile": "celebrate",
                "localInteractionProfile": "finiteScriptedAction",
                "completionFallback": "idle"
            })
        } else {
            json!({
                "renderProfile": "celebrate",
                "localInteractionProfile": "none"
            })
        };
        action
    }
}
