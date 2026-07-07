use std::cell::Cell;

use gtk::prelude::*;

use super::{
    bounds::NativePetWindowPlacement, coordinates::NativePetPosition, layer_shell::LayerShellApi,
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
