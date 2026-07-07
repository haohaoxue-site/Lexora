use super::coordinates::NativePetLogicalRect;

#[derive(Debug, Clone, Copy, PartialEq)]
pub(super) struct NativePetScaleFactor {
    value: f64,
}

impl NativePetScaleFactor {
    pub(super) fn new(value: f64) -> Self {
        let normalized = if value.is_finite() && value > 0.0 {
            value
        } else {
            1.0
        };

        Self { value: normalized }
    }

    pub(super) fn from_gdk_monitor_scale_factor(scale_factor: i32) -> Self {
        Self::new(f64::from(scale_factor.max(1)))
    }

    #[cfg(test)]
    pub(super) fn value(self) -> f64 {
        self.value
    }

    pub(super) fn logical_to_physical_px(self, logical_px: f64) -> i32 {
        (logical_px * self.value).round() as i32
    }

    pub(super) fn logical_rect_to_physical(
        self,
        rect: NativePetLogicalRect,
    ) -> NativePetPhysicalRect {
        NativePetPhysicalRect {
            x: self.logical_to_physical_px(f64::from(rect.x)),
            y: self.logical_to_physical_px(f64::from(rect.y)),
            width: self.logical_to_physical_px(f64::from(rect.width)),
            height: self.logical_to_physical_px(f64::from(rect.height)),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct NativePetPhysicalRect {
    pub(super) x: i32,
    pub(super) y: i32,
    pub(super) width: i32,
    pub(super) height: i32,
}

#[cfg(test)]
mod tests {
    use super::NativePetScaleFactor;
    use crate::native_pet::coordinates::NativePetLogicalRect;

    #[test]
    fn converts_negative_logical_rect_to_physical_pixels() {
        let scale_factor = NativePetScaleFactor::new(1.25);
        let rect =
            scale_factor.logical_rect_to_physical(NativePetLogicalRect::new(-320, 40, 200, 120));

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
}
