#![allow(dead_code)]

use std::{
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex, RwLock,
    },
    thread,
    time::{Duration, Instant},
};

use crate::error::{BuddyError, BuddyResult};

mod control_protocol;
mod socket_control;
pub(crate) mod step_protocol;

#[cfg(feature = "pet")]
use super::{
    animation::NativePetAnimationSet,
    assets::create_native_pet_smoke_check_report,
    config::{load_native_pet_config, resolve_native_pet_config_path, NativePetConfig},
    drag_replay::create_native_pet_drag_replay_check_report,
    position_state::resolve_native_pet_position_state_path,
    window::run_native_pet_sidecar,
};
#[cfg(feature = "pet")]
pub(super) use control_protocol::{
    compile_execute_step_control_message, parse_native_pet_control_message, NativePetAnchorReveal,
    NativePetWalkEdge, NativePetWalkTarget, NativePetWindowAnchorEdge, NativePetWindowAnchorReveal,
    NativePetWindowAnchorSelector, NativePetWindowAnchorSelectorKind,
};
use control_protocol::{
    parse_native_pet_control_request_kind, parse_native_pet_stdin_control_request_kind,
};
pub(super) use control_protocol::{NativePetControlMessage, NativePetControlRequestKind};
use socket_control::spawn_native_pet_socket_control_reader;
#[cfg(feature = "pet")]
use step_protocol::SIDECAR_PROTOCOL_VERSION;
use step_protocol::{
    format_sidecar_step_response, interrupt_step_request, parse_sidecar_state_snapshot_response,
    parse_sidecar_step_response, query_state_request, ExecuteStepPayload, ExecuteStepRequest,
    SidecarInterruptReasonCode, SidecarStateSnapshotResponse, SidecarStepResponse,
};

pub const NATIVE_PET_MODE_ARG: &str = "--native-pet";

const NATIVE_PET_SMOKE_CHECK_ARG: &str = "--buddy-native-pet-smoke-check";
const NATIVE_PET_DRAG_REPLAY_CHECK_ARG: &str = "--buddy-native-pet-drag-replay-check";
const NATIVE_PET_SIDECAR_READY_EVENT: &str = "event:ready";
const NATIVE_PET_SIDECAR_RESTARTING_EVENT: &str = "event:restarting";
const NATIVE_PET_SIDECAR_READY_TIMEOUT_MS: u64 = 8_000;
const NATIVE_PET_SIDECAR_STARTUP_MAX_ATTEMPTS: usize = 3;
const NATIVE_PET_SIDECAR_STARTUP_BACKOFF_MS: [u64; 2] = [120, 360];
const NATIVE_PET_SIDECAR_RESTART_BACKOFF_MS: u64 = 1_000;
const NATIVE_PET_EXIT_ON_STDIN_CLOSE_ENV: &str = "LEXORA_BUDDY_PET_EXIT_ON_STDIN_CLOSE";
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativePetProcessSpec {
    pub program: PathBuf,
    pub args: Vec<&'static str>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NativePetLayer {
    AlwaysOnTop,
    Normal,
}

impl NativePetLayer {
    pub(super) fn from_always_on_top(always_on_top: bool) -> Self {
        if always_on_top {
            Self::AlwaysOnTop
        } else {
            Self::Normal
        }
    }

    pub(super) fn keep_above(self) -> bool {
        matches!(self, Self::AlwaysOnTop)
    }
}

#[cfg(feature = "pet")]
#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct NativePetLaunchConfig {
    pub(super) config_path: PathBuf,
    pub(super) position_state_path: PathBuf,
    pub(super) preferences: NativePetConfig,
}

pub(super) struct NativePetControlRequest {
    kind: NativePetControlRequestKind,
    response_sender: Option<mpsc::Sender<serde_json::Value>>,
}

impl NativePetControlRequest {
    fn command(message: NativePetControlMessage) -> Self {
        Self {
            kind: NativePetControlRequestKind::Command(message),
            response_sender: None,
        }
    }

    fn step(kind: NativePetControlRequestKind) -> Self {
        Self {
            kind,
            response_sender: None,
        }
    }

    fn parent_disconnected() -> Self {
        Self {
            kind: NativePetControlRequestKind::ParentDisconnected,
            response_sender: None,
        }
    }

    fn socket(kind: NativePetControlRequestKind) -> (Self, mpsc::Receiver<serde_json::Value>) {
        let (sender, receiver) = mpsc::channel();
        (
            Self {
                kind,
                response_sender: Some(sender),
            },
            receiver,
        )
    }

    pub(super) fn kind(&self) -> NativePetControlRequestKind {
        self.kind.clone()
    }

    pub(super) fn respond(self, response: serde_json::Value) {
        if let Some(sender) = self.response_sender {
            let _ = sender.send(response);
        }
    }
}

const NATIVE_PET_PRESET_BEHAVIOR_EVENT_PREFIX: &str = "event:preset_behavior:";

