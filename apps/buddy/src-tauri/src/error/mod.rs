pub type BuddyResult<T> = Result<T, BuddyError>;

#[derive(Debug, thiserror::Error)]
pub enum BuddyError {
    #[error("failed to resolve application path: {0}")]
    AppPath(#[from] tauri::Error),

    #[error("filesystem operation failed: {0}")]
    Io(#[from] std::io::Error),

    #[error("sqlite operation failed: {0}")]
    Sqlite(#[from] rusqlite::Error),

    #[error("json operation failed: {0}")]
    Json(#[from] serde_json::Error),

    #[error("yaml operation failed: {0}")]
    Yaml(#[from] serde_yaml::Error),

    #[error("buddy state validation failed: {0}")]
    Validation(String),

    #[error("codex runtime failed: {0}")]
    Codex(String),

    #[error("runtime failed: {0}")]
    Runtime(String),
}
