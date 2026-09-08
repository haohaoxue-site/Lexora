pub(super) fn native_pet_apply_pointer_cursor(
    drawing_area: &gtk::DrawingArea,
    cursor_name: Option<&str>,
) {
    let Some(window) = gtk::prelude::WidgetExt::window(drawing_area) else {
        return;
    };

    let cursor = cursor_name.and_then(|name| gdk::Cursor::from_name(&window.display(), name));
    window.set_cursor(cursor.as_ref());
}
