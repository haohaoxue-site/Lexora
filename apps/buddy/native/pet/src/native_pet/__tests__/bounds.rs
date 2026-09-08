use super::{
    native_pet_initial_placement, native_pet_resolve_restored_placement,
    native_pet_resolve_window_placement, NativePetBoundaryStrategy, NativePetBoundsPolicy,
    NativePetWindowVisibility,
};

#[test]
fn restores_a_saved_position_that_is_still_visible() {
    let layout = multi_monitor_layout();
    let window_size = NativePetLogicalSize::new(320, 360);

    let placement = native_pet_resolve_restored_placement(
        &layout,
        NativePetPosition { x: 420, y: 280 },
        window_size,
        &NativePetBoundsPolicy::default(),
    );

    assert_eq!(placement.position, NativePetPosition { x: 420, y: 280 });
}

#[test]
fn falls_back_to_default_when_saved_position_is_offscreen() {
    let layout = multi_monitor_layout();
    let window_size = NativePetLogicalSize::new(320, 360);

    let placement = native_pet_resolve_restored_placement(
        &layout,
        NativePetPosition { x: 8000, y: 8000 },
        window_size,
        &NativePetBoundsPolicy::default(),
    );

    assert_eq!(
        placement,
        native_pet_initial_placement(&layout, window_size, &NativePetBoundsPolicy::default(),)
    );
}
use crate::native_pet::{
    coordinates::{
        NativePetLogicalPoint, NativePetLogicalRect, NativePetLogicalSize, NativePetPosition,
    },
    dpi::NativePetScaleFactor,
    monitor_layout::{NativePetMonitorInfo, NativePetMonitorLayout},
};

fn single_monitor_layout() -> NativePetMonitorLayout {
    NativePetMonitorLayout::new_for_tests(vec![NativePetMonitorInfo::new_for_tests(
        0,
        NativePetLogicalRect::new(0, 0, 1920, 1080),
        NativePetLogicalRect::new(0, 0, 1920, 1040),
        NativePetScaleFactor::new(1.0),
        true,
    )])
}

fn multi_monitor_layout() -> NativePetMonitorLayout {
    NativePetMonitorLayout::new_for_tests(vec![
        NativePetMonitorInfo::new_for_tests(
            0,
            NativePetLogicalRect::new(-1920, 0, 1920, 1080),
            NativePetLogicalRect::new(-1920, 0, 1920, 1040),
            NativePetScaleFactor::new(1.0),
            false,
        ),
        NativePetMonitorInfo::new_for_tests(
            1,
            NativePetLogicalRect::new(0, 0, 2560, 1440),
            NativePetLogicalRect::new(0, 40, 2560, 1400),
            NativePetScaleFactor::new(1.7),
            true,
        ),
    ])
}

#[test]
fn clamps_window_to_edge_reveal_bounds() {
    let layout = single_monitor_layout();
    let resolution = native_pet_resolve_window_placement(
        &layout,
        NativePetPosition { x: 1900, y: 990 },
        NativePetLogicalSize::new(240, 180),
        None,
        &NativePetBoundsPolicy::default(),
    );

    assert_eq!(resolution.strategy, NativePetBoundaryStrategy::Clamp);
    assert!(resolution.was_clamped);
    assert_eq!(
        resolution.placement.position,
        NativePetPosition { x: 1824, y: 944 }
    );
}

#[test]
fn allows_partial_window_overflow_for_edge_interactions() {
    let layout = single_monitor_layout();
    let policy = NativePetBoundsPolicy::default();
    let window_size = NativePetLogicalSize::new(240, 180);

    let left = native_pet_resolve_window_placement(
        &layout,
        NativePetPosition { x: -120, y: 120 },
        window_size,
        None,
        &policy,
    );
    let right = native_pet_resolve_window_placement(
        &layout,
        NativePetPosition { x: 1800, y: 120 },
        window_size,
        None,
        &policy,
    );
    let top = native_pet_resolve_window_placement(
        &layout,
        NativePetPosition { x: 320, y: -60 },
        window_size,
        None,
        &policy,
    );
    let bottom = native_pet_resolve_window_placement(
        &layout,
        NativePetPosition { x: 320, y: 944 },
        window_size,
        None,
        &policy,
    );

    assert_eq!(
        left.placement.position,
        NativePetPosition { x: -120, y: 120 }
    );
    assert_eq!(
        right.placement.position,
        NativePetPosition { x: 1800, y: 120 }
    );
    assert_eq!(top.placement.position, NativePetPosition { x: 320, y: -60 });
    assert_eq!(
        bottom.placement.position,
        NativePetPosition { x: 320, y: 944 }
    );
}

#[test]
fn keeps_window_on_negative_coordinate_monitor() {
    let layout = multi_monitor_layout();
    let resolution = native_pet_resolve_window_placement(
        &layout,
        NativePetPosition { x: -1840, y: 120 },
        NativePetLogicalSize::new(260, 180),
        Some(NativePetLogicalPoint::new(-1700.0, 200.0)),
        &NativePetBoundsPolicy::default(),
    );

    assert_eq!(resolution.placement.monitor_index, Some(0));
    assert_eq!(
        resolution.visibility,
        NativePetWindowVisibility::FullyVisible
    );
    assert_eq!(resolution.placement.position.x, -1840);
    assert_eq!(
        resolution.placement.layer_shell_position,
        NativePetPosition { x: 80, y: 120 }
    );
}

#[test]
fn prefers_pointer_monitor_when_drag_crosses_screens() {
    let layout = multi_monitor_layout();
    let resolution = native_pet_resolve_window_placement(
        &layout,
        NativePetPosition { x: -180, y: 120 },
        NativePetLogicalSize::new(260, 180),
        Some(NativePetLogicalPoint::new(40.0, 180.0)),
        &NativePetBoundsPolicy::default(),
    );

    assert_eq!(resolution.placement.monitor_index, Some(1));
    assert_eq!(
        resolution.placement.position,
        NativePetPosition { x: -164, y: 120 }
    );
}

#[test]
fn recovers_fully_invisible_window_to_nearest_visible_monitor() {
    let layout = multi_monitor_layout();
    let resolution = native_pet_resolve_window_placement(
        &layout,
        NativePetPosition { x: 5000, y: 120 },
        NativePetLogicalSize::new(260, 180),
        None,
        &NativePetBoundsPolicy::default(),
    );

    assert_eq!(
        resolution.visibility,
        NativePetWindowVisibility::FullyInvisible
    );
    assert!(resolution.was_recovered);
    assert_eq!(resolution.placement.monitor_index, Some(1));
    assert_eq!(
        resolution.placement.position,
        NativePetPosition { x: 2464, y: 120 }
    );
}

#[test]
fn resolves_initial_placement_from_runtime_window_size() {
    let layout = multi_monitor_layout();
    let cases = [
        (
            NativePetLogicalSize::new(320, 180),
            NativePetPosition { x: 2216, y: 1236 },
        ),
        (
            NativePetLogicalSize::new(480, 240),
            NativePetPosition { x: 2056, y: 1176 },
        ),
    ];

    for (window_size, expected_position) in cases {
        let placement =
            native_pet_initial_placement(&layout, window_size, &NativePetBoundsPolicy::default());

        assert_eq!(placement.monitor_index, Some(1));
        assert_eq!(placement.position, expected_position);
    }
}
