use std::{
    fs,
    path::{Path, PathBuf},
    sync::mpsc,
};

use tauri::{AppHandle, State};

use crate::{
    error::{BuddyError, BuddyResult},
    state::BuddyAppState,
    storage::{BuddyRegisteredAttachment, CreateBuddyRegisteredAttachmentRequest},
};

use super::{BuddyCommandError, BuddyCommandResult};

const BUDDY_CLIPBOARD_FILE_COUNT_LIMIT: usize = 16;
const BUDDY_CLIPBOARD_FILE_MAX_BYTES: u64 = 8 * 1024 * 1024;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyClipboardImage {
    pub(super) attachment_id: Option<String>,
    pub(super) data_url: Option<String>,
    pub(super) mime_type: &'static str,
    pub(super) name: &'static str,
    pub(super) preview_path: Option<String>,
    pub(super) size_bytes: usize,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuddyClipboardFile {
    pub(super) attachment_id: Option<String>,
    pub(super) kind: String,
    pub(super) name: String,
    pub(super) mime_type: String,
    pub(super) size_bytes: u64,
    pub(super) data_url: Option<String>,
    pub(super) preview_path: Option<String>,
    pub(super) text: Option<String>,
}

#[tauri::command]
pub fn read_buddy_clipboard_image(
    app: AppHandle,
    state: State<'_, BuddyAppState>,
) -> BuddyCommandResult<Option<BuddyClipboardImage>> {
    let (sender, receiver) = mpsc::channel();

    app.run_on_main_thread(move || {
        let _ = sender.send(read_buddy_clipboard_png_bytes_on_main_thread());
    })
    .map_err(|error| BuddyError::Runtime(error.to_string()))?;

    let Some(png_bytes) = receiver
        .recv()
        .map_err(|_| BuddyError::Runtime("failed to receive clipboard image".to_owned()))?
        .map_err(BuddyCommandError::from)?
    else {
        return Ok(None);
    };

    create_buddy_clipboard_image_from_png_bytes(state.inner(), &png_bytes)
        .map(Some)
        .map_err(Into::into)
}

#[tauri::command]
pub fn read_buddy_clipboard_files(
    app: AppHandle,
    state: State<'_, BuddyAppState>,
    paths: Vec<String>,
) -> BuddyCommandResult<Vec<BuddyClipboardFile>> {
    if !paths.is_empty() {
        return Err(BuddyError::Validation(
            "clipboard file paths must come from the native clipboard".to_owned(),
        )
        .into());
    }

    let paths = read_buddy_clipboard_file_paths(&app)?;

    create_buddy_clipboard_files_from_paths(state.inner(), &paths, "clipboard-file")
        .map_err(Into::into)
}

#[tauri::command]
pub fn select_buddy_chat_attachment_files(
    app: AppHandle,
    state: State<'_, BuddyAppState>,
) -> BuddyCommandResult<Vec<BuddyClipboardFile>> {
    let paths = pick_buddy_chat_attachment_file_paths(&app)?;

    create_buddy_clipboard_files_from_paths(state.inner(), &paths, "file-picker")
        .map_err(Into::into)
}

fn read_buddy_clipboard_png_bytes_on_main_thread() -> BuddyResult<Option<Vec<u8>>> {
    if !gtk::is_initialized_main_thread() {
        gtk::init().map_err(|error| BuddyError::Runtime(error.to_string()))?;
    }

    let clipboard = gtk::Clipboard::get(&gdk::SELECTION_CLIPBOARD);
    let Some(pixbuf) = clipboard.wait_for_image() else {
        return Ok(None);
    };

    let png_bytes = pixbuf.save_to_bufferv("png", &[]).map_err(|error| {
        BuddyError::Runtime(format!("failed to encode clipboard image: {error}"))
    })?;

    Ok(Some(png_bytes))
}

fn read_buddy_clipboard_file_paths(app: &AppHandle) -> BuddyResult<Vec<PathBuf>> {
    let (sender, receiver) = mpsc::channel();

    app.run_on_main_thread(move || {
        let _ = sender.send(read_buddy_clipboard_file_paths_on_main_thread());
    })
    .map_err(|error| BuddyError::Runtime(error.to_string()))?;

    receiver
        .recv()
        .map_err(|_| BuddyError::Runtime("failed to receive clipboard file paths".to_owned()))?
}

fn read_buddy_clipboard_file_paths_on_main_thread() -> BuddyResult<Vec<PathBuf>> {
    if !gtk::is_initialized_main_thread() {
        gtk::init().map_err(|error| BuddyError::Runtime(error.to_string()))?;
    }

    let clipboard = gtk::Clipboard::get(&gdk::SELECTION_CLIPBOARD);
    let mut paths = Vec::new();
    for uri in clipboard.wait_for_uris() {
        push_unique_buddy_clipboard_file_path(&mut paths, uri.as_str());
    }

    if paths.is_empty() {
        if let Some(text) = clipboard.wait_for_text() {
            for line in text.lines() {
                push_unique_buddy_clipboard_file_path(&mut paths, line);
            }
        }
    }

    Ok(paths)
}

fn create_buddy_clipboard_image_from_png_bytes(
    state: &BuddyAppState,
    png_bytes: &[u8],
) -> BuddyResult<BuddyClipboardImage> {
    let name = "clipboard-image.png";
    let attachment = create_buddy_registered_attachment_from_bytes(
        state,
        name,
        "image/png",
        "image",
        "clipboard-image",
        png_bytes,
    )?;

    Ok(BuddyClipboardImage {
        attachment_id: Some(attachment.id),
        data_url: None,
        mime_type: "image/png",
        name,
        preview_path: Some(attachment.path),
        size_bytes: png_bytes.len(),
    })
}

pub(super) fn create_buddy_clipboard_files_from_paths(
    state: &BuddyAppState,
    paths: &[PathBuf],
    source: &'static str,
) -> BuddyResult<Vec<BuddyClipboardFile>> {
    let mut files = Vec::new();
    for path in paths.iter().take(BUDDY_CLIPBOARD_FILE_COUNT_LIMIT) {
        if let Some(file) = create_buddy_clipboard_file_from_path(state, path, source)? {
            files.push(file);
        }
    }

    Ok(files)
}

pub(super) fn create_buddy_clipboard_file_from_path(
    state: &BuddyAppState,
    path: &Path,
    source: &'static str,
) -> BuddyResult<Option<BuddyClipboardFile>> {
    let metadata = match fs::metadata(path) {
        Ok(metadata) if metadata.is_file() => metadata,
        Ok(_) => return Ok(None),
        Err(error) => return Err(BuddyError::Io(error)),
    };
    if metadata.len() > BUDDY_CLIPBOARD_FILE_MAX_BYTES {
        return Err(BuddyError::Validation(format!(
            "clipboard file is too large: {} bytes",
            metadata.len()
        )));
    }

    let mime_type = guess_buddy_clipboard_file_mime_type(path);
    let kind = if mime_type.starts_with("image/") {
        "image"
    } else {
        let is_text_candidate = is_buddy_text_clipboard_file(path, &mime_type);
        let text_bytes = is_text_candidate.then(|| fs::read(path)).transpose()?;
        if text_bytes
            .as_ref()
            .is_some_and(|bytes| std::str::from_utf8(bytes).is_ok())
        {
            "text"
        } else {
            "binary"
        }
    };
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| BuddyError::Validation("clipboard file name is not valid UTF-8".to_owned()))?
        .to_owned();
    let attachment = create_buddy_registered_attachment_from_path(
        state,
        path,
        &name,
        &mime_type,
        kind,
        source,
        metadata.len(),
    )?;
    let preview_path = (kind == "image").then(|| attachment.path.clone());

    Ok(Some(BuddyClipboardFile {
        attachment_id: Some(attachment.id),
        kind: kind.to_owned(),
        name,
        mime_type,
        size_bytes: metadata.len(),
        data_url: None,
        preview_path,
        text: None,
    }))
}

