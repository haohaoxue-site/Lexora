use std::{
    io::{Read, Write},
    os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle},
    ptr,
};

use serde::Deserialize;
use windows_sys::Win32::{
    Foundation::{FILETIME, HANDLE, WAIT_OBJECT_0},
    System::{
        JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JobObjectExtendedLimitInformation,
            SetInformationJobObject,
        },
        Threading::{
            GetCurrentProcess, GetProcessTimes, INFINITE, OpenProcess,
            PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SET_QUOTA, PROCESS_SYNCHRONIZE,
            PROCESS_TERMINATE, WaitForSingleObject,
        },
    },
};

#[derive(Debug, thiserror::Error)]
#[error("RUNTIME_GUARD_FAILED")]
pub struct GuardError;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    pid: u32,
}

pub fn run() -> Result<(), GuardError> {
    let mut input = Vec::new();
    std::io::stdin()
        .take(1025)
        .read_to_end(&mut input)
        .map_err(|_| GuardError)?;
    if input.len() > 1024 {
        return Err(GuardError);
    }
    let request: Request = serde_json::from_slice(&input).map_err(|_| GuardError)?;
    if request.pid <= 1 || request.pid == std::process::id() {
        return Err(GuardError);
    }
    // SAFETY: The requested rights are limited to job assignment, identity and exit observation.
    let runtime = owned(unsafe {
        OpenProcess(
            PROCESS_SET_QUOTA
                | PROCESS_TERMINATE
                | PROCESS_QUERY_LIMITED_INFORMATION
                | PROCESS_SYNCHRONIZE,
            0,
            request.pid,
        )
    })?;
    // SAFETY: GetCurrentProcess returns a valid non-owning pseudo handle.
    let guard_created = creation_time(unsafe { GetCurrentProcess() })?;
    if creation_time(runtime.as_raw_handle())? >= guard_created {
        return Err(GuardError);
    }
    // SAFETY: Null attributes/name create a private, non-inheritable job.
    let job = owned(unsafe { CreateJobObjectW(ptr::null(), ptr::null()) })?;
    let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
    limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
    // SAFETY: The live job and initialized limits remain valid for the exact supplied struct size.
    if unsafe {
        SetInformationJobObject(
            job.as_raw_handle(),
            JobObjectExtendedLimitInformation,
            ptr::from_ref(&limits).cast(),
            size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        )
    } == 0
    {
        return Err(GuardError);
    }
    // SAFETY: Both handles are owned and live; Runtime waits for readiness before creating tools.
    if unsafe { AssignProcessToJobObject(job.as_raw_handle(), runtime.as_raw_handle()) } == 0 {
        return Err(GuardError);
    }
    let mut output = std::io::stdout().lock();
    output.write_all(b"ready\n").map_err(|_| GuardError)?;
    output.flush().map_err(|_| GuardError)?;
    // SAFETY: The process handle has SYNCHRONIZE access and remains owned until the wait completes.
    if unsafe { WaitForSingleObject(runtime.as_raw_handle(), INFINITE) } != WAIT_OBJECT_0 {
        return Err(GuardError);
    }
    drop(job);
    Ok(())
}

fn owned(handle: HANDLE) -> Result<OwnedHandle, GuardError> {
    if handle.is_null() {
        return Err(GuardError);
    }
    // SAFETY: Successful CreateJobObject/OpenProcess results transfer one owning handle here.
    Ok(unsafe { OwnedHandle::from_raw_handle(handle) })
}

fn creation_time(handle: HANDLE) -> Result<u64, GuardError> {
    let mut created = FILETIME::default();
    let mut exited = FILETIME::default();
    let mut kernel = FILETIME::default();
    let mut user = FILETIME::default();
    // SAFETY: The caller supplies a live queryable process handle and all output structs are writable.
    if unsafe { GetProcessTimes(handle, &mut created, &mut exited, &mut kernel, &mut user) } == 0 {
        return Err(GuardError);
    }
    Ok((u64::from(created.dwHighDateTime) << 32) | u64::from(created.dwLowDateTime))
}
