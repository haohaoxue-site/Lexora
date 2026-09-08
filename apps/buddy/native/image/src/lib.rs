#![forbid(unsafe_code)]

use std::io::{self, Cursor, Read, Write};

use serde::Deserialize;

mod validation;

pub const MAX_IMAGE_BYTES: usize = 32 * 1024 * 1024;
const MAX_IMAGE_PIXELS: u64 = 25_000_000;
const MAX_OPTIONS_BYTES: usize = 1024;

#[derive(Debug, thiserror::Error)]
pub enum ImageError {
    #[error("VALIDATION_FAILED")]
    InvalidOptions,
    #[error("IMAGE_TRANSFORM_INVALID_IMAGE")]
    InvalidImage,
    #[error("IMAGE_TRANSFORM_INPUT_TOO_LARGE")]
    InputTooLarge,
    #[error("IMAGE_TRANSFORM_OUTPUT_TOO_LARGE")]
    OutputTooLarge,
    #[error("IMAGE_TRANSFORM_FAILED")]
    Failed,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ChromaOptions {
    pub color: String,
    pub tolerance: f64,
    pub softness: f64,
    pub despill: f64,
}

#[derive(Deserialize)]
#[serde(
    tag = "operation",
    content = "options",
    rename_all = "camelCase",
    deny_unknown_fields
)]
enum ImageRequest {
    Chroma(ChromaOptions),
    Validate(validation::ValidationOptions),
}

impl ChromaOptions {
    fn key_color(&self) -> Result<[u8; 3], ImageError> {
        if !self.tolerance.is_finite()
            || !(0.0..=442.0).contains(&self.tolerance)
            || !self.softness.is_finite()
            || !(0.0..=442.0).contains(&self.softness)
            || !self.despill.is_finite()
            || !(0.0..=1.0).contains(&self.despill)
            || self.color.len() != 7
            || !self.color.starts_with('#')
            || !self.color.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit)
        {
            return Err(ImageError::InvalidOptions);
        }
        let mut color = [0; 3];
        for (index, channel) in color.iter_mut().enumerate() {
            *channel = u8::from_str_radix(&self.color[1 + index * 2..3 + index * 2], 16)
                .map_err(|_| ImageError::InvalidOptions)?;
        }
        Ok(color)
    }
}

pub fn run(mut input: impl Read, mut output: impl Write) -> Result<(), ImageError> {
    let mut size = [0; 4];
    input
        .read_exact(&mut size)
        .map_err(|_| ImageError::InvalidOptions)?;
    let size = u32::from_be_bytes(size) as usize;
    if size == 0 || size > MAX_OPTIONS_BYTES {
        return Err(ImageError::InvalidOptions);
    }
    let mut options = vec![0; size];
    input
        .read_exact(&mut options)
        .map_err(|_| ImageError::InvalidOptions)?;
    let options: ImageRequest =
        serde_json::from_slice(&options).map_err(|_| ImageError::InvalidOptions)?;
    let mut bytes = Vec::new();
    input
        .take(MAX_IMAGE_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| ImageError::InvalidImage)?;
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err(ImageError::InputTooLarge);
    }
    let transformed = match options {
        ImageRequest::Chroma(options) => transform_png(&bytes, &options)?,
        ImageRequest::Validate(options) => validation::validate(&bytes, &options)?,
    };
    output
        .write_all(&transformed)
        .map_err(|_| ImageError::Failed)
}

pub fn transform_png(bytes: &[u8], options: &ChromaOptions) -> Result<Vec<u8>, ImageError> {
    let key = options.key_color()?;
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err(ImageError::InputTooLarge);
    }
    let mut decoder = png::Decoder::new_with_limits(
        Cursor::new(bytes),
        png::Limits {
            bytes: 128 * 1024 * 1024,
        },
    );
    decoder.set_ignore_text_chunk(true);
    decoder.set_ignore_iccp_chunk(true);
    decoder.set_transformations(png::Transformations::normalize_to_color8());
    let header = decoder.read_header_info().map_err(decode_error)?;
    let (width, height) = (header.width, header.height);
    let count = u64::from(width) * u64::from(height);
    if count == 0 {
        return Err(ImageError::InvalidImage);
    }
    if count > MAX_IMAGE_PIXELS {
        return Err(ImageError::InputTooLarge);
    }
    let mut reader = decoder.read_info().map_err(decode_error)?;
    let size = reader
        .output_buffer_size()
        .ok_or(ImageError::InputTooLarge)?;
    if size > MAX_IMAGE_PIXELS as usize * 4 {
        return Err(ImageError::InputTooLarge);
    }
    let mut pixels = vec![0; size];
    let info = reader.next_frame(&mut pixels).map_err(decode_error)?;
    if info.width != width || info.height != height || info.bit_depth != png::BitDepth::Eight {
        return Err(ImageError::InvalidImage);
    }
    pixels.truncate(info.buffer_size());
    expand_rgba(&mut pixels, info.color_type, count as usize)?;
    remove_chroma(&mut pixels, key, options);
    encode_png(&pixels, width, height)
}

