#[cfg(any(windows, test))]
use std::collections::{HashMap, HashSet};

use serde::Serialize;

use super::{Action, ProcessError};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Target {
    pub kind: &'static str,
    pub pid: u32,
    pub executable: String,
    pub instance_id: String,
    pub started_at: String,
    pub display_name: String,
    pub interruption: &'static str,
    pub allowed_actions: Vec<Action>,
}

#[cfg(any(windows, test))]
pub(super) fn protected_processes(parents: &HashMap<u32, u32>, roots: &[u32]) -> HashSet<u32> {
    let mut protected = HashSet::new();
    for &root in roots {
        let mut pid = root;
        while pid != 0 && protected.insert(pid) {
            pid = parents.get(&pid).copied().unwrap_or(0);
        }
    }
    protected
}

#[cfg(any(windows, test))]
pub(super) fn allowed_actions(
    protected: bool,
    same_owner: bool,
    critical: bool,
    has_window: bool,
) -> Vec<Action> {
    if protected || !same_owner || critical {
        return Vec::new();
    }
    if has_window {
        vec![Action::Terminate, Action::Kill]
    } else {
        vec![Action::Kill]
    }
}

pub(super) fn validate_execution(
    target: &Target,
    pid: u32,
    instance_id: &str,
    executable: &str,
    action: Action,
) -> Result<(), ProcessError> {
    if target.pid != pid || target.instance_id != instance_id || target.executable != executable {
        return Err(ProcessError::TargetChanged);
    }
    if !target.allowed_actions.contains(&action) {
        return Err(ProcessError::NotAllowed);
    }
    Ok(())
}
