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
#[path = "__tests__/pointer_samples.rs"]
mod tests;
