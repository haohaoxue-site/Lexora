#![cfg(test)]

use std::io::Cursor;

use lexora_buddy_image_transform::{ChromaOptions, MAX_IMAGE_BYTES, run, transform_png};

fn options() -> ChromaOptions {
    ChromaOptions {
        color: "#00ff00".to_owned(),
        tolerance: 10.0,
        softness: 20.0,
        despill: 1.0,
    }
}

fn png_bytes(color: png::ColorType, depth: png::BitDepth, pixels: &[u8]) -> Vec<u8> {
    let mut bytes = Vec::new();
    let mut encoder = png::Encoder::new(&mut bytes, 2, 1);
    encoder.set_color(color);
    encoder.set_depth(depth);
    let mut writer = encoder.write_header().unwrap();
    writer.write_image_data(pixels).unwrap();
    writer.finish().unwrap();
    bytes
}

fn rgba(bytes: &[u8]) -> Vec<u8> {
    let mut reader = png::Decoder::new(Cursor::new(bytes)).read_info().unwrap();
    assert_eq!((reader.info().width, reader.info().height), (2, 1));
    let mut pixels = vec![0; reader.output_buffer_size().unwrap()];
    let info = reader.next_frame(&mut pixels).unwrap();
    assert_eq!(info.color_type, png::ColorType::Rgba);
    pixels.truncate(info.buffer_size());
    pixels
}

#[test]
fn removes_background_and_preserves_existing_foreground_alpha() {
    let source = png_bytes(
        png::ColorType::Rgba,
        png::BitDepth::Eight,
        &[0, 255, 0, 255, 255, 0, 0, 128],
    );
    assert_eq!(
        rgba(&transform_png(&source, &options()).unwrap()),
        [0, 0, 0, 0, 255, 0, 0, 128]
    );
}

#[test]
fn applies_soft_edges_and_despill_without_losing_canvas() {
    let source = png_bytes(
        png::ColorType::Rgba,
        png::BitDepth::Eight,
        &[0, 235, 0, 200, 0, 240, 0, 100],
    );
    assert_eq!(
        rgba(&transform_png(&source, &options()).unwrap()),
        [0, 118, 0, 100, 0, 60, 0, 25]
    );
}

#[test]
fn accepts_rgb_grayscale_and_sixteen_bit_png() {
    for (color, depth, input, expected) in [
        (
            png::ColorType::Rgb,
            png::BitDepth::Eight,
            vec![0, 255, 0, 255, 0, 0],
            vec![0, 0, 0, 0, 255, 0, 0, 255],
        ),
        (
            png::ColorType::GrayscaleAlpha,
            png::BitDepth::Eight,
            vec![25, 128, 255, 255],
            vec![25, 25, 25, 128, 255, 255, 255, 255],
        ),
        (
            png::ColorType::Grayscale,
            png::BitDepth::Eight,
            vec![25, 255],
            vec![25, 25, 25, 255, 255, 255, 255, 255],
        ),
        (
            png::ColorType::Rgb,
            png::BitDepth::Sixteen,
            vec![0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 0, 0],
            vec![0, 0, 0, 0, 255, 0, 0, 255],
        ),
    ] {
        assert_eq!(
            rgba(&transform_png(&png_bytes(color, depth, &input), &options()).unwrap()),
            expected
        );
    }
}

#[test]
fn rejects_invalid_parameters_and_corrupt_images() {
    let source = png_bytes(
        png::ColorType::Rgb,
        png::BitDepth::Eight,
        &[0, 255, 0, 255, 0, 0],
    );
    for value in [f64::NAN, f64::INFINITY, -1.0, 443.0] {
        let mut input = options();
        input.tolerance = value;
        assert_eq!(
            transform_png(&source, &input).unwrap_err().to_string(),
            "VALIDATION_FAILED"
        );
    }
    assert_eq!(
        transform_png(b"not a PNG", &options())
            .unwrap_err()
            .to_string(),
        "IMAGE_TRANSFORM_INVALID_IMAGE"
    );
    let mut corrupt = source;
    corrupt[29] ^= 1;
    assert_eq!(
        transform_png(&corrupt, &options()).unwrap_err().to_string(),
        "IMAGE_TRANSFORM_INVALID_IMAGE"
    );
}