#[derive(Debug, Clone, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativePetPresetBehaviorEvent {
    pub preset_behavior_id: String,
    pub interaction_id: Option<String>,
    pub outcome: String,
    pub animation: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NativePetSidecarEvent {
    Ready,
    Restarting,
    OpenChat,
    PresetBehavior(NativePetPresetBehaviorEvent),
    StepResponse(SidecarStepResponse),
    StateSnapshot(SidecarStateSnapshotResponse),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum NativePetControlPoll {
    Connected,
    Disconnected,
}

type NativePetSidecarEventHandler = Arc<Mutex<Box<dyn Fn(NativePetSidecarEvent) + Send>>>;

struct NativePetSidecarConnection {
    child: Mutex<Option<Child>>,
    state_snapshots: Mutex<mpsc::Receiver<SidecarStateSnapshotResponse>>,
    step_responses: Mutex<mpsc::Receiver<SidecarStepResponse>>,
    stdin: Mutex<Option<std::process::ChildStdin>>,
}

struct SupervisedNativePetGeneration<T> {
    connection: Arc<T>,
    exited: mpsc::Receiver<()>,
}

struct NativePetSidecarSupervisorConfig<T> {
    initial: SupervisedNativePetGeneration<T>,
    current: Arc<RwLock<Option<Arc<T>>>>,
    shutdown: Arc<AtomicBool>,
    spawn_generation:
        Box<dyn FnMut() -> BuddyResult<SupervisedNativePetGeneration<T>> + Send + 'static>,
    on_restarting: Box<dyn Fn() + Send + 'static>,
    on_ready: Box<dyn Fn() + Send + 'static>,
    terminate: Box<dyn Fn(&T) + Send + 'static>,
    sleep_after_failure: Box<dyn FnMut(Duration) + Send + 'static>,
}

pub struct NativePetSidecarProcess {
    current: Arc<RwLock<Option<Arc<NativePetSidecarConnection>>>>,
    shutdown: Arc<AtomicBool>,
    supervisor: Mutex<Option<thread::JoinHandle<()>>>,
}

impl Drop for NativePetSidecarConnection {
    fn drop(&mut self) {
        self.terminate();
    }
}

impl NativePetSidecarConnection {
    fn terminate(&self) {
        if let Ok(mut stdin) = self.stdin.lock() {
            stdin.take();
        }
        let Ok(mut child) = self.child.lock() else {
            return;
        };
        let Some(mut child) = child.take() else {
            return;
        };

        let _ = child.kill();
        let _ = child.wait();
    }

    fn execute_step(&self, request: &ExecuteStepRequest) -> BuddyResult<SidecarStepResponse> {
        let receiver = self.step_responses.lock().map_err(|_| {
            BuddyError::Runtime("native pet step response lock was poisoned".to_owned())
        })?;
        let line = serde_json::to_string(request)?;
        self.send_control_line(&line)?;

        receive_native_pet_step_response(
            &receiver,
            request.step_id.as_str(),
            request.message_id.as_str(),
            native_pet_execute_step_wait_timeout(request),
        )
    }

    fn interrupt_step(&self, step_id: &str, reason_code: &str) -> BuddyResult<()> {
        let reason_code = SidecarInterruptReasonCode::parse(reason_code)?;
        let request = interrupt_step_request(step_id, reason_code);
        let line = serde_json::to_string(&request)?;
        self.send_control_line(&line)
    }

    fn query_state_snapshot(&self) -> BuddyResult<SidecarStateSnapshotResponse> {
        let receiver = self.state_snapshots.lock().map_err(|_| {
            BuddyError::Runtime("native pet state snapshot lock was poisoned".to_owned())
        })?;
        let request_id = format!("state_{}", uuid::Uuid::now_v7());
        let request = query_state_request(request_id.clone());
        let line = serde_json::to_string(&request)?;
        self.send_control_line(&line)?;

        receive_native_pet_state_snapshot(
            &receiver,
            request_id.as_str(),
            request.message_id.as_str(),
        )
    }

    fn send_control_line(&self, line: &str) -> BuddyResult<()> {
        let mut stdin = self
            .stdin
            .lock()
            .map_err(|_| BuddyError::Runtime("native pet stdin lock was poisoned".to_owned()))?;
        let Some(writer) = stdin.as_mut() else {
            return Err(BuddyError::Runtime(
                "native pet sidecar stdin is unavailable".to_owned(),
            ));
        };

        if let Err(error) = writeln!(writer, "{line}") {
            stdin.take();
            return Err(BuddyError::Runtime(error.to_string()));
        }
        writer
            .flush()
            .map_err(|error| BuddyError::Runtime(error.to_string()))
    }
}

impl Drop for NativePetSidecarProcess {
    fn drop(&mut self) {
        self.shutdown.store(true, Ordering::SeqCst);
        if let Ok(mut current) = self.current.write() {
            if let Some(connection) = current.take() {
                connection.terminate();
            }
        }
        if let Ok(supervisor) = self.supervisor.get_mut() {
            if let Some(supervisor) = supervisor.take() {
                let _ = supervisor.join();
            }
        }
    }
}

impl NativePetSidecarProcess {
    fn current_connection(&self) -> BuddyResult<Arc<NativePetSidecarConnection>> {
        self.current
            .read()
            .map_err(|_| {
                BuddyError::Runtime("native pet sidecar state lock was poisoned".to_owned())
            })?
            .clone()
            .ok_or_else(|| BuddyError::Runtime("native pet sidecar is restarting".to_owned()))
    }

    pub(crate) fn execute_step(
        &self,
        request: &ExecuteStepRequest,
    ) -> BuddyResult<SidecarStepResponse> {
        self.current_connection()?.execute_step(request)
    }

    pub(crate) fn interrupt_step(&self, step_id: &str, reason_code: &str) -> BuddyResult<()> {
        self.current_connection()?
            .interrupt_step(step_id, reason_code)
    }

    pub(crate) fn query_state_snapshot(&self) -> BuddyResult<SidecarStateSnapshotResponse> {
        self.current_connection()?.query_state_snapshot()
    }
}

#[cfg(feature = "pet")]
pub fn is_native_pet_sidecar_mode<I, S>(args: I) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter()
        .any(|arg| arg.as_ref() == NATIVE_PET_MODE_ARG)
}

pub fn create_native_pet_process_spec(pet_executable: &Path) -> NativePetProcessSpec {
    NativePetProcessSpec {
        program: pet_executable.to_path_buf(),
        args: vec![NATIVE_PET_MODE_ARG],
    }
}

fn resolve_native_pet_executable(runtime_executable: &Path) -> BuddyResult<PathBuf> {
    let runtime_directory = runtime_executable.parent().ok_or_else(|| {
        BuddyError::Runtime("desktop runtime executable has no parent directory".to_owned())
    })?;
    let pet_executable =
        runtime_directory.join(format!("lexora-buddy-pet{}", std::env::consts::EXE_SUFFIX));

    if !pet_executable.is_file() {
        return Err(BuddyError::Runtime(format!(
            "native pet executable is missing: {}",
            pet_executable.display()
        )));
    }

    Ok(pet_executable)
}

#[allow(dead_code)]
pub(crate) fn query_native_pet_local_interaction_active() -> BuddyResult<Option<bool>> {
    socket_control::query_native_pet_local_interaction_active()
}

#[cfg(feature = "pet")]
pub fn run_native_pet_sidecar_from_env() -> Option<BuddyResult<()>> {
    let args = std::env::args().collect::<Vec<_>>();
    if !is_native_pet_sidecar_mode(&args) {
        return None;
    }

    Some((|| {
        let config_path = resolve_native_pet_config_path()?;
        let preferences = load_native_pet_config(&config_path)?;
        if !preferences.enabled {
            return Ok(());
        }
        run_native_pet_sidecar(NativePetLaunchConfig {
            config_path,
            position_state_path: resolve_native_pet_position_state_path()?,
            preferences,
        })
    })())
}

#[cfg(feature = "pet")]
pub fn run_native_pet_smoke_command_from_env() -> Option<BuddyResult<String>> {
    run_native_pet_smoke_command(std::env::args())
}

