use std::cell::{Cell, RefCell};

use super::{
    animation::NativePetAnimationName,
    bounds::{native_pet_runtime_resolve_window_placement, NATIVE_PET_BOUNDS_POLICY},
    coordinates::{
        native_pet_window_rect, NativePetLogicalRect, NativePetLogicalSize, NativePetPosition,
    },
    edge_runout::NativePetEdgeRunoutState,
    monitor_layout::NativePetMonitorLayout,
    physics::NativePetInertiaState,
    process::{NativePetWalkEdge, NativePetWalkTarget},
};

const NATIVE_PET_SCRIPTED_WALK_SPEED_LOGICAL_PX_PER_S: f64 = 620.0;
const NATIVE_PET_SCRIPTED_WALK_COMPLETE_DISTANCE_PX: f64 = 6.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct NativePetScriptedWalkState {
    pub(super) after_animation: Option<NativePetAnimationName>,
    pub(super) target_position: NativePetPosition,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(super) struct NativePetScriptedWalkStep {
    pub(super) animation: NativePetAnimationName,
    pub(super) finished: bool,
    pub(super) movement_dx: f64,
    pub(super) position: NativePetPosition,
}

pub(super) struct NativePetScriptedWalkRuntimeState<'a> {
    pub(super) inertia_state: &'a RefCell<Option<NativePetInertiaState>>,
    pub(super) edge_runout_state: &'a Cell<Option<NativePetEdgeRunoutState>>,
    pub(super) idle_lifecycle_elapsed_ms: &'a Cell<u64>,
    pub(super) task_presence_elapsed_ms: &'a Cell<u64>,
    pub(super) requested_animation: &'a Cell<NativePetAnimationName>,
    pub(super) scripted_walk_state: &'a RefCell<Option<NativePetScriptedWalkState>>,
}

pub(super) fn native_pet_start_scripted_walk(
    current_position: NativePetPosition,
    window_size: NativePetLogicalSize,
    target: NativePetWalkTarget,
    after: Option<NativePetAnimationName>,
    runtime_state: NativePetScriptedWalkRuntimeState<'_>,
) {
    runtime_state.inertia_state.replace(None);
    runtime_state.edge_runout_state.set(None);
    runtime_state.idle_lifecycle_elapsed_ms.set(0);
    runtime_state.task_presence_elapsed_ms.set(0);
    runtime_state
        .requested_animation
        .set(NativePetAnimationName::Idle);
    runtime_state
        .scripted_walk_state
        .replace(Some(NativePetScriptedWalkState {
            after_animation: after,
            target_position: native_pet_walk_target_position(current_position, window_size, target),
        }));
}

pub(super) fn native_pet_walk_target_position(
    current_position: NativePetPosition,
    window_size: NativePetLogicalSize,
    target: NativePetWalkTarget,
) -> NativePetPosition {
    if let Some(target_position) =
        native_pet_visible_walk_target_position(current_position, window_size, target)
    {
        return target_position;
    }

    let requested_position = match target {
        NativePetWalkTarget::Center | NativePetWalkTarget::Home => current_position,
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
    };
    native_pet_runtime_resolve_window_placement(
        requested_position,
        window_size,
        Some(native_pet_window_rect(current_position, window_size).center()),
    )
    .placement
    .position
}

fn native_pet_visible_walk_target_position(
    current_position: NativePetPosition,
    window_size: NativePetLogicalSize,
    target: NativePetWalkTarget,
) -> Option<NativePetPosition> {
    let layout = NativePetMonitorLayout::capture()?;
    let current_rect = native_pet_window_rect(current_position, window_size);
    let anchor = current_rect.center();
    let monitor = layout
        .monitor_at_point(anchor)
        .or_else(|| layout.nearest_monitor_to_point(anchor))
        .or_else(|| layout.primary_monitor())?;
    let bounds = monitor.available_bounds();
    let visible_position = native_pet_visible_walk_target_position_for_bounds(
        current_position,
        window_size,
        target,
        bounds,
        NATIVE_PET_BOUNDS_POLICY.monitor_margin_logical_px,
    );

    Some(
        native_pet_runtime_resolve_window_placement(visible_position, window_size, Some(anchor))
            .placement
            .position,
    )
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

fn native_pet_visible_walk_target_position_for_bounds(
    current_position: NativePetPosition,
    window_size: NativePetLogicalSize,
    target: NativePetWalkTarget,
    bounds: NativePetLogicalRect,
    margin_logical_px: i32,
) -> NativePetPosition {
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
        NativePetWalkTarget::Position { x, y } => NativePetPosition { x, y },
        NativePetWalkTarget::X { x } => NativePetPosition {
            x,
            y: current_position.y,
        },
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

    NativePetPosition {
        x: requested.x.clamp(min_x, max_x),
        y: requested.y.clamp(min_y, max_y),
    }
}

pub(super) fn native_pet_step_scripted_walk(
    current_position: NativePetPosition,
    target_position: NativePetPosition,
    elapsed_ms: u64,
) -> NativePetScriptedWalkStep {
    let dx = f64::from(target_position.x) - f64::from(current_position.x);
    let dy = f64::from(target_position.y) - f64::from(current_position.y);
    let distance = dx.hypot(dy);
    let animation = if dx >= 0.0 {
        NativePetAnimationName::RunRight
    } else {
        NativePetAnimationName::RunLeft
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

    #[test]
    fn advances_toward_target_with_directional_run_animation() {
        let step = native_pet_step_scripted_walk(
            NativePetPosition { x: 400, y: 700 },
            NativePetPosition { x: 0, y: 700 },
            100,
        );

        assert_eq!(step.animation, NativePetAnimationName::RunLeft);
        assert!(!step.finished);
        assert!(step.position.x < 400);
        assert_eq!(step.position.y, 700);
        assert!(step.movement_dx < 0.0);
    }

    #[test]
    fn finishes_when_next_step_reaches_target() {
        let step = native_pet_step_scripted_walk(
            NativePetPosition { x: 0, y: 700 },
            NativePetPosition { x: 24, y: 700 },
            100,
        );

        assert_eq!(step.animation, NativePetAnimationName::RunRight);
        assert!(step.finished);
        assert_eq!(step.position, NativePetPosition { x: 24, y: 700 });
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
}
