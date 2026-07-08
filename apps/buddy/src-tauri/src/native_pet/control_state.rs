use serde_json::json;

use super::{
    animation::NativePetAnimationName,
    coordinates::{
        native_pet_window_rect, NativePetLogicalRect, NativePetLogicalSize, NativePetPosition,
        NATIVE_PET_COORDINATE_SPACE,
    },
    monitor_layout::NativePetMonitorLayout,
    scripted_walk::NativePetScriptedWalkState,
};

pub(super) struct NativePetControlStateSnapshot {
    pub(super) current_position: NativePetPosition,
    pub(super) current_monitor_index: Option<i32>,
    pub(super) window_size: NativePetLogicalSize,
    pub(super) current_animation: NativePetAnimationName,
    pub(super) requested_animation: NativePetAnimationName,
    pub(super) scripted_walk_state: Option<NativePetScriptedWalkState>,
    pub(super) is_dragging: bool,
    pub(super) is_inertia_active: bool,
    pub(super) is_edge_runout_active: bool,
}

pub(super) fn native_pet_control_state_response(
    snapshot: NativePetControlStateSnapshot,
) -> serde_json::Value {
    let is_scripted_walk_active = snapshot.scripted_walk_state.is_some();
    json!({
        "ok": true,
        "coordinateSpace": NATIVE_PET_COORDINATE_SPACE.label(),
        "position": native_pet_position_json(snapshot.current_position),
        "window": {
            "width": snapshot.window_size.width,
            "height": snapshot.window_size.height,
        },
        "monitor": native_pet_current_monitor_json(
            snapshot.current_position,
            snapshot.current_monitor_index,
            snapshot.window_size,
        ),
        "animation": {
            "current": snapshot.current_animation.manifest_key(),
            "requested": snapshot.requested_animation.manifest_key(),
        },
        "motion": {
            "active": snapshot.is_dragging
                || snapshot.is_inertia_active
                || snapshot.is_edge_runout_active
                || is_scripted_walk_active,
            "dragging": snapshot.is_dragging,
            "inertiaActive": snapshot.is_inertia_active,
            "edgeRunoutActive": snapshot.is_edge_runout_active,
            "scriptedWalkActive": is_scripted_walk_active,
            "targetPosition": snapshot.scripted_walk_state
                .map(|state| native_pet_position_json(state.target_position)),
        },
    })
}

fn native_pet_current_monitor_json(
    current_position: NativePetPosition,
    current_monitor_index: Option<i32>,
    window_size: NativePetLogicalSize,
) -> serde_json::Value {
    let Some(layout) = NativePetMonitorLayout::capture() else {
        return serde_json::Value::Null;
    };
    let current_rect = native_pet_window_rect(current_position, window_size);
    let anchor = current_rect.center();
    let monitor = current_monitor_index
        .and_then(|index| {
            layout
                .monitors()
                .iter()
                .find(|monitor| monitor.index == index)
        })
        .or_else(|| layout.monitor_at_point(anchor))
        .or_else(|| layout.nearest_monitor_to_point(anchor))
        .or_else(|| layout.primary_monitor());
    let Some(monitor) = monitor else {
        return serde_json::Value::Null;
    };

    json!({
        "index": monitor.index,
        "isPrimary": monitor.is_primary,
        "geometry": native_pet_rect_json(monitor.logical_geometry),
        "workarea": native_pet_rect_json(monitor.logical_workarea),
    })
}

fn native_pet_position_json(position: NativePetPosition) -> serde_json::Value {
    json!({
        "x": position.x,
        "y": position.y,
    })
}

fn native_pet_rect_json(rect: NativePetLogicalRect) -> serde_json::Value {
    json!({
        "x": rect.x,
        "y": rect.y,
        "width": rect.width,
        "height": rect.height,
    })
}
