use super::{
    validate_layer_shell_availability, GTK_LAYER_SHELL_LAYER_BOTTOM, GTK_LAYER_SHELL_LAYER_OVERLAY,
};
use crate::native_pet::process::NativePetLayer;

#[test]
fn maps_native_pet_layer_to_wayland_layer_shell_layer() {
    assert_eq!(
        NativePetLayer::AlwaysOnTop.gtk_layer(),
        GTK_LAYER_SHELL_LAYER_OVERLAY
    );
    assert_eq!(
        NativePetLayer::Normal.gtk_layer(),
        GTK_LAYER_SHELL_LAYER_BOTTOM
    );
}

#[test]
fn rejects_always_on_top_without_layer_shell() {
    assert!(validate_layer_shell_availability(NativePetLayer::AlwaysOnTop, false).is_err());
}