#[cfg(feature = "pet")]
pub fn run_native_pet_drag_replay_command_from_env() -> Option<BuddyResult<String>> {
    run_native_pet_drag_replay_command(std::env::args())
}

#[cfg(feature = "pet")]
fn run_native_pet_smoke_command<I, S>(args: I) -> Option<BuddyResult<String>>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    if !args
        .into_iter()
        .any(|arg| arg.as_ref() == NATIVE_PET_SMOKE_CHECK_ARG)
    {
        return None;
    }

    Some(
        create_native_pet_smoke_check_report()
            .and_then(|report| Ok(serde_json::to_string(&report)?)),
    )
}

#[cfg(feature = "pet")]
fn run_native_pet_drag_replay_command<I, S>(args: I) -> Option<BuddyResult<String>>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    if !args
        .into_iter()
        .any(|arg| arg.as_ref() == NATIVE_PET_DRAG_REPLAY_CHECK_ARG)
    {
        return None;
    }

    Some(
        create_native_pet_drag_replay_check_report()
            .and_then(|report| Ok(serde_json::to_string(&report)?)),
    )
}

pub fn spawn_native_pet_sidecar<F>(on_event: F) -> BuddyResult<NativePetSidecarProcess>
where
    F: Fn(NativePetSidecarEvent) + Send + 'static,
{
    let on_event: NativePetSidecarEventHandler = Arc::new(Mutex::new(Box::new(on_event)));
    let shutdown = Arc::new(AtomicBool::new(false));
    let initial = spawn_native_pet_sidecar_with_startup_retry(
        |_| spawn_native_pet_sidecar_once(Arc::clone(&on_event), Arc::clone(&shutdown)),
        thread::sleep,
    )?;
    let current = Arc::new(RwLock::new(Some(Arc::clone(&initial.connection))));
    let restart_on_event = Arc::clone(&on_event);
    let restart_shutdown = Arc::clone(&shutdown);
    let restarting_on_event = Arc::clone(&on_event);
    let ready_on_event = Arc::clone(&on_event);
    let restart_sleep_shutdown = Arc::clone(&shutdown);
    dispatch_native_pet_sidecar_event(&on_event, NativePetSidecarEvent::Ready);
    let supervisor = spawn_native_pet_sidecar_supervisor(NativePetSidecarSupervisorConfig {
        initial,
        current: Arc::clone(&current),
        shutdown: Arc::clone(&shutdown),
        spawn_generation: Box::new(move || {
            spawn_native_pet_sidecar_with_startup_retry(
                |_| {
                    spawn_native_pet_sidecar_once(
                        Arc::clone(&restart_on_event),
                        Arc::clone(&restart_shutdown),
                    )
                },
                |duration| sleep_until_shutdown(&restart_shutdown, duration),
            )
        }),
        on_restarting: Box::new(move || {
            dispatch_native_pet_sidecar_event(
                &restarting_on_event,
                NativePetSidecarEvent::Restarting,
            );
        }),
        on_ready: Box::new(move || {
            dispatch_native_pet_sidecar_event(&ready_on_event, NativePetSidecarEvent::Ready);
        }),
        terminate: Box::new(NativePetSidecarConnection::terminate),
        sleep_after_failure: Box::new(move |duration| {
            sleep_until_shutdown(&restart_sleep_shutdown, duration);
        }),
    });

    Ok(NativePetSidecarProcess {
        current,
        shutdown,
        supervisor: Mutex::new(Some(supervisor)),
    })
}

fn spawn_native_pet_sidecar_once(
    on_event: NativePetSidecarEventHandler,
    shutdown: Arc<AtomicBool>,
) -> BuddyResult<SupervisedNativePetGeneration<NativePetSidecarConnection>> {
    if shutdown.load(Ordering::SeqCst) {
        return Err(BuddyError::Runtime(
            "native pet sidecar startup was cancelled".to_owned(),
        ));
    }
    let runtime_executable = std::env::current_exe()?;
    let pet_executable = resolve_native_pet_executable(&runtime_executable)?;
    let spec = create_native_pet_process_spec(&pet_executable);
    let mut command = Command::new(&spec.program);
    command
        .args(&spec.args)
        .env(NATIVE_PET_EXIT_ON_STDIN_CLOSE_ENV, "1")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit());

    let mut child = command.spawn()?;
    let stdin = child.stdin.take();
    let (step_response_sender, step_response_receiver) = mpsc::channel();
    let (state_snapshot_sender, state_snapshot_receiver) = mpsc::channel();
    let (ready_sender, ready_receiver) = mpsc::channel();
    let (exit_sender, exit_receiver) = mpsc::channel();
    if let Some(stdout) = child.stdout.take() {
        thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                let Some(event) = parse_native_pet_sidecar_event(&line) else {
                    continue;
                };
                match &event {
                    NativePetSidecarEvent::Ready => {
                        let _ = ready_sender.send(());
                        continue;
                    }
                    NativePetSidecarEvent::StepResponse(response) => {
                        let _ = step_response_sender.send(response.clone());
                    }
                    NativePetSidecarEvent::StateSnapshot(response) => {
                        let _ = state_snapshot_sender.send(response.clone());
                    }
                    NativePetSidecarEvent::Restarting
                    | NativePetSidecarEvent::OpenChat
                    | NativePetSidecarEvent::PresetBehavior(_) => {}
                }
                dispatch_native_pet_sidecar_event(&on_event, event);
            }
            let _ = exit_sender.send(());
        });
    }

    if let Err(error) = receive_native_pet_sidecar_ready_until_shutdown(
        &ready_receiver,
        native_pet_sidecar_ready_timeout(),
        &shutdown,
    ) {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error);
    }

    Ok(SupervisedNativePetGeneration {
        connection: Arc::new(NativePetSidecarConnection {
            child: Mutex::new(Some(child)),
            state_snapshots: Mutex::new(state_snapshot_receiver),
            step_responses: Mutex::new(step_response_receiver),
            stdin: Mutex::new(stdin),
        }),
        exited: exit_receiver,
    })
}

