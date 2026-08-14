#[cfg(feature = "pet")]
mod active_window;
#[cfg(feature = "pet")]
mod animation;
mod animation_key;
#[cfg(feature = "pet")]
mod assets;
#[cfg(feature = "pet")]
mod bounds;
#[cfg(feature = "pet")]
mod config;
#[cfg(feature = "pet")]
mod control_runtime;
#[cfg(feature = "pet")]
mod control_state;
#[cfg(feature = "pet")]
mod coordinates;
#[cfg(feature = "pet")]
mod dpi;
#[cfg(feature = "pet")]
mod drag_motion;
#[cfg(feature = "pet")]
mod drag_replay;
#[cfg(feature = "pet")]
mod drag_runtime;
#[cfg(feature = "pet")]
mod drag_state;
#[cfg(feature = "pet")]
mod edge_runout;
#[cfg(feature = "pet")]
mod frame_timing;
#[cfg(feature = "pet")]
mod geometry;
#[cfg(feature = "pet")]
mod layer_shell;
#[cfg(feature = "pet")]
mod lifecycle;
#[cfg(feature = "pet")]
mod monitor_layout;
#[cfg(feature = "pet")]
mod physics;
#[cfg(feature = "pet")]
mod physics_params;
#[cfg(feature = "pet")]
mod pointer_interaction;
#[cfg(feature = "pet")]
mod pointer_samples;
#[cfg(feature = "pet")]
mod position_state;
#[cfg(feature = "pet")]
mod preset_behavior;
mod process;
#[cfg(feature = "pet")]
mod renderer;
#[cfg(feature = "pet")]
mod scripted_walk;
#[cfg(feature = "pet")]
mod step_runtime;
#[cfg(feature = "pet")]
mod window;
#[cfg(feature = "pet")]
mod window_anchor;
#[cfg(feature = "pet")]
mod window_cursor;
#[cfg(feature = "pet")]
mod window_events;
#[cfg(feature = "pet")]
mod window_layer;
#[cfg(feature = "pet")]
mod window_movement;
#[cfg(feature = "pet")]
mod window_state;
#[cfg(feature = "pet")]
mod window_tick;

pub(crate) use animation_key::native_pet_manifest_animation_key_is_valid;
pub(crate) use process::step_protocol;
#[cfg(feature = "pet")]
pub use process::{
    run_native_pet_drag_replay_command_from_env, run_native_pet_sidecar_from_env,
    run_native_pet_smoke_command_from_env,
};
