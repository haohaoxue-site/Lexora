use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum AffectiveMood {
    Neutral,
    Happy,
    Sad,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum AffectiveEnergy {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AffectiveContext {
    pub(crate) mood: AffectiveMood,
    pub(crate) energy: AffectiveEnergy,
}

impl Default for AffectiveContext {
    fn default() -> Self {
        Self {
            mood: AffectiveMood::Neutral,
            energy: AffectiveEnergy::Medium,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum AffectiveContextSource {
    DefaultCreated,
    StateFile,
    InvalidFileFallback,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct AffectiveContextSnapshot {
    pub(crate) context: AffectiveContext,
    pub(crate) source: AffectiveContextSource,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ResolveContext {
    pub(crate) affective_context: AffectiveContext,
    pub(crate) affective_context_source: AffectiveContextSource,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(crate) unsupported_capabilities: Vec<String>,
}

impl ResolveContext {
    pub(crate) fn from_affective_snapshot(snapshot: AffectiveContextSnapshot) -> Self {
        Self {
            affective_context: snapshot.context,
            affective_context_source: snapshot.source,
            unsupported_capabilities: Vec::new(),
        }
    }

    #[cfg(test)]
    pub(crate) fn with_unsupported_capability(mut self, capability: impl Into<String>) -> Self {
        self.unsupported_capabilities.push(capability.into());
        self
    }

    pub(crate) fn supports_capability(&self, capability: &str) -> bool {
        !self
            .unsupported_capabilities
            .iter()
            .any(|unsupported| unsupported == capability)
    }
}

impl Default for ResolveContext {
    fn default() -> Self {
        Self::from_affective_snapshot(AffectiveContextSnapshot {
            context: AffectiveContext::default(),
            source: AffectiveContextSource::DefaultCreated,
        })
    }
}
