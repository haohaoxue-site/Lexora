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
