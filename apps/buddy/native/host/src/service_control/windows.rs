use std::{ptr, time::Duration};

use windows_sys::Win32::{
    Foundation::{
        ERROR_ACCESS_DENIED, ERROR_SERVICE_ALREADY_RUNNING, ERROR_SERVICE_DOES_NOT_EXIST,
        ERROR_SERVICE_NOT_ACTIVE, GetLastError,
    },
    Globalization::{CSTR_EQUAL, CompareStringOrdinal},
    System::Services::{
        CloseServiceHandle, ControlService, GetServiceDisplayNameW, GetServiceKeyNameW,
        OpenSCManagerW, OpenServiceW, QueryServiceStatusEx, SC_HANDLE, SC_MANAGER_CONNECT,
        SC_STATUS_PROCESS_INFO, SERVICE_ACCEPT_STOP, SERVICE_CONTROL_STOP, SERVICE_QUERY_STATUS,
        SERVICE_RUNNING, SERVICE_START, SERVICE_STATUS, SERVICE_STATUS_PROCESS, SERVICE_STOP,
        SERVICE_STOPPED, SERVICE_WIN32, StartServiceW,
    },
};

use super::{
    Action, Request, ServiceError,
    execution::{self, Service, State, Target},
};

struct ScHandle(SC_HANDLE);

impl Drop for ScHandle {
    fn drop(&mut self) {
        // SAFETY: This wrapper exclusively owns a successful SCM/service open result.
        unsafe { CloseServiceHandle(self.0) };
    }
}

struct WindowsService {
    handle: ScHandle,
    service_id: String,
    display_name: String,
}

pub(super) fn request(request: &Request) -> Result<Vec<Target>, ServiceError> {
    if request.action.is_some() && execution::is_protected(&request.service_id) {
        return Err(ServiceError::NotAllowed);
    }
    let Some(service) = open(&request.service_id, request.action)? else {
        return if request.action.is_some() {
            Err(ServiceError::TargetChanged)
        } else {
            Ok(Vec::new())
        };
    };
    let target = match request.action {
        Some(action) => execution::execute(&service, action)?,
        None => service.target()?,
    };
    Ok(vec![target])
}

fn open(service_id: &str, action: Option<Action>) -> Result<Option<WindowsService>, ServiceError> {
    // SAFETY: Null names select the local machine and default SCM database.
    let manager = unsafe { OpenSCManagerW(ptr::null(), ptr::null(), SC_MANAGER_CONNECT) };
    if manager.is_null() {
        // SAFETY: Read the error immediately after the failed Win32 call.
        return Err(operation_error(unsafe { GetLastError() }));
    }
    let manager = ScHandle(manager);
    let name: Vec<u16> = service_id.encode_utf16().chain(Some(0)).collect();
    let rights = SERVICE_QUERY_STATUS
        | match action {
            None => 0,
            Some(Action::Start) => SERVICE_START,
            Some(Action::Stop) => SERVICE_STOP,
            Some(Action::Restart) => SERVICE_START | SERVICE_STOP,
        };
    // SAFETY: The manager is live; the validated service name is NUL-terminated UTF-16.
    let handle = unsafe { OpenServiceW(manager.0, name.as_ptr(), rights) };
    if handle.is_null() {
        // SAFETY: Read the error immediately after the failed Win32 call.
        return match unsafe { GetLastError() } {
            ERROR_SERVICE_DOES_NOT_EXIST => Ok(None),
            code => Err(operation_error(code)),
        };
    }
    let handle = ScHandle(handle);
    if status(&handle)?.dwServiceType & SERVICE_WIN32 == 0 {
        return Ok(None);
    }
    let mut display = [0u16; 1025];
    let mut display_len = display.len() as u32;
    // SAFETY: Both handles/buffers are live, and the declared capacity matches the output array.
    if unsafe {
        GetServiceDisplayNameW(
            manager.0,
            name.as_ptr(),
            display.as_mut_ptr(),
            &mut display_len,
        )
    } == 0
    {
        return Err(ServiceError::Failed);
    }
    let display_name = decode_name(&display, display_len)?;
    let mut key = [0u16; 257];
    let mut key_len = key.len() as u32;
    // SAFETY: GetServiceDisplayNameW supplied a terminated name; key has the supplied UTF-16 capacity.
    if unsafe { GetServiceKeyNameW(manager.0, display.as_ptr(), key.as_mut_ptr(), &mut key_len) }
        == 0
    {
        return Err(ServiceError::Failed);
    }
    let service_id = decode_name(&key, key_len)?;
    // SAFETY: Both names are validated, terminated UTF-16 arrays owned throughout the comparison.
    if unsafe { CompareStringOrdinal(name.as_ptr(), -1, key.as_ptr(), -1, 1) } != CSTR_EQUAL {
        return Err(ServiceError::TargetChanged);
    }
    Ok(Some(WindowsService {
        handle,
        service_id,
        display_name,
    }))
}

