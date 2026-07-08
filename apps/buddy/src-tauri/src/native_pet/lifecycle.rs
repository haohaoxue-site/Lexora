mod presence;
mod transitions;

pub(super) use presence::{
    native_pet_animation_for_lifecycle, native_pet_idle_lifecycle_elapsed_ms,
    native_pet_initial_idle_presence_schedule_seed, native_pet_initial_throw_outcome_seed,
    native_pet_next_idle_presence_schedule_seed, native_pet_next_throw_outcome_seed,
    native_pet_should_apply_lifecycle_animation, native_pet_should_rotate_idle_presence_schedule,
    native_pet_task_presence_animation, native_pet_task_presence_elapsed_ms,
};
pub(super) use transitions::{
    native_pet_animation_after_drag_release, native_pet_animation_after_throw_runout,
    native_pet_animation_for_hover_state, native_pet_animation_for_velocity,
    native_pet_fallen_get_up_animation, native_pet_initial_animation,
    native_pet_requested_animation_after_pointer_interaction,
    native_pet_requested_animation_for_control_animation,
    native_pet_should_block_pointer_interaction, native_pet_should_keep_scripted_action_playing,
};

#[cfg(test)]
use transitions::native_pet_should_keep_fallen_waiting;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::native_pet::{
        animation::{native_pet_requested_animation_fallback, NativePetAnimationName},
        assets::load_default_pet_animation_set,
        coordinates::NativePetLogicalVelocity,
        geometry::NativePetFacing,
    };

    #[test]
    fn starts_with_wake_transition_before_idle_loop() {
        assert_eq!(native_pet_initial_animation(), NativePetAnimationName::Wake);
        assert_eq!(
            native_pet_requested_animation_fallback(
                &load_default_pet_animation_set().expect("native pet animation manifest loads"),
                NativePetAnimationName::Wake,
            ),
            NativePetAnimationName::Idle
        );
    }

    #[test]
    fn drag_release_without_inertia_returns_idle_after_confirmed_drag() {
        assert_eq!(
            native_pet_animation_after_drag_release(true, None, NativePetFacing::Left,),
            NativePetAnimationName::Idle
        );
        assert_eq!(
            native_pet_animation_after_drag_release(true, None, NativePetFacing::Right,),
            NativePetAnimationName::Idle
        );
        assert_eq!(
            native_pet_animation_after_drag_release(false, None, NativePetFacing::Left,),
            NativePetAnimationName::Tap
        );
    }

    #[test]
    fn fallen_idle_click_maps_to_directional_get_up_animation() {
        assert_eq!(
            native_pet_fallen_get_up_animation(NativePetAnimationName::FallenIdleLeft),
            Some(NativePetAnimationName::FallenGetUpLeft)
        );
        assert_eq!(
            native_pet_fallen_get_up_animation(NativePetAnimationName::FallenIdleRight),
            Some(NativePetAnimationName::FallenGetUpRight)
        );
        assert_eq!(
            native_pet_fallen_get_up_animation(NativePetAnimationName::Idle),
            None
        );
    }

    #[test]
    fn control_messages_do_not_interrupt_scripted_action_states() {
        assert!(native_pet_should_keep_fallen_waiting(
            NativePetAnimationName::FallenIdleLeft
        ));
        assert!(native_pet_should_keep_fallen_waiting(
            NativePetAnimationName::FallenIdleRight
        ));
        assert!(!native_pet_should_keep_fallen_waiting(
            NativePetAnimationName::TripFallLeft
        ));
        assert!(!native_pet_should_keep_fallen_waiting(
            NativePetAnimationName::Idle
        ));
        assert!(native_pet_should_keep_scripted_action_playing(
            NativePetAnimationName::TripFallLeft
        ));
        assert!(native_pet_should_keep_scripted_action_playing(
            NativePetAnimationName::FallenIdleRight
        ));
        assert!(native_pet_should_keep_scripted_action_playing(
            NativePetAnimationName::FallenGetUpLeft
        ));
        assert!(native_pet_should_keep_scripted_action_playing(
            NativePetAnimationName::StumbleRecoverRight
        ));
        assert!(!native_pet_should_keep_scripted_action_playing(
            NativePetAnimationName::Celebrate
        ));
    }

    #[test]
    fn scripted_action_blocks_drag_until_fallen_waiting_can_be_clicked() {
        assert!(native_pet_should_block_pointer_interaction(
            NativePetAnimationName::TripFallLeft
        ));
        assert!(native_pet_should_block_pointer_interaction(
            NativePetAnimationName::FallenGetUpRight
        ));
        assert!(native_pet_should_block_pointer_interaction(
            NativePetAnimationName::StumbleRecoverLeft
        ));
        assert!(!native_pet_should_block_pointer_interaction(
            NativePetAnimationName::FallenIdleLeft
        ));
        assert!(!native_pet_should_block_pointer_interaction(
            NativePetAnimationName::Idle
        ));
    }

    #[test]
    fn keeps_directional_inertia_animation_after_fast_drag_release() {
        assert_eq!(
            native_pet_animation_after_drag_release(
                true,
                Some(NativePetLogicalVelocity { x: 120.0, y: 0.0 }),
                NativePetFacing::Left,
            ),
            NativePetAnimationName::RunRight
        );
    }

    #[test]
    fn thrown_runout_resolves_to_idle_trip_or_stumble() {
        assert_eq!(
            native_pet_animation_after_throw_runout(NativePetAnimationName::RunLeft, 0,),
            NativePetAnimationName::Idle
        );
        assert_eq!(
            native_pet_animation_after_throw_runout(NativePetAnimationName::RunLeft, 1,),
            NativePetAnimationName::TripFallLeft
        );
        assert_eq!(
            native_pet_animation_after_throw_runout(NativePetAnimationName::RunRight, 2,),
            NativePetAnimationName::StumbleRecoverRight
        );
    }

    #[test]
    fn finite_control_actions_return_requested_state_to_idle_without_rewriting_run() {
        assert_eq!(
            native_pet_requested_animation_for_control_animation(
                NativePetAnimationName::TripFallLeft
            ),
            NativePetAnimationName::Idle
        );
        assert_eq!(
            native_pet_requested_animation_for_control_animation(
                NativePetAnimationName::StumbleRecoverRight,
            ),
            NativePetAnimationName::Idle
        );
        assert_eq!(
            native_pet_requested_animation_for_control_animation(NativePetAnimationName::RunRight),
            NativePetAnimationName::RunRight
        );
    }

    #[test]
    fn uses_hover_animation_only_when_no_higher_priority_animation_is_active() {
        assert_eq!(
            native_pet_animation_for_hover_state(
                true,
                false,
                false,
                NativePetAnimationName::Idle,
                NativePetAnimationName::Idle,
            ),
            NativePetAnimationName::Hover
        );
        assert_eq!(
            native_pet_animation_for_hover_state(
                false,
                false,
                false,
                NativePetAnimationName::Idle,
                NativePetAnimationName::Hover,
            ),
            NativePetAnimationName::Idle
        );
        assert_eq!(
            native_pet_animation_for_hover_state(
                true,
                true,
                false,
                NativePetAnimationName::Working,
                NativePetAnimationName::Working,
            ),
            NativePetAnimationName::Working
        );
        assert_eq!(
            native_pet_animation_for_hover_state(
                true,
                false,
                true,
                NativePetAnimationName::Working,
                NativePetAnimationName::Working,
            ),
            NativePetAnimationName::Working
        );
    }

    #[test]
    fn hover_does_not_dilute_task_and_status_feedback() {
        assert_eq!(
            native_pet_animation_for_hover_state(
                true,
                false,
                false,
                NativePetAnimationName::Working,
                NativePetAnimationName::Working,
            ),
            NativePetAnimationName::Working
        );
        assert_eq!(
            native_pet_animation_for_hover_state(
                true,
                false,
                false,
                NativePetAnimationName::Approval,
                NativePetAnimationName::Approval,
            ),
            NativePetAnimationName::Approval
        );
        assert_eq!(
            native_pet_animation_for_hover_state(
                true,
                false,
                false,
                NativePetAnimationName::Sad,
                NativePetAnimationName::Sad,
            ),
            NativePetAnimationName::Sad
        );
    }

    #[test]
    fn hover_wakes_sleeping_pet_without_skipping_the_wake_transition() {
        assert_eq!(
            native_pet_animation_for_hover_state(
                true,
                false,
                false,
                NativePetAnimationName::Idle,
                NativePetAnimationName::Sleep,
            ),
            NativePetAnimationName::Wake
        );
        assert_eq!(
            native_pet_animation_for_hover_state(
                false,
                false,
                false,
                NativePetAnimationName::Idle,
                NativePetAnimationName::Sleep,
            ),
            NativePetAnimationName::Sleep
        );
    }

    #[test]
    fn pointer_interaction_clears_sleep_request_without_clearing_task_requests() {
        let requested =
            native_pet_requested_animation_after_pointer_interaction(NativePetAnimationName::Sleep);
        assert_eq!(requested, NativePetAnimationName::Idle);
        assert_eq!(
            native_pet_animation_for_lifecycle(
                false,
                false,
                false,
                requested,
                NativePetAnimationName::Wake,
                0,
                0,
            ),
            NativePetAnimationName::Idle
        );
        assert_eq!(
            native_pet_requested_animation_after_pointer_interaction(
                NativePetAnimationName::Working,
            ),
            NativePetAnimationName::Working
        );
    }

    #[test]
    fn hover_does_not_interrupt_one_shot_reaction_animations() {
        assert_eq!(
            native_pet_animation_for_hover_state(
                true,
                false,
                false,
                NativePetAnimationName::Idle,
                NativePetAnimationName::Tap,
            ),
            NativePetAnimationName::Tap
        );
        assert_eq!(
            native_pet_animation_for_hover_state(
                true,
                false,
                false,
                NativePetAnimationName::Idle,
                NativePetAnimationName::Curious,
            ),
            NativePetAnimationName::Curious
        );
        assert_eq!(
            native_pet_animation_for_hover_state(
                true,
                false,
                false,
                NativePetAnimationName::Idle,
                NativePetAnimationName::TripFallLeft,
            ),
            NativePetAnimationName::TripFallLeft
        );
        assert_eq!(
            native_pet_animation_for_hover_state(
                true,
                false,
                false,
                NativePetAnimationName::Idle,
                NativePetAnimationName::FallenIdleRight,
            ),
            NativePetAnimationName::FallenIdleRight
        );
        assert_eq!(
            native_pet_animation_for_hover_state(
                true,
                false,
                false,
                NativePetAnimationName::Idle,
                NativePetAnimationName::StumbleRecoverLeft,
            ),
            NativePetAnimationName::StumbleRecoverLeft
        );
    }

    #[test]
    fn lifecycle_sleeps_after_long_idle_and_wakes_on_hover() {
        assert_eq!(
            native_pet_animation_for_lifecycle(
                false,
                false,
                false,
                NativePetAnimationName::Idle,
                NativePetAnimationName::Idle,
                45_000,
                0,
            ),
            NativePetAnimationName::Sleep
        );
        assert_eq!(
            native_pet_animation_for_lifecycle(
                true,
                false,
                false,
                NativePetAnimationName::Idle,
                NativePetAnimationName::Sleep,
                45_000,
                0,
            ),
            NativePetAnimationName::Wake
        );
        assert_eq!(
            native_pet_animation_for_lifecycle(
                false,
                false,
                false,
                NativePetAnimationName::Working,
                NativePetAnimationName::Working,
                45_000,
                0,
            ),
            NativePetAnimationName::Working
        );
    }

    #[test]
    fn lifecycle_wakes_from_sleep_before_non_idle_requested_animation() {
        assert_eq!(
            native_pet_animation_for_lifecycle(
                false,
                false,
                false,
                NativePetAnimationName::Working,
                NativePetAnimationName::Sleep,
                0,
                0,
            ),
            NativePetAnimationName::Wake
        );
    }

    #[test]
    fn lifecycle_uses_reassure_recovery_when_error_status_clears() {
        assert_eq!(
            native_pet_animation_for_lifecycle(
                false,
                false,
                false,
                NativePetAnimationName::Idle,
                NativePetAnimationName::Sad,
                0,
                0,
            ),
            NativePetAnimationName::Reassure
        );
        assert_eq!(
            native_pet_animation_for_lifecycle(
                false,
                false,
                false,
                NativePetAnimationName::Idle,
                NativePetAnimationName::Reassure,
                0,
                0,
            ),
            NativePetAnimationName::Idle
        );
    }

    #[test]
    fn lifecycle_uses_celebrate_when_working_completes() {
        assert_eq!(
            native_pet_animation_for_lifecycle(
                false,
                false,
                false,
                NativePetAnimationName::Idle,
                NativePetAnimationName::Working,
                0,
                0,
            ),
            NativePetAnimationName::Celebrate
        );
        assert_eq!(
            native_pet_animation_for_lifecycle(
                false,
                false,
                false,
                NativePetAnimationName::Idle,
                NativePetAnimationName::Celebrate,
                0,
                0,
            ),
            NativePetAnimationName::Idle
        );
    }

    #[test]
    fn lifecycle_elapsed_only_accumulates_for_plain_idle() {
        assert_eq!(
            native_pet_idle_lifecycle_elapsed_ms(
                1_000,
                16,
                false,
                false,
                false,
                NativePetAnimationName::Idle,
            ),
            1_016
        );
        assert_eq!(
            native_pet_idle_lifecycle_elapsed_ms(
                1_000,
                16,
                true,
                false,
                false,
                NativePetAnimationName::Idle,
            ),
            0
        );
        assert_eq!(
            native_pet_idle_lifecycle_elapsed_ms(
                1_000,
                16,
                false,
                false,
                false,
                NativePetAnimationName::Working,
            ),
            0
        );
    }

    #[test]
    fn task_presence_elapsed_accumulates_only_for_uninterrupted_task_states() {
        assert_eq!(
            native_pet_task_presence_elapsed_ms(
                1_000,
                16,
                false,
                false,
                false,
                NativePetAnimationName::Working,
            ),
            1_016
        );
        assert_eq!(
            native_pet_task_presence_elapsed_ms(
                1_000,
                16,
                false,
                false,
                false,
                NativePetAnimationName::Thinking,
            ),
            1_016
        );
        assert_eq!(
            native_pet_task_presence_elapsed_ms(
                1_000,
                16,
                true,
                false,
                false,
                NativePetAnimationName::Working,
            ),
            0
        );
        assert_eq!(
            native_pet_task_presence_elapsed_ms(
                1_000,
                16,
                false,
                false,
                false,
                NativePetAnimationName::Approval,
            ),
            1_016
        );
    }

    #[test]
    fn task_presence_inserts_low_frequency_variation_without_interrupting_priority_states() {
        assert_eq!(
            native_pet_task_presence_animation(
                false,
                false,
                false,
                NativePetAnimationName::Working,
                NativePetAnimationName::Working,
                21_999,
            ),
            None
        );
        assert_eq!(
            native_pet_task_presence_animation(
                false,
                false,
                false,
                NativePetAnimationName::Working,
                NativePetAnimationName::Working,
                22_000,
            ),
            Some(NativePetAnimationName::Curious)
        );
        assert_eq!(
            native_pet_task_presence_animation(
                false,
                false,
                false,
                NativePetAnimationName::Working,
                NativePetAnimationName::Curious,
                22_000,
            ),
            None
        );
        assert_eq!(
            native_pet_task_presence_animation(
                false,
                false,
                false,
                NativePetAnimationName::Approval,
                NativePetAnimationName::Approval,
                22_000,
            ),
            Some(NativePetAnimationName::Hover)
        );
        assert_eq!(
            native_pet_task_presence_animation(
                true,
                false,
                false,
                NativePetAnimationName::Thinking,
                NativePetAnimationName::Thinking,
                22_000,
            ),
            None
        );
    }

    #[test]
    fn lifecycle_does_not_interrupt_one_shot_wake_transition() {
        assert!(native_pet_should_apply_lifecycle_animation(
            NativePetAnimationName::Sleep,
            NativePetAnimationName::Wake,
        ));
        assert!(!native_pet_should_apply_lifecycle_animation(
            NativePetAnimationName::Wake,
            NativePetAnimationName::Hover,
        ));
    }
}
