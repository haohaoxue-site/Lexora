use super::*;

#[test]
fn clamps_native_pet_frame_dt_seconds_for_inertia_updates() {
    let params = NativePetPhysicsParams::default();
    assert_eq!(native_pet_frame_dt_seconds(None, 1_000_000, &params), 0.0);
    assert_eq!(
        native_pet_frame_dt_seconds(Some(1_000_000), 51_000_000, &params),
        params.max_dt_seconds
    );
    assert_eq!(
        native_pet_frame_dt_seconds(Some(1_000_000), 1_016_000, &params),
        0.016
    );
}