fn operation_error(code: u32) -> ServiceError {
    if code == ERROR_ACCESS_DENIED {
        ServiceError::AccessDenied
    } else {
        ServiceError::Failed
    }
}

fn decode_name(buffer: &[u16], len: u32) -> Result<String, ServiceError> {
    let len = len as usize;
    if len == 0 || len >= buffer.len() || buffer[len] != 0 {
        return Err(ServiceError::Failed);
    }
    String::from_utf16(&buffer[..len]).map_err(|_| ServiceError::Failed)
}

fn status(handle: &ScHandle) -> Result<SERVICE_STATUS_PROCESS, ServiceError> {
    let mut status = SERVICE_STATUS_PROCESS::default();
    let mut needed = 0;
    // SAFETY: The handle is live and the aligned output struct has exactly the supplied byte size.
    if unsafe {
        QueryServiceStatusEx(
            handle.0,
            SC_STATUS_PROCESS_INFO,
            ptr::from_mut(&mut status).cast(),
            size_of::<SERVICE_STATUS_PROCESS>() as u32,
            &mut needed,
        )
    } == 0
    {
        return Err(ServiceError::Failed);
    }
    Ok(status)
}

fn state(status: &SERVICE_STATUS_PROCESS) -> State {
    match status.dwCurrentState {
        SERVICE_RUNNING => State::Running,
        SERVICE_STOPPED => State::Stopped,
        _ => State::Transitioning,
    }
}

impl Service for WindowsService {
    fn target(&self) -> Result<Target, ServiceError> {
        let status = status(&self.handle)?;
        Ok(Target::new(
            &self.service_id,
            &self.display_name,
            state(&status),
            status.dwControlsAccepted & SERVICE_ACCEPT_STOP != 0,
        ))
    }

    fn stop(&self) -> Result<(), ServiceError> {
        let mut status = SERVICE_STATUS::default();
        // SAFETY: This live service handle was opened with SERVICE_STOP; status is writable.
        if unsafe { ControlService(self.handle.0, SERVICE_CONTROL_STOP, &mut status) } == 0 {
            // SAFETY: Read the error immediately after the failed Win32 call.
            if unsafe { GetLastError() } != ERROR_SERVICE_NOT_ACTIVE {
                return Err(ServiceError::Failed);
            }
        }
        Ok(())
    }

    fn start(&self) -> Result<(), ServiceError> {
        // SAFETY: This live service handle was opened with SERVICE_START; no arguments are supplied.
        if unsafe { StartServiceW(self.handle.0, 0, ptr::null()) } == 0 {
            // SAFETY: Read the error immediately after the failed Win32 call.
            if unsafe { GetLastError() } != ERROR_SERVICE_ALREADY_RUNNING {
                return Err(ServiceError::Failed);
            }
        }
        Ok(())
    }

    fn wait_for(&self, expected: State) -> Result<(), ServiceError> {
        execution::wait_for_state(
            || status(&self.handle).map(|status| state(&status)),
            expected,
            Duration::from_secs(8),
        )
    }
}