fn decode_error(error: png::DecodingError) -> ImageError {
    match error {
        png::DecodingError::LimitsExceeded => ImageError::InputTooLarge,
        _ => ImageError::InvalidImage,
    }
}

fn expand_rgba(
    pixels: &mut Vec<u8>,
    color: png::ColorType,
    count: usize,
) -> Result<(), ImageError> {
    let channels = color.samples();
    if pixels.len() != count * channels || color == png::ColorType::Indexed {
        return Err(ImageError::InvalidImage);
    }
    if color == png::ColorType::Rgba {
        return Ok(());
    }
    pixels.resize(count * 4, 0);
    for index in (0..count).rev() {
        let start = index * channels;
        let rgba = match color {
            png::ColorType::Rgb => [pixels[start], pixels[start + 1], pixels[start + 2], 255],
            png::ColorType::Grayscale => [pixels[start], pixels[start], pixels[start], 255],
            png::ColorType::GrayscaleAlpha => [
                pixels[start],
                pixels[start],
                pixels[start],
                pixels[start + 1],
            ],
            _ => return Err(ImageError::InvalidImage),
        };
        pixels[index * 4..index * 4 + 4].copy_from_slice(&rgba);
    }
    Ok(())
}

fn remove_chroma(pixels: &mut [u8], key: [u8; 3], options: &ChromaOptions) {
    let mut dominant = 0;
    for index in 1..3 {
        if key[index] > key[dominant] {
            dominant = index;
        }
    }
    for pixel in pixels.as_chunks_mut::<4>().0 {
        let distance = color_distance(pixel, key);
        let opacity = if distance <= options.tolerance {
            0.0
        } else if options.softness == 0.0 || distance >= options.tolerance + options.softness {
            1.0
        } else {
            (distance - options.tolerance) / options.softness
        };
        pixel[3] = (f64::from(pixel[3]) * opacity).round() as u8;
        if options.despill != 0.0 && opacity != 1.0 {
            let other = pixel[(dominant + 1) % 3].max(pixel[(dominant + 2) % 3]);
            let spill = pixel[dominant].saturating_sub(other);
            pixel[dominant] = (f64::from(pixel[dominant])
                - f64::from(spill) * (1.0 - opacity) * options.despill)
                .round() as u8;
        }
    }
}

fn color_distance(pixel: &[u8; 4], key: [u8; 3]) -> f64 {
    let channels = [0, 1, 2].map(|index| (f64::from(pixel[index]) - f64::from(key[index])).abs());
    let maximum = channels[0].max(channels[1]).max(channels[2]);
    if maximum == 0.0 {
        return 0.0;
    }
    // Match the scaled, compensated sum used by Math.hypot at alpha rounding boundaries.
    let [first, second, third] = channels.map(|value| (value / maximum).powi(2));
    let correction = ((first + second) - first) - second;
    (first + second + (third - correction)).sqrt() * maximum
}

fn encode_png(pixels: &[u8], width: u32, height: u32) -> Result<Vec<u8>, ImageError> {
    let mut output = BoundedOutput {
        bytes: Vec::new(),
        exceeded: false,
    };
    let result = (|| {
        let mut encoder = png::Encoder::new(&mut output, width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        encoder.set_compression(png::Compression::Fast);
        let mut writer = encoder.write_header()?;
        writer.write_image_data(pixels)?;
        writer.finish()
    })();
    if output.exceeded {
        return Err(ImageError::OutputTooLarge);
    }
    result.map_err(|_| ImageError::Failed)?;
    Ok(output.bytes)
}

struct BoundedOutput {
    bytes: Vec<u8>,
    exceeded: bool,
}

impl Write for BoundedOutput {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if bytes.len() > MAX_IMAGE_BYTES.saturating_sub(self.bytes.len()) {
            self.exceeded = true;
            return Err(io::Error::other("image output limit"));
        }
        self.bytes.extend_from_slice(bytes);
        Ok(bytes.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
