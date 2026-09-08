use super::{NativePetMonitorInfo, NativePetMonitorLayout};
use crate::native_pet::{
    coordinates::{NativePetLogicalPoint, NativePetLogicalRect},
    dpi::NativePetScaleFactor,
};

fn build_test_layout() -> NativePetMonitorLayout {
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
fn finds_monitor_for_negative_coordinate_point() {
    let layout = build_test_layout();
    let monitor = layout
        .monitor_at_point(NativePetLogicalPoint::new(-400.0, 200.0))
        .expect("point should land on the left monitor");

    assert_eq!(monitor.index, 0);
}

#[test]
fn falls_back_to_nearest_monitor_when_point_is_outside_all_outputs() {
    let layout = build_test_layout();
    let monitor = layout
        .nearest_monitor_to_point(NativePetLogicalPoint::new(4000.0, 100.0))
        .expect("should find nearest monitor");

    assert_eq!(monitor.index, 1);
}

#[test]
fn falls_back_to_primary_monitor_when_point_is_not_finite() {
    let layout = build_test_layout();
    let monitor = layout
        .nearest_monitor_to_point(NativePetLogicalPoint::new(f64::NAN, 100.0))
        .expect("should fall back to primary monitor");

    assert_eq!(monitor.index, 1);
}

#[test]
fn preserves_fractional_scale_factor_metadata_for_runtime_layout() {
    let layout = build_test_layout();
    let primary = layout.primary_monitor().expect("primary monitor");

    assert_eq!(primary.scale_factor.value(), 1.7);
    assert_eq!(primary.physical_workarea.width, 4352);
}

#[test]
fn excludes_zero_sized_output_from_runtime_layout() {
    let layout = NativePetMonitorLayout::new_for_tests(vec![NativePetMonitorInfo::new_for_tests(
        0,
        NativePetLogicalRect::new(0, 0, 0, 0),
        NativePetLogicalRect::new(0, 0, 0, 0),
        NativePetScaleFactor::new(1.0),
        true,
    )]);

    assert!(layout.monitors().is_empty());
}
