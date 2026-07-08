use std::cell::Cell;

use gtk::prelude::*;

use super::{
    bounds::{
        native_pet_runtime_resolve_window_placement, NativePetBoundsResolution,
        NativePetWindowPlacement,
    },
    coordinates::{NativePetLogicalSize, NativePetPosition},
    layer_shell::LayerShellApi,
};

pub(super) struct NativePetWindowMovementAdapter<'a> {
    gtk_window: &'a gtk::Window,
    layer_shell: Option<&'a LayerShellApi>,
    window_monitor_index: &'a Cell<Option<i32>>,
    window_position: &'a Cell<NativePetPosition>,
}

impl<'a> NativePetWindowMovementAdapter<'a> {
    pub(super) fn new(
        gtk_window: &'a gtk::Window,
        layer_shell: Option<&'a LayerShellApi>,
        window_monitor_index: &'a Cell<Option<i32>>,
        window_position: &'a Cell<NativePetPosition>,
    ) -> Self {
        Self {
            gtk_window,
            layer_shell,
            window_monitor_index,
            window_position,
        }
    }

    pub(super) fn move_to(&self, placement: NativePetWindowPlacement) {
        self.window_position.set(placement.position);
        self.window_monitor_index.set(placement.monitor_index);
        if let Some(layer_shell) = self.layer_shell {
            layer_shell.set_placement(self.gtk_window, placement);
        } else {
            self.gtk_window
                .move_(placement.position.x, placement.position.y);
        }
    }
}

pub(super) fn native_pet_reconcile_visible_placement(
    movement_adapter: &NativePetWindowMovementAdapter<'_>,
    current_position: NativePetPosition,
    current_monitor_index: Option<i32>,
    window_size: NativePetLogicalSize,
    drag_debug: bool,
) {
    let bounds = native_pet_runtime_resolve_window_placement(current_position, window_size, None);
    if !native_pet_bounds_changed(bounds, current_position, current_monitor_index) {
        return;
    }

    movement_adapter.move_to(bounds.placement);
    if drag_debug {
        eprintln!(
            "native-pet-drag-debug reconcile visibility={:?} position=({}, {}) monitor={:?} recovered={} clamped={}",
            bounds.visibility,
            bounds.placement.position.x,
            bounds.placement.position.y,
            bounds.placement.monitor_index,
            bounds.was_recovered,
            bounds.was_clamped,
        );
    }
}

fn native_pet_bounds_changed(
    bounds: NativePetBoundsResolution,
    current_position: NativePetPosition,
    current_monitor_index: Option<i32>,
) -> bool {
    bounds.placement.position != current_position
        || bounds.placement.monitor_index != current_monitor_index
}
