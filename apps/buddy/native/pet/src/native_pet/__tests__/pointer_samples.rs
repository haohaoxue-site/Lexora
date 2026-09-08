use super::{NativePetPointerSample, NativePetPointerSamples};
use crate::native_pet::{
    coordinates::NativePetLogicalPoint, physics_params::NativePetPhysicsParams,
};

#[test]
fn computes_release_velocity_from_recent_pointer_window() {
    let params = NativePetPhysicsParams::default();
    let mut samples = NativePetPointerSamples::new(NativePetPointerSample {
        cursor_position: NativePetLogicalPoint::new(100.0, 50.0),
        time_ms: 0,
    });
    samples.push(NativePetPointerSample {
        cursor_position: NativePetLogicalPoint::new(124.0, 62.0),
        time_ms: 20,
    });
    samples.push(NativePetPointerSample {
        cursor_position: NativePetLogicalPoint::new(160.0, 80.0),
        time_ms: 40,
    });

    let velocity = samples.release_velocity(&params);
    assert_eq!(velocity.x.round() as i32, 1500);
    assert_eq!(velocity.y.round() as i32, 750);
}

#[test]
fn returns_zero_velocity_when_timestamps_do_not_advance() {
    let params = NativePetPhysicsParams::default();
    let mut samples = NativePetPointerSamples::new(NativePetPointerSample {
        cursor_position: NativePetLogicalPoint::new(100.0, 100.0),
        time_ms: 5,
    });
    samples.push(NativePetPointerSample {
        cursor_position: NativePetLogicalPoint::new(120.0, 120.0),
        time_ms: 5,
    });

    let velocity = samples.release_velocity(&params);
    assert_eq!(velocity.x, 0.0);
    assert_eq!(velocity.y, 0.0);
}

#[test]
fn ignores_outlier_jump_when_estimating_release_velocity() {
    let params = NativePetPhysicsParams::default();
    let mut samples = NativePetPointerSamples::new(NativePetPointerSample {
        cursor_position: NativePetLogicalPoint::new(100.0, 100.0),
        time_ms: 0,
    });
    samples.push(NativePetPointerSample {
        cursor_position: NativePetLogicalPoint::new(112.0, 106.0),
        time_ms: 16,
    });
    samples.push(NativePetPointerSample {
        cursor_position: NativePetLogicalPoint::new(900.0, 700.0),
        time_ms: 24,
    });
    samples.push(NativePetPointerSample {
        cursor_position: NativePetLogicalPoint::new(124.0, 112.0),
        time_ms: 32,
    });

    let velocity = samples.release_velocity(&params);
    assert!(velocity.x > 500.0);
    assert!(velocity.x < params.max_sample_velocity_logical_px_per_s);
    assert!(velocity.y > 200.0);
}

#[test]
fn clamps_release_velocity_to_configured_max_speed() {
    let params = NativePetPhysicsParams::default();
    let mut samples = NativePetPointerSamples::new(NativePetPointerSample {
        cursor_position: NativePetLogicalPoint::new(0.0, 0.0),
        time_ms: 0,
    });
    samples.push(NativePetPointerSample {
        cursor_position: NativePetLogicalPoint::new(160.0, 0.0),
        time_ms: 50,
    });
    samples.push(NativePetPointerSample {
        cursor_position: NativePetLogicalPoint::new(320.0, 0.0),
        time_ms: 100,
    });

    let velocity = samples.release_velocity(&params);
    assert_eq!(
        velocity.speed().round() as i32,
        params.max_velocity_logical_px_per_s.round() as i32
    );
}

#[test]
fn ignores_non_finite_pointer_samples_for_release_velocity() {
    let params = NativePetPhysicsParams::default();
    let mut samples = NativePetPointerSamples::new(NativePetPointerSample {
        cursor_position: NativePetLogicalPoint::new(100.0, 100.0),
        time_ms: 0,
    });
    samples.push(NativePetPointerSample {
        cursor_position: NativePetLogicalPoint::new(f64::NAN, 120.0),
        time_ms: 16,
    });
    samples.push(NativePetPointerSample {
        cursor_position: NativePetLogicalPoint::new(130.0, 100.0),
        time_ms: 32,
    });

    let velocity = samples.release_velocity(&params);

    assert!(velocity.x.is_finite());
    assert_eq!(velocity.y, 0.0);
}
