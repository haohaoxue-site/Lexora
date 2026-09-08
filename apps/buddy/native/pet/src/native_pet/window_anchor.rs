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
#[path = "__tests__/window_anchor.rs"]
mod tests;
