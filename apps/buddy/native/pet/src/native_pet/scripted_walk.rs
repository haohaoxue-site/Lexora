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
#[path = "__tests__/scripted_walk.rs"]
mod tests;
