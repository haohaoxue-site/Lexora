use serde::Deserialize;

use crate::error::{BuddyError, BuddyResult};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::native_pet) struct NativePetManifest {
    #[allow(dead_code)]
    pub(in crate::native_pet) animations: Vec<NativePetManifestAnimation>,
    pub(in crate::native_pet) frame: NativePetManifestFrame,
    #[allow(dead_code)]
    pub(in crate::native_pet) id: String,
    #[allow(dead_code)]
    pub(in crate::native_pet) image: String,
    #[allow(dead_code)]
    pub(in crate::native_pet) kind: String,
    #[allow(dead_code)]
    pub(in crate::native_pet) name: String,
    pub(in crate::native_pet) sheet: NativePetManifestSheet,
    #[allow(dead_code)]
    pub(in crate::native_pet) source: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::native_pet) struct NativePetManifestFrame {
    pub(in crate::native_pet) height: i32,
    pub(in crate::native_pet) width: i32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::native_pet) struct NativePetManifestSheet {
    pub(in crate::native_pet) columns: usize,
    pub(in crate::native_pet) rows: usize,
}

impl NativePetManifestSheet {
    fn frame_count(&self) -> BuddyResult<usize> {
        if self.columns == 0 || self.rows == 0 {
            return Err(BuddyError::Runtime(
                "native pet manifest sheet requires positive columns and rows".to_owned(),
            ));
        }

        self.columns.checked_mul(self.rows).ok_or_else(|| {
            BuddyError::Runtime("native pet manifest sheet frame count overflowed".to_owned())
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::native_pet) struct NativePetSpritesheetGeometry {
    frame_height: i32,
    frame_width: i32,
    sheet_columns: usize,
    sheet_rows: usize,
}

impl NativePetSpritesheetGeometry {
    pub(in crate::native_pet) fn new(
        frame_width: i32,
        frame_height: i32,
        sheet_columns: usize,
        sheet_rows: usize,
    ) -> BuddyResult<Self> {
        if frame_width <= 0 || frame_height <= 0 {
            return Err(BuddyError::Runtime(
                "native pet manifest frame size must be positive".to_owned(),
            ));
        }
        if sheet_columns == 0 || sheet_rows == 0 {
            return Err(BuddyError::Runtime(
                "native pet manifest sheet requires positive columns and rows".to_owned(),
            ));
        }

        Ok(Self {
            frame_height,
            frame_width,
            sheet_columns,
            sheet_rows,
        })
    }

    pub(in crate::native_pet) fn from_manifest(manifest: &NativePetManifest) -> BuddyResult<Self> {
        Self::new(
            manifest.frame.width,
            manifest.frame.height,
            manifest.sheet.columns,
            manifest.sheet.rows,
        )
    }

    pub(in crate::native_pet) fn frame_count(self) -> BuddyResult<usize> {
        NativePetManifestSheet {
            columns: self.sheet_columns,
            rows: self.sheet_rows,
        }
        .frame_count()
    }

    pub(in crate::native_pet) fn frame_height(self) -> i32 {
        self.frame_height
    }

    pub(in crate::native_pet) fn frame_width(self) -> i32 {
        self.frame_width
    }

    pub(in crate::native_pet) fn sheet_columns(self) -> usize {
        self.sheet_columns
    }

    #[cfg(test)]
    pub(in crate::native_pet) fn sheet_rows(self) -> usize {
        self.sheet_rows
    }

    #[cfg(test)]
    pub(in crate::native_pet) fn sheet_pixel_height(self) -> BuddyResult<i32> {
        checked_axis_extent(self.frame_height, self.sheet_rows, "height")
    }

    #[cfg(test)]
    pub(in crate::native_pet) fn sheet_pixel_width(self) -> BuddyResult<i32> {
        checked_axis_extent(self.frame_width, self.sheet_columns, "width")
    }
}

#[cfg(test)]
fn checked_axis_extent(frame_size: i32, cell_count: usize, axis_name: &str) -> BuddyResult<i32> {
    let cell_count = i32::try_from(cell_count).map_err(|_| {
        BuddyError::Runtime(format!(
            "native pet manifest sheet {axis_name} cell count is too large"
        ))
    })?;

    frame_size.checked_mul(cell_count).ok_or_else(|| {
        BuddyError::Runtime(format!(
            "native pet manifest sheet pixel {axis_name} overflowed"
        ))
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::native_pet) struct NativePetManifestAnimation {
    #[allow(dead_code)]
    pub(super) description: String,
    pub(super) fps: Option<u32>,
    pub(super) frames: Vec<NativePetManifestAnimationFrame>,
    #[serde(rename = "loop")]
    pub(super) loop_animation: bool,
    pub(super) name: String,
    #[allow(dead_code)]
    pub(super) row: usize,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(untagged)]
pub(super) enum NativePetManifestAnimationFrame {
    Index(usize),
    Timed(NativePetTimedManifestAnimationFrame),
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct NativePetTimedManifestAnimationFrame {
    index: usize,
    duration_ms: Option<u64>,
}

impl NativePetTimedManifestAnimationFrame {
    #[cfg(test)]
    pub(super) fn new(index: usize, duration_ms: Option<u64>) -> Self {
        Self { index, duration_ms }
    }
}

impl NativePetManifestAnimationFrame {
    pub(super) fn index(self) -> usize {
        match self {
            Self::Index(index) => index,
            Self::Timed(frame) => frame.index,
        }
    }

    pub(super) fn duration_ms(self) -> Option<u64> {
        match self {
            Self::Index(_) => None,
            Self::Timed(frame) => frame.duration_ms,
        }
    }
}

#[cfg(test)]
#[path = "__tests__/manifest.rs"]
mod tests;
