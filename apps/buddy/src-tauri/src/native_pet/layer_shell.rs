use std::ffi::CString;

use glib::translate::ToGlibPtr;
use libloading::Library;

use crate::error::{BuddyError, BuddyResult};

use super::{bounds::NativePetWindowPlacement, process::NativePetLayer};

const GTK_LAYER_SHELL_LAYER_BOTTOM: i32 = 1;
const GTK_LAYER_SHELL_LAYER_OVERLAY: i32 = 3;
const GTK_LAYER_SHELL_EDGE_LEFT: i32 = 0;
const GTK_LAYER_SHELL_EDGE_RIGHT: i32 = 1;
const GTK_LAYER_SHELL_EDGE_TOP: i32 = 2;
const GTK_LAYER_SHELL_EDGE_BOTTOM: i32 = 3;

type GtkLayerInitForWindow = unsafe extern "C" fn(*mut gtk::ffi::GtkWindow);
type GtkLayerSetLayer = unsafe extern "C" fn(*mut gtk::ffi::GtkWindow, i32);
type GtkLayerSetMonitor = unsafe extern "C" fn(*mut gtk::ffi::GtkWindow, *mut gdk::ffi::GdkMonitor);
type GtkLayerSetAnchor = unsafe extern "C" fn(*mut gtk::ffi::GtkWindow, i32, glib::ffi::gboolean);
type GtkLayerSetMargin = unsafe extern "C" fn(*mut gtk::ffi::GtkWindow, i32, i32);
type GtkLayerSetNamespace = unsafe extern "C" fn(*mut gtk::ffi::GtkWindow, *const std::ffi::c_char);
type GtkLayerTryForceCommit = unsafe extern "C" fn(*mut gtk::ffi::GtkWindow);

impl NativePetLayer {
    pub(super) fn gtk_layer(self) -> i32 {
        match self {
            Self::AlwaysOnTop => GTK_LAYER_SHELL_LAYER_OVERLAY,
            Self::Normal => GTK_LAYER_SHELL_LAYER_BOTTOM,
        }
    }
}

pub(super) fn validate_layer_shell_availability(
    layer: NativePetLayer,
    available: bool,
) -> BuddyResult<()> {
    if matches!(layer, NativePetLayer::AlwaysOnTop) && !available {
        return Err(BuddyError::Runtime(
            "gtk-layer-shell is required for always-on-top native pet window".to_owned(),
        ));
    }

    Ok(())
}

pub(super) struct LayerShellApi {
    _library: Library,
    init_for_window: GtkLayerInitForWindow,
    set_layer: GtkLayerSetLayer,
    set_monitor: Option<GtkLayerSetMonitor>,
    set_anchor: GtkLayerSetAnchor,
    set_margin: GtkLayerSetMargin,
    set_namespace: Option<GtkLayerSetNamespace>,
    try_force_commit: Option<GtkLayerTryForceCommit>,
}

impl LayerShellApi {
    pub(super) fn load() -> Option<Self> {
        // SAFETY: Loading this optional system library only enables Wayland layer-shell support.
        // We keep the Library alive in LayerShellApi for at least as long as the loaded symbols.
        let library = unsafe { Library::new("libgtk-layer-shell.so.0").ok()? };
        // SAFETY: The symbol names and function signatures match the gtk-layer-shell C ABI.
        let init_for_window = unsafe {
            *library
                .get::<GtkLayerInitForWindow>(b"gtk_layer_init_for_window\0")
                .ok()?
        };
        // SAFETY: The symbol names and function signatures match the gtk-layer-shell C ABI.
        let set_layer = unsafe {
            *library
                .get::<GtkLayerSetLayer>(b"gtk_layer_set_layer\0")
                .ok()?
        };
        // SAFETY: The symbol names and function signatures match the gtk-layer-shell C ABI.
        let set_monitor = unsafe {
            library
                .get::<GtkLayerSetMonitor>(b"gtk_layer_set_monitor\0")
                .ok()
                .map(|symbol| *symbol)
        };
        // SAFETY: The symbol names and function signatures match the gtk-layer-shell C ABI.
        let set_anchor = unsafe {
            *library
                .get::<GtkLayerSetAnchor>(b"gtk_layer_set_anchor\0")
                .ok()?
        };
        // SAFETY: The symbol names and function signatures match the gtk-layer-shell C ABI.
        let set_margin = unsafe {
            *library
                .get::<GtkLayerSetMargin>(b"gtk_layer_set_margin\0")
                .ok()?
        };
        // SAFETY: The symbol names and function signatures match the gtk-layer-shell C ABI.
        let set_namespace = unsafe {
            library
                .get::<GtkLayerSetNamespace>(b"gtk_layer_set_namespace\0")
                .ok()
                .map(|symbol| *symbol)
        };
        // SAFETY: The symbol names and function signatures match the gtk-layer-shell C ABI.
        let try_force_commit = unsafe {
            library
                .get::<GtkLayerTryForceCommit>(b"gtk_layer_try_force_commit\0")
                .ok()
                .map(|symbol| *symbol)
        };

        Some(Self {
            _library: library,
            init_for_window,
            set_layer,
            set_monitor,
            set_anchor,
            set_margin,
            set_namespace,
            try_force_commit,
        })
    }

