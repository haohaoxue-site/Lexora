use std::{cell::Cell, rc::Rc, time::Duration};

use gtk::prelude::*;

use crate::error::{BuddyError, BuddyResult};

use super::{
    animation::NativePetRequestedAnimationState,
    assets::{load_default_app_icon, load_default_pet_animation_set, load_default_pet_spritesheet},
    bounds::{
        native_pet_runtime_initial_placement, native_pet_runtime_resolve_restored_placement,
        native_pet_runtime_resolve_window_placement,
    },
    control_runtime::{
        native_pet_apply_completed_play_action_behavior, native_pet_drain_control_runtime_requests,
        NativePetControlRuntimeState,
    },
    coordinates::{NativePetLogicalOffset, NativePetLogicalPoint, NATIVE_PET_COORDINATE_SPACE},
    drag_motion::{
        native_pet_flush_drag_motion_sample, native_pet_record_drag_motion_sample,
        native_pet_take_drag_frame_update,
    },
    drag_runtime::{
        native_pet_commit_drag_update, NativePetDragCommitContext, NativePetDragRuntimeState,
    },
    drag_state::{NativePetDragPhase, NativePetDragStateMachine},
    edge_runout::{native_pet_advance_edge_runout, native_pet_edge_runout_after_inertia_step},
    frame_timing::{
        native_pet_frame_clock_time_ms, native_pet_frame_dt_seconds, native_pet_frame_elapsed_ms,
    },
    geometry::{native_pet_window_logical_size, NativePetFacing},
    layer_shell::{validate_layer_shell_availability, LayerShellApi},
    lifecycle::{
        native_pet_animation_after_drag_release, native_pet_animation_for_hover_state,
        native_pet_animation_for_velocity, native_pet_facing_for_velocity,
        native_pet_fallen_get_up_animation, native_pet_next_throw_outcome_seed,
        native_pet_requested_animation_after_pointer_interaction,
        native_pet_requested_animation_for_control_animation,
        native_pet_should_block_pointer_interaction, NativePetFallenGetUpActionTargets,
        NativePetLifecycleActionTargets, NativePetLocalInteractionAnimationState,
    },
    physics::{NativePetInertiaState, NativePetPhysicsPhase},
    pointer_interaction::{
        native_pet_open_chat_click_matches, native_pet_open_chat_release_cancels_candidate,
        native_pet_pointer_cursor_name, native_pet_pointer_press_can_open_chat,
        native_pet_should_start_pointer_interaction,
        native_pet_window_local_pointer_tracking_position, NativePetOpenChatClick,
    },
    position_state::{
        clear_native_pet_position_state, load_native_pet_position_state,
        save_native_pet_position_state, should_persist_native_pet_rest_position,
    },
    preset_behavior::{
        native_pet_fallen_get_up_preset_behavior_event,
        native_pet_fallen_recovery_state_after_throw_finish,
        native_pet_new_preset_behavior_interaction_id,
        native_pet_new_preset_behavior_interaction_uuid, native_pet_preset_behavior_interaction_id,
        native_pet_start_preset_behavior_execute_step,
        native_pet_throw_after_drag_finish_after_runout,
        native_pet_throw_after_drag_preset_behavior_event, NativePetThrowAfterDragFinishTargets,
    },
    process::{
        emit_native_pet_sidecar_event, NativePetControlPoll, NativePetLaunchConfig, NativePetLayer,
        NativePetSidecarEvent,
    },
    renderer::{
        clear_transparent, draw_pet_frame, install_transparent_window_css,
        native_pet_pointer_hits_visible_pet,
    },
    scripted_walk::{native_pet_step_scripted_walk, NativePetScriptedWalkArrival},
    step_runtime::{
        native_pet_active_play_action_completion_behavior, native_pet_advance_active_step,
        native_pet_complete_active_step, native_pet_interrupt_active_step_for_local_interaction,
        native_pet_play_action_completion_behavior_for_response,
        native_pet_step_response_is_motion_timeout,
    },
    window_cursor::native_pet_apply_pointer_cursor,
    window_events::{native_pet_button_press_opens_chat, native_pet_event_time_ms},
    window_layer::native_pet_layer_for_scripted_walk,
    window_movement::{native_pet_reconcile_visible_placement, NativePetWindowMovementAdapter},
    window_state::NativePetRuntimeState,
    window_tick::{native_pet_advance_lifecycle_tick, NativePetLifecycleTickState},
};

const NATIVE_PET_DRAG_DEBUG_ENV: &str = "LEXORA_BUDDY_NATIVE_PET_DRAG_DEBUG";
const NATIVE_PET_RUNTIME_TICK_MS: u64 = 16;
const NATIVE_PET_PLACEMENT_REFRESH_MS: u64 = 1_000;

fn native_pet_preempt_agent_step_for_local_interaction(
    active_step_state: &std::cell::RefCell<Option<super::step_runtime::NativePetActiveStepState>>,
) {
    let response =
        native_pet_interrupt_active_step_for_local_interaction(&mut active_step_state.borrow_mut());
    if let Some(response) = response {
        let _ = emit_native_pet_sidecar_event(NativePetSidecarEvent::StepResponse(response));
    }
}

fn native_pet_requested_animation_after_motion_timeout(
    lifecycle_action_targets: &NativePetLifecycleActionTargets,
) -> NativePetRequestedAnimationState {
    NativePetRequestedAnimationState::from((*lifecycle_action_targets).idle())
}

