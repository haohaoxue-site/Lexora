use gdk_pixbuf::prelude::*;
use serde::Serialize;

use crate::error::{BuddyError, BuddyResult};

use super::{
    animation::{
        NativePetAnimationSet, NativePetManifest, NATIVE_PET_ANIMATION_NAMES, PET_FRAME_HEIGHT,
        PET_FRAME_WIDTH,
    },
    process::{parse_native_pet_control_message, NativePetControlMessage},
};

const DEFAULT_PET_SPRITESHEET: &[u8] =
    include_bytes!("../../../../../packages/assets/buddy/pets/default/spritesheet.webp");
const DEFAULT_PET_MANIFEST: &str =
    include_str!("../../../../../packages/assets/buddy/pets/default/manifest.json");
const DEFAULT_APP_ICON: &[u8] = include_bytes!("../../../../../packages/assets/brand/app-icon.png");

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct NativePetSmokeCheckReport {
    animation_count: usize,
    frame_height: i32,
    frame_width: i32,
    ok: bool,
    sheet_columns: usize,
    sheet_frame_count: usize,
    sheet_rows: usize,
    validated_animations: Vec<&'static str>,
}

pub(super) fn load_default_pet_spritesheet() -> BuddyResult<gdk_pixbuf::Pixbuf> {
    load_pixbuf_from_bytes(DEFAULT_PET_SPRITESHEET, "native pet spritesheet")
}

pub(super) fn load_default_app_icon() -> BuddyResult<gdk_pixbuf::Pixbuf> {
    load_pixbuf_from_bytes(DEFAULT_APP_ICON, "native pet app icon")
}

fn load_pixbuf_from_bytes(bytes: &[u8], name: &str) -> BuddyResult<gdk_pixbuf::Pixbuf> {
    let loader = gdk_pixbuf::PixbufLoader::new();
    loader
        .write(bytes)
        .map_err(|error| BuddyError::Runtime(error.to_string()))?;
    loader
        .close()
        .map_err(|error| BuddyError::Runtime(error.to_string()))?;
    loader
        .pixbuf()
        .ok_or_else(|| BuddyError::Runtime(format!("failed to load {name}")))
}

pub(super) fn load_default_pet_animation_set() -> BuddyResult<NativePetAnimationSet> {
    let manifest = load_default_pet_manifest()?;

    NativePetAnimationSet::from_manifest(manifest)
}

fn load_default_pet_manifest() -> BuddyResult<NativePetManifest> {
    serde_json::from_str::<NativePetManifest>(DEFAULT_PET_MANIFEST)
        .map_err(|error| BuddyError::Runtime(error.to_string()))
}

pub(super) fn create_native_pet_smoke_check_report() -> BuddyResult<NativePetSmokeCheckReport> {
    let manifest = load_default_pet_manifest()?;
    let sheet_columns = manifest.sheet.columns;
    let sheet_rows = manifest.sheet.rows;
    let (sheet_width, sheet_height) = default_pet_spritesheet_size_from_webp()?;
    let animations = NativePetAnimationSet::from_manifest(manifest)?;
    let validated_animations = validate_native_pet_control_messages()?;

    if sheet_width != PET_FRAME_WIDTH * sheet_columns as i32 {
        return Err(BuddyError::Runtime(
            "native pet spritesheet width does not match manifest".to_owned(),
        ));
    }
    if sheet_height != PET_FRAME_HEIGHT * sheet_rows as i32 {
        return Err(BuddyError::Runtime(
            "native pet spritesheet height does not match manifest".to_owned(),
        ));
    }

    Ok(NativePetSmokeCheckReport {
        animation_count: animations.len(),
        frame_height: PET_FRAME_HEIGHT,
        frame_width: PET_FRAME_WIDTH,
        ok: true,
        sheet_columns,
        sheet_frame_count: sheet_columns * sheet_rows,
        sheet_rows,
        validated_animations,
    })
}

fn validate_native_pet_control_messages() -> BuddyResult<Vec<&'static str>> {
    let mut validated_animations = Vec::with_capacity(NATIVE_PET_ANIMATION_NAMES.len());

    for animation in NATIVE_PET_ANIMATION_NAMES {
        let line = format!("animation:{}", animation.manifest_key());
        match parse_native_pet_control_message(&line) {
            Some(NativePetControlMessage::SetAnimation(parsed)) if parsed == animation => {
                validated_animations.push(animation.manifest_key());
            }
            _ => {
                return Err(BuddyError::Runtime(format!(
                    "native pet animation control message failed: {}",
                    animation.manifest_key(),
                )));
            }
        }
    }

    Ok(validated_animations)
}

