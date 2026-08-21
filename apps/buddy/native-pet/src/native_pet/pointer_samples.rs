use std::collections::VecDeque;

use super::coordinates::{NativePetLogicalPoint, NativePetLogicalVelocity};
use super::physics_params::NativePetPhysicsParams;

const NATIVE_PET_POINTER_SAMPLE_CAPACITY: usize = 16;

#[derive(Debug, Clone, Copy, PartialEq)]
pub(super) struct NativePetPointerSample {
    pub(super) cursor_position: NativePetLogicalPoint,
    pub(super) time_ms: u64,
}

#[derive(Debug, Clone)]
pub(super) struct NativePetPointerSamples {
    samples: VecDeque<NativePetPointerSample>,
}

impl NativePetPointerSamples {
    pub(super) fn new(initial_sample: NativePetPointerSample) -> Self {
        let mut samples = VecDeque::with_capacity(NATIVE_PET_POINTER_SAMPLE_CAPACITY);
        if initial_sample.cursor_position.is_finite() {
            samples.push_back(initial_sample);
        }
        Self { samples }
    }

    pub(super) fn push(&mut self, sample: NativePetPointerSample) {
        if !sample.cursor_position.is_finite() {
            return;
        }

        if let Some(last) = self.samples.back().copied() {
            if last == sample {
                return;
            }
        }

        if self.samples.len() == NATIVE_PET_POINTER_SAMPLE_CAPACITY {
            self.samples.pop_front();
        }
        self.samples.push_back(sample);
    }

    pub(super) fn release_velocity(
        &self,
        params: &NativePetPhysicsParams,
    ) -> NativePetLogicalVelocity {
        let Some(latest) = self.samples.back().copied() else {
            return NativePetLogicalVelocity::default();
        };

        let mut total_dx = 0.0;
        let mut total_dy = 0.0;
        let mut total_dt_ms = 0_u64;
        let window_start_ms = latest
            .time_ms
            .saturating_sub(params.velocity_sample_window_ms);
        let mut previous_sample = None;

        for sample in self.samples.iter().copied() {
            if sample.time_ms < window_start_ms {
                previous_sample = Some(sample);
                continue;
            }
            let Some(previous) = previous_sample else {
                previous_sample = Some(sample);
                continue;
            };
            previous_sample = Some(sample);

            let segment_dt_ms = sample.time_ms.saturating_sub(previous.time_ms);
            if segment_dt_ms == 0 {
                continue;
            }

            let dx = sample.cursor_position.x - previous.cursor_position.x;
            let dy = sample.cursor_position.y - previous.cursor_position.y;
            if !dx.is_finite() || !dy.is_finite() {
                continue;
            }

            let segment_dt_seconds = segment_dt_ms as f64 / 1000.0;
            let segment_speed = dx.hypot(dy) / segment_dt_seconds;
            if segment_speed > params.max_sample_velocity_logical_px_per_s {
                continue;
            }

            total_dx += dx;
            total_dy += dy;
            total_dt_ms += segment_dt_ms;
        }

        if total_dt_ms == 0 {
            return NativePetLogicalVelocity::default();
        }

        NativePetLogicalVelocity {
            x: total_dx / (total_dt_ms as f64 / 1000.0),
            y: total_dy / (total_dt_ms as f64 / 1000.0),
        }
        .clamp_speed(params.max_velocity_logical_px_per_s)
    }
}

#[cfg(test)]
mod tests {
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
}