fn create_buddy_registered_attachment_from_bytes(
    state: &BuddyAppState,
    name: &str,
    mime_type: &str,
    kind: &str,
    source: &str,
    bytes: &[u8],
) -> BuddyResult<BuddyRegisteredAttachment> {
    let attachment_id = uuid::Uuid::new_v4().to_string();
    let path = resolve_buddy_registered_attachment_path(
        &state.attachments_dir_path(),
        &attachment_id,
        name,
    )?;
    fs::write(&path, bytes)?;

    state.create_attachment(CreateBuddyRegisteredAttachmentRequest {
        id: attachment_id,
        kind: kind.to_owned(),
        mime_type: mime_type.to_owned(),
        name: name.to_owned(),
        path: path.to_string_lossy().into_owned(),
        size_bytes: bytes.len() as u64,
        source: source.to_owned(),
    })
}

fn create_buddy_registered_attachment_from_path(
    state: &BuddyAppState,
    source_path: &Path,
    name: &str,
    mime_type: &str,
    kind: &str,
    source: &str,
    size_bytes: u64,
) -> BuddyResult<BuddyRegisteredAttachment> {
    let attachment_id = uuid::Uuid::new_v4().to_string();
    let path = resolve_buddy_registered_attachment_path(
        &state.attachments_dir_path(),
        &attachment_id,
        name,
    )?;
    fs::copy(source_path, &path)?;

    state.create_attachment(CreateBuddyRegisteredAttachmentRequest {
        id: attachment_id,
        kind: kind.to_owned(),
        mime_type: mime_type.to_owned(),
        name: name.to_owned(),
        path: path.to_string_lossy().into_owned(),
        size_bytes,
        source: source.to_owned(),
    })
}

