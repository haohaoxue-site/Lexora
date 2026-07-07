#![cfg_attr(not(test), allow(dead_code))]

use std::path::Path;

use crate::{
    error::{BuddyError, BuddyResult},
    memory::workspace,
    storage::{BuddyAcceptedMemoryCandidate, BuddyStorage, CreateBuddyMemorySourceRefRequest},
};

pub fn accept_memory_candidate(
    storage: &BuddyStorage,
    memory_root: &Path,
    candidate_id: &str,
) -> BuddyResult<BuddyAcceptedMemoryCandidate> {
    let candidate = storage.find_memory_candidate(candidate_id)?;
    let existing_refs = storage.list_memory_source_refs(candidate.id.clone())?;
    if candidate.decision == "accepted" {
        if let Some(source_ref) = existing_refs.into_iter().next() {
            return Ok(BuddyAcceptedMemoryCandidate {
                candidate,
                source_ref,
            });
        }
    } else if candidate.decision != "pending" {
        return Err(BuddyError::Validation(format!(
            "memory candidate {} cannot be accepted from {}",
            candidate.id, candidate.decision
        )));
    }

    workspace::append_accepted_memory_candidate(memory_root, &candidate)?;
    let workspace_write =
        workspace::consolidate_accepted_memory_candidate(memory_root, &candidate)?;
    storage.accept_memory_candidate_with_source_ref(CreateBuddyMemorySourceRefRequest {
        candidate_id: candidate.id.clone(),
        content_hash: workspace_write.content_hash,
        line_end: workspace_write.line_end,
        line_start: workspace_write.line_start,
        project_id: candidate.project_id.clone(),
        relative_path: workspace_write.relative_path,
        scope: candidate.scope.clone(),
        source_event_id: candidate.source_event_id.clone(),
        source_kind: "buddy_memory_file".to_owned(),
        source_log_path: Some(candidate.source_log_path.clone()),
        source_run_id: candidate.run_id.clone(),
    })
}