fn spawn_native_pet_sidecar_supervisor<T>(
    config: NativePetSidecarSupervisorConfig<T>,
) -> thread::JoinHandle<()>
where
    T: Send + Sync + 'static,
{
    let NativePetSidecarSupervisorConfig {
        initial,
        current,
        shutdown,
        mut spawn_generation,
        on_restarting,
        on_ready,
        terminate,
        mut sleep_after_failure,
    } = config;
    thread::spawn(move || {
        let mut generation = initial;
        loop {
            let _ = generation.exited.recv();
            if shutdown.load(Ordering::SeqCst) {
                return;
            }

            on_restarting();
            let previous_connection = match current.write() {
                Ok(mut current) => current.take(),
                Err(_) => Some(Arc::clone(&generation.connection)),
            };
            if let Some(connection) = previous_connection {
                terminate(&connection);
            }

            loop {
                if shutdown.load(Ordering::SeqCst) {
                    return;
                }
                match spawn_generation() {
                    Ok(next_generation) => {
                        let Ok(mut current) = current.write() else {
                            terminate(&next_generation.connection);
                            return;
                        };
                        if shutdown.load(Ordering::SeqCst) {
                            drop(current);
                            terminate(&next_generation.connection);
                            return;
                        }
                        *current = Some(Arc::clone(&next_generation.connection));
                        drop(current);
                        on_ready();
                        generation = next_generation;
                        break;
                    }
                    Err(error) => {
                        eprintln!("native pet sidecar restart failed: {error}");
                        sleep_after_failure(Duration::from_millis(
                            NATIVE_PET_SIDECAR_RESTART_BACKOFF_MS,
                        ));
                    }
                }
            }
        }
    })
}

fn dispatch_native_pet_sidecar_event(
    on_event: &NativePetSidecarEventHandler,
    event: NativePetSidecarEvent,
) {
    if let Ok(callback) = on_event.lock() {
        callback(event);
    }
}

fn sleep_until_shutdown(shutdown: &AtomicBool, duration: Duration) {
    let deadline = Instant::now() + duration;
    while !shutdown.load(Ordering::SeqCst) {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return;
        }
        thread::sleep(remaining.min(Duration::from_millis(50)));
    }
}

fn spawn_native_pet_sidecar_with_startup_retry<T>(
    mut spawn_attempt: impl FnMut(usize) -> BuddyResult<T>,
    mut sleep_after_failure: impl FnMut(Duration),
) -> BuddyResult<T> {
    for attempt in 1..=NATIVE_PET_SIDECAR_STARTUP_MAX_ATTEMPTS {
        match spawn_attempt(attempt) {
            Ok(process) => return Ok(process),
            Err(error) if attempt == NATIVE_PET_SIDECAR_STARTUP_MAX_ATTEMPTS => {
                return Err(error);
            }
            Err(_) => {
                sleep_after_failure(native_pet_sidecar_startup_backoff(attempt));
            }
        }
    }

    Err(BuddyError::Runtime(
        "native pet sidecar startup attempts were exhausted".to_owned(),
    ))
}

fn native_pet_sidecar_startup_backoff(attempt: usize) -> Duration {
    let index = attempt.saturating_sub(1);
    Duration::from_millis(
        NATIVE_PET_SIDECAR_STARTUP_BACKOFF_MS
            .get(index)
            .copied()
            .unwrap_or_else(|| *NATIVE_PET_SIDECAR_STARTUP_BACKOFF_MS.last().unwrap_or(&360)),
    )
}

pub(super) fn emit_native_pet_sidecar_event(event: NativePetSidecarEvent) -> BuddyResult<()> {
    let line = match event {
        NativePetSidecarEvent::Ready => NATIVE_PET_SIDECAR_READY_EVENT.to_owned(),
        NativePetSidecarEvent::Restarting => NATIVE_PET_SIDECAR_RESTARTING_EVENT.to_owned(),
        NativePetSidecarEvent::OpenChat => "event:open_chat".to_owned(),
        NativePetSidecarEvent::PresetBehavior(event) => {
            format!(
                "{NATIVE_PET_PRESET_BEHAVIOR_EVENT_PREFIX}{}",
                serde_json::to_string(&event)?
            )
        }
        NativePetSidecarEvent::StepResponse(response) => format_sidecar_step_response(&response)?,
        NativePetSidecarEvent::StateSnapshot(response) => serde_json::to_string(&response)?,
    };

    println!("{line}");
    std::io::stdout()
        .flush()
        .map_err(|error| BuddyError::Runtime(error.to_string()))
}

pub(super) fn parse_native_pet_sidecar_event(line: &str) -> Option<NativePetSidecarEvent> {
    let line = line.trim();
    if line == NATIVE_PET_SIDECAR_READY_EVENT {
        return Some(NativePetSidecarEvent::Ready);
    }
    if line == NATIVE_PET_SIDECAR_RESTARTING_EVENT {
        return Some(NativePetSidecarEvent::Restarting);
    }
    if line == "event:open_chat" {
        return Some(NativePetSidecarEvent::OpenChat);
    }
    if let Some(payload) = line.strip_prefix(NATIVE_PET_PRESET_BEHAVIOR_EVENT_PREFIX) {
        let event = serde_json::from_str::<NativePetPresetBehaviorEvent>(payload).ok()?;
        return native_pet_preset_behavior_event_is_valid(&event)
            .then_some(NativePetSidecarEvent::PresetBehavior(event));
    }

    parse_sidecar_step_response(line)
        .ok()
        .map(NativePetSidecarEvent::StepResponse)
        .or_else(|| {
            parse_sidecar_state_snapshot_response(line)
                .ok()
                .map(NativePetSidecarEvent::StateSnapshot)
        })
}

fn native_pet_sidecar_ready_timeout() -> Duration {
    Duration::from_millis(NATIVE_PET_SIDECAR_READY_TIMEOUT_MS)
}

#[cfg(test)]
fn receive_native_pet_sidecar_ready(
    receiver: &mpsc::Receiver<()>,
    timeout: Duration,
) -> BuddyResult<()> {
    receiver
        .recv_timeout(timeout)
        .map(|_| ())
        .map_err(|_| BuddyError::Runtime("native pet sidecar ready timed out".to_owned()))
}

fn receive_native_pet_sidecar_ready_until_shutdown(
    receiver: &mpsc::Receiver<()>,
    timeout: Duration,
    shutdown: &AtomicBool,
) -> BuddyResult<()> {
    let started_at = Instant::now();
    loop {
        if shutdown.load(Ordering::SeqCst) {
            return Err(BuddyError::Runtime(
                "native pet sidecar startup was cancelled".to_owned(),
            ));
        }
        let remaining = timeout.saturating_sub(started_at.elapsed());
        if remaining.is_zero() {
            return Err(BuddyError::Runtime(
                "native pet sidecar ready timed out".to_owned(),
            ));
        }
        match receiver.recv_timeout(remaining.min(Duration::from_millis(50))) {
            Ok(()) => return Ok(()),
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                return Err(BuddyError::Runtime(
                    "native pet sidecar exited before ready".to_owned(),
                ));
            }
        }
    }
}

