use std::{collections::HashSet, fs, num::NonZeroU32};

use rustix::process::{Pid, PidfdFlags, Signal, pidfd_open, pidfd_send_signal};

use super::{
    Action, MAX_OUTPUT_BYTES, ProcessError, Request, Selector,
    policy::{Target, validate_execution},
};

mod identity;
use identity::{Process, read_stat};

const MAX_CANDIDATES: usize = 4096;

pub(super) fn request(request: &Request) -> Result<Vec<u8>, ProcessError> {
    let protected = protected_processes(request.protected_pids())?;
    let targets = match request {
        Request::Resolve { selector, .. } => resolve(selector, &protected)?,
        Request::Read { pid, .. } => inspect(pid.get())?
            .map(|process| process.target(&protected))
            .transpose()?
            .into_iter()
            .collect(),
        Request::Execute {
            pid,
            instance_id,
            executable,
            action,
            ..
        } => {
            let process = inspect(pid.get())?.ok_or(ProcessError::TargetChanged)?;
            let target = process.target(&protected)?;
            validate_execution(&target, pid.get(), instance_id, executable, *action)?;
            let signal = match action {
                Action::Terminate => Signal::TERM,
                Action::Kill => Signal::KILL,
            };
            pidfd_send_signal(&process.fd, signal).map_err(map_error)?;
            process.wait(2)?;
            vec![target]
        }
    };
    let output = serde_json::to_vec(&targets).map_err(|_| ProcessError::Failed)?;
    if output.len() > MAX_OUTPUT_BYTES {
        return Err(ProcessError::Failed);
    }
    Ok(output)
}

fn resolve(selector: &Selector, protected: &HashSet<u32>) -> Result<Vec<Target>, ProcessError> {
    if let Selector::Pid { pid } = selector {
        return inspect(pid.get())?
            .map(|process| process.target(protected))
            .transpose()
            .map(|target| target.into_iter().collect());
    }
    let Selector::Name { name } = selector else {
        unreachable!()
    };
    let mut pids = Vec::new();
    for entry in fs::read_dir("/proc").map_err(|_| ProcessError::Failed)? {
        let entry = entry.map_err(|_| ProcessError::Failed)?;
        if let Some(pid) = entry
            .file_name()
            .to_str()
            .and_then(|name| name.parse::<u32>().ok())
        {
            pids.push(pid);
            if pids.len() > MAX_CANDIDATES {
                return Err(ProcessError::Failed);
            }
        }
    }
    pids.sort_unstable();
    let expected = name.trim().to_lowercase();
    let mut targets = Vec::new();
    for pid in pids {
        if let Some(process) = inspect(pid)?
            && process.matches(&expected)
        {
            targets.push(process.target(protected)?);
        }
    }
    Ok(targets)
}

fn inspect(pid: u32) -> Result<Option<Process>, ProcessError> {
    let pid_value = i32::try_from(pid)
        .ok()
        .and_then(Pid::from_raw)
        .ok_or(ProcessError::Invalid)?;
    let fd = match pidfd_open(pid_value, PidfdFlags::empty()) {
        Ok(fd) => fd,
        Err(rustix::io::Errno::SRCH | rustix::io::Errno::ACCESS | rustix::io::Errno::PERM) => {
            return Ok(None);
        }
        Err(error) => return Err(map_error(error)),
    };
    Process::read(pid, fd)
}

fn protected_processes(roots: &[NonZeroU32]) -> Result<HashSet<u32>, ProcessError> {
    let mut protected = HashSet::from([1]);
    for root in roots
        .iter()
        .map(|pid| pid.get())
        .chain([std::process::id()])
    {
        let mut pid = root;
        while pid != 0 && protected.insert(pid) {
            if protected.len() > MAX_CANDIDATES {
                return Err(ProcessError::Failed);
            }
            match read_stat(pid) {
                Ok(stat) => pid = stat.parent,
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => break,
                Err(_) => return Err(ProcessError::Failed),
            }
        }
    }
    Ok(protected)
}

fn map_error(error: rustix::io::Errno) -> ProcessError {
    match error {
        rustix::io::Errno::NOSYS => ProcessError::Unavailable,
        rustix::io::Errno::SRCH => ProcessError::TargetChanged,
        rustix::io::Errno::ACCESS | rustix::io::Errno::PERM => ProcessError::NotAllowed,
        _ => ProcessError::Failed,
    }
}
