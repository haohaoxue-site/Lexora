#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(super) struct NativePetAnimationKey(String);

impl NativePetAnimationKey {
    pub(super) fn parse(value: &str) -> Option<Self> {
        if !native_pet_manifest_animation_key_is_valid(value) {
            return None;
        }

        Some(Self(value.to_owned()))
    }

    #[cfg(feature = "pet")]
    pub(super) fn manifest_key(&self) -> &str {
        self.0.as_str()
    }
}

pub(crate) fn native_pet_manifest_animation_key_is_valid(value: &str) -> bool {
    let mut chars = value.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !first.is_ascii_lowercase() {
        return false;
    }

    chars.all(|character| {
        character.is_ascii_lowercase() || character.is_ascii_digit() || character == '_'
    })
}
