use std::{cell::Cell, rc::Rc};

use gtk::prelude::*;

use crate::error::{BuddyError, BuddyResult};

use super::{
    animation::NativePetAnimationName,
    assets::{load_default_app_icon, load_default_pet_spritesheet},
    bounds::{native_pet_runtime_initial_placement, native_pet_runtime_resolve_window_placement},
    control_runtime::{native_pet_drain_control_runtime_requests, NativePetControlRuntimeState},
    coordinates::{NativePetLogicalOffset, NativePetLogicalPoint, NATIVE_PET_COORDINATE_SPACE},
    drag_motion::{
        native_pet_flush_drag_motion_sample, native_pet_record_drag_motion_sample,
        native_pet_take_drag_frame_update,
    },
    drag_runtime::{native_pet_commit_drag_update, NativePetDragRuntimeState},
    drag_state::{NativePetDragPhase, NativePetDragStateMachine},
    edge_runout::{native_pet_advance_edge_runout, native_pet_edge_runout_after_inertia_step},
    frame_timing::{
        native_pet_frame_clock_time_ms, native_pet_frame_dt_seconds, native_pet_frame_elapsed_ms,
    },
    geometry::{native_pet_window_logical_size, NativePetFacing},
    layer_shell::{validate_layer_shell_availability, LayerShellApi},
    lifecycle::{
        native_pet_animation_after_drag_release, native_pet_animation_after_throw_runout,
        native_pet_animation_for_hover_state, native_pet_animation_for_velocity,
        native_pet_fallen_get_up_animation, native_pet_next_throw_outcome_seed,
        native_pet_requested_animation_after_pointer_interaction,
        native_pet_requested_animation_for_control_animation,
        native_pet_should_block_pointer_interaction,
    },
    physics::{NativePetInertiaState, NativePetPhysicsPhase},
    pointer_interaction::{
        native_pet_open_chat_click_matches, native_pet_open_chat_release_cancels_candidate,
        native_pet_pointer_cursor_name, native_pet_pointer_press_can_open_chat,
        native_pet_should_start_pointer_interaction,
        native_pet_window_local_pointer_tracking_position, NativePetOpenChatClick,
    },
    process::{
        emit_native_pet_sidecar_event, NativePetControlPoll, NativePetLaunchConfig,
        NativePetSidecarEvent,
    },
    renderer::{
        clear_transparent, draw_pet_frame, install_transparent_window_css,
        native_pet_pointer_hits_visible_pet,
    },
    scripted_walk::native_pet_step_scripted_walk,
    window_cursor::native_pet_apply_pointer_cursor,
    window_events::{native_pet_button_press_opens_chat, native_pet_event_time_ms},
    window_movement::{native_pet_reconcile_visible_placement, NativePetWindowMovementAdapter},
    window_state::NativePetRuntimeState,
    window_tick::{native_pet_advance_lifecycle_tick, NativePetLifecycleTickState},
};

const NATIVE_PET_DRAG_DEBUG_ENV: &str = "LEXORA_BUDDY_NATIVE_PET_DRAG_DEBUG";