#[cfg(test)]
fn native_pet_step_response_matches_step_id(response: &SidecarStepResponse, step_id: &str) -> bool {
    native_pet_step_response_matches_request(response, step_id, "")
}

fn native_pet_step_response_matches_request(
    response: &SidecarStepResponse,
    step_id: &str,
    correlation_id: &str,
) -> bool {
    match response {
        SidecarStepResponse::StepCompleted(response) => step_response_ids_match_request(
            response.step_id.as_str(),
            Some(response.correlation_id.as_str()),
            step_id,
            correlation_id,
        ),
        SidecarStepResponse::StepFailed(response) => step_response_ids_match_request(
            response.step_id.as_str(),
            Some(response.correlation_id.as_str()),
            step_id,
            correlation_id,
        ),
        SidecarStepResponse::StepInterrupted(response) => step_response_ids_match_request(
            response.step_id.as_str(),
            Some(response.correlation_id.as_str()),
            step_id,
            correlation_id,
        ),
        SidecarStepResponse::ProtocolError(response) => protocol_error_ids_match_request(
            response.step_id.as_deref(),
            response.correlation_id.as_deref(),
            step_id,
            correlation_id,
        ),
    }
}

fn step_response_ids_match_request(
    response_step_id: &str,
    response_correlation_id: Option<&str>,
    step_id: &str,
    correlation_id: &str,
) -> bool {
    response_step_id == step_id
        && (correlation_id.is_empty() || response_correlation_id == Some(correlation_id))
}

fn protocol_error_ids_match_request(
    response_step_id: Option<&str>,
    response_correlation_id: Option<&str>,
    step_id: &str,
    correlation_id: &str,
) -> bool {
    let step_id_matches = response_step_id.is_some_and(|id| id == step_id);
    let correlation_id_matches =
        !correlation_id.is_empty() && response_correlation_id == Some(correlation_id);

    if !step_id_matches && !correlation_id_matches {
        return false;
    }

    let response_step_id_consistent = response_step_id.is_none_or(|id| id == step_id);
    let response_correlation_id_consistent =
        correlation_id.is_empty() || response_correlation_id.is_none_or(|id| id == correlation_id);

    response_step_id_consistent && response_correlation_id_consistent
}

fn receive_native_pet_step_response(
    receiver: &mpsc::Receiver<SidecarStepResponse>,
    step_id: &str,
    correlation_id: &str,
    timeout: Duration,
) -> BuddyResult<SidecarStepResponse> {
    let started_at = Instant::now();
    loop {
        let remaining = timeout.saturating_sub(started_at.elapsed());
        if remaining.is_zero() {
            return Err(BuddyError::Runtime(format!(
                "native pet step response timed out: {step_id}"
            )));
        }

        let response = receiver
            .recv_timeout(remaining)
            .map_err(|error| BuddyError::Runtime(error.to_string()))?;
        if native_pet_step_response_matches_request(&response, step_id, correlation_id) {
            return Ok(response);
        }
    }
}

fn receive_native_pet_state_snapshot(
    receiver: &mpsc::Receiver<SidecarStateSnapshotResponse>,
    request_id: &str,
    correlation_id: &str,
) -> BuddyResult<SidecarStateSnapshotResponse> {
    let started_at = Instant::now();
    let timeout = Duration::from_millis(1_000);
    loop {
        let remaining = timeout.saturating_sub(started_at.elapsed());
        if remaining.is_zero() {
            return Err(BuddyError::Runtime(format!(
                "native pet state snapshot timed out: {request_id}"
            )));
        }

        let response = receiver
            .recv_timeout(remaining)
            .map_err(|error| BuddyError::Runtime(error.to_string()))?;
        if response.request_id == request_id || response.correlation_id == correlation_id {
            return Ok(response);
        }
    }
}

fn native_pet_execute_step_wait_timeout(request: &ExecuteStepRequest) -> Duration {
    let timeout_ms = match &request.step {
        ExecuteStepPayload::PlayAction { timeout_ms, .. }
        | ExecuteStepPayload::MoveTo { timeout_ms, .. }
        | ExecuteStepPayload::MoveByPath { timeout_ms, .. } => *timeout_ms,
    };

    Duration::from_millis(timeout_ms.saturating_add(1_000))
}

fn native_pet_preset_behavior_event_is_valid(event: &NativePetPresetBehaviorEvent) -> bool {
    !event.preset_behavior_id.trim().is_empty()
        && !event.outcome.trim().is_empty()
        && !event.animation.trim().is_empty()
}

pub(super) fn create_native_pet_control_channel(
) -> BuddyResult<mpsc::Receiver<NativePetControlRequest>> {
    let (sender, receiver) = mpsc::channel();
    spawn_native_pet_socket_control_reader(sender.clone())?;
    spawn_native_pet_stdin_control_reader(
        sender.clone(),
        std::env::var(NATIVE_PET_EXIT_ON_STDIN_CLOSE_ENV).is_ok_and(|value| value == "1"),
    );

    Ok(receiver)
}

fn spawn_native_pet_stdin_control_reader(
    sender: mpsc::Sender<NativePetControlRequest>,
    exit_on_stdin_close: bool,
) {
    thread::spawn(move || {
        let stdin = std::io::stdin();
        for line in stdin.lock().lines().map_while(Result::ok) {
            let kind = match parse_native_pet_stdin_control_request_kind(&line) {
                Ok(Some(kind)) => kind,
                Ok(None) => continue,
                Err(response) => {
                    let _ = emit_native_pet_sidecar_event(NativePetSidecarEvent::StepResponse(
                        *response,
                    ));
                    continue;
                }
            };
            let request = match kind {
                NativePetControlRequestKind::Command(message) => {
                    NativePetControlRequest::command(message)
                }
                NativePetControlRequestKind::QueryStateSnapshot(query) => {
                    let (request, receiver) = NativePetControlRequest::socket(
                        NativePetControlRequestKind::QueryStateSnapshot(query.clone()),
                    );
                    if sender.send(request).is_err() {
                        break;
                    }
                    if let Ok(response) = receiver.recv_timeout(Duration::from_millis(1_000)) {
                        if let Some(snapshot) = native_pet_state_snapshot_from_control_response(
                            query.message_id.as_str(),
                            query.request_id.as_str(),
                            &response,
                        ) {
                            let _ = emit_native_pet_sidecar_event(
                                NativePetSidecarEvent::StateSnapshot(snapshot),
                            );
                        }
                    }
                    continue;
                }
                NativePetControlRequestKind::ExecuteStep(_)
                | NativePetControlRequestKind::InterruptStep(_)
                | NativePetControlRequestKind::ReloadConfig => NativePetControlRequest::step(kind),
                NativePetControlRequestKind::QueryState
                | NativePetControlRequestKind::QueryCapabilities
                | NativePetControlRequestKind::ParentDisconnected => continue,
            };
            if sender.send(request).is_err() {
                break;
            }
        }
        on_native_pet_stdin_closed(&sender, exit_on_stdin_close);
    });
}

