use std::{
    cell::{Cell, RefCell},
    rc::Rc,
    time::{SystemTime, UNIX_EPOCH},
};

use gdk::prelude::*;
use gtk::prelude::*;

use crate::error::{BuddyError, BuddyResult};

use super::{
    animation::{
        native_pet_completed_animation_fallback, native_pet_requested_animation_fallback,
        NativePetAnimationName, NativePetAnimationPlayback, NativePetAnimationSet,
    },
    assets::{load_default_app_icon, load_default_pet_animation_set, load_default_pet_spritesheet},
    bounds::{
        native_pet_runtime_initial_placement, native_pet_runtime_resolve_window_placement,
        NativePetBoundsResolution,
    },
    coordinates::{
        native_pet_cursor_position, NativePetLogicalOffset, NativePetLogicalPoint,
        NativePetLogicalSize, NativePetLogicalVelocity, NATIVE_PET_COORDINATE_SPACE,
    },
    drag_state::{NativePetDragFrameUpdate, NativePetDragPhase, NativePetDragStateMachine},
    geometry::{native_pet_window_logical_size, NativePetFacing},
    layer_shell::LayerShellApi,
    physics::{native_pet_clamped_dt_seconds, NativePetInertiaState, NativePetPhysicsPhase},
    physics_params::NativePetPhysicsParams,
    process::{
        create_native_pet_control_channel, drain_native_pet_control_messages,
        emit_native_pet_sidecar_event, NativePetControlMessage, NativePetControlPoll,
        NativePetLaunchConfig, NativePetLayer, NativePetSidecarEvent,
    },
    renderer::{
        clear_transparent, draw_pet_frame, install_transparent_window_css,
        native_pet_pointer_hits_visible_pet,
    },
    window_movement::NativePetWindowMovementAdapter,
};

const NATIVE_PET_DRAG_DEBUG_ENV: &str = "LEXORA_BUDDY_NATIVE_PET_DRAG_DEBUG";
const DEFAULT_FRAME_ELAPSED_MS: u64 = 16;
const MAX_FRAME_ELAPSED_MS: u64 = 64;
const NATIVE_PET_DRAG_COMMIT_INTERVAL_MS: u64 = 16;
const NATIVE_PET_EDGE_RUNOUT_MIN_MS: u64 = 260;
const NATIVE_PET_EDGE_RUNOUT_MAX_MS: u64 = 420;
const NATIVE_PET_OPEN_CHAT_DOUBLE_CLICK_MAX_MS: u64 = 450;
const NATIVE_PET_OPEN_CHAT_DOUBLE_CLICK_MAX_DISTANCE: f64 = 24.0;
const NATIVE_PET_IDLE_PRESENCE_AFTER_IDLE_MS: [u64; 2] = [18_000, 31_000];
const NATIVE_PET_IDLE_PRESENCE_DRIFT_MS: [i64; 5] = [0, 1_000, -1_000, 500, -500];
const NATIVE_PET_IDLE_PRESENCE_TRIGGER_WINDOW_MS: u64 = MAX_FRAME_ELAPSED_MS * 2;
const NATIVE_PET_SLEEP_AFTER_IDLE_MS: u64 = 45_000;
const NATIVE_PET_TASK_PRESENCE_FIRST_AFTER_MS: u64 = 22_000;
const NATIVE_PET_TASK_PRESENCE_INTERVAL_MS: u64 = 24_000;
const NATIVE_PET_TASK_PRESENCE_TRIGGER_WINDOW_MS: u64 = MAX_FRAME_ELAPSED_MS * 2;

