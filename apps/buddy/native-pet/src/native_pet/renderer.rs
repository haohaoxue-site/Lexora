use gdk::prelude::GdkContextExt;
use gtk::prelude::*;

use super::{
    animation::{NativePetAnimationPlayback, NativePetAnimationSet},
    geometry::{
        native_pet_bob_offset, native_pet_frame_rect, native_pet_target_size,
        native_pet_window_size, NativePetFacing, PET_FRAME_BOTTOM_MARGIN,
    },
};

mod effect;
mod pose;
mod shadow;

use effect::{native_pet_cast_effect, NativePetCastEffect};
use pose::{native_pet_render_pose, NativePetRenderPose};
use shadow::{native_pet_contact_shadow, NativePetContactShadow};

pub(super) fn clear_transparent(context: &cairo::Context) {
    let _ = context.save();
    context.set_operator(cairo::Operator::Source);
    context.set_source_rgba(0.0, 0.0, 0.0, 0.0);
    let _ = context.paint();
    let _ = context.restore();
}

pub(super) fn install_transparent_window_css(screen: &gdk::Screen) {
    let provider = gtk::CssProvider::new();
    if provider
        .load_from_data(b"window { background-color: transparent; box-shadow: none; }")
        .is_err()
    {
        return;
    }

    gtk::StyleContext::add_provider_for_screen(
        screen,
        &provider,
        gtk::STYLE_PROVIDER_PRIORITY_APPLICATION,
    );
}

pub(super) fn draw_pet_frame(
    context: &cairo::Context,
    spritesheet: &gdk_pixbuf::Pixbuf,
    animations: &NativePetAnimationSet,
    playback: NativePetAnimationPlayback,
    facing: NativePetFacing,
) {
    let geometry = animations.geometry();
    let frame_index = animations.frame_index(playback);
    let frame_rect = native_pet_frame_rect(geometry, frame_index);
    if spritesheet.width() < frame_rect.x + frame_rect.width
        || spritesheet.height() < frame_rect.y + frame_rect.height
    {
        return;
    }

    let frame = spritesheet.new_subpixbuf(
        frame_rect.x,
        frame_rect.y,
        frame_rect.width,
        frame_rect.height,
    );
    let (target_width, target_height) = native_pet_target_size(geometry);
    let Some(mut frame) =
        frame.scale_simple(target_width, target_height, gdk_pixbuf::InterpType::Hyper)
    else {
        return;
    };
    if native_pet_should_mirror_frame(playback, facing) {
        if let Some(flipped) = frame.flip(true) {
            frame = flipped;
        }
    }

    let (window_width, window_height) = native_pet_window_size(geometry);
    let x = (window_width - target_width) / 2;
    let y = window_height - target_height - PET_FRAME_BOTTOM_MARGIN
        + native_pet_bob_offset(animations, playback);
    draw_pet_contact_shadow(
        context,
        native_pet_contact_shadow(geometry, animations, playback),
    );
    draw_pet_cast_effect(
        context,
        native_pet_cast_effect(geometry, animations, playback),
    );
    draw_pet_pixbuf_with_pose(
        context,
        &frame,
        x as f64,
        y as f64,
        target_width as f64,
        target_height as f64,
        native_pet_render_pose(animations, playback),
    );
}

pub(super) fn native_pet_pointer_hits_visible_pet(
    spritesheet: &gdk_pixbuf::Pixbuf,
    animations: &NativePetAnimationSet,
    playback: NativePetAnimationPlayback,
    window_x: f64,
    window_y: f64,
) -> bool {
    if !window_x.is_finite() || !window_y.is_finite() {
        return false;
    }

    let geometry = animations.geometry();
    let frame_index = animations.frame_index(playback);
    let frame_rect = native_pet_frame_rect(geometry, frame_index);
    if spritesheet.width() < frame_rect.x + frame_rect.width
        || spritesheet.height() < frame_rect.y + frame_rect.height
    {
        return false;
    }

    let (target_width, target_height) = native_pet_target_size(geometry);
    let (window_width, window_height) = native_pet_window_size(geometry);
    let frame_x = (window_width - target_width) as f64 / 2.0;
    let frame_y = (window_height - target_height - PET_FRAME_BOTTOM_MARGIN) as f64
        + native_pet_bob_offset(animations, playback) as f64;
    let pose = native_pet_render_pose(animations, playback);
    let anchor_x = frame_x + target_width as f64 / 2.0;
    let anchor_y = frame_y + target_height as f64 + pose.offset_y;
    let dx = window_x - anchor_x;
    let dy = window_y - anchor_y;
    let rotation_cos = pose.rotation_radians.cos();
    let rotation_sin = pose.rotation_radians.sin();
    let unrotated_x = dx * rotation_cos + dy * rotation_sin;
    let unrotated_y = -dx * rotation_sin + dy * rotation_cos;
    let image_x = unrotated_x / pose.scale_x + target_width as f64 / 2.0;
    let image_y = unrotated_y / pose.scale_y + target_height as f64;
    if !image_x.is_finite()
        || !image_y.is_finite()
        || image_x < 0.0
        || image_y < 0.0
        || image_x >= target_width as f64
        || image_y >= target_height as f64
    {
        return false;
    }

    let source_x =
        frame_rect.x + ((image_x / target_width as f64) * frame_rect.width as f64).floor() as i32;
    let source_y =
        frame_rect.y + ((image_y / target_height as f64) * frame_rect.height as f64).floor() as i32;
    native_pet_pointer_hits_visible_frame(spritesheet, source_x as f64, source_y as f64)
}

