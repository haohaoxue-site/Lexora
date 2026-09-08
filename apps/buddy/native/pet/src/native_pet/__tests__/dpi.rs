use super::NativePetScaleFactor;
use crate::native_pet::coordinates::NativePetLogicalRect;

#[test]
fn converts_negative_logical_rect_to_physical_pixels() {
    let scale_factor = NativePetScaleFactor::new(1.25);
    let rect = scale_factor.logical_rect_to_physical(NativePetLogicalRect::new(-320, 40, 200, 120));

    assert_eq!(rect.x, -400);
    assert_eq!(rect.y, 50);
    assert_eq!(rect.width, 250);
    assert_eq!(rect.height, 150);
}

#[test]
fn normalizes_invalid_scale_factor_to_one() {
    assert_eq!(NativePetScaleFactor::new(0.0).value, 1.0);
    assert_eq!(NativePetScaleFactor::new(f64::NAN).value, 1.0);
}
