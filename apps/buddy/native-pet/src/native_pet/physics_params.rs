#[derive(Debug, Clone, Copy, PartialEq)]
pub(super) struct NativePetPhysicsParams {
    pub(super) damping_per_second: f64,
    pub(super) max_dt_seconds: f64,
    pub(super) max_sample_velocity_logical_px_per_s: f64,
    pub(super) max_velocity_logical_px_per_s: f64,
    pub(super) min_inertia_velocity_logical_px_per_s: f64,
    pub(super) stop_velocity_threshold_logical_px_per_s: f64,
    pub(super) velocity_sample_window_ms: u64,
}

pub(super) const NATIVE_PET_PHYSICS_PARAMS: NativePetPhysicsParams = NativePetPhysicsParams {
    damping_per_second: 8.5,
    max_dt_seconds: 0.05,
    max_sample_velocity_logical_px_per_s: 3600.0,
    max_velocity_logical_px_per_s: 1800.0,
    min_inertia_velocity_logical_px_per_s: 380.0,
    stop_velocity_threshold_logical_px_per_s: 45.0,
    velocity_sample_window_ms: 64,
};

impl Default for NativePetPhysicsParams {
    fn default() -> Self {
        NATIVE_PET_PHYSICS_PARAMS
    }
}
