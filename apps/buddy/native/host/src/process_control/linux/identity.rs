use std::{
    collections::HashSet,
    fs::{self, File},
    io::{self, Read},
    os::fd::OwnedFd,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

use chrono::{DateTime, SecondsFormat};
use rustix::{
    event::{PollFd, PollFlags, Timespec, poll},
    process::{geteuid, getuid},
    time::{ClockId, clock_gettime},
};

use super::super::{Action, ProcessError, policy::Target};

pub(super) struct Stat {
    pub parent: u32,
    ticks: u64,
    state: u8,
}

pub(super) struct Process {
    pub fd: OwnedFd,
    pid: u32,
    stat: Stat,
    executable: String,
    name: String,
    same_owner: bool,
}

impl Process {
    pub fn read(pid: u32, fd: OwnedFd) -> Result<Option<Self>, ProcessError> {
        let read = || -> io::Result<Self> {
            let stat = read_stat(pid)?;
            let executable = fs::read_link(format!("/proc/{pid}/exe"))?
                .into_os_string()
                .into_string()
                .map_err(|_| io::ErrorKind::InvalidData)?;
            let name = read_text(&format!("/proc/{pid}/comm"))?
                .trim_end_matches('\n')
                .to_owned();
            let status = read_text(&format!("/proc/{pid}/status"))?;
            let mut uids = status
                .lines()
                .find_map(|line| line.strip_prefix("Uid:"))
                .ok_or(io::ErrorKind::InvalidData)?
                .split_whitespace();
            let uid = uids.next().and_then(|uid| uid.parse::<u32>().ok());
            let euid = uids.next().and_then(|uid| uid.parse::<u32>().ok());
            let current = read_stat(pid)?;
            if stat.ticks != current.ticks || matches!(current.state, b'Z' | b'X') {
                return Err(io::ErrorKind::NotFound.into());
            }
            Ok(Self {
                fd,
                pid,
                stat,
                executable,
                name,
                same_owner: uid == Some(getuid().as_raw()) && euid == Some(geteuid().as_raw()),
            })
        };
        let process = match read() {
            Ok(process) => process,
            Err(error)
                if matches!(
                    error.kind(),
                    io::ErrorKind::NotFound | io::ErrorKind::PermissionDenied
                ) =>
            {
                return Ok(None);
            }
            Err(_) => return Err(ProcessError::Failed),
        };
        if process.wait(0)? {
            Ok(None)
        } else {
            Ok(Some(process))
        }
    }

    pub fn wait(&self, seconds: i64) -> Result<bool, ProcessError> {
        let mut fds = [PollFd::new(&self.fd, PollFlags::IN)];
        let ready = poll(
            &mut fds,
            Some(&Timespec {
                tv_sec: seconds,
                tv_nsec: 0,
            }),
        )
        .map_err(super::map_error)?;
        Ok(ready != 0)
    }

    pub fn matches(&self, expected: &str) -> bool {
        self.name.to_lowercase() == expected
            || Path::new(&self.executable)
                .file_name()
                .is_some_and(|name| name.to_string_lossy().to_lowercase() == expected)
    }

    pub fn target(&self, protected: &HashSet<u32>) -> Result<Target, ProcessError> {
        let mutable = self.same_owner && self.pid > 1 && !protected.contains(&self.pid);
        let identity = format!("{} {}", self.name, self.executable).to_lowercase();
        let interruption = if ["clash", "mihomo", "proxy", "vpn"]
            .iter()
            .any(|name| identity.contains(name))
        {
            "network"
        } else if self.executable.starts_with("/opt/") {
            "application"
        } else {
            "none"
        };
        let display_name: String = self
            .name
            .chars()
            .map(|character| {
                if character.is_control() {
                    ' '
                } else {
                    character
                }
            })
            .take(256)
            .collect();
        Ok(Target {
            kind: "process",
            pid: self.pid,
            executable: self.executable.clone(),
            instance_id: self.stat.ticks.to_string(),
            started_at: started_at(self.stat.ticks)?,
            display_name: if display_name.is_empty() {
                "unknown".into()
            } else {
                display_name
            },
            interruption,
            allowed_actions: if mutable {
                vec![Action::Terminate, Action::Kill]
            } else {
                vec![]
            },
        })
    }
}

fn read_text(path: &str) -> io::Result<String> {
    let mut bytes = Vec::new();
    File::open(path)?.take(65537).read_to_end(&mut bytes)?;
    if bytes.len() > 65536 {
        return Err(io::ErrorKind::InvalidData.into());
    }
    String::from_utf8(bytes).map_err(|_| io::ErrorKind::InvalidData.into())
}

pub(super) fn read_stat(pid: u32) -> io::Result<Stat> {
    parse_stat(&read_text(&format!("/proc/{pid}/stat"))?)
        .ok_or_else(|| io::ErrorKind::InvalidData.into())
}

fn parse_stat(text: &str) -> Option<Stat> {
    let (_, fields) = text.rsplit_once(')')?;
    let mut fields = fields.split_whitespace();
    let state = *fields.next()?.as_bytes().first()?;
    let parent = fields.next()?.parse().ok()?;
    let ticks = fields.nth(17)?.parse().ok()?;
    Some(Stat {
        parent,
        ticks,
        state,
    })
}

fn started_at(ticks: u64) -> Result<String, ProcessError> {
    let frequency = rustix::param::clock_ticks_per_second();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| ProcessError::Failed)?
        .as_millis();
    let boot = clock_gettime(ClockId::Boottime);
    let elapsed = u128::try_from(boot.tv_sec).map_err(|_| ProcessError::Failed)? * 1000
        + u128::try_from(boot.tv_nsec).map_err(|_| ProcessError::Failed)? / 1_000_000;
    let process_elapsed = u128::from(ticks) * 1000 / u128::from(frequency.max(1));
    let timestamp = now.saturating_sub(elapsed.saturating_sub(process_elapsed));
    DateTime::from_timestamp_millis(i64::try_from(timestamp).map_err(|_| ProcessError::Failed)?)
        .map(|time| time.to_rfc3339_opts(SecondsFormat::Millis, true))
        .ok_or(ProcessError::Failed)
}

#[cfg(test)]
#[path = "../../../__tests__/process_identity_linux.rs"]
mod tests;
