use super::{native_pet_clamped_dt_seconds, NativePetInertiaState, NativePetPhysicsPhase};
use crate::native_pet::{
    coordinates::{NativePetLogicalVelocity, NativePetPosition},
    physics_params::NativePetPhysicsParams,
};

#[test]
fn invalid_release_velocity_skips_inertia() {
    let params = NativePetPhysicsParams::default();
    let cases = [
        (
            "below total speed threshold",
            NativePetLogicalVelocity { x: 300.0, y: 0.0 },
        ),
        (
            "below horizontal speed threshold",
            NativePetLogicalVelocity { x: 40.0, y: -900.0 },
        ),
        (
            "vertical-dominant release",
            NativePetLogicalVelocity {
                x: 400.0,
                y: -900.0,
            },
        ),
    ];

    for (label, velocity) in cases {
        let inertia = NativePetInertiaState::from_release(
            NativePetPosition { x: 100, y: 200 },
            velocity,
            &params,
        );

        assert!(inertia.is_none(), "inertia should be skipped: {label}");
    }
}

#[test]
fn high_speed_release_enters_inertia() {
    let params = NativePetPhysicsParams::default();
    let inertia = NativePetInertiaState::from_release(
        NativePetPosition { x: 100, y: 200 },
        NativePetLogicalVelocity {
            x: 600.0,
            y: -200.0,
        },
        &params,
    )
    .expect("high speed release should enter inertia");

    assert_eq!(
        inertia.velocity(),
        NativePetLogicalVelocity {
            x: 600.0,
            y: -200.0
        }
    );
}

#[test]
fn non_finite_frame_delta_keeps_inertia_at_current_position() {
    let params = NativePetPhysicsParams::default();
    let mut inertia = NativePetInertiaState::from_release(
        NativePetPosition { x: 100, y: 200 },
        NativePetLogicalVelocity { x: 600.0, y: 0.0 },
        &params,
    )
    .expect("high speed release should enter inertia");

    let step = inertia.step(f64::NAN, &params, |position| position);

    assert_eq!(step.position, NativePetPosition { x: 100, y: 200 });
    assert_eq!(step.clamped_dt_seconds, 0.0);
}

#[test]
fn clamps_dt_before_advancing_inertia() {
    let params = NativePetPhysicsParams::default();
    let mut inertia = NativePetInertiaState::from_release(
        NativePetPosition { x: 100, y: 200 },
        NativePetLogicalVelocity { x: 600.0, y: 0.0 },
        &params,
    )
    .expect("release should enter inertia");

    let step = inertia.step(0.5, &params, |position| position);

    assert_eq!(step.clamped_dt_seconds, params.max_dt_seconds);
    assert!(step.position.x < 100 + (params.max_velocity_logical_px_per_s * 0.5) as i32);
}

#[test]
fn damping_reduces_velocity_every_step() {
    let params = NativePetPhysicsParams::default();
    let mut inertia = NativePetInertiaState::from_release(
        NativePetPosition { x: 100, y: 200 },
        NativePetLogicalVelocity { x: 900.0, y: 0.0 },
        &params,
    )
    .expect("release should enter inertia");

    let first = inertia.step(0.016, &params, |position| position);
    let second = inertia.step(0.016, &params, |position| position);

    assert!(first.velocity.x < 900.0);
    assert!(second.velocity.x < first.velocity.x);
}

#[test]
fn position_clamp_ends_inertia_without_flying_offscreen() {
    let params = NativePetPhysicsParams::default();
    let mut inertia = NativePetInertiaState::from_release(
        NativePetPosition { x: 100, y: 200 },
        NativePetLogicalVelocity { x: 1600.0, y: 0.0 },
        &params,
    )
    .expect("release should enter inertia");

    let step = inertia.step(0.016, &params, |_| NativePetPosition { x: 120, y: 200 });

    assert!(step.hit_position_clamp);
    assert_eq!(step.position, NativePetPosition { x: 120, y: 200 });
    assert_eq!(step.phase, NativePetPhysicsPhase::Idle);
}

#[test]
fn clamps_large_dt_even_without_active_motion() {
    let params = NativePetPhysicsParams::default();
    assert_eq!(
        native_pet_clamped_dt_seconds(1.0, &params),
        params.max_dt_seconds
    );
    assert_eq!(native_pet_clamped_dt_seconds(-1.0, &params), 0.0);
}
