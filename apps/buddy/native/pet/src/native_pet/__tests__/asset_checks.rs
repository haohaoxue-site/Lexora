use serde::Serialize;

use super::*;
use crate::native_pet::{
    animation::NativePetSpritesheetGeometry,
    process::{parse_native_pet_control_message, NativePetControlMessage},
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativePetSmokeCheckReport {
    animation_count: usize,
    frame_height: i32,
    frame_width: i32,
    ok: bool,
    sheet_columns: usize,
    sheet_frame_count: usize,
    sheet_rows: usize,
    validated_animations: Vec<String>,
}

pub(crate) fn create_native_pet_smoke_check_report() -> BuddyResult<NativePetSmokeCheckReport> {
    let manifest = load_default_pet_manifest()?;
    let geometry = NativePetSpritesheetGeometry::from_manifest(&manifest)?;
    let sheet_columns = geometry.sheet_columns();
    let sheet_rows = geometry.sheet_rows();
    let (sheet_width, sheet_height) = default_pet_spritesheet_size_from_webp()?;
    let animations = NativePetAnimationSet::from_manifest(manifest)?;
    let validated_animations = validate_native_pet_control_messages(&animations)?;

    if sheet_width != geometry.sheet_pixel_width()? {
        return Err(BuddyError::Runtime(
            "native pet spritesheet width does not match manifest".to_owned(),
        ));
    }
    if sheet_height != geometry.sheet_pixel_height()? {
        return Err(BuddyError::Runtime(
            "native pet spritesheet height does not match manifest".to_owned(),
        ));
    }

    Ok(NativePetSmokeCheckReport {
        animation_count: animations.len(),
        frame_height: geometry.frame_height(),
        frame_width: geometry.frame_width(),
        ok: true,
        sheet_columns,
        sheet_frame_count: sheet_columns * sheet_rows,
        sheet_rows,
        validated_animations,
    })
}

fn validate_native_pet_control_messages(
    animations: &NativePetAnimationSet,
) -> BuddyResult<Vec<String>> {
    let mut validated_animations = Vec::with_capacity(animations.len());

    for animation in animations.animation_names() {
        let line = format!("animation:{animation}");
        match parse_native_pet_control_message(&line) {
            Some(NativePetControlMessage::SetAnimation(parsed))
                if parsed.manifest_key() == animation =>
            {
                validated_animations.push(animation.to_owned());
            }
            _ => {
                return Err(BuddyError::Runtime(format!(
                    "native pet animation control message failed: {animation}",
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

#[test]
fn verifies_bundled_assets_and_animation_commands() {
    let report = create_native_pet_smoke_check_report().expect("bundled assets must be valid");
    assert!(report.ok);
    assert_eq!((report.frame_width, report.frame_height), (192, 208));
    assert_eq!(report.validated_animations.len(), report.animation_count);
    println!("{}", serde_json::to_string(&report).unwrap());
}
