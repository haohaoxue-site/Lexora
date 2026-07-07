const WEBKIT_DISABLE_DMABUF_RENDERER: &str = "WEBKIT_DISABLE_DMABUF_RENDERER";

pub fn prepare_webview_environment() {
    let current = std::env::var(WEBKIT_DISABLE_DMABUF_RENDERER).ok();

    if let Some(value) = resolve_webkit_disable_dmabuf_renderer(current.as_deref()) {
        std::env::set_var(WEBKIT_DISABLE_DMABUF_RENDERER, value);
    }
}

#[cfg(target_os = "linux")]
pub fn resolve_webkit_disable_dmabuf_renderer(existing: Option<&str>) -> Option<&str> {
    existing.or(Some("1"))
}

#[cfg(not(target_os = "linux"))]
pub fn resolve_webkit_disable_dmabuf_renderer(existing: Option<&str>) -> Option<&str> {
    existing
}
