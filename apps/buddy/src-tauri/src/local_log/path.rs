use std::{
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use crate::app_paths::{CONVERSATIONS_DIR_NAME, RUNS_DIR_NAME};

const CONVERSATION_INDEX_FILE_NAME: &str = "conversation_index.jsonl";
const RUN_INDEX_FILE_NAME: &str = "run_index.jsonl";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LocalLogTimestamp {
    year: u16,
    month: u8,
    day: u8,
    hour: u8,
    minute: u8,
    second: u8,
}

impl LocalLogTimestamp {
    pub fn new(year: u16, month: u8, day: u8, hour: u8, minute: u8, second: u8) -> Self {
        Self {
            year,
            month,
            day,
            hour,
            minute,
            second,
        }
    }

    pub fn now_utc() -> Self {
        let unix_seconds = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_secs() as i64)
            .unwrap_or(0);

        Self::from_unix_seconds(unix_seconds)
    }

    pub fn from_unix_seconds(unix_seconds: i64) -> Self {
        let days = unix_seconds.div_euclid(86_400);
        let seconds_of_day = unix_seconds.rem_euclid(86_400);
        let (year, month, day) = civil_from_days(days);

        Self {
            year: year as u16,
            month: month as u8,
            day: day as u8,
            hour: (seconds_of_day / 3_600) as u8,
            minute: ((seconds_of_day % 3_600) / 60) as u8,
            second: (seconds_of_day % 60) as u8,
        }
    }

    pub fn to_rfc3339_millis(self) -> String {
        format!(
            "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.000Z",
            self.year, self.month, self.day, self.hour, self.minute, self.second
        )
    }

    fn date_bucket(self) -> String {
        format!("{:04}/{:02}/{:02}", self.year, self.month, self.day)
    }

    fn file_timestamp(self) -> String {
        format!(
            "{:04}-{:02}-{:02}T{:02}-{:02}-{:02}",
            self.year, self.month, self.day, self.hour, self.minute, self.second
        )
    }
}

fn civil_from_days(days_since_unix_epoch: i64) -> (i64, i64, i64) {
    let days = days_since_unix_epoch + 719_468;
    let era = if days >= 0 { days } else { days - 146_096 } / 146_097;
    let day_of_era = days - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    let year = year + if month <= 2 { 1 } else { 0 };

    (year, month, day)
}

pub fn conversation_index_path(buddy_home: &Path) -> PathBuf {
    buddy_home.join(CONVERSATION_INDEX_FILE_NAME)
}

pub fn run_index_path(buddy_home: &Path) -> PathBuf {
    buddy_home.join(RUN_INDEX_FILE_NAME)
}

pub fn conversation_log_path(
    buddy_home: &Path,
    timestamp: LocalLogTimestamp,
    conversation_id: &str,
) -> PathBuf {
    buddy_home
        .join(CONVERSATIONS_DIR_NAME)
        .join(timestamp.date_bucket())
        .join(format!(
            "conversation-{}-{}.jsonl",
            timestamp.file_timestamp(),
            conversation_id
        ))
}

pub fn run_log_path(buddy_home: &Path, timestamp: LocalLogTimestamp, run_id: &str) -> PathBuf {
    buddy_home
        .join(RUNS_DIR_NAME)
        .join(timestamp.date_bucket())
        .join(format!(
            "run-{}-{}.jsonl",
            timestamp.file_timestamp(),
            run_id
        ))
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::{
        conversation_index_path, conversation_log_path, run_index_path, run_log_path,
        LocalLogTimestamp,
    };

    #[test]
    fn builds_date_bucketed_conversation_log_path() {
        let timestamp = LocalLogTimestamp::new(2026, 7, 6, 9, 8, 7);
        let path = conversation_log_path(
            &PathBuf::from("/tmp/lexora-buddy"),
            timestamp,
            "conversation-1",
        );

        assert_eq!(
            path,
            PathBuf::from(
                "/tmp/lexora-buddy/conversations/2026/07/06/conversation-2026-07-06T09-08-07-conversation-1.jsonl"
            )
        );
    }

    #[test]
    fn builds_date_bucketed_run_log_path() {
        let timestamp = LocalLogTimestamp::new(2026, 7, 6, 9, 8, 7);
        let path = run_log_path(&PathBuf::from("/tmp/lexora-buddy"), timestamp, "run-1");

        assert_eq!(
            path,
            PathBuf::from("/tmp/lexora-buddy/runs/2026/07/06/run-2026-07-06T09-08-07-run-1.jsonl")
        );
    }

    #[test]
    fn builds_conversation_index_path() {
        assert_eq!(
            conversation_index_path(&PathBuf::from("/tmp/lexora-buddy")),
            PathBuf::from("/tmp/lexora-buddy/conversation_index.jsonl")
        );
    }

    #[test]
    fn builds_run_index_path() {
        assert_eq!(
            run_index_path(&PathBuf::from("/tmp/lexora-buddy")),
            PathBuf::from("/tmp/lexora-buddy/run_index.jsonl")
        );
    }

    #[test]
    fn converts_unix_seconds_to_utc_timestamp() {
        let timestamp = LocalLogTimestamp::from_unix_seconds(1_783_328_887);

        assert_eq!(timestamp.to_rfc3339_millis(), "2026-07-06T09:08:07.000Z");
        assert_eq!(timestamp.date_bucket(), "2026/07/06");
        assert_eq!(timestamp.file_timestamp(), "2026-07-06T09-08-07");
    }
}