fn on_native_pet_stdin_closed(
    sender: &mpsc::Sender<NativePetControlRequest>,
    exit_on_stdin_close: bool,
) {
    if exit_on_stdin_close {
        let _ = sender.send(NativePetControlRequest::parent_disconnected());
    }
}

fn native_pet_state_snapshot_from_control_response(
    correlation_id: &str,
    request_id: &str,
    response: &serde_json::Value,
) -> Option<SidecarStateSnapshotResponse> {
    let position = response.get("position")?;
    let x = position
        .get("x")?
        .as_i64()
        .and_then(|x| i32::try_from(x).ok())?;
    let y = position
        .get("y")?
        .as_i64()
        .and_then(|y| i32::try_from(y).ok())?;

    Some(step_protocol::state_snapshot_response_for_correlation(
        correlation_id,
        request_id,
        x,
        y,
    ))
}

pub(super) fn drain_native_pet_control_requests<F>(
    receiver: &mpsc::Receiver<NativePetControlRequest>,
    mut on_request: F,
) -> NativePetControlPoll
where
    F: FnMut(NativePetControlRequest),
{
    loop {
        match receiver.try_recv() {
            Ok(request) => {
                if matches!(
                    request.kind(),
                    NativePetControlRequestKind::ParentDisconnected
                ) {
                    return NativePetControlPoll::Disconnected;
                }
                on_request(request);
            }
            Err(mpsc::TryRecvError::Empty) => return NativePetControlPoll::Connected,
            Err(mpsc::TryRecvError::Disconnected) => return NativePetControlPoll::Disconnected,
        }
    }
}

pub(super) fn native_pet_control_ok_response() -> serde_json::Value {
    serde_json::json!({ "ok": true })
}

#[cfg(feature = "pet")]
pub(super) fn native_pet_control_capabilities_response(
    animations: &NativePetAnimationSet,
) -> serde_json::Value {
    serde_json::json!({
        "ok": true,
        "protocolVersion": 1,
        "commands": ["state", "capabilities", "animation", "move"],
        "targets": ["center", "home", "edge", "edgeAnchor", "position", "x", "windowAnchor"],
        "stepProtocol": {
            "version": SIDECAR_PROTOCOL_VERSION,
            "executeStep": true,
            "interruptStep": true,
            "targetSupport": {
                "center": true,
                "home": true,
                "edge": true,
                "edgeAnchor": true,
                "position": true,
                "x": true,
                "windowAnchor": true
            }
        },
        "edges": ["left", "right", "top", "bottom"],
        "animations": animations
            .animation_names()
            .collect::<Vec<_>>(),
        "sequence": {
            "script": "lexora-buddy-pet.mjs",
            "waitsOn": "state.motion.active"
        }
    })
}

#[cfg(all(test, feature = "pet"))]
mod tests {
    use super::{
        drain_native_pet_control_requests, native_pet_control_capabilities_response,
        native_pet_step_response_matches_step_id, on_native_pet_stdin_closed,
        parse_native_pet_sidecar_event, receive_native_pet_sidecar_ready,
        receive_native_pet_step_response, spawn_native_pet_sidecar_with_startup_retry,
        NativePetControlMessage, NativePetControlPoll, NativePetControlRequest,
        NativePetControlRequestKind, NativePetSidecarEvent,
    };
    use crate::error::BuddyError;
    use crate::native_pet::{
        animation::NativePetAnimationKey,
        assets::load_default_pet_animation_set,
        step_protocol::{
            state_snapshot_response, step_completed_response,
            step_completed_response_for_correlation, SidecarStepResponse,
        },
    };
    use std::{
        cell::RefCell,
        sync::{
            atomic::{AtomicBool, Ordering},
            mpsc, Arc, Mutex, RwLock,
        },
        time::Duration,
    };

    #[test]
    fn parses_native_pet_open_chat_event_from_sidecar_stdout() {
        assert_eq!(
            parse_native_pet_sidecar_event("event:open_chat"),
            Some(NativePetSidecarEvent::OpenChat)
        );
        assert_eq!(
            parse_native_pet_sidecar_event(
                r#"event:preset_behavior:{"presetBehaviorId":"throw_after_drag","interactionId":"interaction_1","outcome":"fall","animation":"trip_fall_left"}"#
            ),
            Some(NativePetSidecarEvent::PresetBehavior(
                super::NativePetPresetBehaviorEvent {
                    preset_behavior_id: "throw_after_drag".to_owned(),
                    interaction_id: Some("interaction_1".to_owned()),
                    outcome: "fall".to_owned(),
                    animation: "trip_fall_left".to_owned(),
                }
            ))
        );
        assert_eq!(parse_native_pet_sidecar_event("animation:working"), None);
        assert_eq!(parse_native_pet_sidecar_event("event:unknown"), None);
    }

    #[test]
    fn parses_native_pet_ready_event_from_sidecar_stdout() {
        assert_eq!(
            parse_native_pet_sidecar_event("event:ready"),
            Some(NativePetSidecarEvent::Ready)
        );
    }

    #[test]
    fn parses_native_pet_step_response_event_from_sidecar_stdout() {
        assert_eq!(
            parse_native_pet_sidecar_event(
                r#"{"protocolVersion":1,"correlationId":"message_019f4900-0000-7000-8000-000000000101","type":"stepCompleted","stepId":"step_019f4900-0000-7000-8000-000000000101","elapsedMs":1720}"#
            ),
            Some(NativePetSidecarEvent::StepResponse(
                SidecarStepResponse::StepCompleted(step_completed_response(
                    "step_019f4900-0000-7000-8000-000000000101",
                    1_720,
                ))
            ))
        );
    }

    #[test]
    fn parses_native_pet_state_snapshot_event_from_sidecar_stdout() {
        assert_eq!(
            parse_native_pet_sidecar_event(
                r#"{"protocolVersion":1,"correlationId":"message_019f5500-0000-7000-8000-000000000101","type":"stateSnapshot","requestId":"state_019f5500-0000-7000-8000-000000000101","position":{"x":120,"y":640}}"#
            ),
            Some(NativePetSidecarEvent::StateSnapshot(
                state_snapshot_response("state_019f5500-0000-7000-8000-000000000101", 120, 640,)
            ))
        );
    }