fn draw_pet_pixbuf_with_pose(
    context: &cairo::Context,
    frame: &gdk_pixbuf::Pixbuf,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    pose: NativePetRenderPose,
) {
    let _ = context.save();
    context.translate(x + width / 2.0, y + height + pose.offset_y);
    context.rotate(pose.rotation_radians);
    context.scale(pose.scale_x, pose.scale_y);
    context.set_source_pixbuf(frame, -width / 2.0, -height);
    let _ = context.paint();
    let _ = context.restore();
}

fn draw_pet_contact_shadow(context: &cairo::Context, shadow: NativePetContactShadow) {
    let _ = context.save();
    context.set_source_rgba(0.0, 0.0, 0.0, shadow.opacity);
    context.translate(shadow.center_x, shadow.center_y);
    context.scale(shadow.width / 2.0, shadow.height / 2.0);
    context.arc(0.0, 0.0, 1.0, 0.0, std::f64::consts::TAU);
    let _ = context.fill();
    let _ = context.restore();
}

fn draw_pet_cast_effect(context: &cairo::Context, effect: Option<NativePetCastEffect>) {
    let Some(effect) = effect else {
        return;
    };

    let _ = context.save();
    context.set_source_rgba(0.42, 0.72, 1.0, effect.opacity);
    context.set_line_width(effect.stroke_width);
    context.arc(
        effect.center_x,
        effect.center_y,
        effect.radius,
        0.0,
        std::f64::consts::TAU,
    );
    let _ = context.stroke();
    context.set_source_rgba(0.92, 0.82, 0.34, effect.opacity * 1.35);
    context.arc(
        effect.spark_x,
        effect.spark_y,
        effect.spark_radius,
        0.0,
        std::f64::consts::TAU,
    );
    let _ = context.fill();
    let _ = context.restore();
}

fn native_pet_should_mirror_frame(
    _playback: NativePetAnimationPlayback,
    _facing: NativePetFacing,
) -> bool {
    false
}

