/// Stage 1 standardizes native pet drag input on GTK/GDK logical pixels.
///
/// `EventButton::root`, `EventMotion::root`, `Monitor::geometry`, `gtk::Window::move_`, and
/// gtk-layer-shell margins are all treated as the same logical coordinate space for now. Mixed
/// DPI and physical-pixel transforms will be layered on top of this module in a later phase.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum NativePetCoordinateSpace {
    GtkLogicalPixels,
}

impl NativePetCoordinateSpace {
    pub(super) fn label(self) -> &'static str {
        match self {
            Self::GtkLogicalPixels => "gtk-logical-pixels",
        }
    }
}

pub(super) const NATIVE_PET_COORDINATE_SPACE: NativePetCoordinateSpace =
    NativePetCoordinateSpace::GtkLogicalPixels;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct NativePetPosition {
    pub(super) x: i32,
    pub(super) y: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct NativePetLogicalSize {
    pub(super) width: i32,
    pub(super) height: i32,
}

impl NativePetLogicalSize {
    pub(super) fn new(width: i32, height: i32) -> Self {
        Self {
            width: width.max(0),
            height: height.max(0),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct NativePetLogicalRect {
    pub(super) x: i32,
    pub(super) y: i32,
    pub(super) width: i32,
    pub(super) height: i32,
}

impl NativePetLogicalRect {
    pub(super) fn new(x: i32, y: i32, width: i32, height: i32) -> Self {
        Self {
            x,
            y,
            width: width.max(0),
            height: height.max(0),
        }
    }

    pub(super) fn right(self) -> i32 {
        self.x + self.width
    }

    pub(super) fn bottom(self) -> i32 {
        self.y + self.height
    }

    pub(super) fn contains_point(self, point: NativePetLogicalPoint) -> bool {
        point.x >= f64::from(self.x)
            && point.x < f64::from(self.right())
            && point.y >= f64::from(self.y)
            && point.y < f64::from(self.bottom())
    }

    pub(super) fn center(self) -> NativePetLogicalPoint {
        NativePetLogicalPoint::new(
            f64::from(self.x) + f64::from(self.width) * 0.5,
            f64::from(self.y) + f64::from(self.height) * 0.5,
        )
    }

    pub(super) fn intersection_area(self, other: Self) -> i64 {
        let overlap_left = self.x.max(other.x);
        let overlap_top = self.y.max(other.y);
        let overlap_right = self.right().min(other.right());
        let overlap_bottom = self.bottom().min(other.bottom());
        let overlap_width = (overlap_right - overlap_left).max(0);
        let overlap_height = (overlap_bottom - overlap_top).max(0);

        i64::from(overlap_width) * i64::from(overlap_height)
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(super) struct NativePetLogicalPoint {
    pub(super) x: f64,
    pub(super) y: f64,
}

impl NativePetLogicalPoint {
    pub(super) fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }

    pub(super) fn from_position(position: NativePetPosition) -> Self {
        Self::new(f64::from(position.x), f64::from(position.y))
    }

    pub(super) fn distance_to(self, other: Self) -> f64 {
        (self.x - other.x).hypot(self.y - other.y)
    }

    pub(super) fn round_to_window_position(self) -> NativePetPosition {
        NativePetPosition {
            x: self.x.round() as i32,
            y: self.y.round() as i32,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub(super) struct NativePetLogicalOffset {
    pub(super) x: f64,
    pub(super) y: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub(super) struct NativePetLogicalVelocity {
    pub(super) x: f64,
    pub(super) y: f64,
}

impl NativePetLogicalVelocity {
    pub(super) fn speed(self) -> f64 {
        self.x.hypot(self.y)
    }

    pub(super) fn scaled(self, factor: f64) -> Self {
        Self {
            x: self.x * factor,
            y: self.y * factor,
        }
    }

    pub(super) fn clamp_speed(self, max_speed: f64) -> Self {
        let speed = self.speed();
        if speed <= max_speed || speed == 0.0 {
            return self;
        }

        self.scaled(max_speed / speed)
    }
}

pub(super) fn native_pet_cursor_position(root_x: f64, root_y: f64) -> NativePetLogicalPoint {
    NativePetLogicalPoint::new(root_x, root_y)
}

pub(super) fn native_pet_grab_offset(
    window_position: NativePetPosition,
    cursor_position: NativePetLogicalPoint,
) -> NativePetLogicalOffset {
    NativePetLogicalOffset {
        x: cursor_position.x - f64::from(window_position.x),
        y: cursor_position.y - f64::from(window_position.y),
    }
}

pub(super) fn native_pet_position_from_cursor_offset(
    cursor_position: NativePetLogicalPoint,
    grab_offset: NativePetLogicalOffset,
) -> NativePetPosition {
    NativePetPosition {
        x: (cursor_position.x - grab_offset.x).round() as i32,
        y: (cursor_position.y - grab_offset.y).round() as i32,
    }
}

pub(super) fn native_pet_window_rect(
    position: NativePetPosition,
    size: NativePetLogicalSize,
) -> NativePetLogicalRect {
    NativePetLogicalRect::new(position.x, position.y, size.width, size.height)
}

#[cfg(test)]
mod tests {
    use super::{
        native_pet_grab_offset, native_pet_position_from_cursor_offset, native_pet_window_rect,
        NativePetCoordinateSpace, NativePetLogicalPoint, NativePetLogicalRect,
        NativePetLogicalSize, NativePetPosition, NATIVE_PET_COORDINATE_SPACE,
    };

    #[test]
    fn uses_gtk_logical_pixels_for_stage_one_drag_coordinates() {
        assert_eq!(
            NATIVE_PET_COORDINATE_SPACE,
            NativePetCoordinateSpace::GtkLogicalPixels
        );
    }

    #[test]
    fn preserves_grab_offset_from_window_origin() {
        let offset = native_pet_grab_offset(
            NativePetPosition { x: 200, y: 300 },
            NativePetLogicalPoint::new(212.4, 295.2),
        );

        assert!((offset.x - 12.4).abs() < 1e-9);
        assert!((offset.y + 4.8).abs() < 1e-9);
    }

    #[test]
    fn maps_window_position_from_cursor_minus_grab_offset() {
        let position = native_pet_position_from_cursor_offset(
            NativePetLogicalPoint::new(1012.4, 995.2),
            native_pet_grab_offset(
                NativePetPosition { x: 200, y: 300 },
                NativePetLogicalPoint::new(1000.0, 1000.0),
            ),
        );

        assert_eq!(position.x, 212);
        assert_eq!(position.y, 295);
    }

    #[test]
    fn keeps_negative_logical_coordinates_when_mapping_window_origin() {
        let position = native_pet_position_from_cursor_offset(
            NativePetLogicalPoint::new(-200.0, 144.0),
            native_pet_grab_offset(
                NativePetPosition { x: -240, y: 120 },
                NativePetLogicalPoint::new(-220.0, 132.0),
            ),
        );

        assert_eq!(position, NativePetPosition { x: -220, y: 132 });
    }

    #[test]
    fn rounds_logical_point_back_to_window_position() {
        let position = NativePetLogicalPoint::new(120.4, -99.6).round_to_window_position();
        assert_eq!(position, NativePetPosition { x: 120, y: -100 });
    }

    #[test]
    fn maps_window_rect_from_position_and_size() {
        let rect = native_pet_window_rect(
            NativePetPosition { x: -240, y: 80 },
            NativePetLogicalSize::new(320, 180),
        );

        assert_eq!(rect, NativePetLogicalRect::new(-240, 80, 320, 180));
    }

    #[test]
    fn computes_logical_rect_intersection_for_negative_coordinates() {
        let left = NativePetLogicalRect::new(-1920, 0, 1920, 1080);
        let window = NativePetLogicalRect::new(-220, 40, 240, 180);

        assert_eq!(left.intersection_area(window), 220_i64 * 180_i64);
    }
}