pub(super) fn run_native_pet_sidecar(config: NativePetLaunchConfig) -> BuddyResult<()> {
    gtk::init().map_err(|error| BuddyError::Runtime(error.to_string()))?;

    let window_size = native_pet_window_logical_size();
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
    gtk_window.set_keep_above(config.layer.keep_above());
    gtk_window.set_accept_focus(false);
    gtk_window.set_focus_on_map(false);
    gtk_window.set_skip_taskbar_hint(true);
    gtk_window.set_skip_pager_hint(true);
    gtk_window.connect_delete_event(|_, _| {
        gtk::main_quit();
        glib::Propagation::Proceed
    });

    let layer_shell_api = LayerShellApi::load();
    validate_layer_shell_availability(config.layer, layer_shell_api.is_some())?;
    let layer_shell = Rc::new(layer_shell_api);
    let initial_placement = native_pet_runtime_initial_placement(window_size);
    let window_position = Rc::new(Cell::new(initial_placement.position));
    let window_monitor_index = Rc::new(Cell::new(initial_placement.monitor_index));
    if let Some(layer_shell) = layer_shell.as_ref() {
        layer_shell.configure_window(&gtk_window, config.layer, initial_placement);
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
    let runtime_state = NativePetRuntimeState::new()?;
    let NativePetRuntimeState {
        animation_playback,
        control_messages,
        drag_state,
        edge_runout_state,
        idle_lifecycle_elapsed_ms,
        idle_presence_schedule_seed,
        inertia_state,
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
                playback.set_animation(native_pet_animation_for_hover_state(
                    pointer_hits_visible_pet,
                    false,
                    false,
                    requested_animation.get(),
                    playback.name,
                ));
                animation_playback.set(playback);
            }

            glib::Propagation::Proceed
        });
    }

    {
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
                playback.set_animation(native_pet_animation_for_hover_state(
                    false,
                    false,
                    false,
                    requested_animation.get(),
                    playback.name,
                ));
                animation_playback.set(playback);
            }

            glib::Propagation::Proceed
        });
    }

    {
        let pet_spritesheet = pet_spritesheet.clone();
        let pet_animations = Rc::clone(&pet_animations);
        let animation_playback = Rc::clone(&animation_playback);
        let requested_animation = Rc::clone(&requested_animation);
        let open_chat_click = Rc::clone(&open_chat_click);
        let drag_state = Rc::clone(&drag_state);
        let inertia_state = Rc::clone(&inertia_state);
        let edge_runout_state = Rc::clone(&edge_runout_state);
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
                    let _ = emit_native_pet_sidecar_event(NativePetSidecarEvent::OpenChat);
                    playback.set_animation(NativePetAnimationName::Tap);
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

            scripted_walk_state.replace(None);
            if let Some(get_up_animation) = native_pet_fallen_get_up_animation(playback.name) {
                requested_animation.set(NativePetAnimationName::Idle);
                playback.restart_animation(get_up_animation);
                animation_playback.set(playback);
                inertia_state.replace(None);
                edge_runout_state.set(None);
                native_pet_apply_pointer_cursor(
                    drawing_area,
                    native_pet_pointer_cursor_name(true, false),
                );
                return glib::Propagation::Proceed;
            }

            if native_pet_should_block_pointer_interaction(playback.name) {
                return glib::Propagation::Proceed;
            }

            native_pet_apply_pointer_cursor(
                drawing_area,
                native_pet_pointer_cursor_name(true, true),
            );
            playback.set_animation(NativePetAnimationName::GrabStart);
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
                    playback.set_animation(native_pet_animation_for_hover_state(
                        pointer_hits_visible_pet,
                        false,
                        false,
                        requested_animation.get(),
                        playback.name,
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
                                &mut playback,
                                &pet_facing,
                                &movement_adapter,
                                window_size,
                                drag_debug,
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
                playback.set_animation(native_pet_animation_after_drag_release(
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
        let animation_playback = Rc::clone(&animation_playback);
        let requested_animation = Rc::clone(&requested_animation);
        let pointer_hovered = Rc::clone(&pointer_hovered);
        let idle_lifecycle_elapsed_ms = Rc::clone(&idle_lifecycle_elapsed_ms);
        let task_presence_elapsed_ms = Rc::clone(&task_presence_elapsed_ms);
        let idle_presence_schedule_seed = Rc::clone(&idle_presence_schedule_seed);
        let throw_outcome_seed = Rc::clone(&throw_outcome_seed);
        let control_messages = Rc::clone(&control_messages);
        let drag_state = Rc::clone(&drag_state);
        let edge_runout_state = Rc::clone(&edge_runout_state);
        let inertia_state = Rc::clone(&inertia_state);
        let scripted_walk_state = Rc::clone(&scripted_walk_state);
        let gtk_window = gtk_window.clone();
        let layer_shell = Rc::clone(&layer_shell);
        let pet_facing = Rc::clone(&pet_facing);
        let physics_params = Rc::clone(&physics_params);
        let window_monitor_index = Rc::clone(&window_monitor_index);
        let window_position = Rc::clone(&window_position);
        let last_frame_time = Rc::new(Cell::new(None::<i64>));
        drawing_area.add_tick_callback(move |drawing_area, frame_clock| {
            let frame_time = frame_clock.frame_time();
            let previous_frame_time = last_frame_time.replace(Some(frame_time));
            let elapsed_ms = native_pet_frame_elapsed_ms(previous_frame_time, frame_time);
            let frame_dt_seconds =
                native_pet_frame_dt_seconds(previous_frame_time, frame_time, &physics_params);
            let mut playback = animation_playback.get();
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
                            &mut playback,
                            &pet_facing,
                            &movement_adapter,
                            window_size,
                            drag_debug,
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
                        playback.set_animation(native_pet_animation_for_velocity(
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
                        let run_animation =
                            native_pet_animation_for_velocity(impact_velocity, pet_facing.get());
                        let finish_animation = native_pet_animation_after_throw_runout(
                            run_animation,
                            throw_outcome_seed.get(),
                        );
                        throw_outcome_seed
                            .set(native_pet_next_throw_outcome_seed(throw_outcome_seed.get()));
                        if let Some(runout) = native_pet_edge_runout_after_inertia_step(
                            step.hit_position_clamp,
                            pet_facing.get(),
                            impact_velocity,
                            finish_animation,
                            &physics_params,
                        ) {
                            edge_runout_state.set(Some(runout));
                        } else {
                            playback.set_animation(finish_animation);
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
                playback.set_animation(step.animation);
                step.next_state.is_some()
            } else {
                false
            };
            let is_scripted_walk_active =
                if is_dragging || is_inertia_active || is_edge_runout_active {
                    false
                } else {
                    let mut scripted_walk_state = scripted_walk_state.borrow_mut();
                    if let Some(state) = *scripted_walk_state {
                        let movement_adapter = NativePetWindowMovementAdapter::new(
                            &gtk_window,
                            layer_shell.as_ref().as_ref(),
                            &window_monitor_index,
                            &window_position,
                        );
                        let step = native_pet_step_scripted_walk(
                            window_position.get(),
                            state.target_position,
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
                        playback.set_animation(step.animation);
                        if step.finished {
                            let after_animation =
                                state.after_animation.unwrap_or(NativePetAnimationName::Idle);
                            requested_animation.set(
                                native_pet_requested_animation_for_control_animation(
                                    after_animation,
                                ),
                            );
                            playback.restart_animation(after_animation);
                            *scripted_walk_state = None;
                            false
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

            if !is_motion_locked {
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
                    drag_debug,
                );
            }

            let is_dragging_for_control_state = drag_state.borrow().is_some();
            let control_poll =
                native_pet_drain_control_runtime_requests(NativePetControlRuntimeState {
                    control_messages: control_messages.as_ref(),
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
                });
            if matches!(control_poll, NativePetControlPoll::Disconnected) {
                gtk::main_quit();
                return glib::ControlFlow::Break;
            }

            native_pet_advance_lifecycle_tick(NativePetLifecycleTickState {
                playback: &mut playback,
                pet_animations: &pet_animations,
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
        });
    }

    gtk_window.show_all();
    gtk::main();
    Ok(())
}
