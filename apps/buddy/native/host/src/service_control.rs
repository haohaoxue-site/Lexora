use std::io::{Read, Write};

use serde::{Deserialize, Serialize};

#[cfg(any(windows, test))]
mod execution;
#[cfg(windows)]
mod windows;

const MAX_REQUEST_BYTES: u64 = 16 * 1024;

#[derive(Debug, thiserror::Error, PartialEq)]
pub enum ServiceError {
    #[error("SYSTEM_ACTION_INVALID")]
    Invalid,
    #[error("SYSTEM_ACTION_NOT_ALLOWED")]
    NotAllowed,
    #[error("SYSTEM_TARGET_CHANGED")]
    TargetChanged,
    #[error("SYSTEM_OPERATION_FAILED")]
    Failed,
    #[error("SYSTEM_ACCESS_DENIED")]
    AccessDenied,
    #[error("SYSTEM_OPERATION_TIMEOUT")]
    Timeout,
    #[error("SYSTEM_HOST_UNAVAILABLE")]
    Unavailable,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
enum Operation {
    Resolve,
    Read,
    Execute,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
enum Action {
    #[serde(rename = "start-service")]
    Start,
    #[serde(rename = "stop-service")]
    Stop,
    #[serde(rename = "restart-service")]
    Restart,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    operation: Operation,
    service_id: String,
    action: Option<Action>,
}

fn read_request(input: impl Read) -> Result<Request, ServiceError> {
    let mut bytes = Vec::new();
    input
        .take(MAX_REQUEST_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| ServiceError::Invalid)?;
    if bytes.len() as u64 > MAX_REQUEST_BYTES {
        return Err(ServiceError::Invalid);
    }
    let request: Request = serde_json::from_slice(&bytes).map_err(|_| ServiceError::Invalid)?;
    if request.service_id.trim().is_empty()
        || request.service_id.encode_utf16().count() > 256
        || request
            .service_id
            .chars()
            .any(|c| c < ' ' || matches!(c, '/' | '\\'))
        || (request.operation == Operation::Execute) != request.action.is_some()
    {
        return Err(ServiceError::Invalid);
    }
    Ok(request)
}

pub fn run(input: impl Read, output: impl Write) -> Result<(), ServiceError> {
    let request = read_request(input)?;
    #[cfg(windows)]
    {
        let targets = windows::request(&request)?;
        serde_json::to_writer(output, &targets).map_err(|_| ServiceError::Failed)
    }
    #[cfg(not(windows))]
    {
        let _ = (request, output);
        Err(ServiceError::Unavailable)
    }
}

#[cfg(test)]
#[path = "../__tests__/service_control.rs"]
mod tests;