fn native_pet_pointer_hits_visible_frame(
    frame: &gdk_pixbuf::Pixbuf,
    frame_x: f64,
    frame_y: f64,
) -> bool {
    if !frame_x.is_finite()
        || !frame_y.is_finite()
        || frame_x < 0.0
        || frame_y < 0.0
        || frame_x >= frame.width() as f64
        || frame_y >= frame.height() as f64
    {
        return false;
    }

    if !frame.has_alpha() {
        return true;
    }

    let x = frame_x.floor() as usize;
    let y = frame_y.floor() as usize;
    let channel_count = frame.n_channels() as usize;
    if channel_count < 4 {
        return false;
    }

    let rowstride = frame.rowstride() as usize;
    let pixels = frame.read_pixel_bytes();
    let pixels = pixels.as_ref();
    let alpha_index = y
        .saturating_mul(rowstride)
        .saturating_add(x.saturating_mul(channel_count))
        .saturating_add(3);

    pixels.get(alpha_index).is_some_and(|alpha| *alpha > 16)
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::pose::{NativePetRenderProfile, NativePetRenderProfileKind};
    use super::{native_pet_pointer_hits_visible_frame, native_pet_should_mirror_frame};
    use crate::native_pet::{
        animation::{
            NativePetAnimationCompletionFallbackProfile, NativePetAnimationKey,
            NativePetAnimationLocalInteractionProfile, NativePetAnimationPlayback,
            NativePetAnimationRenderProfile, NativePetAnimationRuntimeProfile,
            NativePetAnimationSet, NativePetManifest,
        },
        assets::load_default_pet_animation_set,
        geometry::NativePetFacing,
    };

    const DEFAULT_PET_MANIFEST: &str =
        include_str!("../../../../../packages/assets/buddy/pets/default/manifest.json");

    #[test]
    fn uses_explicit_directional_frames_without_runtime_mirroring() {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");
        let drag = animations.playback_for_test_key("drag");
        let run_left = animations.playback_for_test_key("run_left");
        let run_right = animations.playback_for_test_key("run_right");

        assert!(!native_pet_should_mirror_frame(
            drag,
            NativePetFacing::Right
        ));
        assert!(!native_pet_should_mirror_frame(
            run_left,
            NativePetFacing::Right
        ));
        assert!(!native_pet_should_mirror_frame(
            run_right,
            NativePetFacing::Left
        ));
    }

    #[test]
    fn projects_manifest_handles_to_renderer_profiles_once() {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");
        let trip_left = NativePetRenderProfile::from_playback(
            &animations,
            animations.playback_for_test_key("trip_fall_left"),
        );
        let trip_right = NativePetRenderProfile::from_playback(
            &animations,
            animations.playback_for_test_key("trip_fall_right"),
        );
        let cast = NativePetRenderProfile::from_playback(
            &animations,
            animations.playback_for_test_key("cast"),
        );
        let run_right = NativePetRenderProfile::from_playback(
            &animations,
            animations.playback_for_test_key("run_right"),
        );

        assert_eq!(trip_left.kind(), NativePetRenderProfileKind::TripFall);
        assert_eq!(trip_right.kind(), NativePetRenderProfileKind::TripFall);
        assert_eq!(cast.kind(), NativePetRenderProfileKind::Cast);
        assert_eq!(run_right.kind(), NativePetRenderProfileKind::RunRight);
    }

    #[test]
    fn projects_manifest_handle_playback_to_renderer_profile_by_runtime_profile() {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");
        let key = NativePetAnimationKey::parse("run_right").expect("valid animation key");
        let handle = animations
            .animation_handle_for_key(&key)
            .expect("run_right animation exists");
        let playback = NativePetAnimationPlayback::from_manifest_handle(handle);

        let profile = NativePetRenderProfile::from_playback(&animations, playback);

        assert_eq!(profile.kind(), NativePetRenderProfileKind::RunRight);
    }

    #[test]
    fn projects_manifest_handle_playback_to_renderer_profile_from_runtime_profile() {
        let mut manifest_json = serde_json::from_str::<serde_json::Value>(DEFAULT_PET_MANIFEST)
            .expect("native pet animation manifest parses");
        manifest_json["animations"]
            .as_array_mut()
            .expect("manifest animations are an array")
            .push(serde_json::json!({
                "description": "Fixture future run",
                "frames": [{ "index": 0, "durationMs": 120 }],
                "loop": false,
                "name": "future_run",
                "row": 0
            }));
        let manifest = serde_json::from_value::<NativePetManifest>(manifest_json)
            .expect("native pet animation manifest parses with future run");
        let mut profiles = HashMap::new();
        profiles.insert(
            "future_run".to_owned(),
            NativePetAnimationRuntimeProfile {
                render_profile: NativePetAnimationRenderProfile::RunRight,
                local_interaction_profile: NativePetAnimationLocalInteractionProfile::None,
                completion_fallback_profile: NativePetAnimationCompletionFallbackProfile::Default,
            },
        );
        let animations =
            NativePetAnimationSet::from_manifest_with_runtime_profiles(manifest, profiles)
                .expect("manifest with future run loads");
        let key = NativePetAnimationKey::parse("future_run").expect("valid animation key");
        let handle = animations
            .animation_handle_for_key(&key)
            .expect("future run animation exists");
        let playback = NativePetAnimationPlayback::from_manifest_handle(handle);

        let profile = NativePetRenderProfile::from_playback(&animations, playback);

        assert_eq!(profile.kind(), NativePetRenderProfileKind::RunRight);
    }

    #[test]
    fn hit_tests_visible_frame_alpha_instead_of_window_rectangle() {
        let pixels =
            glib::Bytes::from_owned(vec![0, 0, 0, 0, 255, 255, 255, 255, 0, 0, 0, 0, 0, 0, 0, 0]);
        let frame =
            gdk_pixbuf::Pixbuf::from_bytes(&pixels, gdk_pixbuf::Colorspace::Rgb, true, 8, 2, 2, 8);

        assert!(native_pet_pointer_hits_visible_frame(&frame, 1.25, 0.25));
        assert!(!native_pet_pointer_hits_visible_frame(&frame, 0.25, 0.25));
        assert!(!native_pet_pointer_hits_visible_frame(&frame, 1.25, 1.25));
        assert!(!native_pet_pointer_hits_visible_frame(&frame, -0.25, 0.25));
    }

    #[test]
    fn visible_frame_hit_test_rejects_non_finite_coordinates() {
        let pixels = glib::Bytes::from_owned(vec![255, 255, 255, 255, 255, 255, 255, 255]);
        let frame =
            gdk_pixbuf::Pixbuf::from_bytes(&pixels, gdk_pixbuf::Colorspace::Rgb, true, 8, 2, 1, 8);

        assert!(!native_pet_pointer_hits_visible_frame(
            &frame,
            f64::NAN,
            0.0
        ));
    }
}
