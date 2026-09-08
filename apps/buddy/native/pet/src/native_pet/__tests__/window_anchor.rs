use super::*;

#[test]
fn window_anchor_positions_pet_so_only_head_peeks_from_each_window_edge() {
    let active_window_rect = NativePetLogicalRect::new(400, 200, 800, 600);
    let window_size = NativePetLogicalSize::new(240, 180);
    let bounds = NativePetLogicalRect::new(0, 0, 1920, 1040);

    assert_eq!(
        native_pet_window_anchor_position_for_bounds(
            active_window_rect,
            window_size,
            NativePetWindowAnchorEdge::Left,
            NativePetWindowAnchorReveal::Head,
            bounds,
            24,
        ),
        NativePetPosition { x: 320, y: 410 }
    );
    assert_eq!(
        native_pet_window_anchor_position_for_bounds(
            active_window_rect,
            window_size,
            NativePetWindowAnchorEdge::Right,
            NativePetWindowAnchorReveal::Head,
            bounds,
            24,
        ),
        NativePetPosition { x: 1040, y: 410 }
    );
    assert_eq!(
        native_pet_window_anchor_position_for_bounds(
            active_window_rect,
            window_size,
            NativePetWindowAnchorEdge::Top,
            NativePetWindowAnchorReveal::Head,
            bounds,
            24,
        ),
        NativePetPosition { x: 680, y: 140 }
    );
    assert_eq!(
        native_pet_window_anchor_position_for_bounds(
            active_window_rect,
            window_size,
            NativePetWindowAnchorEdge::Bottom,
            NativePetWindowAnchorReveal::Head,
            bounds,
            24,
        ),
        NativePetPosition { x: 680, y: 680 }
    );
}

#[test]
fn window_anchor_clamps_pet_window_inside_monitor_workarea() {
    let active_window_rect = NativePetLogicalRect::new(20, 30, 320, 220);
    let window_size = NativePetLogicalSize::new(240, 180);
    let bounds = NativePetLogicalRect::new(0, 0, 1920, 1040);

    assert_eq!(
        native_pet_window_anchor_position_for_bounds(
            active_window_rect,
            window_size,
            NativePetWindowAnchorEdge::Left,
            NativePetWindowAnchorReveal::Head,
            bounds,
            24,
        ),
        NativePetPosition { x: 24, y: 50 }
    );
    assert_eq!(
        native_pet_window_anchor_position_for_bounds(
            active_window_rect,
            window_size,
            NativePetWindowAnchorEdge::Top,
            NativePetWindowAnchorReveal::Head,
            bounds,
            24,
        ),
        NativePetPosition { x: 60, y: 24 }
    );
}

#[test]
fn auto_window_anchor_edge_prefers_nearest_edge_with_enough_reveal_room() {
    let window_size = NativePetLogicalSize::new(240, 180);
    let bounds = NativePetLogicalRect::new(0, 0, 1920, 1040);

    assert_eq!(
        native_pet_window_anchor_position_for_bounds(
            NativePetLogicalRect::new(40, 200, 800, 600),
            window_size,
            NativePetWindowAnchorEdge::Auto,
            NativePetWindowAnchorReveal::Head,
            bounds,
            24,
        ),
        NativePetPosition { x: 320, y: 140 }
    );
    assert_eq!(
        native_pet_window_anchor_position_for_bounds(
            NativePetLogicalRect::new(980, 200, 800, 600),
            window_size,
            NativePetWindowAnchorEdge::Auto,
            NativePetWindowAnchorReveal::Head,
            bounds,
            24,
        ),
        NativePetPosition { x: 1620, y: 410 }
    );
    assert_eq!(
        native_pet_window_anchor_position_for_bounds(
            NativePetLogicalRect::new(400, 40, 800, 600),
            window_size,
            NativePetWindowAnchorEdge::Auto,
            NativePetWindowAnchorReveal::Head,
            bounds,
            24,
        ),
        NativePetPosition { x: 320, y: 250 }
    );
    assert_eq!(
        native_pet_window_anchor_position_for_bounds(
            NativePetLogicalRect::new(400, 320, 800, 600),
            window_size,
            NativePetWindowAnchorEdge::Auto,
            NativePetWindowAnchorReveal::Head,
            bounds,
            24,
        ),
        NativePetPosition { x: 680, y: 800 }
    );
}

#[test]
fn auto_window_anchor_edge_handles_body_fit_and_reveal_room_constraints() {
    let window_size = NativePetLogicalSize::new(240, 180);
    let cases = [
        (
            NativePetLogicalRect::new(400, 120, 120, 600),
            NativePetLogicalRect::new(0, 0, 1920, 1040),
            NativePetPosition { x: 320, y: 330 },
        ),
        (
            NativePetLogicalRect::new(120, 300, 800, 80),
            NativePetLogicalRect::new(0, 0, 1920, 1040),
            NativePetPosition { x: 400, y: 240 },
        ),
        (
            NativePetLogicalRect::new(0, 0, 320, 260),
            NativePetLogicalRect::new(0, 0, 320, 260),
            NativePetPosition { x: 24, y: 40 },
        ),
    ];

    for (active_window_rect, bounds, expected) in cases {
        assert_eq!(
            native_pet_window_anchor_position_for_bounds(
                active_window_rect,
                window_size,
                NativePetWindowAnchorEdge::Auto,
                NativePetWindowAnchorReveal::Head,
                bounds,
                24,
            ),
            expected
        );
    }
}
