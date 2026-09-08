use std::ptr;

use windows_sys::Win32::{
    Foundation::{HWND, LPARAM},
    UI::{
        Input::KeyboardAndMouse::IsWindowEnabled,
        WindowsAndMessaging::{
            EnumWindows, GW_OWNER, GetWindow, GetWindowThreadProcessId, IsWindowVisible,
            PostMessageW, WM_CLOSE,
        },
    },
};

use super::ProcessError;

struct Search {
    pid: u32,
    window: HWND,
}

unsafe extern "system" fn find_window(window: HWND, data: LPARAM) -> i32 {
    // SAFETY: EnumWindows calls synchronously with the pointer supplied by main_window.
    let search = unsafe { &mut *(data as *mut Search) };
    let mut pid = 0;
    // SAFETY: The enumerator supplies HWND; the PID output is writable and APIs validate window liveness.
    let eligible = unsafe {
        GetWindowThreadProcessId(window, &mut pid) != 0
            && pid == search.pid
            && GetWindow(window, GW_OWNER).is_null()
            && IsWindowVisible(window) != 0
            && IsWindowEnabled(window) != 0
    };
    if eligible {
        search.window = window;
        0
    } else {
        1
    }
}

pub(super) fn main_window(pid: u32) -> Option<HWND> {
    let mut search = Search {
        pid,
        window: ptr::null_mut(),
    };
    // SAFETY: search remains live and exclusively borrowed throughout the synchronous enumeration.
    unsafe { EnumWindows(Some(find_window), ptr::from_mut(&mut search) as LPARAM) };
    (!search.window.is_null()).then_some(search.window)
}

pub(super) fn close(window: HWND, expected_pid: u32) -> Result<(), ProcessError> {
    let mut pid = 0;
    // SAFETY: Recheck window ownership immediately before posting; PID remains bound by the open process handle.
    if unsafe { GetWindowThreadProcessId(window, &mut pid) } == 0 || pid != expected_pid {
        return Err(ProcessError::TargetChanged);
    }
    // SAFETY: This non-null, ownership-checked window receives only WM_CLOSE with no pointer arguments.
    if unsafe { PostMessageW(window, WM_CLOSE, 0, 0) } == 0 {
        return Err(ProcessError::Failed);
    }
    Ok(())
}
