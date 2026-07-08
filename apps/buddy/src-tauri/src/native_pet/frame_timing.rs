use super::{physics::native_pet_clamped_dt_seconds, physics_params::NativePetPhysicsParams};

const DEFAULT_FRAME_ELAPSED_MS: u64 = 16;
const MAX_FRAME_ELAPSED_MS: u64 = 64;

pub(super) fn native_pet_frame_elapsed_ms(
    previous_frame_time: Option<i64>,
    frame_time: i64,
) -> u64 {
    let Some(previous_frame_time) = previous_frame_time else {
        return DEFAULT_FRAME_ELAPSED_MS;
    };

    ((frame_time - previous_frame_time).max(0) as u64 / 1000).clamp(1, MAX_FRAME_ELAPSED_MS)
}

pub(super) fn native_pet_frame_clock_time_ms(frame_time: i64) -> u64 {
    (frame_time.max(0) as u64) / 1000
}

pub(super) fn native_pet_frame_dt_seconds(
    previous_frame_time: Option<i64>,
    frame_time: i64,
    physics_params: &NativePetPhysicsParams,
) -> f64 {
    let Some(previous_frame_time) = previous_frame_time else {
        return 0.0;
    };

    let raw_dt_seconds = ((frame_time - previous_frame_time).max(0) as f64) / 1_000_000.0;
    native_pet_clamped_dt_seconds(raw_dt_seconds, physics_params)
}

#[cfg(test)]
mod tests {
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
}