#[derive(Debug, Clone)]
struct NativePetDragState {
    grabbed_seat: Option<gdk::Seat>,
    last_commit_frame_time_ms: Option<u64>,
    machine: NativePetDragStateMachine,
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct NativePetOpenChatClick {
    time_ms: u64,
    position: NativePetLogicalPoint,
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct NativePetEdgeRunoutState {
    animation: NativePetAnimationName,
    finish_animation: NativePetAnimationName,
    remaining_ms: u64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct NativePetEdgeRunoutStep {
    animation: NativePetAnimationName,
    next_state: Option<NativePetEdgeRunoutState>,
}

#[derive(Clone)]
struct NativePetRuntimeState {
    animation_playback: Rc<Cell<NativePetAnimationPlayback>>,
    control_messages: Rc<std::sync::mpsc::Receiver<NativePetControlMessage>>,
    drag_state: Rc<RefCell<Option<NativePetDragState>>>,
    edge_runout_state: Rc<Cell<Option<NativePetEdgeRunoutState>>>,
    idle_lifecycle_elapsed_ms: Rc<Cell<u64>>,
    idle_presence_schedule_seed: Rc<Cell<u64>>,
    inertia_state: Rc<RefCell<Option<NativePetInertiaState>>>,
    open_chat_click: Rc<Cell<Option<NativePetOpenChatClick>>>,
    pet_animations: Rc<NativePetAnimationSet>,
    pet_facing: Rc<Cell<NativePetFacing>>,
    physics_params: Rc<NativePetPhysicsParams>,
    pointer_hovered: Rc<Cell<bool>>,
    requested_animation: Rc<Cell<NativePetAnimationName>>,
    task_presence_elapsed_ms: Rc<Cell<u64>>,
    throw_outcome_seed: Rc<Cell<u64>>,
}

impl NativePetRuntimeState {
    fn new() -> BuddyResult<Self> {
        Ok(Self {
            animation_playback: Rc::new(Cell::new(NativePetAnimationPlayback::new(
                native_pet_initial_animation(),
            ))),
            control_messages: Rc::new(create_native_pet_control_channel()),
            drag_state: Rc::new(RefCell::new(None)),
            edge_runout_state: Rc::new(Cell::new(None)),
            idle_lifecycle_elapsed_ms: Rc::new(Cell::new(0)),
            idle_presence_schedule_seed: Rc::new(Cell::new(
                native_pet_initial_idle_presence_schedule_seed(),
            )),
            inertia_state: Rc::new(RefCell::new(None)),
            open_chat_click: Rc::new(Cell::new(None)),
            pet_animations: Rc::new(load_default_pet_animation_set()?),
            pet_facing: Rc::new(Cell::new(NativePetFacing::Left)),
            physics_params: Rc::new(NativePetPhysicsParams::default()),
            pointer_hovered: Rc::new(Cell::new(false)),
            requested_animation: Rc::new(Cell::new(NativePetAnimationName::Idle)),
            task_presence_elapsed_ms: Rc::new(Cell::new(0)),
            throw_outcome_seed: Rc::new(Cell::new(native_pet_initial_throw_outcome_seed())),
        })
    }
}

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
        let window_position = Rc::clone(&window_position);
        drawing_area.connect_button_press_event(move |drawing_area, event| {
            let mut playback = animation_playback.get();
            let (local_x, local_y) = event.position();
            let press_time_ms = native_pet_event_time_ms(event.time());
            let press_position = NativePetLogicalPoint::new(local_x, local_y);
            let pointer_hits_visible_pet = native_pet_pointer_hits_visible_pet(
                &pet_spritesheet,
                &pet_animations,
                playback,
                local_x,
                local_y,
            );
            if native_pet_pointer_press_can_open_chat(pointer_hits_visible_pet, event.button()) {
                if native_pet_button_press_opens_chat(event)
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
            let press_cursor_position =
                native_pet_window_local_pointer_tracking_position(origin_position, local_x, local_y);
            let machine = NativePetDragStateMachine::begin_with_grab_offset(
                press_cursor_position,
                NativePetLogicalOffset {
                    x: local_x,
                    y: local_y,
                },
                native_pet_event_time_ms(event.time()),
            );
            let grab_offset = machine.grab_offset();
            drag_state.replace(Some(NativePetDragState {
                grabbed_seat: native_pet_grab_pointer(drawing_area, event),
                last_commit_frame_time_ms: None,
                machine,
            }));
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
                    record_native_pet_drag_motion_sample(
                        &mut state.machine,
                        native_pet_window_local_pointer_tracking_position(
                            window_position.get(),
                            local_x,
                            local_y,
                        ),
                        native_pet_event_time_ms(event.time()),
                    );
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
                    if let Some(update) = state.machine.flush_pointer_sample(
                        native_pet_window_local_pointer_tracking_position(
                            window_position.get(),
                            local_x,
                            local_y,
                        ),
                        native_pet_event_time_ms(event.time()),
                    ) {
                        let movement_adapter = NativePetWindowMovementAdapter::new(
                            &gtk_window,
                            layer_shell.as_ref().as_ref(),
                            &window_monitor_index,
                            &window_position,
                        );
                        commit_native_pet_drag_update(
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
                drag_state.take()
            };

            if let Some(state) = state {
                let release = state.machine.release(&physics_params);
                if let Some(seat) = state.grabbed_seat {
                    seat.ungrab();
                }
                let (release_x, release_y) = event.position();
                let release_position = NativePetLogicalPoint::new(release_x, release_y);
                if release.was_dragging()
                    && open_chat_click.get().is_some_and(|previous| {
                        previous.position.distance_to(release_position)
                            > NATIVE_PET_OPEN_CHAT_DOUBLE_CLICK_MAX_DISTANCE
                    })
                {
                    open_chat_click.set(None);
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
                    phase = state.machine.phase();
                    let frame_time_ms = native_pet_frame_clock_time_ms(frame_time);
                    if let Some(update) = take_native_pet_drag_frame_update(state, frame_time_ms) {
                        let movement_adapter = NativePetWindowMovementAdapter::new(
                            &gtk_window,
                            layer_shell.as_ref().as_ref(),
                            &window_monitor_index,
                            &window_position,
                        );
                        commit_native_pet_drag_update(
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
            let is_motion_locked = is_dragging || is_inertia_active || is_edge_runout_active;

            if !is_motion_locked {
                let movement_adapter = NativePetWindowMovementAdapter::new(
                    &gtk_window,
                    layer_shell.as_ref().as_ref(),
                    &window_monitor_index,
                    &window_position,
                );
                reconcile_native_pet_visible_placement(
                    &movement_adapter,
                    window_position.get(),
                    window_monitor_index.get(),
                    window_size,
                    drag_debug,
                );
            }

            let control_poll =
                drain_native_pet_control_messages(&control_messages, |message| match message {
                    NativePetControlMessage::SetAnimation(animation) => {
                        let requested =
                            native_pet_requested_animation_for_control_animation(animation);
                        if requested_animation.replace(requested) != requested {
                            task_presence_elapsed_ms.set(0);
                        }
                        if !matches!(requested, NativePetAnimationName::Idle) {
                            if idle_lifecycle_elapsed_ms.get() > 0 {
                                idle_presence_schedule_seed.set(
                                    native_pet_next_idle_presence_schedule_seed(
                                        idle_presence_schedule_seed.get(),
                                    ),
                                );
                            }
                            idle_lifecycle_elapsed_ms.set(0);
                        }
                        if !is_motion_locked {
                            if !native_pet_should_keep_scripted_action_playing(playback.name) {
                                let target_animation = if animation == requested {
                                    native_pet_animation_for_lifecycle(
                                        pointer_hovered.get(),
                                        false,
                                        false,
                                        requested,
                                        playback.name,
                                        idle_lifecycle_elapsed_ms.get(),
                                        idle_presence_schedule_seed.get(),
                                    )
                                } else {
                                    animation
                                };
                                playback.restart_animation(target_animation);
                            }
                        }
                    }
                });
            if matches!(control_poll, NativePetControlPoll::Disconnected) {
                gtk::main_quit();
                return glib::ControlFlow::Break;
            }

            let current_idle_lifecycle_elapsed_ms = idle_lifecycle_elapsed_ms.get();
            let next_idle_lifecycle_elapsed_ms = native_pet_idle_lifecycle_elapsed_ms(
                current_idle_lifecycle_elapsed_ms,
                elapsed_ms,
                pointer_hovered.get(),
                is_dragging || is_edge_runout_active,
                is_inertia_active,
                requested_animation.get(),
            );
            if native_pet_should_rotate_idle_presence_schedule(
                current_idle_lifecycle_elapsed_ms,
                next_idle_lifecycle_elapsed_ms,
            ) {
                idle_presence_schedule_seed.set(native_pet_next_idle_presence_schedule_seed(
                    idle_presence_schedule_seed.get(),
                ));
            }
            idle_lifecycle_elapsed_ms.set(next_idle_lifecycle_elapsed_ms);
            let next_task_presence_elapsed_ms = native_pet_task_presence_elapsed_ms(
                task_presence_elapsed_ms.get(),
                elapsed_ms,
                pointer_hovered.get(),
                is_dragging || is_edge_runout_active,
                is_inertia_active,
                requested_animation.get(),
            );
            task_presence_elapsed_ms.set(next_task_presence_elapsed_ms);
            let lifecycle_animation = native_pet_animation_for_lifecycle(
                pointer_hovered.get(),
                is_dragging || is_edge_runout_active,
                is_inertia_active,
                requested_animation.get(),
                playback.name,
                next_idle_lifecycle_elapsed_ms,
                idle_presence_schedule_seed.get(),
            );
            if native_pet_should_apply_lifecycle_animation(playback.name, lifecycle_animation) {
                playback.set_animation(lifecycle_animation);
            }
            if let Some(task_presence_animation) = native_pet_task_presence_animation(
                pointer_hovered.get(),
                is_dragging || is_edge_runout_active,
                is_inertia_active,
                requested_animation.get(),
                playback.name,
                next_task_presence_elapsed_ms,
            ) {
                playback.set_animation(task_presence_animation);
            }

            let default_fallback = native_pet_requested_animation_fallback(&pet_animations, {
                if playback.name == NativePetAnimationName::Wake {
                    native_pet_animation_for_hover_state(
                        pointer_hovered.get(),
                        is_dragging,
                        is_inertia_active,
                        requested_animation.get(),
                        requested_animation.get(),
                    )
                } else {
                    lifecycle_animation
                }
            });
            let fallback = native_pet_completed_animation_fallback(playback.name, default_fallback);
            playback.advance(&pet_animations, elapsed_ms, fallback);
            animation_playback.set(playback);
            drawing_area.queue_draw();
            glib::ControlFlow::Continue
        });
    }

    gtk_window.show_all();
    gtk::main();
    Ok(())
}

fn native_pet_frame_elapsed_ms(previous_frame_time: Option<i64>, frame_time: i64) -> u64 {
    let Some(previous_frame_time) = previous_frame_time else {
        return DEFAULT_FRAME_ELAPSED_MS;
    };

    ((frame_time - previous_frame_time).max(0) as u64 / 1000).clamp(1, MAX_FRAME_ELAPSED_MS)
}

fn native_pet_event_time_ms(event_time: u32) -> u64 {
    u64::from(event_time)
}

fn native_pet_button_press_opens_chat(event: &gdk::EventButton) -> bool {
    event.button() == 1 && event.event_type() == gdk::EventType::DoubleButtonPress
}

fn native_pet_pointer_press_can_open_chat(pointer_hits_visible_pet: bool, button: u32) -> bool {
    pointer_hits_visible_pet && button == 1
}

fn native_pet_open_chat_click_matches(
    previous: Option<NativePetOpenChatClick>,
    current_time_ms: u64,
    current_position: NativePetLogicalPoint,
) -> bool {
    let Some(previous) = previous else {
        return false;
    };

    let elapsed_ms = current_time_ms.saturating_sub(previous.time_ms);
    elapsed_ms > 0
        && elapsed_ms <= NATIVE_PET_OPEN_CHAT_DOUBLE_CLICK_MAX_MS
        && previous.position.distance_to(current_position)
            <= NATIVE_PET_OPEN_CHAT_DOUBLE_CLICK_MAX_DISTANCE
}

fn native_pet_frame_clock_time_ms(frame_time: i64) -> u64 {
    (frame_time.max(0) as u64) / 1000
}

fn native_pet_frame_dt_seconds(
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

fn record_native_pet_drag_motion_sample(
    machine: &mut NativePetDragStateMachine,
    cursor_position: NativePetLogicalPoint,
    event_time_ms: u64,
) {
    machine.record_pointer_sample(cursor_position, event_time_ms);
}

fn native_pet_window_local_pointer_tracking_position(
    window_position: crate::native_pet::coordinates::NativePetPosition,
    local_x: f64,
    local_y: f64,
) -> NativePetLogicalPoint {
    native_pet_cursor_position(
        f64::from(window_position.x) + local_x,
        f64::from(window_position.y) + local_y,
    )
}

fn take_native_pet_drag_frame_update(
    state: &mut NativePetDragState,
    frame_time_ms: u64,
) -> Option<NativePetDragFrameUpdate> {
    if !native_pet_should_commit_drag_frame(state.last_commit_frame_time_ms, frame_time_ms) {
        return None;
    }

    let update = state.machine.take_frame_update()?;
    state.last_commit_frame_time_ms = Some(frame_time_ms);
    Some(update)
}

fn native_pet_should_commit_drag_frame(
    last_commit_frame_time_ms: Option<u64>,
    frame_time_ms: u64,
) -> bool {
    last_commit_frame_time_ms
        .map(|last_commit_frame_time_ms| {
            frame_time_ms.saturating_sub(last_commit_frame_time_ms)
                >= NATIVE_PET_DRAG_COMMIT_INTERVAL_MS
        })
        .unwrap_or(true)
}

fn commit_native_pet_drag_update(
    state: &mut NativePetDragState,
    update: NativePetDragFrameUpdate,
    playback: &mut NativePetAnimationPlayback,
    pet_facing: &Cell<NativePetFacing>,
    movement_adapter: &NativePetWindowMovementAdapter<'_>,
    window_size: NativePetLogicalSize,
    drag_debug: bool,
) {
    if update.movement_dx.abs() > 1.0 {
        pet_facing.set(if update.movement_dx > 0.0 {
            NativePetFacing::Right
        } else {
            NativePetFacing::Left
        });
    }

    if matches!(update.phase, NativePetDragPhase::Dragging) {
        playback.set_animation(NativePetAnimationName::Drag);
        let cursor_position = state.machine.latest_cursor_position();
        let bounds = native_pet_runtime_resolve_window_placement(
            update.position,
            window_size,
            Some(cursor_position),
        );
        movement_adapter.move_to(bounds.placement);
        if drag_debug {
            eprintln!(
                "native-pet-drag-debug frame cursor=({:.1},{:.1}) dx={:.1} distance={:.1} position=({}, {}) monitor={:?} visibility={:?}",
                cursor_position.x,
                cursor_position.y,
                update.movement_dx,
                update.distance,
                bounds.placement.position.x,
                bounds.placement.position.y,
                bounds.placement.monitor_index,
                bounds.visibility,
            );
        }
    } else if drag_debug {
        let cursor_position = state.machine.latest_cursor_position();
        eprintln!(
            "native-pet-drag-debug frame cursor=({:.1},{:.1}) dx={:.1} distance={:.1} pending",
            cursor_position.x, cursor_position.y, update.movement_dx, update.distance
        );
    }
}

fn reconcile_native_pet_visible_placement(
    movement_adapter: &NativePetWindowMovementAdapter<'_>,
    current_position: crate::native_pet::coordinates::NativePetPosition,
    current_monitor_index: Option<i32>,
    window_size: NativePetLogicalSize,
    drag_debug: bool,
) {
    let bounds = native_pet_runtime_resolve_window_placement(current_position, window_size, None);
    if !native_pet_bounds_changed(bounds, current_position, current_monitor_index) {
        return;
    }

    movement_adapter.move_to(bounds.placement);
    if drag_debug {
        eprintln!(
            "native-pet-drag-debug reconcile visibility={:?} position=({}, {}) monitor={:?} recovered={} clamped={}",
            bounds.visibility,
            bounds.placement.position.x,
            bounds.placement.position.y,
            bounds.placement.monitor_index,
            bounds.was_recovered,
            bounds.was_clamped,
        );
    }
}

fn native_pet_bounds_changed(
    bounds: NativePetBoundsResolution,
    current_position: crate::native_pet::coordinates::NativePetPosition,
    current_monitor_index: Option<i32>,
) -> bool {
    bounds.placement.position != current_position
        || bounds.placement.monitor_index != current_monitor_index
}

fn native_pet_edge_runout_after_inertia_step(
    hit_position_clamp: bool,
    facing: NativePetFacing,
    impact_velocity: NativePetLogicalVelocity,
    finish_animation: NativePetAnimationName,
    physics_params: &NativePetPhysicsParams,
) -> Option<NativePetEdgeRunoutState> {
    if !hit_position_clamp {
        return None;
    }

    Some(NativePetEdgeRunoutState {
        animation: native_pet_animation_for_velocity(impact_velocity, facing),
        finish_animation,
        remaining_ms: native_pet_edge_runout_duration_ms(impact_velocity, physics_params),
    })
}

fn native_pet_edge_runout_duration_ms(
    impact_velocity: NativePetLogicalVelocity,
    physics_params: &NativePetPhysicsParams,
) -> u64 {
    let speed_ratio =
        (impact_velocity.x.abs() / physics_params.max_velocity_logical_px_per_s).clamp(0.0, 1.0);
    let duration_ms = NATIVE_PET_EDGE_RUNOUT_MIN_MS as f64
        + (NATIVE_PET_EDGE_RUNOUT_MAX_MS - NATIVE_PET_EDGE_RUNOUT_MIN_MS) as f64 * speed_ratio;

    duration_ms.round() as u64
}

fn native_pet_advance_edge_runout(
    state: NativePetEdgeRunoutState,
    elapsed_ms: u64,
) -> NativePetEdgeRunoutStep {
    if elapsed_ms >= state.remaining_ms {
        return NativePetEdgeRunoutStep {
            animation: state.finish_animation,
            next_state: None,
        };
    }

    NativePetEdgeRunoutStep {
        animation: state.animation,
        next_state: Some(NativePetEdgeRunoutState {
            animation: state.animation,
            finish_animation: state.finish_animation,
            remaining_ms: state.remaining_ms - elapsed_ms,
        }),
    }
}

fn native_pet_animation_for_facing(facing: NativePetFacing) -> NativePetAnimationName {
    match facing {
        NativePetFacing::Left => NativePetAnimationName::RunLeft,
        NativePetFacing::Right => NativePetAnimationName::RunRight,
    }
}

fn native_pet_animation_for_velocity(
    velocity: crate::native_pet::coordinates::NativePetLogicalVelocity,
    facing: NativePetFacing,
) -> NativePetAnimationName {
    if velocity.x.abs() > 1.0 {
        if velocity.x > 0.0 {
            return NativePetAnimationName::RunRight;
        }
        return NativePetAnimationName::RunLeft;
    }

    native_pet_animation_for_facing(facing)
}

fn native_pet_initial_animation() -> NativePetAnimationName {
    NativePetAnimationName::Wake
}

fn native_pet_animation_after_drag_release(
    was_dragging: bool,
    inertia_velocity: Option<crate::native_pet::coordinates::NativePetLogicalVelocity>,
    facing: NativePetFacing,
) -> NativePetAnimationName {
    if !was_dragging {
        return NativePetAnimationName::Tap;
    }

    if let Some(velocity) = inertia_velocity {
        return native_pet_animation_for_velocity(velocity, facing);
    }

    NativePetAnimationName::Idle
}

fn native_pet_animation_after_throw_runout(
    run_animation: NativePetAnimationName,
    variant_seed: u64,
) -> NativePetAnimationName {
    match (run_animation, variant_seed % 3) {
        (_, 0) => NativePetAnimationName::Idle,
        (NativePetAnimationName::RunLeft, 1) => NativePetAnimationName::TripFallLeft,
        (NativePetAnimationName::RunRight, 1) => NativePetAnimationName::TripFallRight,
        (NativePetAnimationName::RunLeft, _) => NativePetAnimationName::StumbleRecoverLeft,
        (NativePetAnimationName::RunRight, _) => NativePetAnimationName::StumbleRecoverRight,
        _ => NativePetAnimationName::Idle,
    }
}

fn native_pet_requested_animation_for_control_animation(
    control_animation: NativePetAnimationName,
) -> NativePetAnimationName {
    if native_pet_is_finite_scripted_action(control_animation) {
        return NativePetAnimationName::Idle;
    }

    control_animation
}

fn native_pet_fallen_get_up_animation(
    current: NativePetAnimationName,
) -> Option<NativePetAnimationName> {
    match current {
        NativePetAnimationName::FallenIdleLeft => Some(NativePetAnimationName::FallenGetUpLeft),
        NativePetAnimationName::FallenIdleRight => Some(NativePetAnimationName::FallenGetUpRight),
        _ => None,
    }
}

fn native_pet_should_keep_fallen_waiting(current: NativePetAnimationName) -> bool {
    matches!(
        current,
        NativePetAnimationName::FallenIdleLeft | NativePetAnimationName::FallenIdleRight
    )
}

fn native_pet_should_keep_scripted_action_playing(current: NativePetAnimationName) -> bool {
    native_pet_is_finite_scripted_action(current) || native_pet_should_keep_fallen_waiting(current)
}

fn native_pet_is_finite_scripted_action(current: NativePetAnimationName) -> bool {
    matches!(
        current,
        NativePetAnimationName::TripFallLeft
            | NativePetAnimationName::FallenGetUpLeft
            | NativePetAnimationName::TripFallRight
            | NativePetAnimationName::FallenGetUpRight
            | NativePetAnimationName::StumbleRecoverLeft
            | NativePetAnimationName::StumbleRecoverRight
    )
}

fn native_pet_should_block_pointer_interaction(current: NativePetAnimationName) -> bool {
    native_pet_should_keep_scripted_action_playing(current)
        && !native_pet_should_keep_fallen_waiting(current)
}

fn native_pet_animation_for_hover_state(
    pointer_hovered: bool,
    is_dragging: bool,
    is_inertia_active: bool,
    requested: NativePetAnimationName,
    current: NativePetAnimationName,
) -> NativePetAnimationName {
    if is_dragging || is_inertia_active {
        return requested;
    }

    if native_pet_should_preserve_animation_during_hover_transition(current) {
        return current;
    }

    if matches!(current, NativePetAnimationName::Sleep) {
        if pointer_hovered {
            return NativePetAnimationName::Wake;
        }

        return NativePetAnimationName::Sleep;
    }

    if pointer_hovered {
        return NativePetAnimationName::Hover;
    }

    requested
}

fn native_pet_should_preserve_animation_during_hover_transition(
    current: NativePetAnimationName,
) -> bool {
    matches!(
        current,
        NativePetAnimationName::Wake
            | NativePetAnimationName::Tap
            | NativePetAnimationName::GrabStart
            | NativePetAnimationName::Approval
            | NativePetAnimationName::Thinking
            | NativePetAnimationName::Working
            | NativePetAnimationName::Celebrate
            | NativePetAnimationName::Sad
            | NativePetAnimationName::Reassure
            | NativePetAnimationName::Explain
            | NativePetAnimationName::Curious
            | NativePetAnimationName::TripFallLeft
            | NativePetAnimationName::FallenIdleLeft
            | NativePetAnimationName::FallenGetUpLeft
            | NativePetAnimationName::TripFallRight
            | NativePetAnimationName::FallenIdleRight
            | NativePetAnimationName::FallenGetUpRight
            | NativePetAnimationName::StumbleRecoverLeft
            | NativePetAnimationName::StumbleRecoverRight
    )
}

fn native_pet_idle_lifecycle_elapsed_ms(
    current_elapsed_ms: u64,
    elapsed_ms: u64,
    pointer_hovered: bool,
    is_dragging: bool,
    is_inertia_active: bool,
    requested: NativePetAnimationName,
) -> u64 {
    if matches!(requested, NativePetAnimationName::Idle)
        && !pointer_hovered
        && !is_dragging
        && !is_inertia_active
    {
        return current_elapsed_ms.saturating_add(elapsed_ms);
    }

    0
}

fn native_pet_task_presence_elapsed_ms(
    current_elapsed_ms: u64,
    elapsed_ms: u64,
    pointer_hovered: bool,
    is_dragging: bool,
    is_inertia_active: bool,
    requested: NativePetAnimationName,
) -> u64 {
    if native_pet_is_task_presence_state(requested)
        && !pointer_hovered
        && !is_dragging
        && !is_inertia_active
    {
        return current_elapsed_ms.saturating_add(elapsed_ms);
    }

    0
}

fn native_pet_task_presence_animation(
    pointer_hovered: bool,
    is_dragging: bool,
    is_inertia_active: bool,
    requested: NativePetAnimationName,
    current: NativePetAnimationName,
    task_presence_elapsed_ms: u64,
) -> Option<NativePetAnimationName> {
    if pointer_hovered || is_dragging || is_inertia_active || current != requested {
        return None;
    }

    if !native_pet_is_task_presence_state(requested) {
        return None;
    }

    if native_pet_should_play_task_presence_reaction(task_presence_elapsed_ms) {
        return Some(native_pet_task_presence_reaction_animation(requested));
    }

    None
}

fn native_pet_task_presence_reaction_animation(
    requested: NativePetAnimationName,
) -> NativePetAnimationName {
    match requested {
        NativePetAnimationName::Thinking => NativePetAnimationName::Explain,
        NativePetAnimationName::Approval => NativePetAnimationName::Hover,
        NativePetAnimationName::Working => NativePetAnimationName::Curious,
        _ => NativePetAnimationName::Curious,
    }
}

fn native_pet_is_task_presence_state(requested: NativePetAnimationName) -> bool {
    matches!(
        requested,
        NativePetAnimationName::Thinking
            | NativePetAnimationName::Working
            | NativePetAnimationName::Approval
    )
}

fn native_pet_should_play_task_presence_reaction(task_presence_elapsed_ms: u64) -> bool {
    if task_presence_elapsed_ms < NATIVE_PET_TASK_PRESENCE_FIRST_AFTER_MS {
        return false;
    }

    let elapsed_after_first = task_presence_elapsed_ms - NATIVE_PET_TASK_PRESENCE_FIRST_AFTER_MS;
    elapsed_after_first % NATIVE_PET_TASK_PRESENCE_INTERVAL_MS
        < NATIVE_PET_TASK_PRESENCE_TRIGGER_WINDOW_MS
}

fn native_pet_animation_for_lifecycle(
    pointer_hovered: bool,
    is_dragging: bool,
    is_inertia_active: bool,
    requested: NativePetAnimationName,
    current: NativePetAnimationName,
    idle_elapsed_ms: u64,
    idle_presence_schedule_seed: u64,
) -> NativePetAnimationName {
    if is_dragging || is_inertia_active {
        return requested;
    }

    if matches!(requested, NativePetAnimationName::Idle)
        && matches!(current, NativePetAnimationName::Sad)
    {
        return NativePetAnimationName::Reassure;
    }

    if matches!(requested, NativePetAnimationName::Idle)
        && matches!(current, NativePetAnimationName::Working)
    {
        return NativePetAnimationName::Celebrate;
    }

    if !matches!(requested, NativePetAnimationName::Idle) {
        if matches!(current, NativePetAnimationName::Sleep) {
            return NativePetAnimationName::Wake;
        }

        return requested;
    }

    if pointer_hovered {
        if matches!(current, NativePetAnimationName::Sleep) {
            return NativePetAnimationName::Wake;
        }

        return NativePetAnimationName::Hover;
    }

    if idle_elapsed_ms >= NATIVE_PET_SLEEP_AFTER_IDLE_MS {
        return NativePetAnimationName::Sleep;
    }

    if let Some(animation) =
        native_pet_idle_presence_reaction_animation(idle_elapsed_ms, idle_presence_schedule_seed)
    {
        return animation;
    }

    NativePetAnimationName::Idle
}

fn native_pet_idle_presence_reaction_animation(
    idle_elapsed_ms: u64,
    idle_presence_schedule_seed: u64,
) -> Option<NativePetAnimationName> {
    NATIVE_PET_IDLE_PRESENCE_AFTER_IDLE_MS
        .iter()
        .enumerate()
        .find_map(|(index, threshold_ms)| {
            let threshold_ms = native_pet_idle_presence_threshold_ms(
                *threshold_ms,
                index,
                idle_presence_schedule_seed,
            );
            if idle_elapsed_ms < threshold_ms
                || idle_elapsed_ms >= threshold_ms + NATIVE_PET_IDLE_PRESENCE_TRIGGER_WINDOW_MS
            {
                return None;
            }

            Some(native_pet_idle_presence_reaction_for_seed(
                idle_presence_schedule_seed,
                index,
            ))
        })
}

fn native_pet_idle_presence_reaction_for_seed(
    idle_presence_schedule_seed: u64,
    threshold_index: usize,
) -> NativePetAnimationName {
    let branch = idle_presence_schedule_seed.wrapping_add(threshold_index as u64);
    match branch % 3 {
        0 => NativePetAnimationName::Idle,
        _ => NativePetAnimationName::Curious,
    }
}

fn native_pet_idle_presence_threshold_ms(
    threshold_ms: u64,
    threshold_index: usize,
    idle_presence_schedule_seed: u64,
) -> u64 {
    if idle_presence_schedule_seed == 0 {
        return threshold_ms;
    }

    let drift_index = ((idle_presence_schedule_seed + threshold_index as u64) as usize)
        % NATIVE_PET_IDLE_PRESENCE_DRIFT_MS.len();
    let drift_ms = NATIVE_PET_IDLE_PRESENCE_DRIFT_MS[drift_index];
    if drift_ms >= 0 {
        return threshold_ms.saturating_add(drift_ms as u64);
    }

    threshold_ms.saturating_sub(drift_ms.unsigned_abs())
}

fn native_pet_initial_idle_presence_schedule_seed() -> u64 {
    let Ok(duration) = SystemTime::now().duration_since(UNIX_EPOCH) else {
        return 0;
    };

    duration.as_secs() ^ u64::from(duration.subsec_nanos())
}

fn native_pet_initial_throw_outcome_seed() -> u64 {
    native_pet_initial_idle_presence_schedule_seed()
}

fn native_pet_next_idle_presence_schedule_seed(current_seed: u64) -> u64 {
    current_seed.wrapping_add(1)
}

fn native_pet_next_throw_outcome_seed(current_seed: u64) -> u64 {
    current_seed.wrapping_add(1)
}

fn native_pet_should_rotate_idle_presence_schedule(
    current_idle_elapsed_ms: u64,
    next_idle_elapsed_ms: u64,
) -> bool {
    current_idle_elapsed_ms > 0 && next_idle_elapsed_ms == 0
}

fn native_pet_should_apply_lifecycle_animation(
    current: NativePetAnimationName,
    target: NativePetAnimationName,
) -> bool {
    current != target
        && matches!(
            current,
            NativePetAnimationName::Idle
                | NativePetAnimationName::Sleep
                | NativePetAnimationName::Hover
        )
}

fn native_pet_should_start_pointer_interaction(pointer_hits_visible_pet: bool) -> bool {
    pointer_hits_visible_pet
}

fn native_pet_pointer_cursor_name(
    pointer_hits_visible_pet: bool,
    is_dragging: bool,
) -> Option<&'static str> {
    if is_dragging {
        return Some("grabbing");
    }

    if pointer_hits_visible_pet {
        return Some("grab");
    }

    None
}

fn native_pet_apply_pointer_cursor(drawing_area: &gtk::DrawingArea, cursor_name: Option<&str>) {
    let Some(window) = gtk::prelude::WidgetExt::window(drawing_area) else {
        return;
    };

    let cursor = cursor_name.and_then(|name| gdk::Cursor::from_name(&window.display(), name));
    window.set_cursor(cursor.as_ref());
}

fn validate_layer_shell_availability(layer: NativePetLayer, available: bool) -> BuddyResult<()> {
    if matches!(layer, NativePetLayer::AlwaysOnTop) && !available {
        return Err(BuddyError::Runtime(
            "gtk-layer-shell is required for always-on-top native pet window".to_owned(),
        ));
    }

    Ok(())
}

fn native_pet_grab_pointer(
    drawing_area: &gtk::DrawingArea,
    event: &gdk::EventButton,
) -> Option<gdk::Seat> {
    let seat = event.device().and_then(|device| device.seat())?;
    let window = gtk::prelude::WidgetExt::window(drawing_area)?;
    let status = seat.grab(
        &window,
        gdk::SeatCapabilities::POINTER,
        false,
        None,
        None,
        None,
    );

    if status == gdk::GrabStatus::Success {
        Some(seat)
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use crate::native_pet::{
        animation::{native_pet_requested_animation_fallback, NativePetAnimationName},
        assets::load_default_pet_animation_set,
        coordinates::{NativePetLogicalPoint, NativePetLogicalVelocity, NativePetPosition},
        drag_state::{NativePetDragPhase, NativePetDragStateMachine},
        geometry::NativePetFacing,
        process::NativePetLayer,
    };

    use super::validate_layer_shell_availability;
    use super::{
        native_pet_advance_edge_runout, native_pet_animation_after_drag_release,
        native_pet_animation_after_throw_runout, native_pet_animation_for_hover_state,
        native_pet_animation_for_lifecycle, native_pet_edge_runout_after_inertia_step,
        native_pet_fallen_get_up_animation, native_pet_frame_dt_seconds,
        native_pet_idle_lifecycle_elapsed_ms, native_pet_open_chat_click_matches,
        native_pet_pointer_cursor_name, native_pet_pointer_press_can_open_chat,
        native_pet_requested_animation_for_control_animation,
        native_pet_should_apply_lifecycle_animation, native_pet_should_block_pointer_interaction,
        native_pet_should_keep_fallen_waiting, native_pet_should_keep_scripted_action_playing,
        native_pet_should_start_pointer_interaction, native_pet_task_presence_animation,
        native_pet_task_presence_elapsed_ms, native_pet_window_local_pointer_tracking_position,
        record_native_pet_drag_motion_sample, take_native_pet_drag_frame_update,
        NativePetDragState, NativePetEdgeRunoutState, NativePetOpenChatClick,
        NATIVE_PET_EDGE_RUNOUT_MAX_MS, NATIVE_PET_EDGE_RUNOUT_MIN_MS,
    };
    use crate::native_pet::physics_params::NativePetPhysicsParams;

    #[test]
    fn rejects_always_on_top_without_layer_shell() {
        assert!(validate_layer_shell_availability(NativePetLayer::AlwaysOnTop, false).is_err());
    }

    #[test]
    fn opens_chat_for_nearby_second_primary_click() {
        let previous = NativePetOpenChatClick {
            time_ms: 1_000,
            position: NativePetLogicalPoint::new(80.0, 120.0),
        };

        assert!(native_pet_open_chat_click_matches(
            Some(previous),
            1_260,
            NativePetLogicalPoint::new(88.0, 130.0),
        ));
    }

    #[test]
    fn ignores_stale_or_distant_open_chat_click_candidate() {
        let previous = NativePetOpenChatClick {
            time_ms: 1_000,
            position: NativePetLogicalPoint::new(80.0, 120.0),
        };

        assert!(!native_pet_open_chat_click_matches(
            Some(previous),
            1_800,
            NativePetLogicalPoint::new(82.0, 121.0),
        ));
        assert!(!native_pet_open_chat_click_matches(
            Some(previous),
            1_220,
            NativePetLogicalPoint::new(140.0, 120.0),
        ));
        assert!(!native_pet_open_chat_click_matches(
            None,
            1_220,
            NativePetLogicalPoint::new(80.0, 120.0),
        ));
    }

    #[test]
    fn ignores_transparent_pointer_press_for_open_chat_candidate() {
        assert!(native_pet_pointer_press_can_open_chat(true, 1));
        assert!(!native_pet_pointer_press_can_open_chat(false, 1));
        assert!(!native_pet_pointer_press_can_open_chat(true, 3));
    }

    #[test]
    fn starts_with_wake_transition_before_idle_loop() {
        assert_eq!(
            super::native_pet_initial_animation(),
            NativePetAnimationName::Wake
        );
        assert_eq!(
            native_pet_requested_animation_fallback(
                &load_default_pet_animation_set().expect("native pet animation manifest loads"),
                NativePetAnimationName::Wake,
            ),
            NativePetAnimationName::Idle
        );
    }

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

    #[test]
    fn pointer_motion_coalesces_multiple_samples_until_frame_clock() {
        let mut drag = NativePetDragStateMachine::begin(
            NativePetPosition { x: 200, y: 300 },
            NativePetLogicalPoint::new(500.0, 500.0),
            0,
        );

        record_native_pet_drag_motion_sample(
            &mut drag,
            NativePetLogicalPoint::new(512.0, 506.0),
            8,
        );
        record_native_pet_drag_motion_sample(
            &mut drag,
            NativePetLogicalPoint::new(528.0, 514.0),
            12,
        );
        let update = drag.take_frame_update().expect("frame-clock update");

        assert_eq!(update.phase, NativePetDragPhase::Dragging);
        assert_eq!(update.position, NativePetPosition { x: 228, y: 314 });
        assert!(drag.take_frame_update().is_none());
    }

    #[test]
    fn pointer_motion_waits_for_frame_clock_before_committing_position() {
        let mut drag = NativePetDragStateMachine::begin(
            NativePetPosition { x: 200, y: 300 },
            NativePetLogicalPoint::new(500.0, 500.0),
            0,
        );

        record_native_pet_drag_motion_sample(
            &mut drag,
            NativePetLogicalPoint::new(512.0, 506.0),
            8,
        );

        let frame_update = drag.take_frame_update().expect("frame-clock update");
        assert_eq!(frame_update.phase, NativePetDragPhase::Dragging);
        assert_eq!(frame_update.position, NativePetPosition { x: 212, y: 306 });
    }

    #[test]
    fn maps_window_local_pointer_position_into_drag_tracking_space() {
        let position = native_pet_window_local_pointer_tracking_position(
            NativePetPosition { x: 924, y: 686 },
            84.0,
            66.0,
        );

        assert_eq!(position, NativePetLogicalPoint::new(1008.0, 752.0));
    }

    #[test]
    fn drag_frame_updates_are_rate_limited_while_preserving_latest_pointer_position() {
        let mut state = NativePetDragState {
            grabbed_seat: None,
            last_commit_frame_time_ms: None,
            machine: NativePetDragStateMachine::begin(
                NativePetPosition { x: 200, y: 300 },
                NativePetLogicalPoint::new(500.0, 500.0),
                0,
            ),
        };

        record_native_pet_drag_motion_sample(
            &mut state.machine,
            NativePetLogicalPoint::new(512.0, 506.0),
            6,
        );
        let first = take_native_pet_drag_frame_update(&mut state, 6).expect("first frame update");
        assert_eq!(first.position, NativePetPosition { x: 212, y: 306 });

        record_native_pet_drag_motion_sample(
            &mut state.machine,
            NativePetLogicalPoint::new(528.0, 514.0),
            12,
        );
        assert!(take_native_pet_drag_frame_update(&mut state, 12).is_none());

        record_native_pet_drag_motion_sample(
            &mut state.machine,
            NativePetLogicalPoint::new(540.0, 520.0),
            22,
        );
        let second =
            take_native_pet_drag_frame_update(&mut state, 22).expect("second frame update");
        assert_eq!(second.position, NativePetPosition { x: 240, y: 320 });
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
    fn starts_directional_edge_runout_when_inertia_hits_bounds() {
        let params = NativePetPhysicsParams::default();
        let runout = native_pet_edge_runout_after_inertia_step(
            true,
            NativePetFacing::Left,
            NativePetLogicalVelocity { x: -900.0, y: 0.0 },
            NativePetAnimationName::TripFallLeft,
            &params,
        )
        .expect("edge runout");

        assert_eq!(runout.animation, NativePetAnimationName::RunLeft);
        assert_eq!(
            runout.finish_animation,
            NativePetAnimationName::TripFallLeft
        );
        assert!(runout.remaining_ms >= NATIVE_PET_EDGE_RUNOUT_MIN_MS);
        assert!(runout.remaining_ms <= NATIVE_PET_EDGE_RUNOUT_MAX_MS);
    }

    #[test]
    fn edge_runout_duration_scales_with_impact_speed() {
        let params = NativePetPhysicsParams::default();
        let gentle = native_pet_edge_runout_after_inertia_step(
            true,
            NativePetFacing::Right,
            NativePetLogicalVelocity { x: 420.0, y: 0.0 },
            NativePetAnimationName::Idle,
            &params,
        )
        .expect("gentle edge runout");
        let fast = native_pet_edge_runout_after_inertia_step(
            true,
            NativePetFacing::Right,
            NativePetLogicalVelocity { x: 1800.0, y: 0.0 },
            NativePetAnimationName::Idle,
            &params,
        )
        .expect("fast edge runout");

        let midpoint_ms = (NATIVE_PET_EDGE_RUNOUT_MIN_MS + NATIVE_PET_EDGE_RUNOUT_MAX_MS) / 2;

        assert!(gentle.remaining_ms < midpoint_ms);
        assert!(fast.remaining_ms > midpoint_ms);
    }

    #[test]
    fn edge_runout_prefers_impact_velocity_direction_over_stale_facing() {
        let params = NativePetPhysicsParams::default();
        let runout = native_pet_edge_runout_after_inertia_step(
            true,
            NativePetFacing::Right,
            NativePetLogicalVelocity { x: -900.0, y: 0.0 },
            NativePetAnimationName::StumbleRecoverLeft,
            &params,
        )
        .expect("edge runout");

        assert_eq!(runout.animation, NativePetAnimationName::RunLeft);
    }

    #[test]
    fn edge_runout_holds_running_animation_before_finish_animation() {
        let runout = NativePetEdgeRunoutState {
            animation: NativePetAnimationName::RunRight,
            finish_animation: NativePetAnimationName::StumbleRecoverRight,
            remaining_ms: NATIVE_PET_EDGE_RUNOUT_MAX_MS,
        };

        let running = native_pet_advance_edge_runout(runout, 120);
        assert_eq!(running.animation, NativePetAnimationName::RunRight);
        assert!(running.next_state.is_some());

        let landing =
            native_pet_advance_edge_runout(running.next_state.expect("remaining runout"), 1_000);
        assert_eq!(
            landing.animation,
            NativePetAnimationName::StumbleRecoverRight
        );
        assert!(landing.next_state.is_none());
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
    fn starts_pointer_interaction_only_on_visible_pet_pixels() {
        assert!(native_pet_should_start_pointer_interaction(true));
        assert!(!native_pet_should_start_pointer_interaction(false));
    }

    #[test]
    fn maps_pointer_hit_state_to_grab_cursor_feedback() {
        assert_eq!(native_pet_pointer_cursor_name(false, false), None);
        assert_eq!(native_pet_pointer_cursor_name(true, false), Some("grab"));
        assert_eq!(native_pet_pointer_cursor_name(true, true), Some("grabbing"));
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
