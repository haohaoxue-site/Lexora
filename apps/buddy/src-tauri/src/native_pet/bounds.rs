use super::{
    coordinates::{
        native_pet_window_rect, NativePetLogicalPoint, NativePetLogicalRect, NativePetLogicalSize,
        NativePetPosition,
    },
    monitor_layout::{NativePetMonitorInfo, NativePetMonitorLayout},
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum NativePetBoundaryStrategy {
    Clamp,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct NativePetBoundsPolicy {
    pub(super) monitor_margin_logical_px: i32,
    pub(super) edge_reveal_logical_px: i32,
    pub(super) strategy: NativePetBoundaryStrategy,
}

pub(super) const NATIVE_PET_BOUNDS_POLICY: NativePetBoundsPolicy = NativePetBoundsPolicy {
    monitor_margin_logical_px: 24,
    edge_reveal_logical_px: 96,
    strategy: NativePetBoundaryStrategy::Clamp,
};

impl Default for NativePetBoundsPolicy {
    fn default() -> Self {
        NATIVE_PET_BOUNDS_POLICY
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct NativePetWindowPlacement {
    pub(super) monitor_index: Option<i32>,
    pub(super) layer_shell_position: NativePetPosition,
    pub(super) position: NativePetPosition,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum NativePetWindowVisibility {
    FullyVisible,
    PartiallyVisible,
    FullyInvisible,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct NativePetBoundsResolution {
    pub(super) placement: NativePetWindowPlacement,
    pub(super) strategy: NativePetBoundaryStrategy,
    pub(super) visibility: NativePetWindowVisibility,
    pub(super) was_clamped: bool,
    pub(super) was_recovered: bool,
}

pub(super) fn native_pet_runtime_initial_placement(
    window_size: NativePetLogicalSize,
) -> NativePetWindowPlacement {
    let Some(layout) = NativePetMonitorLayout::capture() else {
        let policy = NativePetBoundsPolicy::default();
        let position = NativePetPosition {
            x: policy.monitor_margin_logical_px,
            y: policy.monitor_margin_logical_px,
        };
        return NativePetWindowPlacement {
            layer_shell_position: position,
            monitor_index: None,
            position,
        };
    };

    native_pet_initial_placement(&layout, window_size, &NativePetBoundsPolicy::default())
}

pub(super) fn native_pet_runtime_resolve_window_placement(
    requested_position: NativePetPosition,
    window_size: NativePetLogicalSize,
    anchor: Option<NativePetLogicalPoint>,
) -> NativePetBoundsResolution {
    let Some(layout) = NativePetMonitorLayout::capture() else {
        return NativePetBoundsResolution {
            placement: NativePetWindowPlacement {
                layer_shell_position: requested_position,
                monitor_index: None,
                position: requested_position,
            },
            strategy: NativePetBoundaryStrategy::Clamp,
            visibility: NativePetWindowVisibility::FullyVisible,
            was_clamped: false,
            was_recovered: false,
        };
    };

    native_pet_resolve_window_placement(
        &layout,
        requested_position,
        window_size,
        anchor,
        &NativePetBoundsPolicy::default(),
    )
}

pub(super) fn native_pet_initial_placement(
    layout: &NativePetMonitorLayout,
    window_size: NativePetLogicalSize,
    policy: &NativePetBoundsPolicy,
) -> NativePetWindowPlacement {
    let monitor = layout
        .primary_monitor()
        .expect("initial placement requires at least one monitor");
    let bounds = monitor.available_bounds();
    let requested_position = native_pet_bottom_right_position(bounds, window_size, policy);

    native_pet_resolve_window_placement(layout, requested_position, window_size, None, policy)
        .placement
}

fn native_pet_bottom_right_position(
    bounds: NativePetLogicalRect,
    window_size: NativePetLogicalSize,
    policy: &NativePetBoundsPolicy,
) -> NativePetPosition {
    NativePetPosition {
        x: bounds.right() - window_size.width - policy.monitor_margin_logical_px,
        y: bounds.bottom() - window_size.height - policy.monitor_margin_logical_px,
    }
}

pub(super) fn native_pet_resolve_window_placement(
    layout: &NativePetMonitorLayout,
    requested_position: NativePetPosition,
    window_size: NativePetLogicalSize,
    anchor: Option<NativePetLogicalPoint>,
    policy: &NativePetBoundsPolicy,
) -> NativePetBoundsResolution {
    let window_rect = native_pet_window_rect(requested_position, window_size);
    let visibility = native_pet_window_visibility(layout, window_rect);
    let target_monitor = native_pet_target_monitor(layout, window_rect, anchor);
    let clamped_position =
        native_pet_clamp_to_monitor(target_monitor, requested_position, window_size, policy);

    NativePetBoundsResolution {
        placement: NativePetWindowPlacement {
            layer_shell_position: native_pet_layer_shell_position(target_monitor, clamped_position),
            monitor_index: Some(target_monitor.index),
            position: clamped_position,
        },
        strategy: policy.strategy,
        visibility,
        was_clamped: clamped_position != requested_position,
        was_recovered: matches!(visibility, NativePetWindowVisibility::FullyInvisible)
            && clamped_position != requested_position,
    }
}

fn native_pet_layer_shell_position(
    monitor: &NativePetMonitorInfo,
    global_position: NativePetPosition,
) -> NativePetPosition {
    NativePetPosition {
        x: global_position.x - monitor.logical_geometry.x,
        y: global_position.y - monitor.logical_geometry.y,
    }
}

fn native_pet_target_monitor(
    layout: &NativePetMonitorLayout,
    window_rect: super::coordinates::NativePetLogicalRect,
    anchor: Option<NativePetLogicalPoint>,
) -> &NativePetMonitorInfo {
    if let Some(anchor) = anchor.and_then(|anchor| layout.monitor_at_point(anchor)) {
        return anchor;
    }

    if let Some(center_monitor) = layout.monitor_at_point(window_rect.center()) {
        return center_monitor;
    }

    layout
        .monitors()
        .iter()
        .max_by_key(|monitor| monitor.available_bounds().intersection_area(window_rect))
        .filter(|monitor| monitor.available_bounds().intersection_area(window_rect) > 0)
        .or_else(|| layout.nearest_monitor_to_point(window_rect.center()))
        .expect("window placement requires at least one monitor")
}

fn native_pet_window_visibility(
    layout: &NativePetMonitorLayout,
    window_rect: super::coordinates::NativePetLogicalRect,
) -> NativePetWindowVisibility {
    let window_area = i64::from(window_rect.width) * i64::from(window_rect.height);
    let best_overlap = layout
        .monitors()
        .iter()
        .map(|monitor| monitor.available_bounds().intersection_area(window_rect))
        .max()
        .unwrap_or(0);

    if best_overlap <= 0 {
        NativePetWindowVisibility::FullyInvisible
    } else if best_overlap >= window_area {
        NativePetWindowVisibility::FullyVisible
    } else {
        NativePetWindowVisibility::PartiallyVisible
    }
}

fn native_pet_clamp_to_monitor(
    monitor: &NativePetMonitorInfo,
    requested_position: NativePetPosition,
    window_size: NativePetLogicalSize,
    policy: &NativePetBoundsPolicy,
) -> NativePetPosition {
    let bounds = monitor.available_bounds();
    let horizontal_reveal = native_pet_edge_reveal_logical_px(window_size.width, policy);
    let top_reveal = native_pet_edge_reveal_logical_px(window_size.height, policy);
    let min_x = bounds.x - window_size.width + horizontal_reveal;
    let min_y = bounds.y - window_size.height + top_reveal;
    let max_x = (bounds.right() - horizontal_reveal).max(min_x);
    let max_y =
        (bounds.bottom() - window_size.height - policy.monitor_margin_logical_px).max(min_y);

    NativePetPosition {
        x: requested_position.x.clamp(min_x, max_x),
        y: requested_position.y.clamp(min_y, max_y),
    }
}

fn native_pet_edge_reveal_logical_px(window_extent: i32, policy: &NativePetBoundsPolicy) -> i32 {
    policy.edge_reveal_logical_px.clamp(1, window_extent.max(1))
}

#[cfg(test)]
mod tests {
    use super::{
        native_pet_initial_placement, native_pet_resolve_window_placement,
        NativePetBoundaryStrategy, NativePetBoundsPolicy, NativePetWindowVisibility,
        NATIVE_PET_BOUNDS_POLICY,
    };
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
    fn clamps_window_within_single_monitor_bounds() {
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
            NativePetPosition { x: 1824, y: 836 }
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

        assert_eq!(
            left.placement.position,
            NativePetPosition { x: -120, y: 120 }
        );
        assert_eq!(
            right.placement.position,
            NativePetPosition { x: 1800, y: 120 }
        );
        assert_eq!(top.placement.position, NativePetPosition { x: 320, y: -60 });
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
    fn resolves_initial_placement_to_primary_monitor_bottom_right_workarea() {
        let layout = multi_monitor_layout();
        let placement = native_pet_initial_placement(
            &layout,
            NativePetLogicalSize::new(320, 180),
            &NativePetBoundsPolicy::default(),
        );

        assert_eq!(placement.monitor_index, Some(1));
        assert_eq!(placement.position, NativePetPosition { x: 2216, y: 1236 });
    }

    #[test]
    fn resolves_initial_placement_from_runtime_window_size() {
        let layout = multi_monitor_layout();
        let placement = native_pet_initial_placement(
            &layout,
            NativePetLogicalSize::new(480, 240),
            &NativePetBoundsPolicy::default(),
        );

        assert_eq!(placement.monitor_index, Some(1));
        assert_eq!(placement.position, NativePetPosition { x: 2056, y: 1176 });
    }

    #[test]
    fn exposes_clamp_only_strategy_for_stage_three() {
        assert_eq!(
            NATIVE_PET_BOUNDS_POLICY.strategy,
            NativePetBoundaryStrategy::Clamp
        );
        assert_eq!(NATIVE_PET_BOUNDS_POLICY.monitor_margin_logical_px, 24);
        assert_eq!(NATIVE_PET_BOUNDS_POLICY.edge_reveal_logical_px, 96);
    }
}
