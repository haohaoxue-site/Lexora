use serde::Serialize;

use crate::error::{BuddyError, BuddyResult};

use super::{
    animation::{NativePetAnimationName, NativePetAnimationPlayback, NativePetAnimationSet},
    assets::load_default_pet_animation_set,
    coordinates::{native_pet_cursor_position, NativePetLogicalPoint, NativePetPosition},
    drag_state::{NativePetDragStateMachine, PET_DRAG_START_DISTANCE},
};

const DRAG_REPLAY_SAMPLE_RATE_HZ: u32 = 160;
const DRAG_REPLAY_SAMPLE_COUNT: usize = 96;
const DRAG_REPLAY_MAX_FOLLOW_ERROR_PX: f64 = 0.5;
const DRAG_REPLAY_MIN_ANIMATION_FRAME_CHANGES: usize = 5;

#[derive(Debug, Clone, Copy)]
struct NativePetDragReplaySample {
    root_x: f64,
    root_y: f64,
    time_ms: u64,
}

#[derive(Debug)]
struct NativePetDragReplayResult {
    drag_animation_frame_changes: usize,
    frame_count: usize,
    max_follow_error_px: f64,
    position_commit_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct NativePetDragReplayCheckReport {
    drag_animation_frame_changes: usize,
    frame_count: usize,
    max_follow_error_px: f64,
    ok: bool,
    position_commit_count: usize,
    sample_rate_hz: u32,
}

pub(super) fn create_native_pet_drag_replay_check_report(
) -> BuddyResult<NativePetDragReplayCheckReport> {
    let animations = load_default_pet_animation_set()?;
    let samples = create_default_native_pet_drag_replay_samples();
    let result =
        replay_native_pet_drag(&animations, NativePetPosition { x: 320, y: 240 }, &samples)?;
    let ok = result.max_follow_error_px <= DRAG_REPLAY_MAX_FOLLOW_ERROR_PX
        && result.drag_animation_frame_changes >= DRAG_REPLAY_MIN_ANIMATION_FRAME_CHANGES
        && result.position_commit_count + 1 >= result.frame_count;

    if !ok {
        return Err(BuddyError::Runtime(format!(
            "native pet drag replay failed: max_follow_error_px={:.2}, drag_animation_frame_changes={}, position_commit_count={}, frame_count={}",
            result.max_follow_error_px,
            result.drag_animation_frame_changes,
            result.position_commit_count,
            result.frame_count
        )));
    }

    Ok(NativePetDragReplayCheckReport {
        drag_animation_frame_changes: result.drag_animation_frame_changes,
        frame_count: result.frame_count,
        max_follow_error_px: result.max_follow_error_px,
        ok,
        position_commit_count: result.position_commit_count,
        sample_rate_hz: DRAG_REPLAY_SAMPLE_RATE_HZ,
    })
}

fn replay_native_pet_drag(
    animations: &NativePetAnimationSet,
    origin_position: NativePetPosition,
    samples: &[NativePetDragReplaySample],
) -> BuddyResult<NativePetDragReplayResult> {
    let Some(first_sample) = samples.first().copied() else {
        return Err(BuddyError::Runtime(
            "native pet drag replay requires pointer samples".to_owned(),
        ));
    };

    let Some(first_cursor) = native_pet_cursor_position(first_sample.root_x, first_sample.root_y)
    else {
        return Err(BuddyError::Runtime(
            "native pet drag replay received invalid initial pointer sample".to_owned(),
        ));
    };
    let mut drag_frame =
        NativePetDragStateMachine::begin(origin_position, first_cursor, first_sample.time_ms);
    let mut playback = NativePetAnimationPlayback::new(NativePetAnimationName::Drag);
    let mut window_position = origin_position;
    let mut previous_time_ms = first_sample.time_ms;
    let mut previous_frame_index = animations.frame_index(playback);
    let mut position_commit_count = 0;
    let mut drag_animation_frame_changes = 0;
    let mut max_follow_error_px = 0.0_f64;

    for sample in samples.iter().copied().skip(1) {
        let elapsed_ms = sample.time_ms.saturating_sub(previous_time_ms).max(1);
        previous_time_ms = sample.time_ms;

        let Some(cursor_position) = native_pet_cursor_position(sample.root_x, sample.root_y) else {
            return Err(BuddyError::Runtime(
                "native pet drag replay received invalid pointer sample".to_owned(),
            ));
        };
        drag_frame.record_pointer_sample(cursor_position, sample.time_ms);
        if let Some(update) = drag_frame.take_frame_update() {
            if update.distance >= PET_DRAG_START_DISTANCE {
                playback.set_animation(NativePetAnimationName::Drag);
                window_position = update.position;
                position_commit_count += 1;
            }
        }

        playback.advance(animations, elapsed_ms, NativePetAnimationName::Idle);
        let frame_index = animations.frame_index(playback);
        if frame_index != previous_frame_index {
            drag_animation_frame_changes += 1;
            previous_frame_index = frame_index;
        }

        let Some(expected_position) = NativePetLogicalPoint::new(
            f64::from(origin_position.x) + cursor_position.x - first_cursor.x,
            f64::from(origin_position.y) + cursor_position.y - first_cursor.y,
        )
        .round_to_window_position() else {
            return Err(BuddyError::Runtime(
                "native pet drag replay produced invalid expected position".to_owned(),
            ));
        };
        let follow_error = ((window_position.x - expected_position.x) as f64)
            .hypot((window_position.y - expected_position.y) as f64);
        max_follow_error_px = max_follow_error_px.max(follow_error);
    }

    Ok(NativePetDragReplayResult {
        drag_animation_frame_changes,
        frame_count: samples.len(),
        max_follow_error_px,
        position_commit_count,
    })
}

fn create_default_native_pet_drag_replay_samples() -> Vec<NativePetDragReplaySample> {
    (0..DRAG_REPLAY_SAMPLE_COUNT)
        .map(|index| NativePetDragReplaySample {
            root_x: 1000.0 + index as f64 * 6.0,
            root_y: 800.0 + index as f64 * 3.0,
            time_ms: ((index as f64 * 1000.0) / DRAG_REPLAY_SAMPLE_RATE_HZ as f64).round() as u64,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{create_default_native_pet_drag_replay_samples, replay_native_pet_drag};
    use crate::native_pet::{
        assets::load_default_pet_animation_set, coordinates::NativePetPosition,
    };

    #[test]
    fn replays_high_refresh_drag_without_lagging_behind_pointer() {
        let animations = load_default_pet_animation_set().expect("load animations");
        let samples = create_default_native_pet_drag_replay_samples();
        let result =
            replay_native_pet_drag(&animations, NativePetPosition { x: 320, y: 240 }, &samples)
                .expect("replay drag");

        assert_eq!(result.frame_count, 96);
        assert_eq!(result.position_commit_count, 95);
        assert!(result.max_follow_error_px <= 0.5);
        assert!(result.drag_animation_frame_changes >= 5);
    }
}