    #[test]
    fn native_pet_capabilities_report_step_target_support() {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");
        let response = native_pet_control_capabilities_response(&animations);

        assert_eq!(
            response.get("targets"),
            Some(&serde_json::json!([
                "center",
                "home",
                "edge",
                "edgeAnchor",
                "position",
                "x",
                "windowAnchor"
            ]))
        );
        assert_eq!(
            response.get("stepProtocol"),
            Some(&serde_json::json!({
                "version": 1,
                "executeStep": true,
                "interruptStep": true,
                "targetSupport": {
                    "center": true,
                    "home": true,
                    "edge": true,
                    "edgeAnchor": true,
                    "position": true,
                    "x": true,
                    "windowAnchor": true
                }
            }))
        );
    }

    #[test]
    fn native_pet_capabilities_report_uses_manifest_animation_order() {
        let animations =
            load_default_pet_animation_set().expect("native pet animation manifest loads");
        let response = native_pet_control_capabilities_response(&animations);

        assert_eq!(
            response.get("animations"),
            Some(&serde_json::json!([
                "idle",
                "run_left",
                "run_right",
                "drag",
                "grab_start",
                "celebrate",
                "sleep_enter",
                "sleep",
                "wake",
                "thinking",
                "approval",
                "sad",
                "reassure",
                "working",
                "cast",
                "explain",
                "tap",
                "hover",
                "curious",
                "trip_fall_left",
                "fallen_idle_left",
                "fallen_get_up_left",
                "trip_fall_right",
                "fallen_idle_right",
                "fallen_get_up_right",
                "stumble_recover_left",
                "stumble_recover_right"
            ]))
        );
    }

    #[test]
    fn waits_for_native_pet_sidecar_ready_signal() {
        let (sender, receiver) = mpsc::channel();
        sender.send(()).expect("send ready signal");

        receive_native_pet_sidecar_ready(&receiver, Duration::from_millis(20))
            .expect("receive ready signal");
    }

    #[test]
    fn times_out_waiting_for_native_pet_sidecar_ready_signal() {
        let (_sender, receiver) = mpsc::channel();

        let error = receive_native_pet_sidecar_ready(&receiver, Duration::from_millis(1))
            .expect_err("ready signal should time out");

        assert!(
            matches!(error, BuddyError::Runtime(message) if message == "native pet sidecar ready timed out")
        );
    }

    #[test]
    fn retries_native_pet_sidecar_startup_after_ready_timeout() {
        let attempts = RefCell::new(Vec::<usize>::new());
        let backoffs = RefCell::new(Vec::<Duration>::new());

        let process = spawn_native_pet_sidecar_with_startup_retry(
            |attempt| {
                attempts.borrow_mut().push(attempt);
                if attempt == 1 {
                    return Err(BuddyError::Runtime(
                        "native pet sidecar ready timed out".to_owned(),
                    ));
                }

                Ok("ready")
            },
            |duration| backoffs.borrow_mut().push(duration),
        )
        .expect("second startup attempt should succeed");

        assert_eq!(process, "ready");
        assert_eq!(attempts.into_inner(), vec![1, 2]);
        assert_eq!(backoffs.into_inner(), vec![Duration::from_millis(120)]);
    }

    #[test]
    fn native_pet_sidecar_startup_retry_returns_last_error_after_attempts_are_exhausted() {
        let attempts = RefCell::new(Vec::<usize>::new());
        let backoffs = RefCell::new(Vec::<Duration>::new());

        let error = spawn_native_pet_sidecar_with_startup_retry::<&'static str>(
            |attempt| {
                attempts.borrow_mut().push(attempt);
                Err(BuddyError::Runtime(format!(
                    "startup attempt {attempt} failed"
                )))
            },
            |duration| backoffs.borrow_mut().push(duration),
        )
        .expect_err("exhausted startup attempts should fail");

