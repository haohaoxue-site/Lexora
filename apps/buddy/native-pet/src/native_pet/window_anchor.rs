use super::{
    coordinates::{NativePetLogicalRect, NativePetLogicalSize, NativePetPosition},
    process::{NativePetWalkEdge, NativePetWindowAnchorEdge, NativePetWindowAnchorReveal},
};

pub(super) fn native_pet_window_anchor_position_for_bounds(
    active_window_rect: NativePetLogicalRect,
    window_size: NativePetLogicalSize,
    edge: NativePetWindowAnchorEdge,
    reveal: NativePetWindowAnchorReveal,
    bounds: NativePetLogicalRect,
    margin_logical_px: i32,
) -> NativePetPosition {
    let margin = margin_logical_px.max(0);
    let edge = native_pet_resolve_window_anchor_edge(
        active_window_rect,
        window_size,
        edge,
        reveal,
        bounds,
        margin,
    );
    let min_x = bounds.x + margin;
    let min_y = bounds.y + margin;
    let max_x = (bounds.right() - window_size.width - margin).max(min_x);
    let max_y = (bounds.bottom() - window_size.height - margin).max(min_y);
    let reveal_extent = native_pet_window_anchor_reveal_extent(window_size, edge, reveal);

    let requested = match edge {
        NativePetWalkEdge::Left => NativePetPosition {
            x: active_window_rect.x - reveal_extent,
            y: active_window_rect.y + ((active_window_rect.height - window_size.height) / 2),
        },
        NativePetWalkEdge::Right => NativePetPosition {
            x: active_window_rect.right() - window_size.width + reveal_extent,
            y: active_window_rect.y + ((active_window_rect.height - window_size.height) / 2),
        },
        NativePetWalkEdge::Top => NativePetPosition {
            x: active_window_rect.x + ((active_window_rect.width - window_size.width) / 2),
            y: active_window_rect.y - reveal_extent,
        },
        NativePetWalkEdge::Bottom => NativePetPosition {
            x: active_window_rect.x + ((active_window_rect.width - window_size.width) / 2),
            y: active_window_rect.bottom() - window_size.height + reveal_extent,
        },
    };

    NativePetPosition {
        x: requested.x.clamp(min_x, max_x),
        y: requested.y.clamp(min_y, max_y),
    }
}

pub(super) fn native_pet_explicit_window_anchor_edge_can_reveal_and_hide_body(
    active_window_rect: NativePetLogicalRect,
    window_size: NativePetLogicalSize,
    edge: NativePetWindowAnchorEdge,
    reveal: NativePetWindowAnchorReveal,
    bounds: NativePetLogicalRect,
    margin_logical_px: i32,
) -> bool {
    let edge = match edge {
        NativePetWindowAnchorEdge::Auto => return true,
        NativePetWindowAnchorEdge::Left => NativePetWalkEdge::Left,
        NativePetWindowAnchorEdge::Right => NativePetWalkEdge::Right,
        NativePetWindowAnchorEdge::Top => NativePetWalkEdge::Top,
        NativePetWindowAnchorEdge::Bottom => NativePetWalkEdge::Bottom,
    };

    native_pet_window_anchor_edge_can_reveal_and_hide_body(
        active_window_rect,
        window_size,
        edge,
        reveal,
        bounds,
        margin_logical_px.max(0),
    )
}

fn native_pet_resolve_window_anchor_edge(
    active_window_rect: NativePetLogicalRect,
    window_size: NativePetLogicalSize,
    edge: NativePetWindowAnchorEdge,
    reveal: NativePetWindowAnchorReveal,
    bounds: NativePetLogicalRect,
    margin_logical_px: i32,
) -> NativePetWalkEdge {
    match edge {
        NativePetWindowAnchorEdge::Left => NativePetWalkEdge::Left,
        NativePetWindowAnchorEdge::Right => NativePetWalkEdge::Right,
        NativePetWindowAnchorEdge::Top => NativePetWalkEdge::Top,
        NativePetWindowAnchorEdge::Bottom => NativePetWalkEdge::Bottom,
        NativePetWindowAnchorEdge::Auto => native_pet_auto_window_anchor_edge(
            active_window_rect,
            window_size,
            reveal,
            bounds,
            margin_logical_px,
        ),
    }
}

fn native_pet_auto_window_anchor_edge(
    active_window_rect: NativePetLogicalRect,
    window_size: NativePetLogicalSize,
    reveal: NativePetWindowAnchorReveal,
    bounds: NativePetLogicalRect,
    margin_logical_px: i32,
) -> NativePetWalkEdge {
    let margin = margin_logical_px.max(0);
    let nearest_edges =
        native_pet_window_anchor_edges_by_workarea_distance(active_window_rect, bounds);
    nearest_edges
        .iter()
        .copied()
        .find(|edge| {
            native_pet_window_anchor_edge_can_reveal_and_hide_body(
                active_window_rect,
                window_size,
                *edge,
                reveal,
                bounds,
                margin,
            )
        })
        .unwrap_or_else(|| native_pet_nearest_window_anchor_edge(active_window_rect, bounds))
}