fn resolve_buddy_registered_attachment_path(
    attachments_dir: &Path,
    attachment_id: &str,
    name: &str,
) -> BuddyResult<PathBuf> {
    fs::create_dir_all(attachments_dir)?;
    Ok(attachments_dir.join(format!(
        "{}-{}",
        attachment_id,
        sanitize_buddy_attachment_file_name(name)
    )))
}

fn sanitize_buddy_attachment_file_name(name: &str) -> String {
    let sanitized = name
        .chars()
        .map(|character| match character {
            '/' | '\\' | '\0' => '_',
            character if character.is_control() => '_',
            character => character,
        })
        .collect::<String>();
    let sanitized =
        sanitized.trim_matches(|character: char| character.is_whitespace() || character == '.');

    if sanitized.is_empty() {
        "attachment".to_owned()
    } else {
        sanitized.to_owned()
    }
}

fn pick_buddy_chat_attachment_file_paths(app: &AppHandle) -> BuddyCommandResult<Vec<PathBuf>> {
    let (sender, receiver) = mpsc::channel();

    app.run_on_main_thread(move || {
        let _ = sender.send(pick_buddy_chat_attachment_file_paths_on_main_thread());
    })
    .map_err(|error| BuddyError::Runtime(error.to_string()))?;

    receiver
        .recv()
        .map_err(|_| BuddyError::Runtime("failed to receive attachment file selection".to_owned()))?
        .map_err(Into::into)
}

fn pick_buddy_chat_attachment_file_paths_on_main_thread() -> BuddyResult<Vec<PathBuf>> {
    if !gtk::is_initialized_main_thread() {
        gtk::init().map_err(|error| BuddyError::Runtime(error.to_string()))?;
    }

    use gtk::prelude::{FileChooserExt, NativeDialogExt};

    let dialog = gtk::FileChooserNative::new(
        Some("选择附件"),
        gtk::Window::NONE,
        gtk::FileChooserAction::Open,
        Some("选择"),
        Some("取消"),
    );
    dialog.set_select_multiple(true);
    let response = dialog.run();
    let paths = if response == gtk::ResponseType::Accept {
        dialog.filenames()
    } else {
        Vec::new()
    };
    dialog.destroy();

    Ok(paths)
}

