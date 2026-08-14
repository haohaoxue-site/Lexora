use std::cell::{Cell, RefCell};

use crate::error::{BuddyError, BuddyResult};

use super::{
    active_window::native_pet_active_window_rect,
    animation::{NativePetAnimationTarget, NativePetRequestedAnimationState},
    bounds::{native_pet_runtime_resolve_window_placement, NATIVE_PET_BOUNDS_POLICY},
    coordinates::{
        native_pet_window_rect, NativePetLogicalRect, NativePetLogicalSize, NativePetPosition,
    },
    edge_runout::NativePetEdgeRunoutState,
    lifecycle::NativePetMovementActionTargets,
    monitor_layout::NativePetMonitorLayout,
    physics::NativePetInertiaState,
    process::{
        NativePetAnchorReveal, NativePetWalkEdge, NativePetWalkTarget,
        NativePetWindowAnchorSelector,
    },
    window_anchor::{
        native_pet_explicit_window_anchor_edge_can_reveal_and_hide_body,
        native_pet_window_anchor_position_for_bounds,
    },
};

const NATIVE_PET_SCRIPTED_WALK_SPEED_LOGICAL_PX_PER_S: f64 = 620.0;
const NATIVE_PET_SCRIPTED_WALK_COMPLETE_DISTANCE_PX: f64 = 6.0;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct NativePetScriptedWalkState {
    pub(super) after_animation: Option<NativePetAnimationTarget>,
    pub(super) composition: NativePetScriptedWalkComposition,
    pub(super) target_position: NativePetPosition,
    target_hold_after_arrival_ms: u64,
    target_hold_elapsed_ms: u64,
    remaining_targets: Vec<NativePetScriptedWalkTarget>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum NativePetScriptedWalkComposition {
    Default,
    BehindActiveWindow,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum NativePetScriptedWalkArrival {
    Holding,
    Advanced,
    Finished,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct NativePetScriptedWalkTarget {
    position: NativePetPosition,
    hold_after_arrival_ms: u64,
}

impl NativePetScriptedWalkTarget {
    fn new(position: NativePetPosition, hold_after_arrival_ms: u64) -> Self {
        Self {
            position,
            hold_after_arrival_ms,
        }
    }
}

impl NativePetScriptedWalkState {
    fn single(
        target_position: NativePetPosition,
        after_animation: Option<NativePetAnimationTarget>,
        composition: NativePetScriptedWalkComposition,
        target_hold_after_arrival_ms: u64,
    ) -> Self {
        Self {
            after_animation,
            composition,
            target_position,
            target_hold_after_arrival_ms,
            target_hold_elapsed_ms: 0,
            remaining_targets: Vec::new(),
        }
    }

    #[cfg(test)]
    pub(super) fn path(
        target_positions: Vec<NativePetPosition>,
        after_animation: Option<NativePetAnimationTarget>,
        composition: NativePetScriptedWalkComposition,
    ) -> Option<Self> {
        Self::path_targets(
            target_positions
                .into_iter()
                .map(|position| NativePetScriptedWalkTarget::new(position, 0))
                .collect(),
            after_animation,
            composition,
        )
    }

    fn path_targets(
        mut targets: Vec<NativePetScriptedWalkTarget>,
        after_animation: Option<NativePetAnimationTarget>,
        composition: NativePetScriptedWalkComposition,
    ) -> Option<Self> {
        if targets.is_empty() {
            return None;
        }

        let target = targets.remove(0);
        Some(Self {
            after_animation,
            composition,
            target_position: target.position,
            target_hold_after_arrival_ms: target.hold_after_arrival_ms,
            target_hold_elapsed_ms: 0,
            remaining_targets: targets,
        })
    }

    pub(super) fn target_position(&self) -> NativePetPosition {
        self.target_position
    }

    pub(super) fn advance_after_arrival(
        &mut self,
        elapsed_ms: u64,
    ) -> NativePetScriptedWalkArrival {
        if self.target_hold_after_arrival_ms > 0 {
            self.target_hold_elapsed_ms = self.target_hold_elapsed_ms.saturating_add(elapsed_ms);
            if self.target_hold_elapsed_ms < self.target_hold_after_arrival_ms {
                return NativePetScriptedWalkArrival::Holding;
            }
        }

        if self.advance_to_next_target() {
            NativePetScriptedWalkArrival::Advanced
        } else {
            NativePetScriptedWalkArrival::Finished
        }
    }

    fn advance_to_next_target(&mut self) -> bool {
        let Some(target) =
            (!self.remaining_targets.is_empty()).then(|| self.remaining_targets.remove(0))
        else {
            return false;
        };

        self.target_position = target.position;
        self.target_hold_after_arrival_ms = target.hold_after_arrival_ms;
        self.target_hold_elapsed_ms = 0;
        true
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(super) struct NativePetScriptedWalkStep {
    pub(super) animation: NativePetAnimationTarget,
    pub(super) finished: bool,
    pub(super) movement_dx: f64,
    pub(super) position: NativePetPosition,
}

pub(super) struct NativePetScriptedWalkRuntimeState<'a> {
    pub(super) inertia_state: &'a RefCell<Option<NativePetInertiaState>>,
    pub(super) edge_runout_state: &'a Cell<Option<NativePetEdgeRunoutState>>,
    pub(super) idle_lifecycle_elapsed_ms: &'a Cell<u64>,
    pub(super) task_presence_elapsed_ms: &'a Cell<u64>,
    pub(super) requested_animation: &'a Cell<NativePetRequestedAnimationState>,
    pub(super) requested_reset_animation: NativePetAnimationTarget,
    pub(super) scripted_walk_state: &'a RefCell<Option<NativePetScriptedWalkState>>,
}

pub(super) fn native_pet_start_scripted_walk(
    current_position: NativePetPosition,
    window_size: NativePetLogicalSize,
    target: NativePetWalkTarget,
    after: Option<NativePetAnimationTarget>,
    runtime_state: NativePetScriptedWalkRuntimeState<'_>,
) -> BuddyResult<()> {
    let composition = native_pet_walk_target_composition(target);
    let hold_after_arrival_ms = native_pet_walk_target_hold_after_arrival_ms(target);
    let target_position = native_pet_walk_target_position(current_position, window_size, target)?;

    native_pet_reset_scripted_walk_runtime_state(&runtime_state);
    runtime_state
        .scripted_walk_state
        .replace(Some(NativePetScriptedWalkState::single(
            target_position,
            after,
            composition,
            hold_after_arrival_ms,
        )));
    Ok(())
}

pub(super) fn native_pet_start_scripted_walk_path(
    current_position: NativePetPosition,
    window_size: NativePetLogicalSize,
    path: Vec<NativePetWalkTarget>,
    after: Option<NativePetAnimationTarget>,
    runtime_state: NativePetScriptedWalkRuntimeState<'_>,
) -> BuddyResult<()> {
    let composition = native_pet_walk_path_composition(path.as_slice());
    let targets = native_pet_walk_path_targets(current_position, window_size, path)?;

    native_pet_reset_scripted_walk_runtime_state(&runtime_state);
    runtime_state
        .scripted_walk_state
        .replace(NativePetScriptedWalkState::path_targets(
            targets,
            after,
            composition,
        ));
    Ok(())
}

fn native_pet_reset_scripted_walk_runtime_state(
    runtime_state: &NativePetScriptedWalkRuntimeState<'_>,
) {
    runtime_state.inertia_state.replace(None);
    runtime_state.edge_runout_state.set(None);
    runtime_state.idle_lifecycle_elapsed_ms.set(0);
    runtime_state.task_presence_elapsed_ms.set(0);
    runtime_state
        .requested_animation
        .set(NativePetRequestedAnimationState::from(
            runtime_state.requested_reset_animation,
        ));
}

fn native_pet_walk_path_composition(
    path: &[NativePetWalkTarget],
) -> NativePetScriptedWalkComposition {
    path.iter()
        .copied()
        .map(native_pet_walk_target_composition)
        .find(|composition| *composition == NativePetScriptedWalkComposition::BehindActiveWindow)
        .unwrap_or(NativePetScriptedWalkComposition::Default)
}

fn native_pet_walk_target_composition(
    target: NativePetWalkTarget,
) -> NativePetScriptedWalkComposition {
    match target {
        NativePetWalkTarget::WindowAnchor { .. } => {
            NativePetScriptedWalkComposition::BehindActiveWindow
        }
        NativePetWalkTarget::Center
        | NativePetWalkTarget::Home
        | NativePetWalkTarget::EdgeAnchor { .. }
        | NativePetWalkTarget::Edge(_)
        | NativePetWalkTarget::Position { .. }
        | NativePetWalkTarget::X { .. } => NativePetScriptedWalkComposition::Default,
    }
}

fn native_pet_walk_target_hold_after_arrival_ms(target: NativePetWalkTarget) -> u64 {
    match target {
        NativePetWalkTarget::EdgeAnchor { duration_ms, .. }
        | NativePetWalkTarget::WindowAnchor { duration_ms, .. } => duration_ms,
        NativePetWalkTarget::Center
        | NativePetWalkTarget::Home
        | NativePetWalkTarget::Edge(_)
        | NativePetWalkTarget::Position { .. }
        | NativePetWalkTarget::X { .. } => 0,
    }
}

pub(super) fn native_pet_walk_target_position(
    current_position: NativePetPosition,
    window_size: NativePetLogicalSize,
    target: NativePetWalkTarget,
) -> BuddyResult<NativePetPosition> {
    let mut active_window_rect_provider = native_pet_active_window_rect;
    native_pet_walk_target_position_with_window_provider(
        current_position,
        window_size,
        target,
        &mut active_window_rect_provider,
    )
}

fn native_pet_walk_target_position_with_window_provider(
    current_position: NativePetPosition,
    window_size: NativePetLogicalSize,
    target: NativePetWalkTarget,
    active_window_rect_provider: &mut impl FnMut(
        NativePetWindowAnchorSelector,
    ) -> BuddyResult<Option<NativePetLogicalRect>>,
) -> BuddyResult<NativePetPosition> {
    if let Some(target_position) = native_pet_visible_walk_target_position_with_window_provider(
        current_position,
        window_size,
        target,
        active_window_rect_provider,
    )? {
        return Ok(target_position);
    }

    let requested_position = match target {
        NativePetWalkTarget::Center
        | NativePetWalkTarget::Home
        | NativePetWalkTarget::EdgeAnchor { .. } => current_position,
        NativePetWalkTarget::Edge(NativePetWalkEdge::Left) => NativePetPosition {
            x: i32::MIN / 2,
            y: current_position.y,
        },
        NativePetWalkTarget::Edge(NativePetWalkEdge::Right) => NativePetPosition {
            x: i32::MAX / 2,
            y: current_position.y,
        },
        NativePetWalkTarget::Edge(NativePetWalkEdge::Top) => NativePetPosition {
            x: current_position.x,
            y: i32::MIN / 2,
        },
        NativePetWalkTarget::Edge(NativePetWalkEdge::Bottom) => NativePetPosition {
            x: current_position.x,
            y: i32::MAX / 2,
        },
        NativePetWalkTarget::Position { x, y } => NativePetPosition { x, y },
        NativePetWalkTarget::X { x } => NativePetPosition {
            x,
            y: current_position.y,
        },
        NativePetWalkTarget::WindowAnchor { .. } => {
            return Err(native_pet_window_anchor_unavailable_error())
        }
    };
    Ok(native_pet_runtime_resolve_window_placement(
        requested_position,
        window_size,
        Some(native_pet_window_rect(current_position, window_size).center()),
    )
    .placement
    .position)
}

fn native_pet_visible_walk_target_position_with_window_provider(
    current_position: NativePetPosition,
    window_size: NativePetLogicalSize,
    target: NativePetWalkTarget,
    active_window_rect_provider: &mut impl FnMut(
        NativePetWindowAnchorSelector,
    ) -> BuddyResult<Option<NativePetLogicalRect>>,
) -> BuddyResult<Option<NativePetPosition>> {
    let Some(layout) = NativePetMonitorLayout::capture() else {
        return Ok(None);
    };
    let current_rect = native_pet_window_rect(current_position, window_size);
    let anchor = current_rect.center();
    let Some(monitor) = layout
        .monitor_at_point(anchor)
        .or_else(|| layout.nearest_monitor_to_point(anchor))
        .or_else(|| layout.primary_monitor())
    else {
        return Ok(None);
    };
    let bounds = monitor.available_bounds();
    let visible_position = native_pet_visible_walk_target_position_for_bounds_with_window_provider(
        current_position,
        window_size,
        target,
        bounds,
        NATIVE_PET_BOUNDS_POLICY.monitor_margin_logical_px,
        active_window_rect_provider,
    )?;

    Ok(Some(
        native_pet_runtime_resolve_window_placement(visible_position, window_size, Some(anchor))
            .placement
            .position,
    ))
}

fn native_pet_walk_path_targets(
    current_position: NativePetPosition,
    window_size: NativePetLogicalSize,
    path: Vec<NativePetWalkTarget>,
) -> BuddyResult<Vec<NativePetScriptedWalkTarget>> {
    let mut next_position = current_position;
    let mut targets = Vec::with_capacity(path.len());
    let mut active_window_rect_provider = native_pet_active_window_rect;

    for target in path {
        let hold_after_arrival_ms = native_pet_walk_target_hold_after_arrival_ms(target);
        next_position = native_pet_walk_target_position_with_window_provider(
            next_position,
            window_size,
            target,
            &mut active_window_rect_provider,
        )?;
        targets.push(NativePetScriptedWalkTarget::new(
            next_position,
            hold_after_arrival_ms,
        ));
    }

    Ok(targets)
}

#[cfg(test)]
fn native_pet_visible_walk_edge_target_position_for_bounds(
    current_position: NativePetPosition,
    window_size: NativePetLogicalSize,
    edge: NativePetWalkEdge,
    bounds: NativePetLogicalRect,
    margin_logical_px: i32,
) -> NativePetPosition {
    native_pet_visible_walk_target_position_for_bounds(
        current_position,
        window_size,
        NativePetWalkTarget::Edge(edge),
        bounds,
        margin_logical_px,
    )
}

#[cfg(test)]
fn native_pet_visible_walk_target_position_for_bounds(
    current_position: NativePetPosition,
    window_size: NativePetLogicalSize,
    target: NativePetWalkTarget,
    bounds: NativePetLogicalRect,
    margin_logical_px: i32,
) -> NativePetPosition {
    native_pet_visible_walk_target_position_for_bounds_with_active_window(
        current_position,
        window_size,
        target,
        bounds,
        margin_logical_px,
        None,
    )
    .expect("non-windowAnchor target resolves without active window")
}

fn native_pet_visible_walk_target_position_for_bounds_with_window_provider(
    current_position: NativePetPosition,
    window_size: NativePetLogicalSize,
    target: NativePetWalkTarget,
    bounds: NativePetLogicalRect,
    margin_logical_px: i32,
    active_window_rect_provider: &mut impl FnMut(
        NativePetWindowAnchorSelector,
    ) -> BuddyResult<Option<NativePetLogicalRect>>,
) -> BuddyResult<NativePetPosition> {
    let active_window_rect =
        native_pet_active_window_rect_for_target(target, active_window_rect_provider)?;
    native_pet_visible_walk_target_position_for_bounds_with_active_window(
        current_position,
        window_size,
        target,
        bounds,
        margin_logical_px,
        active_window_rect,
    )
}

fn native_pet_visible_walk_target_position_for_bounds_with_active_window(
    current_position: NativePetPosition,
    window_size: NativePetLogicalSize,
    target: NativePetWalkTarget,
    bounds: NativePetLogicalRect,
    margin_logical_px: i32,
    active_window_rect: Option<NativePetLogicalRect>,
) -> BuddyResult<NativePetPosition> {
    let margin = margin_logical_px.max(0);
    let min_x = bounds.x + margin;
    let min_y = bounds.y + margin;
    let max_x = (bounds.right() - window_size.width - margin).max(min_x);
    let max_y = (bounds.bottom() - window_size.height - margin).max(min_y);
    let center_x = bounds.x + ((bounds.width - window_size.width) / 2);
    let center_y = bounds.y + ((bounds.height - window_size.height) / 2);
    let requested = match target {
        NativePetWalkTarget::Center => NativePetPosition {
            x: center_x,
            y: center_y,
        },
        NativePetWalkTarget::Home => NativePetPosition { x: max_x, y: max_y },
        NativePetWalkTarget::EdgeAnchor {
            edge,
            reveal,
            duration_ms: _,
        } => {
            return Ok(native_pet_edge_anchor_position_for_bounds(
                current_position,
                window_size,
                edge,
                reveal,
                bounds,
                margin_logical_px,
            ));
        }
        NativePetWalkTarget::Position { x, y } => NativePetPosition { x, y },
        NativePetWalkTarget::X { x } => NativePetPosition {
            x,
            y: current_position.y,
        },
        NativePetWalkTarget::WindowAnchor {
            edge,
            reveal,
            selector: _,
            duration_ms: _,
        } => {
            let Some(active_window_rect) = active_window_rect else {
                return Err(native_pet_window_anchor_unavailable_error());
            };
            if active_window_rect.intersection_area(bounds) == 0 {
                return Err(native_pet_window_anchor_unavailable_error());
            }
            if !native_pet_explicit_window_anchor_edge_can_reveal_and_hide_body(
                active_window_rect,
                window_size,
                edge,
                reveal,
                bounds,
                margin_logical_px,
            ) {
                return Err(native_pet_window_anchor_unavailable_error());
            }
            return Ok(native_pet_window_anchor_position_for_bounds(
                active_window_rect,
                window_size,
                edge,
                reveal,
                bounds,
                margin_logical_px,
            ));
        }
        NativePetWalkTarget::Edge(edge) => NativePetPosition {
            x: match edge {
                NativePetWalkEdge::Left => min_x,
                NativePetWalkEdge::Right => max_x,
                NativePetWalkEdge::Top | NativePetWalkEdge::Bottom => current_position.x,
            },
            y: match edge {
                NativePetWalkEdge::Top => min_y,
                NativePetWalkEdge::Bottom => max_y,
                NativePetWalkEdge::Left | NativePetWalkEdge::Right => current_position.y,
            },
        },
    };

    Ok(NativePetPosition {
        x: requested.x.clamp(min_x, max_x),
        y: requested.y.clamp(min_y, max_y),
    })
}

fn native_pet_active_window_rect_for_target(
    target: NativePetWalkTarget,
    active_window_rect_provider: &mut impl FnMut(
        NativePetWindowAnchorSelector,
    ) -> BuddyResult<Option<NativePetLogicalRect>>,
) -> BuddyResult<Option<NativePetLogicalRect>> {
    match target {
        NativePetWalkTarget::WindowAnchor { selector, .. } => match selector.kind() {
            super::process::NativePetWindowAnchorSelectorKind::ActiveWindow => {
                active_window_rect_provider(selector)
            }
        },
        NativePetWalkTarget::Center
        | NativePetWalkTarget::Home
        | NativePetWalkTarget::EdgeAnchor { .. }
        | NativePetWalkTarget::Edge(_)
        | NativePetWalkTarget::Position { .. }
        | NativePetWalkTarget::X { .. } => Ok(None),
    }
}

fn native_pet_edge_anchor_position_for_bounds(
    current_position: NativePetPosition,
    window_size: NativePetLogicalSize,
    edge: NativePetWalkEdge,
    reveal: NativePetAnchorReveal,
    bounds: NativePetLogicalRect,
    margin_logical_px: i32,
) -> NativePetPosition {
    let margin = margin_logical_px.max(0);
    let min_x = bounds.x + margin;
    let min_y = bounds.y + margin;
    let max_x = (bounds.right() - window_size.width - margin).max(min_x);
    let max_y = (bounds.bottom() - window_size.height - margin).max(min_y);
    let reveal_extent = native_pet_edge_anchor_reveal_extent(window_size, edge, reveal);

    match edge {
        NativePetWalkEdge::Left => NativePetPosition {
            x: bounds.x - window_size.width + reveal_extent,
            y: current_position.y.clamp(min_y, max_y),
        },
        NativePetWalkEdge::Right => NativePetPosition {
            x: bounds.right() - reveal_extent,
            y: current_position.y.clamp(min_y, max_y),
        },
        NativePetWalkEdge::Top => NativePetPosition {
            x: current_position.x.clamp(min_x, max_x),
            y: bounds.y - window_size.height + reveal_extent,
        },
        NativePetWalkEdge::Bottom => NativePetPosition {
            x: current_position.x.clamp(min_x, max_x),
            y: bounds.bottom() - reveal_extent,
        },
    }
}

fn native_pet_edge_anchor_reveal_extent(
    window_size: NativePetLogicalSize,
    edge: NativePetWalkEdge,
    reveal: NativePetAnchorReveal,
) -> i32 {
    let window_extent = match edge {
        NativePetWalkEdge::Left | NativePetWalkEdge::Right => window_size.width,
        NativePetWalkEdge::Top | NativePetWalkEdge::Bottom => window_size.height,
    };

    match reveal {
        NativePetAnchorReveal::Head => NATIVE_PET_BOUNDS_POLICY
            .edge_reveal_logical_px
            .clamp(1, window_extent.max(1)),
    }
}

fn native_pet_window_anchor_unavailable_error() -> BuddyError {
    BuddyError::Runtime("native pet active window rect is unavailable".to_owned())
}

pub(super) fn native_pet_step_scripted_walk(
    targets: &NativePetMovementActionTargets,
    current_position: NativePetPosition,
    target_position: NativePetPosition,
    elapsed_ms: u64,
) -> NativePetScriptedWalkStep {
    let dx = f64::from(target_position.x) - f64::from(current_position.x);
    let dy = f64::from(target_position.y) - f64::from(current_position.y);
    let distance = dx.hypot(dy);
    let animation = if dx >= 0.0 {
        targets.run_right()
    } else {
        targets.run_left()
    };

    if distance <= NATIVE_PET_SCRIPTED_WALK_COMPLETE_DISTANCE_PX || elapsed_ms == 0 {
        return NativePetScriptedWalkStep {
            animation,
            finished: true,
            movement_dx: dx,
            position: target_position,
        };
    }

    let max_step = NATIVE_PET_SCRIPTED_WALK_SPEED_LOGICAL_PX_PER_S * elapsed_ms as f64 / 1_000.0;
    if max_step >= distance {
        return NativePetScriptedWalkStep {
            animation,
            finished: true,
            movement_dx: dx,
            position: target_position,
        };
    }

    let ratio = max_step / distance;
    let position = super::coordinates::NativePetLogicalPoint::new(
        f64::from(current_position.x) + dx * ratio,
        f64::from(current_position.y) + dy * ratio,
    )
    .round_to_window_position()
    .unwrap_or(target_position);

    NativePetScriptedWalkStep {
        animation,
        finished: false,
        movement_dx: f64::from(position.x) - f64::from(current_position.x),
        position,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::native_pet::animation::{
        NativePetAnimationKey, NativePetAnimationSet, NativePetManifest,
    };
    use crate::native_pet::assets::load_default_pet_animation_set;
    use crate::native_pet::lifecycle::NativePetMovementActionTargets;
    use crate::native_pet::process::NativePetWindowAnchorEdge;

    const DEFAULT_PET_MANIFEST: &str =
        include_str!("../../../../../packages/assets/buddy/pets/default/manifest.json");

    fn default_animations() -> NativePetAnimationSet {
        load_default_pet_animation_set().expect("default native pet animation set loads")
    }

    fn animation_target(
        animations: &NativePetAnimationSet,
        animation_key: &str,
    ) -> NativePetAnimationTarget {
        let key = NativePetAnimationKey::parse(animation_key).expect("valid animation key");
        animations
            .animation_target_for_key(&key)
            .expect("animation target exists")
    }

    fn movement_targets(animations: &NativePetAnimationSet) -> NativePetMovementActionTargets {
        NativePetMovementActionTargets::load_bundled(animations)
            .expect("movement targets resolve from registry")
    }

    fn animations_with_manifest_only_target(
        animation_name: &str,
    ) -> (NativePetAnimationSet, NativePetAnimationTarget) {
        let mut manifest_json = serde_json::from_str::<serde_json::Value>(DEFAULT_PET_MANIFEST)
            .expect("native pet animation manifest parses");
        manifest_json["animations"]
            .as_array_mut()
            .expect("manifest animations are an array")
            .push(serde_json::json!({
                "description": "Fixture manifest-only animation",
                "frames": [{ "index": 0, "durationMs": 120 }],
                "loop": false,
                "name": animation_name,
                "row": 0,
            }));
        let manifest = serde_json::from_value::<NativePetManifest>(manifest_json)
            .expect("native pet animation manifest value parses");
        let animations =
            NativePetAnimationSet::from_manifest(manifest).expect("manifest with extra clip loads");
        let target = animation_target(&animations, animation_name);

        (animations, target)
    }

    #[test]
    fn advances_toward_target_with_directional_run_animation() {
        let animations = default_animations();
        let movement_targets = movement_targets(&animations);
        let step = native_pet_step_scripted_walk(
            &movement_targets,
            NativePetPosition { x: 400, y: 700 },
            NativePetPosition { x: 0, y: 700 },
            100,
        );

        assert_eq!(step.animation, movement_targets.run_left());
        assert!(!step.finished);
        assert!(step.position.x < 400);
        assert_eq!(step.position.y, 700);
        assert!(step.movement_dx < 0.0);
    }

    #[test]
    fn scripted_walk_uses_resolved_directional_run_target() {
        let (animations, run_left) = animations_with_manifest_only_target("future_run_left");
        let bundled_targets = movement_targets(&animations);
        let movement_targets =
            bundled_targets.with_run_targets(run_left, bundled_targets.run_right());

        let step = native_pet_step_scripted_walk(
            &movement_targets,
            NativePetPosition { x: 400, y: 700 },
            NativePetPosition { x: 0, y: 700 },
            100,
        );

        assert_eq!(step.animation, run_left);
    }

    #[test]
    fn finishes_when_next_step_reaches_target() {
        let animations = default_animations();
        let movement_targets = movement_targets(&animations);
        let step = native_pet_step_scripted_walk(
            &movement_targets,
            NativePetPosition { x: 0, y: 700 },
            NativePetPosition { x: 24, y: 700 },
            100,
        );

        assert_eq!(step.animation, movement_targets.run_right());
        assert!(step.finished);
        assert_eq!(step.position, NativePetPosition { x: 24, y: 700 });
    }

    #[test]
    fn scripted_walk_resets_requested_animation_to_registry_target() {
        let (animations, reset_animation) =
            animations_with_manifest_only_target("future_idle_reset");
        let inertia_state = RefCell::new(None);
        let edge_runout_state = Cell::new(None);
        let idle_lifecycle_elapsed_ms = Cell::new(25);
        let task_presence_elapsed_ms = Cell::new(25);
        let requested_animation = Cell::new(NativePetRequestedAnimationState::from(
            animation_target(&animations, "celebrate"),
        ));
        let scripted_walk_state = RefCell::new(None);

        native_pet_reset_scripted_walk_runtime_state(&NativePetScriptedWalkRuntimeState {
            inertia_state: &inertia_state,
            edge_runout_state: &edge_runout_state,
            idle_lifecycle_elapsed_ms: &idle_lifecycle_elapsed_ms,
            task_presence_elapsed_ms: &task_presence_elapsed_ms,
            requested_animation: &requested_animation,
            requested_reset_animation: reset_animation,
            scripted_walk_state: &scripted_walk_state,
        });

        assert_eq!(
            requested_animation.get().animation_target(),
            reset_animation
        );
        assert_eq!(idle_lifecycle_elapsed_ms.get(), 0);
        assert_eq!(task_presence_elapsed_ms.get(), 0);
    }

    #[test]
    fn edge_targets_keep_pet_fully_visible() {
        let bounds = NativePetLogicalRect::new(0, 0, 1920, 1040);
        let window_size = NativePetLogicalSize::new(240, 180);
        let current_position = NativePetPosition { x: -144, y: 990 };

        assert_eq!(
            native_pet_visible_walk_edge_target_position_for_bounds(
                current_position,
                window_size,
                NativePetWalkEdge::Left,
                bounds,
                24,
            ),
            NativePetPosition { x: 24, y: 836 }
        );
        assert_eq!(
            native_pet_visible_walk_edge_target_position_for_bounds(
                current_position,
                window_size,
                NativePetWalkEdge::Right,
                bounds,
                24,
            ),
            NativePetPosition { x: 1656, y: 836 }
        );
        assert_eq!(
            native_pet_visible_walk_edge_target_position_for_bounds(
                current_position,
                window_size,
                NativePetWalkEdge::Top,
                bounds,
                24,
            ),
            NativePetPosition { x: 24, y: 24 }
        );
        assert_eq!(
            native_pet_visible_walk_edge_target_position_for_bounds(
                current_position,
                window_size,
                NativePetWalkEdge::Bottom,
                bounds,
                24,
            ),
            NativePetPosition { x: 24, y: 836 }
        );
    }

    #[test]
    fn edge_anchor_targets_leave_only_head_visible_from_screen_edge() {
        let bounds = NativePetLogicalRect::new(0, 0, 1920, 1040);
        let window_size = NativePetLogicalSize::new(240, 180);
        let current_position = NativePetPosition { x: 480, y: 520 };

        assert_eq!(
            native_pet_visible_walk_target_position_for_bounds(
                current_position,
                window_size,
                NativePetWalkTarget::EdgeAnchor {
                    edge: NativePetWalkEdge::Left,
                    reveal: crate::native_pet::process::NativePetAnchorReveal::Head,
                    duration_ms: 1500,
                },
                bounds,
                24,
            ),
            NativePetPosition { x: -144, y: 520 }
        );
        assert_eq!(
            native_pet_visible_walk_target_position_for_bounds(
                current_position,
                window_size,
                NativePetWalkTarget::EdgeAnchor {
                    edge: NativePetWalkEdge::Bottom,
                    reveal: crate::native_pet::process::NativePetAnchorReveal::Head,
                    duration_ms: 1500,
                },
                bounds,
                24,
            ),
            NativePetPosition { x: 480, y: 944 }
        );
    }

    #[test]
    fn named_targets_resolve_inside_visible_bounds() {
        let bounds = NativePetLogicalRect::new(0, 40, 2560, 1400);
        let window_size = NativePetLogicalSize::new(240, 180);
        let current_position = NativePetPosition { x: 1200, y: 700 };

        assert_eq!(
            native_pet_visible_walk_target_position_for_bounds(
                current_position,
                window_size,
                NativePetWalkTarget::Center,
                bounds,
                24,
            ),
            NativePetPosition { x: 1160, y: 650 }
        );
        assert_eq!(
            native_pet_visible_walk_target_position_for_bounds(
                current_position,
                window_size,
                NativePetWalkTarget::Home,
                bounds,
                24,
            ),
            NativePetPosition { x: 2296, y: 1236 }
        );
        assert_eq!(
            native_pet_visible_walk_target_position_for_bounds(
                current_position,
                window_size,
                NativePetWalkTarget::Position { x: -900, y: 3000 },
                bounds,
                24,
            ),
            NativePetPosition { x: 24, y: 1236 }
        );
    }

    #[test]
    fn window_anchor_targets_resolve_against_active_window_rect() {
        let bounds = NativePetLogicalRect::new(0, 0, 1920, 1040);
        let window_size = NativePetLogicalSize::new(240, 180);
        let current_position = NativePetPosition { x: 1200, y: 700 };

        let position = native_pet_visible_walk_target_position_for_bounds_with_active_window(
            current_position,
            window_size,
            NativePetWalkTarget::WindowAnchor {
                selector: crate::native_pet::process::NativePetWindowAnchorSelector::active_window(
                ),
                edge: NativePetWindowAnchorEdge::Left,
                reveal: crate::native_pet::process::NativePetWindowAnchorReveal::Head,
                duration_ms: 3000,
            },
            bounds,
            24,
            Some(NativePetLogicalRect::new(400, 200, 800, 600)),
        )
        .expect("resolve window anchor");

        assert_eq!(position, NativePetPosition { x: 320, y: 410 });
    }

    #[test]
    fn window_anchor_rejects_active_window_rect_outside_workarea() {
        let bounds = NativePetLogicalRect::new(0, 0, 1920, 1040);
        let window_size = NativePetLogicalSize::new(240, 180);
        let current_position = NativePetPosition { x: 1200, y: 700 };

        let error = native_pet_visible_walk_target_position_for_bounds_with_active_window(
            current_position,
            window_size,
            NativePetWalkTarget::WindowAnchor {
                selector: crate::native_pet::process::NativePetWindowAnchorSelector::active_window(
                ),
                edge: NativePetWindowAnchorEdge::Left,
                reveal: crate::native_pet::process::NativePetWindowAnchorReveal::Head,
                duration_ms: 3000,
            },
            bounds,
            24,
            Some(NativePetLogicalRect::new(2200, 200, 800, 600)),
        )
        .unwrap_err();

        assert!(matches!(
            error,
            BuddyError::Runtime(message)
                if message == "native pet active window rect is unavailable"
        ));
    }

    #[test]
    fn window_anchor_rejects_explicit_edge_when_head_reveal_would_be_clamped() {
        let bounds = NativePetLogicalRect::new(0, 0, 1920, 1040);
        let window_size = NativePetLogicalSize::new(240, 180);
        let current_position = NativePetPosition { x: 1200, y: 700 };

        let error = native_pet_visible_walk_target_position_for_bounds_with_active_window(
            current_position,
            window_size,
            NativePetWalkTarget::WindowAnchor {
                selector: crate::native_pet::process::NativePetWindowAnchorSelector::active_window(
                ),
                edge: NativePetWindowAnchorEdge::Left,
                reveal: crate::native_pet::process::NativePetWindowAnchorReveal::Head,
                duration_ms: 3000,
            },
            bounds,
            24,
            Some(NativePetLogicalRect::new(20, 200, 800, 600)),
        )
        .unwrap_err();

        assert!(matches!(
            error,
            BuddyError::Runtime(message)
                if message == "native pet active window rect is unavailable"
        ));
    }

    #[test]
    fn window_anchor_targets_request_active_window_rect_from_provider() {
        let window_size = NativePetLogicalSize::new(240, 180);
        let current_position = NativePetPosition { x: 1200, y: 700 };
        let mut requested_active_window = false;

        let position = native_pet_visible_walk_target_position_for_bounds_with_window_provider(
            current_position,
            window_size,
            NativePetWalkTarget::WindowAnchor {
                selector: crate::native_pet::process::NativePetWindowAnchorSelector::active_window(
                ),
                edge: NativePetWindowAnchorEdge::Left,
                reveal: crate::native_pet::process::NativePetWindowAnchorReveal::Head,
                duration_ms: 3000,
            },
            NativePetLogicalRect::new(0, 0, 1920, 1040),
            24,
            &mut |selector| {
                requested_active_window = selector.kind()
                    == crate::native_pet::process::NativePetWindowAnchorSelectorKind::ActiveWindow;
                Ok(Some(NativePetLogicalRect::new(400, 200, 800, 600)))
            },
        )
        .expect("resolve window anchor");

        assert!(requested_active_window);
        assert_eq!(position, NativePetPosition { x: 320, y: 410 });
    }

    #[test]
    fn scripted_walk_path_advances_to_next_target_before_finishing() {
        let animations = default_animations();
        let after_animation = Some(animation_target(&animations, "sleep"));
        let mut state = NativePetScriptedWalkState::path(
            vec![
                NativePetPosition { x: 24, y: 700 },
                NativePetPosition { x: 240, y: 700 },
            ],
            after_animation,
            NativePetScriptedWalkComposition::Default,
        )
        .expect("path state");

        assert_eq!(state.target_position, NativePetPosition { x: 24, y: 700 });
        assert!(state.advance_to_next_target());
        assert_eq!(state.target_position, NativePetPosition { x: 240, y: 700 });
        assert!(!state.advance_to_next_target());
        assert_eq!(state.after_animation, after_animation);
    }

    #[test]
    fn window_anchor_targets_request_behind_active_window_composition() {
        assert_eq!(
            native_pet_walk_target_composition(NativePetWalkTarget::WindowAnchor {
                selector: crate::native_pet::process::NativePetWindowAnchorSelector::active_window(
                ),
                edge: NativePetWindowAnchorEdge::Left,
                reveal: crate::native_pet::process::NativePetWindowAnchorReveal::Head,
                duration_ms: 3000,
            }),
            NativePetScriptedWalkComposition::BehindActiveWindow
        );
    }

    #[test]
    fn path_targets_request_behind_active_window_composition_when_any_point_uses_window_anchor() {
        assert_eq!(
            native_pet_walk_path_composition(&[
                NativePetWalkTarget::Center,
                NativePetWalkTarget::WindowAnchor {
                    selector:
                        crate::native_pet::process::NativePetWindowAnchorSelector::active_window(),
                    edge: NativePetWindowAnchorEdge::Right,
                    reveal: crate::native_pet::process::NativePetWindowAnchorReveal::Head,
                    duration_ms: 3000,
                },
            ]),
            NativePetScriptedWalkComposition::BehindActiveWindow
        );
    }

    #[test]
    fn window_anchor_duration_holds_scripted_walk_after_arrival() {
        let mut state = NativePetScriptedWalkState::single(
            NativePetPosition { x: 320, y: 410 },
            None,
            NativePetScriptedWalkComposition::BehindActiveWindow,
            3000,
        );

        assert_eq!(
            state.advance_after_arrival(1000),
            NativePetScriptedWalkArrival::Holding
        );
        assert_eq!(
            state.target_position(),
            NativePetPosition { x: 320, y: 410 }
        );
        assert_eq!(
            state.advance_after_arrival(1999),
            NativePetScriptedWalkArrival::Holding
        );
        assert_eq!(
            state.advance_after_arrival(1),
            NativePetScriptedWalkArrival::Finished
        );
    }
}
