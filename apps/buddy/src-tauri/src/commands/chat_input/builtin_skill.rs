use std::{fs, path::Path};

use crate::error::{BuddyError, BuddyResult};

const BUDDY_HOST_SKILL_NAME: &str = "lexora-buddy-host";

#[derive(Clone, Debug, PartialEq, Eq)]
pub(in crate::commands) struct TrustedCodexSkillInput {
    pub(super) name: String,
    pub(super) path: String,
}

pub(in crate::commands) fn create_buddy_builtin_host_skill_input(
    data_dir: &Path,
) -> BuddyResult<TrustedCodexSkillInput> {
    const BUDDY_HOST_SKILL_MD: &str = include_str!("../../../skills/_builtin/SKILL.md");

    let skill_dir = data_dir.join("host-skills").join(BUDDY_HOST_SKILL_NAME);
    let skill_path = skill_dir.join("SKILL.md");
    write_buddy_builtin_skill_file(&skill_path, BUDDY_HOST_SKILL_MD)?;

    let path = skill_path.to_str().ok_or_else(|| {
        BuddyError::Validation("Buddy builtin host skill path is not valid UTF-8".to_owned())
    })?;

    Ok(TrustedCodexSkillInput {
        name: BUDDY_HOST_SKILL_NAME.to_owned(),
        path: path.to_owned(),
    })
}

fn write_buddy_builtin_skill_file(path: &Path, content: &str) -> BuddyResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let should_write = fs::read_to_string(path)
        .map(|current| current != content)
        .unwrap_or(true);
    if should_write {
        fs::write(path, content)?;
    }

    Ok(())
}