    pub(super) fn configure_window(
        &self,
        window: &gtk::Window,
        layer: NativePetLayer,
        placement: NativePetWindowPlacement,
    ) {
        let window = window.to_glib_none().0;
        // SAFETY: window is borrowed from a live gtk::Window and all function pointers were loaded
        // from gtk-layer-shell with matching ABI signatures.
        unsafe {
            (self.init_for_window)(window);
            if let Some(set_namespace) = self.set_namespace {
                if let Ok(namespace) = CString::new("lexora-buddy-pet") {
                    set_namespace(window, namespace.as_ptr());
                }
            }
            (self.set_layer)(window, layer.gtk_layer());
            (self.set_anchor)(window, GTK_LAYER_SHELL_EDGE_LEFT, glib::ffi::GTRUE);
            (self.set_anchor)(window, GTK_LAYER_SHELL_EDGE_TOP, glib::ffi::GTRUE);
            (self.set_anchor)(window, GTK_LAYER_SHELL_EDGE_RIGHT, glib::ffi::GFALSE);
            (self.set_anchor)(window, GTK_LAYER_SHELL_EDGE_BOTTOM, glib::ffi::GFALSE);
            self.set_placement_by_ptr(window, placement);
        }
    }

    pub(super) fn set_placement(&self, window: &gtk::Window, placement: NativePetWindowPlacement) {
        // SAFETY: window is borrowed from a live gtk::Window and placement only changes layer-shell
        // margins/monitor through validated gtk-layer-shell function pointers.
        unsafe {
            self.set_placement_by_ptr(window.to_glib_none().0, placement);
        }
    }

    /// # Safety
    ///
    /// `window` must be a valid pointer borrowed from a live `gtk::Window`, and the loaded
    /// gtk-layer-shell function pointers must match their declared C ABI signatures.
    unsafe fn set_placement_by_ptr(
        &self,
        window: *mut gtk::ffi::GtkWindow,
        placement: NativePetWindowPlacement,
    ) {
        if let Some(set_monitor) = self.set_monitor {
            let monitor_ptr = native_pet_layer_shell_monitor_ptr(placement.monitor_index);
            // SAFETY: caller guarantees `window` is valid, and `monitor_ptr` is either null or a
            // GdkMonitor pointer owned by the current default display.
            unsafe { set_monitor(window, monitor_ptr) };
        }

        let local_position = placement.layer_shell_position;
        // SAFETY: caller guarantees `window` is valid for gtk-layer-shell margin calls.
        unsafe {
            (self.set_margin)(window, GTK_LAYER_SHELL_EDGE_LEFT, local_position.x);
            (self.set_margin)(window, GTK_LAYER_SHELL_EDGE_TOP, local_position.y);
            (self.set_margin)(window, GTK_LAYER_SHELL_EDGE_RIGHT, 0);
            (self.set_margin)(window, GTK_LAYER_SHELL_EDGE_BOTTOM, 0);
        }
        if let Some(try_force_commit) = self.try_force_commit {
            // SAFETY: caller guarantees `window` is valid for gtk-layer-shell commit calls.
            unsafe { try_force_commit(window) };
        }
    }
}

fn native_pet_layer_shell_monitor_ptr(monitor_index: Option<i32>) -> *mut gdk::ffi::GdkMonitor {
    let Some(monitor_index) = monitor_index else {
        return std::ptr::null_mut();
    };
    let Some(display) = gdk::Display::default() else {
        return std::ptr::null_mut();
    };
    let Some(monitor) = display.monitor(monitor_index) else {
        return std::ptr::null_mut();
    };

    monitor.to_glib_none().0
}

#[cfg(test)]
mod tests {
    use super::{
        validate_layer_shell_availability, GTK_LAYER_SHELL_LAYER_BOTTOM,
        GTK_LAYER_SHELL_LAYER_OVERLAY,
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
}
