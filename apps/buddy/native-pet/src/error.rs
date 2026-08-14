pub type BuddyResult<T> = Result<T, BuddyError>;

#[derive(Debug, thiserror::Error)]
pub enum BuddyError {
    #[error("filesystem operation failed: {0}")]
    Io(#[from] std::io::Error),

    #[error("json operation failed: {0}")]
    Json(#[from] serde_json::Error),

    #[error("buddy state validation failed: {0}")]
    Validation(String),

    #[error("buddy state validation failed: unsupported {scope} capability: {capability}")]
    UnsupportedCapability { scope: String, capability: String },

    #[error("runtime failed: {0}")]
    Runtime(String),
}