fn native_pet_apply_window_layer(
    gtk_window: &gtk::Window,
    layer_shell: Option<&LayerShellApi>,
    current_layer: &Cell<NativePetLayer>,
    next_layer: NativePetLayer,
) {
    if current_layer.get() == next_layer {
        return;
    }

    gtk_window.set_keep_above(next_layer.keep_above());
    if let Some(layer_shell) = layer_shell {
        layer_shell.set_layer(gtk_window, next_layer);
    }
    current_layer.set(next_layer);
}

pub(super) fn run_native_pet_sidecar(config: NativePetLaunchConfig) -> BuddyResult<()> {
    let initial_layer = NativePetLayer::from_always_on_top(config.preferences.always_on_top);
    gtk::init().map_err(|error| BuddyError::Runtime(error.to_string()))?;

    let pet_animations = Rc::new(load_default_pet_animation_set()?);
    let throw_after_drag_finish_targets = Rc::new(
        NativePetThrowAfterDragFinishTargets::load_bundled(pet_animations.as_ref())?,
    );
    let fallen_get_up_action_targets = Rc::new(NativePetFallenGetUpActionTargets::load_bundled(
        pet_animations.as_ref(),
    )?);
    let window_size = native_pet_window_logical_size(pet_animations.geometry());
    let window_width = window_size.width;
    let window_height = window_size.height;
    let gtk_window = gtk::Window::new(gtk::WindowType::Toplevel);
    gtk_window.set_title("Lexora");
    let app_icon = load_default_app_icon()?;
    gtk_window.set_icon(Some(&app_icon));
    gtk_window.set_default_size(window_width, window_height);
    gtk_window.set_size_request(window_width, window_height);
    gtk_window.set_resizable(false);
    gtk_window.set_decorated(false);
    gtk_window.set_app_paintable(true);
    gtk_window.set_keep_above(initial_layer.keep_above());
    gtk_window.set_accept_focus(false);
    gtk_window.set_focus_on_map(false);
    gtk_window.set_skip_taskbar_hint(true);
    gtk_window.set_skip_pager_hint(true);
    gtk_window.connect_delete_event(|_, _| {
        gtk::main_quit();
        glib::Propagation::Proceed
    });

    let layer_shell_api = LayerShellApi::load();
    validate_layer_shell_availability(initial_layer, layer_shell_api.is_some())?;
    let layer_shell = Rc::new(layer_shell_api);
    if !config.preferences.remember_position {
        clear_native_pet_position_state(&config.position_state_path)?;
    }
    let restored_position = if config.preferences.remember_position {
        match load_native_pet_position_state(&config.position_state_path) {
            Ok(position) => position,
            Err(error) => {
                eprintln!("Lexora Buddy native pet position state ignored: {error}");
                None
            }
        }
    } else {
        None
    };
    let initial_placement = restored_position
        .map(|position| native_pet_runtime_resolve_restored_placement(position, window_size))
        .unwrap_or_else(|| native_pet_runtime_initial_placement(window_size));
    let preferences = Rc::new(Cell::new(config.preferences));
    let config_path = Rc::new(config.config_path);
    let position_state_path = Rc::new(config.position_state_path);
    let pending_rest_position_save = Rc::new(Cell::new(false));
    let should_quit = Rc::new(Cell::new(false));
    let window_layer = Rc::new(Cell::new(initial_layer));
    let window_position = Rc::new(Cell::new(initial_placement.position));
    let window_monitor_index = Rc::new(Cell::new(initial_placement.monitor_index));
    if let Some(layer_shell) = layer_shell.as_ref() {
        layer_shell.configure_window(&gtk_window, initial_layer, initial_placement);
    } else {
        let position = initial_placement.position;
        gtk_window.move_(position.x, position.y);
    }

    if let Some(screen) = gtk::prelude::WidgetExt::screen(&gtk_window) {
        install_transparent_window_css(&screen);
    }

    let drawing_area = gtk::DrawingArea::new();
    drawing_area.set_size_request(window_width, window_height);
    drawing_area.set_events(
        gdk::EventMask::BUTTON_PRESS_MASK
            | gdk::EventMask::BUTTON_RELEASE_MASK
            | gdk::EventMask::ENTER_NOTIFY_MASK
            | gdk::EventMask::LEAVE_NOTIFY_MASK
            | gdk::EventMask::POINTER_MOTION_MASK,
    );

    gtk_window.add(&drawing_area);

    let pet_spritesheet = load_default_pet_spritesheet()?;
    let runtime_state = NativePetRuntimeState::new(pet_animations)?;
    let NativePetRuntimeState {
        active_step_state,
        animation_playback,
        control_messages,
        drag_state,
        edge_runout_state,
        fallen_preset_behavior_recovery_state,
        idle_lifecycle_elapsed_ms,
        idle_presence_schedule_seed,
        inertia_state,
        lifecycle_action_targets,
        movement_action_targets,
        open_chat_click,
        pet_animations,
        pet_facing,
        physics_params,
        pointer_hovered,
        requested_animation,
        scripted_walk_state,
        task_presence_elapsed_ms,
        throw_outcome_seed,
    } = runtime_state;
    let drag_debug = std::env::var_os(NATIVE_PET_DRAG_DEBUG_ENV).is_some();

    {
        let pet_spritesheet = pet_spritesheet.clone();
        let pet_animations = Rc::clone(&pet_animations);
        let animation_playback = Rc::clone(&animation_playback);
        let pet_facing = Rc::clone(&pet_facing);
        drawing_area.connect_draw(move |_, context| {
            clear_transparent(context);
            draw_pet_frame(
                context,
                &pet_spritesheet,
                &pet_animations,
                animation_playback.get(),
                pet_facing.get(),
            );
            glib::Propagation::Proceed
        });
    }

    {
        let pet_spritesheet = pet_spritesheet.clone();
        let pet_animations = Rc::clone(&pet_animations);
        let lifecycle_action_targets = Rc::clone(&lifecycle_action_targets);
        let animation_playback = Rc::clone(&animation_playback);
        let requested_animation = Rc::clone(&requested_animation);
        let pointer_hovered = Rc::clone(&pointer_hovered);
        let drag_state = Rc::clone(&drag_state);
        let inertia_state = Rc::clone(&inertia_state);
        drawing_area.connect_enter_notify_event(move |drawing_area, event| {
            let is_dragging = drag_state.borrow().is_some();
            let is_inertia_active = inertia_state.borrow().is_some();
            let (local_x, local_y) = event.position();
            let pointer_hits_visible_pet = native_pet_pointer_hits_visible_pet(
                &pet_spritesheet,
                &pet_animations,
                animation_playback.get(),
                local_x,
                local_y,
            );
            pointer_hovered.set(pointer_hits_visible_pet);
            native_pet_apply_pointer_cursor(
                drawing_area,
                native_pet_pointer_cursor_name(pointer_hits_visible_pet, is_dragging),
            );
            if !is_dragging && !is_inertia_active {
                let mut playback = animation_playback.get();
                playback.set_lifecycle_animation(native_pet_animation_for_hover_state(
                    lifecycle_action_targets.as_ref(),
                    pet_animations.as_ref(),
                    pointer_hits_visible_pet,
                    false,
                    false,
                    requested_animation.get(),
                    playback,
                ));
                animation_playback.set(playback);
            }

            glib::Propagation::Proceed
        });
    }

    {
        let pet_animations = Rc::clone(&pet_animations);
        let lifecycle_action_targets = Rc::clone(&lifecycle_action_targets);
        let animation_playback = Rc::clone(&animation_playback);
        let requested_animation = Rc::clone(&requested_animation);
        let pointer_hovered = Rc::clone(&pointer_hovered);
        let drag_state = Rc::clone(&drag_state);
        let inertia_state = Rc::clone(&inertia_state);
        drawing_area.connect_leave_notify_event(move |drawing_area, _| {
            pointer_hovered.set(false);
            let is_dragging = drag_state.borrow().is_some();
            let is_inertia_active = inertia_state.borrow().is_some();
            native_pet_apply_pointer_cursor(
                drawing_area,
                native_pet_pointer_cursor_name(false, is_dragging),
            );
            if !is_dragging && !is_inertia_active {
                let mut playback = animation_playback.get();
                playback.set_lifecycle_animation(native_pet_animation_for_hover_state(
                    lifecycle_action_targets.as_ref(),
                    pet_animations.as_ref(),
                    false,
                    false,
                    false,
                    requested_animation.get(),
                    playback,
                ));
                animation_playback.set(playback);
            }

            glib::Propagation::Proceed
        });
    }

    {
        let pet_spritesheet = pet_spritesheet.clone();
        let pet_animations = Rc::clone(&pet_animations);
        let active_step_state = Rc::clone(&active_step_state);
        let animation_playback = Rc::clone(&animation_playback);
        let requested_animation = Rc::clone(&requested_animation);
        let movement_action_targets = Rc::clone(&movement_action_targets);
        let lifecycle_action_targets = Rc::clone(&lifecycle_action_targets);
        let fallen_get_up_action_targets = Rc::clone(&fallen_get_up_action_targets);
        let open_chat_click = Rc::clone(&open_chat_click);
        let drag_state = Rc::clone(&drag_state);
        let inertia_state = Rc::clone(&inertia_state);
        let edge_runout_state = Rc::clone(&edge_runout_state);
        let fallen_preset_behavior_recovery_state =
            Rc::clone(&fallen_preset_behavior_recovery_state);
        let scripted_walk_state = Rc::clone(&scripted_walk_state);
        let window_position = Rc::clone(&window_position);
        drawing_area.connect_button_press_event(move |drawing_area, event| {
            let mut playback = animation_playback.get();
            let (local_x, local_y) = event.position();
            let press_time_ms = native_pet_event_time_ms(event.time());
            let Some(press_position) = NativePetLogicalPoint::try_new(local_x, local_y) else {
                return glib::Propagation::Proceed;
            };
            let pointer_hits_visible_pet = native_pet_pointer_hits_visible_pet(
                &pet_spritesheet,
                &pet_animations,
                playback,
                local_x,
                local_y,
            );
            if pointer_hits_visible_pet {
                requested_animation.set(native_pet_requested_animation_after_pointer_interaction(
                    requested_animation.get(),
                    lifecycle_action_targets.as_ref().sleep(),
                    lifecycle_action_targets.as_ref().idle(),
                ));
            }
            if native_pet_pointer_press_can_open_chat(pointer_hits_visible_pet, event.button()) {
                if native_pet_button_press_opens_chat(event.button(), event.event_type())
                    || native_pet_open_chat_click_matches(
                        open_chat_click.get(),
                        press_time_ms,
                        press_position,
                    )
                {
                    open_chat_click.set(None);
                    native_pet_preempt_agent_step_for_local_interaction(
                        active_step_state.as_ref(),
                    );
                    let _ = emit_native_pet_sidecar_event(NativePetSidecarEvent::OpenChat);
                    playback.set_animation_target(movement_action_targets.tap());
                    animation_playback.set(playback);
                    return glib::Propagation::Proceed;
                }

                open_chat_click.set(Some(NativePetOpenChatClick {
                    time_ms: press_time_ms,
                    position: press_position,
                }));
            } else {
                open_chat_click.set(None);
            }

            if !native_pet_should_start_pointer_interaction(pointer_hits_visible_pet) {
                return glib::Propagation::Proceed;
            }

            native_pet_preempt_agent_step_for_local_interaction(active_step_state.as_ref());
            scripted_walk_state.replace(None);
            let interaction_state =
                NativePetLocalInteractionAnimationState::from_playback(&pet_animations, playback);
            if let Some(get_up_animation) = native_pet_fallen_get_up_animation(
                fallen_get_up_action_targets.as_ref(),
                interaction_state,
            ) {
                let interaction_id = fallen_preset_behavior_recovery_state
                    .borrow_mut()
                    .take()
                    .map(|state| state.into_interaction_id())
                    .unwrap_or_else(native_pet_new_preset_behavior_interaction_id);
                let _ = emit_native_pet_sidecar_event(NativePetSidecarEvent::PresetBehavior(
                    native_pet_fallen_get_up_preset_behavior_event(
                        get_up_animation,
                        interaction_id.clone(),
                        pet_animations.as_ref(),
                    ),
                ));
                native_pet_start_preset_behavior_execute_step(
                    active_step_state.as_ref(),
                    pet_animations.as_ref(),
                    &mut playback,
                    requested_animation.as_ref(),
                    get_up_animation,
                    movement_action_targets.as_ref().idle(),
                    interaction_id.as_str(),
                );
                animation_playback.set(playback);
                inertia_state.replace(None);
                edge_runout_state.set(None);
                native_pet_apply_pointer_cursor(
                    drawing_area,
                    native_pet_pointer_cursor_name(true, false),
                );
                return glib::Propagation::Proceed;
            }

            if native_pet_should_block_pointer_interaction(interaction_state) {
                return glib::Propagation::Proceed;
            }

            native_pet_apply_pointer_cursor(
                drawing_area,
                native_pet_pointer_cursor_name(true, true),
            );
            playback.set_animation_target(movement_action_targets.grab_start());
            animation_playback.set(playback);
            inertia_state.replace(None);
            edge_runout_state.set(None);

            let origin_position = window_position.get();
            let Some(press_cursor_position) =
                native_pet_window_local_pointer_tracking_position(origin_position, local_x, local_y)
            else {
                return glib::Propagation::Proceed;
            };
            let machine = NativePetDragStateMachine::begin_with_grab_offset(
                press_cursor_position,
                NativePetLogicalOffset {
                    x: local_x,
                    y: local_y,
                },
                native_pet_event_time_ms(event.time()),
            );
            let drag = NativePetDragRuntimeState::begin(drawing_area, event, machine);
            let grab_offset = drag.grab_offset();
            drag_state.replace(Some(drag));
            if drag_debug {
                eprintln!(
                    "native-pet-drag-debug press cursor=({:.1},{:.1}) origin=({}, {}) offset=({:.1},{:.1}) space={}",
                    press_cursor_position.x,
                    press_cursor_position.y,
                    origin_position.x,
                    origin_position.y,
                    grab_offset.x,
                    grab_offset.y,
                    NATIVE_PET_COORDINATE_SPACE.label(),
                );
            }

            glib::Propagation::Proceed
        });
    }

    {
        let pet_spritesheet = pet_spritesheet.clone();
        let pet_animations = Rc::clone(&pet_animations);
        let animation_playback = Rc::clone(&animation_playback);
        let requested_animation = Rc::clone(&requested_animation);
        let drag_state = Rc::clone(&drag_state);
        let inertia_state = Rc::clone(&inertia_state);
        let lifecycle_action_targets = Rc::clone(&lifecycle_action_targets);
        let pointer_hovered = Rc::clone(&pointer_hovered);
        let window_position = Rc::clone(&window_position);
        drawing_area.connect_motion_notify_event(move |drawing_area, event| {
            event.request_motions();
            let is_dragging = {
                let mut drag_state = drag_state.borrow_mut();
                if let Some(state) = drag_state.as_mut() {
                    let (local_x, local_y) = event.position();
                    if let Some(cursor_position) =
                        native_pet_window_local_pointer_tracking_position(
                            window_position.get(),
                            local_x,
                            local_y,
                        )
                    {
                        native_pet_record_drag_motion_sample(
                            state.motion_mut(),
                            cursor_position,
                            native_pet_event_time_ms(event.time()),
                        );
                    }
                    true
                } else {
                    false
                }
            };
            native_pet_apply_pointer_cursor(
                drawing_area,
                native_pet_pointer_cursor_name(pointer_hovered.get(), is_dragging),
            );

            if !is_dragging {
                let (local_x, local_y) = event.position();
                let pointer_hits_visible_pet = native_pet_pointer_hits_visible_pet(
                    &pet_spritesheet,
                    &pet_animations,
                    animation_playback.get(),
                    local_x,
                    local_y,
                );
                let was_hovered = pointer_hovered.replace(pointer_hits_visible_pet);
                let is_inertia_active = inertia_state.borrow().is_some();
                native_pet_apply_pointer_cursor(
                    drawing_area,
                    native_pet_pointer_cursor_name(pointer_hits_visible_pet, false),
                );
                if was_hovered != pointer_hits_visible_pet && !is_inertia_active {
                    let mut playback = animation_playback.get();
                    playback.set_lifecycle_animation(native_pet_animation_for_hover_state(
                        lifecycle_action_targets.as_ref(),
                        pet_animations.as_ref(),
                        pointer_hits_visible_pet,
                        false,
                        false,
                        requested_animation.get(),
                        playback,
                    ));
                    animation_playback.set(playback);
                }
            }

            glib::Propagation::Proceed
        });
    }

    {
        let pet_spritesheet = pet_spritesheet.clone();
        let pet_animations = Rc::clone(&pet_animations);
        let animation_playback = Rc::clone(&animation_playback);
        let movement_action_targets = Rc::clone(&movement_action_targets);
        let pointer_hovered = Rc::clone(&pointer_hovered);
        let open_chat_click = Rc::clone(&open_chat_click);
        let drag_state = Rc::clone(&drag_state);
        let gtk_window = gtk_window.clone();
        let layer_shell = Rc::clone(&layer_shell);
        let pet_facing = Rc::clone(&pet_facing);
        let physics_params = Rc::clone(&physics_params);
        let inertia_state = Rc::clone(&inertia_state);
        let edge_runout_state = Rc::clone(&edge_runout_state);
        let window_monitor_index = Rc::clone(&window_monitor_index);
        let window_position = Rc::clone(&window_position);
        let pending_rest_position_save = Rc::clone(&pending_rest_position_save);
        drawing_area.connect_button_release_event(move |drawing_area, event| {
            let mut playback = animation_playback.get();
            let state = {
                let mut drag_state = drag_state.borrow_mut();
                if let Some(state) = drag_state.as_mut() {
                    let (local_x, local_y) = event.position();
                    if let Some(cursor_position) =
                        native_pet_window_local_pointer_tracking_position(
                            window_position.get(),
                            local_x,
                            local_y,
                        )
                    {
                        if let Some(update) = native_pet_flush_drag_motion_sample(
                            state.motion_mut(),
                            cursor_position,
                            native_pet_event_time_ms(event.time()),
                        ) {
                            let movement_adapter = NativePetWindowMovementAdapter::new(
                                &gtk_window,
                                layer_shell.as_ref().as_ref(),
                                &window_monitor_index,
                                &window_position,
                            );
                            native_pet_commit_drag_update(
                                state,
                                update,
                                NativePetDragCommitContext {
                                    playback: &mut playback,
                                    movement_action_targets: movement_action_targets.as_ref(),
                                    pet_facing: pet_facing.as_ref(),
                                    movement_adapter: &movement_adapter,
                                    window_size,
                                    drag_debug,
                                },
                            );
                        }
                    }
                }
                drag_state.take()
            };

            if let Some(state) = state {
                let release = state.release(&physics_params);
                let (release_x, release_y) = event.position();
                if release.was_dragging() {
                    pending_rest_position_save.set(true);
                    if let Some(release_position) =
                        NativePetLogicalPoint::try_new(release_x, release_y)
                    {
                        if open_chat_click.get().is_some_and(|previous| {
                            native_pet_open_chat_release_cancels_candidate(
                                previous,
                                release_position,
                            )
                        }) {
                            open_chat_click.set(None);
                        }
                    }
                }

                let inertia = if release.was_dragging() {
                    NativePetInertiaState::from_release(
                        window_position.get(),
                        release.release_velocity,
                        &physics_params,
                    )
                } else {
                    None
                };
                let inertia_velocity = inertia.map(NativePetInertiaState::velocity);
                inertia_state.replace(inertia);
                edge_runout_state.set(None);
                playback.set_animation_target(native_pet_animation_after_drag_release(
                    movement_action_targets.as_ref(),
                    release.was_dragging(),
                    inertia_velocity,
                    pet_facing.get(),
                ));
                let pointer_hits_visible_pet = inertia_velocity.is_none() && {
                    let (local_x, local_y) = event.position();
                    native_pet_pointer_hits_visible_pet(
                        &pet_spritesheet,
                        &pet_animations,
                        playback,
                        local_x,
                        local_y,
                    )
                };
                pointer_hovered.set(pointer_hits_visible_pet);
                native_pet_apply_pointer_cursor(
                    drawing_area,
                    native_pet_pointer_cursor_name(pointer_hits_visible_pet, false),
                );
                animation_playback.set(playback);
                if drag_debug {
                    eprintln!(
                        "native-pet-drag-debug release phase={:?} cursor=({:.1},{:.1}) velocity=({:.1},{:.1}) speed={:.1} inertia={}",
                        release.phase_before_release,
                        release.last_cursor_position.x,
                        release.last_cursor_position.y,
                        release.release_velocity.x,
                        release.release_velocity.y,
                        release.release_velocity.speed(),
                        inertia_velocity.is_some(),
                    );
                }
            }
            animation_playback.set(playback);

            glib::Propagation::Proceed
        });
    }

    {
        let drawing_area = drawing_area.clone();
        let pet_animations = Rc::clone(&pet_animations);
        let lifecycle_action_targets = Rc::clone(&lifecycle_action_targets);
        let movement_action_targets = Rc::clone(&movement_action_targets);
        let animation_playback = Rc::clone(&animation_playback);
        let active_step_state = Rc::clone(&active_step_state);
        let requested_animation = Rc::clone(&requested_animation);
        let pointer_hovered = Rc::clone(&pointer_hovered);
        let idle_lifecycle_elapsed_ms = Rc::clone(&idle_lifecycle_elapsed_ms);
        let task_presence_elapsed_ms = Rc::clone(&task_presence_elapsed_ms);
        let idle_presence_schedule_seed = Rc::clone(&idle_presence_schedule_seed);
        let throw_outcome_seed = Rc::clone(&throw_outcome_seed);
        let throw_after_drag_finish_targets = Rc::clone(&throw_after_drag_finish_targets);
        let control_messages = Rc::clone(&control_messages);
        let drag_state = Rc::clone(&drag_state);
        let edge_runout_state = Rc::clone(&edge_runout_state);
        let fallen_preset_behavior_recovery_state =
            Rc::clone(&fallen_preset_behavior_recovery_state);
        let inertia_state = Rc::clone(&inertia_state);
        let scripted_walk_state = Rc::clone(&scripted_walk_state);
        let gtk_window = gtk_window.clone();
        let layer_shell = Rc::clone(&layer_shell);
        let pet_facing = Rc::clone(&pet_facing);
        let physics_params = Rc::clone(&physics_params);
        let window_monitor_index = Rc::clone(&window_monitor_index);
        let window_layer = Rc::clone(&window_layer);
        let window_position = Rc::clone(&window_position);
        let config_path = Rc::clone(&config_path);
        let pending_rest_position_save = Rc::clone(&pending_rest_position_save);
        let position_state_path = Rc::clone(&position_state_path);
        let preferences = Rc::clone(&preferences);
        let should_quit = Rc::clone(&should_quit);
        let last_frame_time = Rc::new(Cell::new(None::<i64>));
        let placement_refresh_elapsed_ms = Rc::new(Cell::new(0_u64));
        glib::timeout_add_local(
            Duration::from_millis(NATIVE_PET_RUNTIME_TICK_MS),
            move || {
                let frame_time = glib::monotonic_time();
                let previous_frame_time = last_frame_time.replace(Some(frame_time));
                let elapsed_ms = native_pet_frame_elapsed_ms(previous_frame_time, frame_time);
                placement_refresh_elapsed_ms.set(
                    placement_refresh_elapsed_ms
                        .get()
                        .saturating_add(elapsed_ms),
                );
                let frame_dt_seconds =
                    native_pet_frame_dt_seconds(previous_frame_time, frame_time, &physics_params);
                let (step_response, completed_play_action_behavior) = {
                    let mut active_step_state = active_step_state.borrow_mut();
                    let completion_behavior =
                        native_pet_active_play_action_completion_behavior(&active_step_state);
                    let response =
                        native_pet_advance_active_step(&mut active_step_state, elapsed_ms);
                    let completed_behavior = response.as_ref().and_then(|response| {
                        native_pet_play_action_completion_behavior_for_response(
                            completion_behavior,
                            response,
                        )
                    });
                    (response, completed_behavior)
                };
                if let Some(response) = step_response {
                    if native_pet_step_response_is_motion_timeout(&response) {
                        scripted_walk_state.replace(None);
                        requested_animation.set(
                            native_pet_requested_animation_after_motion_timeout(
                                lifecycle_action_targets.as_ref(),
                            ),
                        );
                    }
                    let _ = emit_native_pet_sidecar_event(NativePetSidecarEvent::StepResponse(
                        response,
                    ));
                }
                let mut playback = animation_playback.get();
                if let Some(completion_behavior) = completed_play_action_behavior {
                    native_pet_apply_completed_play_action_behavior(
                        completion_behavior,
                        pet_animations.as_ref(),
                        lifecycle_action_targets.as_ref(),
                        &mut playback,
                        requested_animation.as_ref(),
                    );
                }
                let drag_phase = {
                    let mut phase = NativePetDragPhase::Idle;
                    let mut drag_state = drag_state.borrow_mut();
                    if let Some(state) = drag_state.as_mut() {
                        phase = state.phase();
                        let frame_time_ms = native_pet_frame_clock_time_ms(frame_time);
                        if let Some(update) =
                            native_pet_take_drag_frame_update(state.motion_mut(), frame_time_ms)
                        {
                            let movement_adapter = NativePetWindowMovementAdapter::new(
                                &gtk_window,
                                layer_shell.as_ref().as_ref(),
                                &window_monitor_index,
                                &window_position,
                            );
                            native_pet_commit_drag_update(
                                state,
                                update,
                                NativePetDragCommitContext {
                                    playback: &mut playback,
                                    movement_action_targets: movement_action_targets.as_ref(),
                                    pet_facing: pet_facing.as_ref(),
                                    movement_adapter: &movement_adapter,
                                    window_size,
                                    drag_debug,
                                },
                            );
                        }
                    }
                    phase
                };
                let is_dragging = !matches!(drag_phase, NativePetDragPhase::Idle);
                let is_inertia_active = if is_dragging {
                    false
                } else {
                    let mut inertia_state = inertia_state.borrow_mut();
                    if let Some(state) = inertia_state.as_mut() {
                        let movement_adapter = NativePetWindowMovementAdapter::new(
                            &gtk_window,
                            layer_shell.as_ref().as_ref(),
                            &window_monitor_index,
                            &window_position,
                        );
                        let impact_velocity = state.velocity();
                        let step = state.step(frame_dt_seconds, &physics_params, |position| {
                            native_pet_runtime_resolve_window_placement(position, window_size, None)
                                .placement
                                .position
                        });
                        let placement = native_pet_runtime_resolve_window_placement(
                            step.position,
                            window_size,
                            None,
                        )
                        .placement;
                        if step.velocity.x.abs() > 1.0 {
                            pet_facing.set(if step.velocity.x > 0.0 {
                                NativePetFacing::Right
                            } else {
                                NativePetFacing::Left
                            });
                        }
                        movement_adapter.move_to(placement);
                        if matches!(step.phase, NativePetPhysicsPhase::Inertia) {
                            playback.set_animation_target(native_pet_animation_for_velocity(
                                movement_action_targets.as_ref(),
                                step.velocity,
                                pet_facing.get(),
                            ));
                            if drag_debug {
                                eprintln!(
                                "native-pet-drag-debug inertia dt={:.4}s position=({}, {}) velocity=({:.1},{:.1}) speed={:.1} clamped={}",
                                step.clamped_dt_seconds,
                                step.position.x,
                                step.position.y,
                                step.velocity.x,
                                step.velocity.y,
                                step.velocity.speed(),
                                step.hit_position_clamp,
                            );
                            }
                            true
                        } else {
                            inertia_state.take();
                            let run_facing =
                                native_pet_facing_for_velocity(impact_velocity, pet_facing.get());
                            let throw_finish = native_pet_throw_after_drag_finish_after_runout(
                                run_facing,
                                throw_outcome_seed.get(),
                            );
                            let finish_animation =
                                throw_after_drag_finish_targets.animation_target(throw_finish);
                            let interaction_uuid =
                                native_pet_new_preset_behavior_interaction_uuid();
                            let interaction_id =
                                native_pet_preset_behavior_interaction_id(interaction_uuid);
                            fallen_preset_behavior_recovery_state.replace(
                                native_pet_fallen_recovery_state_after_throw_finish(
                                    throw_finish,
                                    interaction_id.clone(),
                                ),
                            );
                            let _ = emit_native_pet_sidecar_event(
                                NativePetSidecarEvent::PresetBehavior(
                                    native_pet_throw_after_drag_preset_behavior_event(
                                        throw_finish,
                                        finish_animation,
                                        interaction_id.clone(),
                                        pet_animations.as_ref(),
                                    ),
                                ),
                            );
                            throw_outcome_seed
                                .set(native_pet_next_throw_outcome_seed(throw_outcome_seed.get()));
                            if let Some(runout) = native_pet_edge_runout_after_inertia_step(
                                movement_action_targets.as_ref(),
                                step.hit_position_clamp,
                                pet_facing.get(),
                                impact_velocity,
                                finish_animation,
                                interaction_uuid,
                                &physics_params,
                            ) {
                                edge_runout_state.set(Some(runout));
                            } else {
                                native_pet_start_preset_behavior_execute_step(
                                    active_step_state.as_ref(),
                                    pet_animations.as_ref(),
                                    &mut playback,
                                    requested_animation.as_ref(),
                                    finish_animation,
                                    lifecycle_action_targets.as_ref().idle(),
                                    interaction_id.as_str(),
                                );
                            }
                            if drag_debug {
                                eprintln!(
                                "native-pet-drag-debug inertia-end dt={:.4}s position=({}, {}) clamped={}",
                                step.clamped_dt_seconds,
                                step.position.x,
                                step.position.y,
                                step.hit_position_clamp,
                            );
                            }
                            false
                        }
                    } else {
                        false
                    }
                };
                let is_edge_runout_active = if is_dragging || is_inertia_active {
                    false
                } else if let Some(state) = edge_runout_state.get() {
                    let step = native_pet_advance_edge_runout(state, elapsed_ms);
                    edge_runout_state.set(step.next_state);
                    if step.next_state.is_some() {
                        playback.set_animation_target(step.animation);
                    } else {
                        let interaction_id = native_pet_preset_behavior_interaction_id(
                            state.preset_behavior_interaction_uuid,
                        );
                        native_pet_start_preset_behavior_execute_step(
                            active_step_state.as_ref(),
                            pet_animations.as_ref(),
                            &mut playback,
                            requested_animation.as_ref(),
                            step.animation,
                            lifecycle_action_targets.as_ref().idle(),
                            interaction_id.as_str(),
                        );
                    }
                    step.next_state.is_some()
                } else {
                    false
                };
                let is_scripted_walk_active =
                    if is_dragging || is_inertia_active || is_edge_runout_active {
                        false
                    } else {
                        native_pet_apply_window_layer(
                            &gtk_window,
                            layer_shell.as_ref().as_ref(),
                            window_layer.as_ref(),
                            native_pet_layer_for_scripted_walk(
                                NativePetLayer::from_always_on_top(preferences.get().always_on_top),
                                scripted_walk_state.borrow().as_ref(),
                            ),
                        );
                        let mut scripted_walk_state = scripted_walk_state.borrow_mut();
                        if let Some(state) = scripted_walk_state.as_mut() {
                            let movement_adapter = NativePetWindowMovementAdapter::new(
                                &gtk_window,
                                layer_shell.as_ref().as_ref(),
                                &window_monitor_index,
                                &window_position,
                            );
                            let step = native_pet_step_scripted_walk(
                                movement_action_targets.as_ref(),
                                window_position.get(),
                                state.target_position(),
                                elapsed_ms,
                            );
                            let placement = native_pet_runtime_resolve_window_placement(
                                step.position,
                                window_size,
                                None,
                            )
                            .placement;
                            if step.movement_dx.abs() > 1.0 {
                                pet_facing.set(if step.movement_dx > 0.0 {
                                    NativePetFacing::Right
                                } else {
                                    NativePetFacing::Left
                                });
                            }
                            movement_adapter.move_to(placement);
                            playback.set_animation_target(step.animation);
                            if step.finished {
                                match state.advance_after_arrival(elapsed_ms) {
                                    NativePetScriptedWalkArrival::Holding => {
                                        let after_animation =
                                            state.after_animation.unwrap_or_else(|| {
                                                lifecycle_action_targets.as_ref().idle()
                                            });
                                        playback.set_animation_target(after_animation);
                                        true
                                    }
                                    NativePetScriptedWalkArrival::Advanced => true,
                                    NativePetScriptedWalkArrival::Finished => {
                                        let after_animation =
                                            state.after_animation.unwrap_or_else(|| {
                                                lifecycle_action_targets.as_ref().idle()
                                            });
                                        let requested =
                                            native_pet_requested_animation_for_control_animation(
                                                &pet_animations,
                                                after_animation,
                                                lifecycle_action_targets.as_ref().idle(),
                                            );
                                        requested_animation.set(requested);
                                        playback.restart_animation_target(after_animation);
                                        *scripted_walk_state = None;
                                        let step_response = {
                                            let mut active_step_state =
                                                active_step_state.borrow_mut();
                                            native_pet_complete_active_step(&mut active_step_state)
                                        };
                                        if let Some(response) = step_response {
                                            let _ = emit_native_pet_sidecar_event(
                                                NativePetSidecarEvent::StepResponse(response),
                                            );
                                        }
                                        false
                                    }
                                }
                            } else {
                                true
                            }
                        } else {
                            false
                        }
                    };
                let is_motion_locked = is_dragging
                    || is_inertia_active
                    || is_edge_runout_active
                    || is_scripted_walk_active;

                if should_persist_native_pet_rest_position(
                    pending_rest_position_save.get(),
                    is_dragging,
                    is_inertia_active,
                    is_edge_runout_active,
                    is_scripted_walk_active,
                ) {
                    pending_rest_position_save.set(false);
                    if preferences.get().remember_position {
                        if let Err(error) = save_native_pet_position_state(
                            position_state_path.as_ref(),
                            window_position.get(),
                        ) {
                            eprintln!("Lexora Buddy native pet position save failed: {error}");
                        }
                    }
                }

                if !is_motion_locked {
                    let force_native_refresh = layer_shell.is_some()
                        && placement_refresh_elapsed_ms.get() >= NATIVE_PET_PLACEMENT_REFRESH_MS;
                    let movement_adapter = NativePetWindowMovementAdapter::new(
                        &gtk_window,
                        layer_shell.as_ref().as_ref(),
                        &window_monitor_index,
                        &window_position,
                    );
                    native_pet_reconcile_visible_placement(
                        &movement_adapter,
                        window_position.get(),
                        window_monitor_index.get(),
                        window_size,
                        force_native_refresh,
                        drag_debug,
                    );
                    if force_native_refresh {
                        placement_refresh_elapsed_ms.set(0);
                    }
                }

                let is_dragging_for_control_state = drag_state.borrow().is_some();
                let control_poll =
                    native_pet_drain_control_runtime_requests(NativePetControlRuntimeState {
                        active_step_state: active_step_state.as_ref(),
                        control_messages: control_messages.as_ref(),
                        pet_animations: pet_animations.as_ref(),
                        lifecycle_action_targets: lifecycle_action_targets.as_ref(),
                        playback: &mut playback,
                        requested_animation: requested_animation.as_ref(),
                        pointer_hovered: pointer_hovered.as_ref(),
                        idle_lifecycle_elapsed_ms: idle_lifecycle_elapsed_ms.as_ref(),
                        idle_presence_schedule_seed: idle_presence_schedule_seed.as_ref(),
                        task_presence_elapsed_ms: task_presence_elapsed_ms.as_ref(),
                        inertia_state: inertia_state.as_ref(),
                        edge_runout_state: edge_runout_state.as_ref(),
                        scripted_walk_state: scripted_walk_state.as_ref(),
                        window_position: window_position.as_ref(),
                        window_monitor_index: window_monitor_index.as_ref(),
                        window_size,
                        is_dragging: is_dragging_for_control_state,
                        is_motion_locked,
                        config_path: config_path.as_ref(),
                        position_state_path: position_state_path.as_ref(),
                        preferences: preferences.as_ref(),
                        pending_rest_position_save: pending_rest_position_save.as_ref(),
                        should_quit: should_quit.as_ref(),
                    });
                if matches!(control_poll, NativePetControlPoll::Disconnected) {
                    gtk::main_quit();
                    return glib::ControlFlow::Break;
                }
                if should_quit.get() {
                    gtk::main_quit();
                    return glib::ControlFlow::Break;
                }
                native_pet_apply_window_layer(
                    &gtk_window,
                    layer_shell.as_ref().as_ref(),
                    window_layer.as_ref(),
                    native_pet_layer_for_scripted_walk(
                        NativePetLayer::from_always_on_top(preferences.get().always_on_top),
                        scripted_walk_state.borrow().as_ref(),
                    ),
                );

                native_pet_advance_lifecycle_tick(NativePetLifecycleTickState {
                    playback: &mut playback,
                    pet_animations: &pet_animations,
                    lifecycle_action_targets: lifecycle_action_targets.as_ref(),
                    requested_animation: requested_animation.as_ref(),
                    pointer_hovered: pointer_hovered.as_ref(),
                    idle_lifecycle_elapsed_ms: idle_lifecycle_elapsed_ms.as_ref(),
                    idle_presence_schedule_seed: idle_presence_schedule_seed.as_ref(),
                    task_presence_elapsed_ms: task_presence_elapsed_ms.as_ref(),
                    elapsed_ms,
                    is_dragging,
                    is_inertia_active,
                    is_edge_runout_active,
                    is_scripted_walk_active,
                });
                animation_playback.set(playback);
                drawing_area.queue_draw();
                glib::ControlFlow::Continue
            },
        );
    }

    gtk_window.show_all();
    emit_native_pet_sidecar_event(NativePetSidecarEvent::Ready)?;
    gtk::main();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::native_pet::{
        assets::load_default_pet_animation_set, lifecycle::NativePetLifecycleActionTargets,
    };

    #[test]
    fn motion_timeout_reset_uses_lifecycle_idle_target() {
        let animations =
            load_default_pet_animation_set().expect("default native pet animation set loads");
        let targets = NativePetLifecycleActionTargets::load_bundled(&animations)
            .expect("lifecycle targets resolve from registry");

        assert_eq!(
            native_pet_requested_animation_after_motion_timeout(&targets).animation_target(),
            targets.idle()
        );
    }
}