fn native_pet_window_anchor_edge_can_reveal_and_hide_body(
    active_window_rect: NativePetLogicalRect,
    window_size: NativePetLogicalSize,
    edge: NativePetWalkEdge,
    reveal: NativePetWindowAnchorReveal,
    bounds: NativePetLogicalRect,
    margin_logical_px: i32,
) -> bool {
    native_pet_window_anchor_edge_has_reveal_room(
        active_window_rect,
        window_size,
        edge,
        reveal,
        bounds,
        margin_logical_px,
    ) && native_pet_window_anchor_edge_can_hide_body(active_window_rect, window_size, edge)
}

fn native_pet_window_anchor_edge_can_hide_body(
    active_window_rect: NativePetLogicalRect,
    window_size: NativePetLogicalSize,
    edge: NativePetWalkEdge,
) -> bool {
    match edge {
        NativePetWalkEdge::Left | NativePetWalkEdge::Right => {
            active_window_rect.height >= window_size.height
        }
        NativePetWalkEdge::Top | NativePetWalkEdge::Bottom => {
            active_window_rect.width >= window_size.width
        }
    }
}

fn native_pet_nearest_window_anchor_edge(
    active_window_rect: NativePetLogicalRect,
    bounds: NativePetLogicalRect,
) -> NativePetWalkEdge {
    native_pet_window_anchor_edges_by_workarea_distance(active_window_rect, bounds)
        .into_iter()
        .next()
        .unwrap_or(NativePetWalkEdge::Left)
}

fn native_pet_window_anchor_edges_by_workarea_distance(
    active_window_rect: NativePetLogicalRect,
    bounds: NativePetLogicalRect,
) -> [NativePetWalkEdge; 4] {
    let mut edges = [
        (
            active_window_rect.x.saturating_sub(bounds.x),
            NativePetWalkEdge::Left,
        ),
        (
            active_window_rect.y.saturating_sub(bounds.y),
            NativePetWalkEdge::Top,
        ),
        (
            bounds.right().saturating_sub(active_window_rect.right()),
            NativePetWalkEdge::Right,
        ),
        (
            bounds.bottom().saturating_sub(active_window_rect.bottom()),
            NativePetWalkEdge::Bottom,
        ),
    ];
    edges.sort_by_key(|(distance, edge)| (*distance, native_pet_window_anchor_edge_order(*edge)));
    edges.map(|(_, edge)| edge)
}

fn native_pet_window_anchor_edge_order(edge: NativePetWalkEdge) -> u8 {
    match edge {
        NativePetWalkEdge::Left => 0,
        NativePetWalkEdge::Top => 1,
        NativePetWalkEdge::Right => 2,
        NativePetWalkEdge::Bottom => 3,
    }
}

fn native_pet_window_anchor_edge_has_reveal_room(
    active_window_rect: NativePetLogicalRect,
    window_size: NativePetLogicalSize,
    edge: NativePetWalkEdge,
    reveal: NativePetWindowAnchorReveal,
    bounds: NativePetLogicalRect,
    margin_logical_px: i32,
) -> bool {
    let reveal_extent = native_pet_window_anchor_reveal_extent(window_size, edge, reveal);
    match edge {
        NativePetWalkEdge::Left => {
            active_window_rect.x - reveal_extent >= bounds.x + margin_logical_px
        }
        NativePetWalkEdge::Right => {
            active_window_rect.right() + reveal_extent <= bounds.right() - margin_logical_px
        }
        NativePetWalkEdge::Top => {
            active_window_rect.y - reveal_extent >= bounds.y + margin_logical_px
        }
        NativePetWalkEdge::Bottom => {
            active_window_rect.bottom() + reveal_extent <= bounds.bottom() - margin_logical_px
        }
    }
}

fn native_pet_window_anchor_reveal_extent(
    window_size: NativePetLogicalSize,
    edge: NativePetWalkEdge,
    reveal: NativePetWindowAnchorReveal,
) -> i32 {
    match reveal {
        NativePetWindowAnchorReveal::Head => match edge {
            NativePetWalkEdge::Left | NativePetWalkEdge::Right => (window_size.width / 3).max(1),
            NativePetWalkEdge::Top | NativePetWalkEdge::Bottom => (window_size.height / 3).max(1),
        },
    }
}

#[cfg(test)]
mod tests {
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
}