#[test]
fn bounded_protocol_returns_no_partial_image_on_bad_request() {
    for bytes in [
        vec![],
        vec![0, 0, 8, 0],
        vec![0, 0, 0, 2, b'{', b'}'],
        vec![0, 0, 0, 2, b'[', b']'],
    ] {
        let mut output = Vec::new();
        assert!(run(bytes.as_slice(), &mut output).is_err());
        assert!(output.is_empty());
    }
}

#[test]
fn rejects_oversized_images_before_decoding_pixels() {
    let mut header = Vec::new();
    let encoder = png::Encoder::new(&mut header, 5001, 5000);
    drop(encoder.write_header().unwrap());
    for bytes in [header, vec![0; MAX_IMAGE_BYTES + 1]] {
        assert_eq!(
            transform_png(&bytes, &options()).unwrap_err().to_string(),
            "IMAGE_TRANSFORM_INPUT_TOO_LARGE"
        );
    }
}

#[test]
fn expands_indexed_palette_and_transparency() {
    let mut input = Vec::new();
    let mut encoder = png::Encoder::new(&mut input, 2, 1);
    encoder.set_color(png::ColorType::Indexed);
    encoder.set_depth(png::BitDepth::One);
    encoder.set_palette(&[0, 255, 0, 255, 0, 0][..]);
    encoder.set_trns(&[255, 128][..]);
    let mut writer = encoder.write_header().unwrap();
    writer.write_image_data(&[0b0100_0000]).unwrap();
    writer.finish().unwrap();
    assert_eq!(
        rgba(&transform_png(&input, &options()).unwrap()),
        [0, 0, 0, 0, 255, 0, 0, 128]
    );
}

#[test]
fn protocol_rejects_unknown_fields_and_oversized_payload_without_output() {
    let mut parameters =
        serde_json::json!({"color":"#00ff00","tolerance":10,"softness":20,"despill":1});
    parameters["path"] = "not-an-accepted-input".into();
    let invalid =
        serde_json::to_vec(&serde_json::json!({"operation":"chroma","options":parameters}))
            .unwrap();
    parameters.as_object_mut().unwrap().remove("path");
    let valid = serde_json::to_vec(&serde_json::json!({"operation":"chroma","options":parameters}))
        .unwrap();
    for (metadata, input_size, expected) in [
        (invalid, 0, "VALIDATION_FAILED"),
        (
            valid,
            MAX_IMAGE_BYTES + 1,
            "IMAGE_TRANSFORM_INPUT_TOO_LARGE",
        ),
    ] {
        let mut request = (metadata.len() as u32).to_be_bytes().to_vec();
        request.extend(metadata);
        request.resize(request.len() + input_size, 0);
        let mut output = Vec::new();
        assert_eq!(
            run(request.as_slice(), &mut output)
                .unwrap_err()
                .to_string(),
            expected
        );
        assert!(output.is_empty());
    }
}

#[test]
fn protocol_round_trip_is_png_only() {
    let parameters = serde_json::to_vec(
        &serde_json::json!({"operation":"chroma","options":{"color":"#00ff00","tolerance":10,"softness":20,"despill":1}}),
    )
    .unwrap();
    let mut request = (parameters.len() as u32).to_be_bytes().to_vec();
    request.extend(parameters);
    request.extend(png_bytes(
        png::ColorType::Rgb,
        png::BitDepth::Eight,
        &[0, 255, 0, 255, 0, 0],
    ));
    let mut output = Vec::new();
    run(request.as_slice(), &mut output).unwrap();
    assert_eq!(rgba(&output), [0, 0, 0, 0, 255, 0, 0, 255]);
}
