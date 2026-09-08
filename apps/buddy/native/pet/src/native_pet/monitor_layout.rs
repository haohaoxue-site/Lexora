use gdk::prelude::*;

use super::{
    coordinates::{NativePetLogicalPoint, NativePetLogicalRect},
    dpi::{NativePetPhysicalRect, NativePetScaleFactor},
};

#[derive(Debug, Clone, PartialEq)]
pub(super) struct NativePetMonitorInfo {
    pub(super) index: i32,
    pub(super) is_primary: bool,
    pub(super) logical_geometry: NativePetLogicalRect,
    pub(super) logical_workarea: NativePetLogicalRect,
    pub(super) physical_geometry: NativePetPhysicalRect,
    pub(super) physical_workarea: NativePetPhysicalRect,
    pub(super) scale_factor: NativePetScaleFactor,
}

impl NativePetMonitorInfo {
    #[cfg(test)]
    pub(super) fn new_for_tests(
        index: i32,
        logical_geometry: NativePetLogicalRect,
        logical_workarea: NativePetLogicalRect,
        scale_factor: NativePetScaleFactor,
        is_primary: bool,
    ) -> Self {
        Self {
            index,
            is_primary,
            logical_geometry,
            logical_workarea,
            physical_geometry: scale_factor.logical_rect_to_physical(logical_geometry),
            physical_workarea: scale_factor.logical_rect_to_physical(logical_workarea),
            scale_factor,
        }
    }

    pub(super) fn available_bounds(&self) -> NativePetLogicalRect {
        self.logical_workarea
    }
}

#[derive(Debug, Clone, PartialEq)]
pub(super) struct NativePetMonitorLayout {
    monitors: Vec<NativePetMonitorInfo>,
}

impl NativePetMonitorLayout {
    #[cfg(test)]
    pub(super) fn new_for_tests(monitors: Vec<NativePetMonitorInfo>) -> Self {
        Self::from_monitors(monitors).unwrap_or_else(|| Self {
            monitors: Vec::new(),
        })
    }

    pub(super) fn capture() -> Option<Self> {
        let display = gdk::Display::default()?;
        let mut monitors = Vec::new();

        for index in 0..display.n_monitors() {
            let monitor = display.monitor(index)?;
            let logical_geometry = native_pet_gdk_rectangle_to_logical_rect(monitor.geometry());
            let logical_workarea =
                native_pet_nonempty_workarea_rect(monitor.workarea(), logical_geometry);
            let scale_factor =
                NativePetScaleFactor::from_gdk_monitor_scale_factor(monitor.scale_factor());
            monitors.push(NativePetMonitorInfo {
                index,
                is_primary: monitor.is_primary(),
                logical_geometry,
                logical_workarea,
                physical_geometry: scale_factor.logical_rect_to_physical(logical_geometry),
                physical_workarea: scale_factor.logical_rect_to_physical(logical_workarea),
                scale_factor,
            });
        }

        Self::from_monitors(monitors)
    }

    fn from_monitors(mut monitors: Vec<NativePetMonitorInfo>) -> Option<Self> {
        monitors.retain(|monitor| {
            monitor.logical_geometry.width > 0
                && monitor.logical_geometry.height > 0
                && monitor.logical_workarea.width > 0
                && monitor.logical_workarea.height > 0
        });
        (!monitors.is_empty()).then_some(Self { monitors })
    }

    pub(super) fn monitors(&self) -> &[NativePetMonitorInfo] {
        &self.monitors
    }

    pub(super) fn primary_monitor(&self) -> Option<&NativePetMonitorInfo> {
        self.monitors
            .iter()
            .find(|monitor| monitor.is_primary)
            .or_else(|| self.monitors.first())
    }

    pub(super) fn monitor_at_point(
        &self,
        point: NativePetLogicalPoint,
    ) -> Option<&NativePetMonitorInfo> {
        self.monitors
            .iter()
            .find(|monitor| monitor.available_bounds().contains_point(point))
    }

    pub(super) fn nearest_monitor_to_point(
        &self,
        point: NativePetLogicalPoint,
    ) -> Option<&NativePetMonitorInfo> {
        if !point.is_finite() {
            return self.primary_monitor();
        }

        self.monitors.iter().min_by(|left, right| {
            native_pet_distance_sq_to_rect(point, left.available_bounds()).total_cmp(
                &native_pet_distance_sq_to_rect(point, right.available_bounds()),
            )
        })
    }
}

fn native_pet_nonempty_workarea_rect(
    workarea: gdk::Rectangle,
    fallback_geometry: NativePetLogicalRect,
) -> NativePetLogicalRect {
    let rect = native_pet_gdk_rectangle_to_logical_rect(workarea);
    if rect.width <= 0 || rect.height <= 0 {
        fallback_geometry
    } else {
        rect
    }
}

fn native_pet_gdk_rectangle_to_logical_rect(rectangle: gdk::Rectangle) -> NativePetLogicalRect {
    NativePetLogicalRect::new(
        rectangle.x(),
        rectangle.y(),
        rectangle.width(),
        rectangle.height(),
    )
}

fn native_pet_distance_sq_to_rect(point: NativePetLogicalPoint, rect: NativePetLogicalRect) -> f64 {
    let clamped_x = point.x.clamp(f64::from(rect.x), f64::from(rect.right()));
    let clamped_y = point.y.clamp(f64::from(rect.y), f64::from(rect.bottom()));
    let dx = point.x - clamped_x;
    let dy = point.y - clamped_y;

    dx * dx + dy * dy
}

#[cfg(test)]
#[path = "__tests__/monitor_layout.rs"]
mod tests;