        assert!(
            matches!(error, BuddyError::Runtime(message) if message == "startup attempt 3 failed")
        );
        assert_eq!(attempts.into_inner(), vec![1, 2, 3]);
        assert_eq!(
            backoffs.into_inner(),
            vec![Duration::from_millis(120), Duration::from_millis(360)]
        );
    }

    #[test]
    fn supervisor_replaces_a_sidecar_generation_after_post_ready_exit() {
        let (initial_exit_sender, initial_exit_receiver) = mpsc::channel();
        let (replacement_exit_sender, replacement_exit_receiver) = mpsc::channel();
        let current = Arc::new(RwLock::new(Some(Arc::new("initial".to_owned()))));
        let shutdown = Arc::new(AtomicBool::new(false));
        let replacement_receiver = Mutex::new(Some(replacement_exit_receiver));
        let (restarted_sender, restarted_receiver) = mpsc::channel();

        let supervisor =
            super::spawn_native_pet_sidecar_supervisor(super::NativePetSidecarSupervisorConfig {
                initial: super::SupervisedNativePetGeneration {
                    connection: Arc::new("initial".to_owned()),
                    exited: initial_exit_receiver,
                },
                current: Arc::clone(&current),
                shutdown: Arc::clone(&shutdown),
                spawn_generation: Box::new(move || {
                    Ok(super::SupervisedNativePetGeneration {
                        connection: Arc::new("replacement".to_owned()),
                        exited: replacement_receiver
                            .lock()
                            .expect("lock replacement receiver")
                            .take()
                            .expect("replacement generation should spawn once"),
                    })
                }),
                on_restarting: Box::new(|| {}),
                on_ready: Box::new(move || {
                    restarted_sender.send(()).expect("signal restarted");
                }),
                terminate: Box::new(|_| {}),
                sleep_after_failure: Box::new(|_| {}),
            });

        initial_exit_sender.send(()).expect("signal initial exit");
        restarted_receiver
            .recv_timeout(Duration::from_secs(1))
            .expect("replacement should become ready");
        assert_eq!(
            current
                .read()
                .expect("read current generation")
                .as_deref()
                .map(String::as_str),
            Some("replacement")
        );

        shutdown.store(true, Ordering::SeqCst);
        replacement_exit_sender
            .send(())
            .expect("signal replacement exit");
        supervisor.join().expect("join sidecar supervisor");
    }

    #[test]
    fn supervisor_does_not_install_a_generation_after_shutdown() {
        let (initial_exit_sender, initial_exit_receiver) = mpsc::channel();
        let (_replacement_exit_sender, replacement_exit_receiver) = mpsc::channel();
        let current = Arc::new(RwLock::new(Some(Arc::new("initial".to_owned()))));
        let shutdown = Arc::new(AtomicBool::new(false));
        let spawn_shutdown = Arc::clone(&shutdown);
        let replacement_receiver = Mutex::new(Some(replacement_exit_receiver));
        let terminated = Arc::new(Mutex::new(Vec::<String>::new()));
        let terminated_connections = Arc::clone(&terminated);
        let (ready_sender, ready_receiver) = mpsc::channel();

        let supervisor =
            super::spawn_native_pet_sidecar_supervisor(super::NativePetSidecarSupervisorConfig {
                initial: super::SupervisedNativePetGeneration {
                    connection: Arc::new("initial".to_owned()),
                    exited: initial_exit_receiver,
                },
                current: Arc::clone(&current),
                shutdown: Arc::clone(&shutdown),
                spawn_generation: Box::new(move || {
                    spawn_shutdown.store(true, Ordering::SeqCst);
                    Ok(super::SupervisedNativePetGeneration {
                        connection: Arc::new("replacement".to_owned()),
                        exited: replacement_receiver
                            .lock()
                            .expect("lock replacement receiver")
                            .take()
                            .expect("replacement generation should spawn once"),
                    })
                }),
                on_restarting: Box::new(|| {}),
                on_ready: Box::new(move || {
                    ready_sender.send(()).expect("signal ready");
                }),
                terminate: Box::new(move |connection| {
                    terminated_connections
                        .lock()
                        .expect("lock terminated connections")
                        .push(connection.clone());
                }),
                sleep_after_failure: Box::new(|_| {}),
            });

        initial_exit_sender.send(()).expect("signal initial exit");
        supervisor.join().expect("join sidecar supervisor");

        assert!(current.read().expect("read current generation").is_none());
        assert!(ready_receiver.try_recv().is_err());
        assert_eq!(
            terminated
                .lock()
                .expect("read terminated connections")
                .as_slice(),
            ["initial", "replacement"]
        );
    }

    #[test]
    fn step_response_matches_request_step_id() {
        assert!(native_pet_step_response_matches_step_id(
            &SidecarStepResponse::StepCompleted(step_completed_response(
                "step_019f4900-0000-7000-8000-000000000102",
                1_720,
            )),
            "step_019f4900-0000-7000-8000-000000000102",
        ));
        assert!(!native_pet_step_response_matches_step_id(
            &SidecarStepResponse::StepCompleted(step_completed_response(
                "step_019f4900-0000-7000-8000-000000000103",
                1_720,
            )),
            "step_019f4900-0000-7000-8000-000000000102",
        ));
    }

    #[test]
    fn waits_for_matching_step_response_while_skipping_other_steps() {
        let (sender, receiver) = mpsc::channel();
        sender
            .send(SidecarStepResponse::StepCompleted(step_completed_response(
                "step_019f4900-0000-7000-8000-000000000104",
                1_720,
            )))
            .expect("send unrelated response");
        sender
            .send(SidecarStepResponse::StepCompleted(step_completed_response(
                "step_019f4900-0000-7000-8000-000000000105",
                2_400,
            )))
            .expect("send matching response");

        let response = receive_native_pet_step_response(
            &receiver,
            "step_019f4900-0000-7000-8000-000000000105",
            "message_019f4900-0000-7000-8000-000000000105",
            Duration::from_millis(20),
        )
        .expect("receive matching response");

        assert_eq!(
            response,
            SidecarStepResponse::StepCompleted(step_completed_response(
                "step_019f4900-0000-7000-8000-000000000105",
                2_400,
            ))
        );
    }

    #[test]
    fn waits_for_step_response_with_matching_step_id_and_correlation_id() {
        let (sender, receiver) = mpsc::channel();
        sender
            .send(SidecarStepResponse::StepCompleted(
                step_completed_response_for_correlation(
                    "message_019f4900-0000-7000-8000-000000000106",
                    "step_019f4900-0000-7000-8000-000000000999",
                    1_720,
                ),
            ))
            .expect("send mismatched response");
        sender
            .send(SidecarStepResponse::StepCompleted(
                step_completed_response_for_correlation(
                    "message_019f4900-0000-7000-8000-000000000106",
                    "step_019f4900-0000-7000-8000-000000000106",
                    2_400,
                ),
            ))
            .expect("send matching response");

        let response = receive_native_pet_step_response(
            &receiver,
            "step_019f4900-0000-7000-8000-000000000106",
            "message_019f4900-0000-7000-8000-000000000106",
            Duration::from_millis(20),
        )
        .expect("receive matching response");

        assert_eq!(
            response,
            SidecarStepResponse::StepCompleted(step_completed_response_for_correlation(
                "message_019f4900-0000-7000-8000-000000000106",
                "step_019f4900-0000-7000-8000-000000000106",
                2_400,
            ))
        );
    }

    #[test]
    fn detects_native_pet_control_channel_disconnect_after_draining_messages() {
        let (sender, receiver) = std::sync::mpsc::channel();
        sender
            .send(NativePetControlRequest::command(
                NativePetControlMessage::SetAnimation(
                    NativePetAnimationKey::parse("working").expect("valid manifest key"),
                ),
            ))
            .expect("send control message");
        drop(sender);

        let mut messages = Vec::new();
        let poll = drain_native_pet_control_requests(&receiver, |request| {
            if let NativePetControlRequestKind::Command(message) = request.kind() {
                messages.push(message);
            }
        });

        assert_eq!(
            messages,
            vec![NativePetControlMessage::SetAnimation(
                NativePetAnimationKey::parse("working").expect("valid manifest key")
            )]
        );
        assert_eq!(poll, NativePetControlPoll::Disconnected);
    }

    #[test]
    fn runtime_managed_native_pet_stops_after_parent_stdin_closes() {
        let (sender, receiver) = std::sync::mpsc::channel();

        on_native_pet_stdin_closed(&sender, true);

        assert_eq!(
            drain_native_pet_control_requests(&receiver, |_| {}),
            NativePetControlPoll::Disconnected
        );
    }

    #[test]
    fn standalone_native_pet_stays_connected_after_stdin_closes() {
        let (sender, receiver) = std::sync::mpsc::channel();

        on_native_pet_stdin_closed(&sender, false);

        assert_eq!(
            drain_native_pet_control_requests(&receiver, |_| {}),
            NativePetControlPoll::Connected
        );
    }
}
