use super::{
    process::NativePetLayer,
    scripted_walk::{NativePetScriptedWalkComposition, NativePetScriptedWalkState},
};

pub(super) fn native_pet_layer_for_scripted_walk(
    default_layer: NativePetLayer,
    scripted_walk_state: Option<&NativePetScriptedWalkState>,
) -> NativePetLayer {
    match scripted_walk_state.map(|state| state.composition) {
        Some(NativePetScriptedWalkComposition::BehindActiveWindow) => NativePetLayer::Normal,
        Some(NativePetScriptedWalkComposition::Default) | None => default_layer,
    }
}

#[cfg(test)]
#[path = "__tests__/window_layer.rs"]
mod tests;