fn default_pet_spritesheet_size_from_webp() -> BuddyResult<(i32, i32)> {
    parse_webp_size(DEFAULT_PET_SPRITESHEET)
}

fn parse_webp_size(bytes: &[u8]) -> BuddyResult<(i32, i32)> {
    if bytes.len() < 20 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WEBP" {
        return Err(BuddyError::Runtime(
            "native pet spritesheet is not a WebP RIFF container".to_owned(),
        ));
    }

    let mut offset = 12;
    while offset + 8 <= bytes.len() {
        let chunk = &bytes[offset..offset + 4];
        let chunk_size = u32::from_le_bytes([
            bytes[offset + 4],
            bytes[offset + 5],
            bytes[offset + 6],
            bytes[offset + 7],
        ]) as usize;
        let data_start = offset + 8;
        let data_end = data_start.saturating_add(chunk_size);
        if data_end > bytes.len() {
            return Err(BuddyError::Runtime(
                "native pet spritesheet has truncated WebP chunk".to_owned(),
            ));
        }

        match chunk {
            b"VP8L" => return parse_lossless_webp_size(&bytes[data_start..data_end]),
            b"VP8X" => return parse_extended_webp_size(&bytes[data_start..data_end]),
            b"VP8 " => return parse_lossy_webp_size(&bytes[data_start..data_end]),
            _ => {}
        }

        offset = data_end + (chunk_size % 2);
    }

    Err(BuddyError::Runtime(
        "native pet spritesheet has no supported WebP image chunk".to_owned(),
    ))
}

fn parse_lossless_webp_size(chunk: &[u8]) -> BuddyResult<(i32, i32)> {
    if chunk.len() < 5 || chunk[0] != 0x2f {
        return Err(BuddyError::Runtime(
            "native pet spritesheet has invalid VP8L header".to_owned(),
        ));
    }

    let bits = u32::from_le_bytes([chunk[1], chunk[2], chunk[3], chunk[4]]);
    Ok((
        ((bits & 0x3fff) + 1) as i32,
        (((bits >> 14) & 0x3fff) + 1) as i32,
    ))
}

fn parse_extended_webp_size(chunk: &[u8]) -> BuddyResult<(i32, i32)> {
    if chunk.len() < 10 {
        return Err(BuddyError::Runtime(
            "native pet spritesheet has invalid VP8X header".to_owned(),
        ));
    }

    Ok((
        read_le24(&chunk[4..7]) as i32 + 1,
        read_le24(&chunk[7..10]) as i32 + 1,
    ))
}

fn parse_lossy_webp_size(chunk: &[u8]) -> BuddyResult<(i32, i32)> {
    if chunk.len() < 10 || chunk[3..6] != [0x9d, 0x01, 0x2a] {
        return Err(BuddyError::Runtime(
            "native pet spritesheet has invalid VP8 header".to_owned(),
        ));
    }

    Ok((
        (u16::from_le_bytes([chunk[6], chunk[7]]) & 0x3fff) as i32,
        (u16::from_le_bytes([chunk[8], chunk[9]]) & 0x3fff) as i32,
    ))
}

fn read_le24(bytes: &[u8]) -> u32 {
    bytes[0] as u32 | ((bytes[1] as u32) << 8) | ((bytes[2] as u32) << 16)
}

#[cfg(test)]
mod tests {
    use super::{load_default_pet_manifest, load_default_pet_spritesheet};
    use crate::native_pet::animation::{
        PET_FRAME_HEIGHT, PET_FRAME_WIDTH, PET_SPRITESHEET_COLUMNS,
    };

    #[test]
    fn loads_bundled_native_pet_spritesheet() {
        let manifest = load_default_pet_manifest().expect("native pet manifest loads");
        let sheet = load_default_pet_spritesheet().expect("native pet spritesheet loads");

        assert_eq!(manifest.sheet.columns, PET_SPRITESHEET_COLUMNS);
        assert_eq!(
            sheet.width(),
            PET_FRAME_WIDTH * manifest.sheet.columns as i32
        );
        assert_eq!(
            sheet.height(),
            PET_FRAME_HEIGHT * manifest.sheet.rows as i32
        );
    }
}
