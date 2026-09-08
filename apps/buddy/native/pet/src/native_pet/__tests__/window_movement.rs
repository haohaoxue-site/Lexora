use super::native_pet_bounds_changed;
use crate::native_pet::{
    bounds::{
        NativePetBoundaryStrategy, NativePetBoundsResolution, NativePetWindowPlacement,
        NativePetWindowVisibility,
    },
    coordinates::NativePetPosition,
};

#[test]
fn reapplies_placement_when_native_surface_refresh_is_requested() {
    let position = NativePetPosition { x: 320, y: 240 };
    let bounds = NativePetBoundsResolution {
        placement: NativePetWindowPlacement {
            monitor_index: Some(0),
            layer_shell_position: position,
            position,
        },
        strategy: NativePetBoundaryStrategy::Clamp,
        visibility: NativePetWindowVisibility::FullyVisible,
        was_clamped: false,
        was_recovered: false,
    };

    assert!(native_pet_bounds_changed(bounds, position, Some(0), true));
}
