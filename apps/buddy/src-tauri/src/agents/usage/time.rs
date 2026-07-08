use std::{
    fs,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

pub(super) fn current_unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_secs())
}

pub(super) fn file_modified_timestamp(path: &Path) -> String {
    fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .and_then(|duration| format_unix_seconds_utc(duration.as_secs()))
        .unwrap_or_else(|| "1970-01-01T00:00:00Z".to_owned())
}

pub(super) fn extract_iso_date(timestamp: &str) -> Option<String> {
    let date = timestamp.get(0..10)?;
    let mut chars = date.chars();
    if chars.by_ref().take(4).all(|char| char.is_ascii_digit())
        && chars.next() == Some('-')
        && chars.by_ref().take(2).all(|char| char.is_ascii_digit())
        && chars.next() == Some('-')
        && chars.all(|char| char.is_ascii_digit())
    {
        return Some(date.to_owned());
    }

    None
}

pub(super) fn parse_rfc3339_utc_seconds(timestamp: &str) -> Option<u64> {
    let year = parse_u32(timestamp.get(0..4)?)? as i32;
    let month = parse_u32(timestamp.get(5..7)?)?;
    let day = parse_u32(timestamp.get(8..10)?)?;
    let hour = parse_u32(timestamp.get(11..13)?)?;
    let minute = parse_u32(timestamp.get(14..16)?)?;
    let second = parse_u32(timestamp.get(17..19)?)?;

    if timestamp.get(4..5) != Some("-")
        || timestamp.get(7..8) != Some("-")
        || timestamp.get(10..11) != Some("T")
        || timestamp.get(13..14) != Some(":")
        || timestamp.get(16..17) != Some(":")
        || !timestamp.ends_with('Z')
        || month == 0
        || month > 12
        || day == 0
        || day > 31
        || hour > 23
        || minute > 59
        || second > 60
    {
        return None;
    }

    let days = days_from_civil(year, month, day)?;
    u64::try_from(days)
        .ok()?
        .checked_mul(24 * 60 * 60)?
        .checked_add(u64::from(hour) * 60 * 60)?
        .checked_add(u64::from(minute) * 60)?
        .checked_add(u64::from(second))
}

pub(super) fn format_unix_seconds_utc(timestamp: u64) -> Option<String> {
    let days = i64::try_from(timestamp / (24 * 60 * 60)).ok()?;
    let seconds_of_day = timestamp % (24 * 60 * 60);
    let (year, month, day) = civil_from_days(days)?;
    let hour = seconds_of_day / (60 * 60);
    let minute = (seconds_of_day % (60 * 60)) / 60;
    let second = seconds_of_day % 60;

    Some(format!(
        "{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}Z"
    ))
}

fn parse_u32(value: &str) -> Option<u32> {
    value.parse::<u32>().ok()
}

fn days_from_civil(year: i32, month: u32, day: u32) -> Option<i64> {
    let year = year - i32::from(month <= 2);
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let year_of_era = year - era * 400;
    let month = i32::try_from(month).ok()?;
    let day = i32::try_from(day).ok()?;
    let day_of_year = (153 * (month + if month > 2 { -3 } else { 9 }) + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;

    Some(i64::from(era * 146097 + day_of_era - 719468))
}

fn civil_from_days(days: i64) -> Option<(i32, u32, u32)> {
    let days = days + 719468;
    let era = if days >= 0 { days } else { days - 146096 } / 146097;
    let day_of_era = days - era * 146097;
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36524 - day_of_era / 146096) / 365;
    let year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    let year = year + i64::from(month <= 2);

    Some((
        i32::try_from(year).ok()?,
        u32::try_from(month).ok()?,
        u32::try_from(day).ok()?,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_rfc3339_utc_seconds() {
        assert_eq!(parse_rfc3339_utc_seconds("1970-01-01T00:00:01Z"), Some(1));
        assert_eq!(
            parse_rfc3339_utc_seconds("1970-01-02T00:00:00.000Z"),
            Some(86_400)
        );
    }
}
