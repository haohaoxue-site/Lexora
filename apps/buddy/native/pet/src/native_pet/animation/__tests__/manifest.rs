use super::*;

const DEFAULT_PET_MANIFEST: &str =
    include_str!("../../../../../../../../packages/assets/buddy/pets/default/manifest.json");

#[test]
fn manifest_geometry_accepts_positive_non_default_frame_and_sheet_values() {
    let manifest = NativePetManifest {
        animations: Vec::new(),
        frame: NativePetManifestFrame {
            width: 200,
            height: 300,
        },
        id: "test-pet".to_owned(),
        image: "spritesheet.webp".to_owned(),
        kind: "sprite-sheet".to_owned(),
        name: "Test Pet".to_owned(),
        sheet: NativePetManifestSheet {
            columns: 5,
            rows: 4,
        },
        source: "test".to_owned(),
    };
    let geometry =
        NativePetSpritesheetGeometry::from_manifest(&manifest).expect("geometry is valid");

    assert_eq!(geometry.frame_width(), 200);
    assert_eq!(geometry.frame_height(), 300);
    assert_eq!(geometry.sheet_columns(), 5);
    assert_eq!(geometry.sheet_rows(), 4);
    assert_eq!(geometry.frame_count().expect("frame count fits"), 20);
}

#[test]
fn bundled_manifest_contains_only_runtime_asset_fields() {
    let manifest = serde_json::from_str::<serde_json::Value>(DEFAULT_PET_MANIFEST)
        .expect("native pet animation manifest is valid json");
    let object = manifest.as_object().expect("manifest is object");
    let allowed_top_level_fields = [
        "id",
        "name",
        "kind",
        "source",
        "image",
        "frame",
        "sheet",
        "animations",
    ];
    let unexpected_top_level_fields = object
        .keys()
        .filter(|key| !allowed_top_level_fields.contains(&key.as_str()))
        .cloned()
        .collect::<Vec<_>>();

    assert!(
        unexpected_top_level_fields.is_empty(),
        "runtime manifest must only contain asset facts, unexpected top-level fields: {unexpected_top_level_fields:?}"
    );

    let allowed_animation_fields = ["name", "description", "row", "frames", "loop", "fps"];
    for (animation_index, animation) in object["animations"]
        .as_array()
        .expect("manifest animations is array")
        .iter()
        .enumerate()
    {
        let animation = animation.as_object().expect("animation is object");
        let unexpected_animation_fields = animation
            .keys()
            .filter(|key| !allowed_animation_fields.contains(&key.as_str()))
            .cloned()
            .collect::<Vec<_>>();
        assert!(
            unexpected_animation_fields.is_empty(),
            "runtime manifest animation {animation_index} must only contain asset facts, unexpected fields: {unexpected_animation_fields:?}"
        );
    }
}

#[test]
fn native_pet_manifest_rejects_unknown_timed_frame_fields() {
    let result = serde_json::from_value::<NativePetManifest>(serde_json::json!({
        "id": "test-pet",
        "name": "Test Pet",
        "kind": "sprite-sheet",
        "source": "test",
        "image": "spritesheet.webp",
        "frame": { "width": 192, "height": 208 },
        "sheet": { "columns": 1, "rows": 1 },
        "animations": [
            {
                "name": "idle",
                "description": "Idle",
                "row": 0,
                "frames": [
                    { "index": 0, "durationMs": 100, "easing": "easeOut" }
                ],
                "loop": true
            }
        ]
    }));
    let Err(error) = result else {
        panic!("native pet manifest should reject frame fields outside the runtime asset schema");
    };

    assert!(
        error.to_string().contains("data did not match any variant"),
        "unexpected error: {error}"
    );
}
