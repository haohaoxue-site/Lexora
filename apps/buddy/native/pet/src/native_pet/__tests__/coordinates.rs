use super::{
    native_pet_grab_offset, native_pet_position_from_cursor_offset, native_pet_round_logical_px,
    NativePetLogicalPoint, NativePetLogicalRect, NativePetPosition,
};

#[test]
fn keeps_negative_logical_coordinates_when_mapping_window_origin() {
    let position = native_pet_position_from_cursor_offset(
        NativePetLogicalPoint::new(-200.0, 144.0),
        native_pet_grab_offset(
            NativePetPosition { x: -240, y: 120 },
            NativePetLogicalPoint::new(-220.0, 132.0),
        ),
    );

    assert_eq!(position, Some(NativePetPosition { x: -220, y: 132 }));
}

#[test]
fn rounds_logical_point_back_to_window_position() {
    let position = NativePetLogicalPoint::new(120.4, -99.6).round_to_window_position();
    assert_eq!(position, Some(NativePetPosition { x: 120, y: -100 }));
}

#[test]
fn rejects_non_finite_cursor_when_mapping_window_origin() {
    let position = native_pet_position_from_cursor_offset(
        NativePetLogicalPoint::new(f64::NAN, 144.0),
        native_pet_grab_offset(
            NativePetPosition { x: -240, y: 120 },
            NativePetLogicalPoint::new(-220.0, 132.0),
        ),
    );

    assert_eq!(position, None);
}

#[test]
fn saturates_extreme_finite_logical_pixels() {
    assert_eq!(
        native_pet_round_logical_px(f64::from(i32::MAX) * 2.0),
        Some(i32::MAX)
    );
    assert_eq!(
        native_pet_round_logical_px(f64::from(i32::MIN) * 2.0),
        Some(i32::MIN)
    );
}

#[test]
fn computes_logical_rect_intersection_for_negative_coordinates() {
    let left = NativePetLogicalRect::new(-1920, 0, 1920, 1080);
    let window = NativePetLogicalRect::new(-220, 40, 240, 180);

    assert_eq!(left.intersection_area(window), 220_i64 * 180_i64);
}