fn parse_buddy_clipboard_file_uri(reference: &str) -> Option<PathBuf> {
    let reference = reference.trim();
    if reference.is_empty()
        || reference.starts_with('#')
        || reference == "copy"
        || reference == "cut"
    {
        return None;
    }

    if reference.starts_with('/') {
        return Some(PathBuf::from(reference));
    }

    if !reference.starts_with("file://") {
        return None;
    }

    let (path, hostname) = glib::filename_from_uri(reference).ok()?;
    if hostname
        .as_ref()
        .is_some_and(|hostname| !hostname.is_empty() && hostname.as_str() != "localhost")
    {
        return None;
    }

    Some(path)
}

fn push_unique_buddy_clipboard_file_path(paths: &mut Vec<PathBuf>, reference: &str) {
    let Some(path) = parse_buddy_clipboard_file_uri(reference) else {
        return;
    };
    if !paths.iter().any(|existing| existing == &path) {
        paths.push(path);
    }
}

fn guess_buddy_clipboard_file_mime_type(path: &Path) -> String {
    let extension = path
        .extension()
        .and_then(|extension| extension.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    match extension.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "txt" => "text/plain",
        "md" | "mdx" => "text/markdown",
        "csv" => "text/csv",
        "json" => "application/json",
        "xml" => "application/xml",
        "html" => "text/html",
        "css" => "text/css",
        "scss" => "text/x-scss",
        "ts" | "tsx" | "js" | "jsx" | "vue" | "rs" | "toml" | "yaml" | "yml" => "text/plain",
        _ => "application/octet-stream",
    }
    .to_owned()
}

fn is_buddy_text_clipboard_file(path: &Path, mime_type: &str) -> bool {
    mime_type.starts_with("text/")
        || matches!(mime_type, "application/json" | "application/xml")
        || path
            .extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| {
                matches!(
                    extension.to_ascii_lowercase().as_str(),
                    "md" | "mdx"
                        | "txt"
                        | "csv"
                        | "ts"
                        | "tsx"
                        | "js"
                        | "jsx"
                        | "json"
                        | "vue"
                        | "rs"
                        | "toml"
                        | "yaml"
                        | "yml"
                        | "xml"
                        | "html"
                        | "css"
                        | "scss"
                )
            })
            .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use crate::{app_paths::BuddyAppPaths, state::BuddyAppState};

    use super::{create_buddy_clipboard_file_from_path, create_buddy_clipboard_files_from_paths};

    #[test]
    fn rejects_oversized_clipboard_file_payloads_before_reading_bytes() {
        let dir = std::env::temp_dir().join(format!("lexora-buddy-test-{}", uuid::Uuid::new_v4()));
        let state = BuddyAppState::initialize_with_paths(BuddyAppPaths::from_data_dir(dir.clone()))
            .expect("initialize state");
        fs::create_dir_all(&dir).expect("create temp dir");
        let path = dir.join("large.txt");
        let file = fs::File::create(&path).expect("create large file");
        file.set_len(8 * 1024 * 1024 + 1)
            .expect("resize large file");

        let error = create_buddy_clipboard_file_from_path(&state, &path, "clipboard-file")
            .expect_err("large clipboard file should be rejected");

        assert!(error.to_string().contains("clipboard file is too large"));
        fs::remove_dir_all(&dir).expect("cleanup temp dir");
    }

    #[test]
    fn limits_native_clipboard_file_payload_count() {
        let dir = std::env::temp_dir().join(format!("lexora-buddy-test-{}", uuid::Uuid::new_v4()));
        let state = BuddyAppState::initialize_with_paths(BuddyAppPaths::from_data_dir(dir.clone()))
            .expect("initialize state");
        fs::create_dir_all(&dir).expect("create temp dir");
        let paths = (0..20)
            .map(|index| {
                let path = dir.join(format!("note-{index}.txt"));
                fs::write(&path, format!("note {index}")).expect("write text");
                path
            })
            .collect::<Vec<_>>();

        let files = create_buddy_clipboard_files_from_paths(&state, &paths, "clipboard-file")
            .expect("create payloads");

        assert_eq!(files.len(), 16);
        fs::remove_dir_all(&dir).expect("cleanup temp dir");
    }
}
