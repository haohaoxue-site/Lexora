use std::{
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{mpsc, Mutex},
    thread,
};

use crate::error::{BuddyError, BuddyResult};

mod control_protocol;
mod host_action;
mod socket_control;

use super::{
    animation::{NativePetAnimationName, NATIVE_PET_ANIMATION_NAMES},
    assets::create_native_pet_smoke_check_report,
    drag_replay::create_native_pet_drag_replay_check_report,
    window::run_native_pet_sidecar,
};
use control_protocol::format_native_pet_control_message;
pub(super) use control_protocol::{
    parse_native_pet_control_message, parse_native_pet_control_request_kind,
    NativePetControlMessage, NativePetControlRequestKind, NativePetWalkEdge, NativePetWalkTarget,
};
use host_action::execute_native_pet_host_action;
#[cfg(unix)]
use socket_control::native_pet_control_socket_path;
use socket_control::spawn_native_pet_socket_control_reader;

pub const NATIVE_PET_MODE_ARG: &str = "--native-pet";
pub const NATIVE_PET_LAYER_ARG: &str = "--native-pet-layer";

const NATIVE_PET_SMOKE_CHECK_ARG: &str = "--buddy-native-pet-smoke-check";
const NATIVE_PET_DRAG_REPLAY_CHECK_ARG: &str = "--buddy-native-pet-drag-replay-check";
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
    fn as_arg(self) -> &'static str {
        match self {
            Self::AlwaysOnTop => "always-on-top",
            Self::Normal => "normal",
        }
    }

    fn from_arg(value: &str) -> Option<Self> {
        match value {
            "always-on-top" => Some(Self::AlwaysOnTop),
            "normal" => Some(Self::Normal),
            _ => None,
        }
    }

    pub(super) fn keep_above(self) -> bool {
        matches!(self, Self::AlwaysOnTop)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NativePetLaunchConfig {
    pub layer: NativePetLayer,
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
        self.kind
    }

    pub(super) fn respond(self, response: serde_json::Value) {
        if let Some(sender) = self.response_sender {
            let _ = sender.send(response);
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NativePetSidecarEvent {
    OpenChat,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum NativePetControlPoll {
    Connected,
    Disconnected,
}

pub struct NativePetSidecarProcess {
    child: Mutex<Option<Child>>,
    stdin: Mutex<Option<std::process::ChildStdin>>,
}

impl Drop for NativePetSidecarProcess {
    fn drop(&mut self) {
        let Ok(mut child) = self.child.lock() else {
            return;
        };
        let Some(child) = child.as_mut() else {
            return;
        };

        let _ = child.kill();
        let _ = child.wait();
    }
}

impl NativePetSidecarProcess {
    pub fn set_animation(&self, animation: &str) -> BuddyResult<()> {
        let animation = NativePetAnimationName::from_manifest_key(animation).ok_or_else(|| {
            BuddyError::Runtime(format!("unknown native pet animation: {animation}"))
        })?;
        self.send_control_message(NativePetControlMessage::SetAnimation(animation))
    }

    pub fn control_host_action(&self, action: serde_json::Value) -> BuddyResult<()> {
        execute_native_pet_host_action(self, &action)
    }

    fn send_control_message(&self, message: NativePetControlMessage) -> BuddyResult<()> {
        let mut stdin = self
            .stdin
            .lock()
            .map_err(|_| BuddyError::Runtime("native pet stdin lock was poisoned".to_owned()))?;
        let Some(writer) = stdin.as_mut() else {
            return Err(BuddyError::Runtime(
                "native pet sidecar stdin is unavailable".to_owned(),
            ));
        };

        if let Err(error) = writeln!(writer, "{}", format_native_pet_control_message(message)) {
            stdin.take();
            return Err(BuddyError::Runtime(error.to_string()));
        }
        writer
            .flush()
            .map_err(|error| BuddyError::Runtime(error.to_string()))
    }
}

pub fn is_native_pet_sidecar_mode<I, S>(args: I) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter()
        .any(|arg| arg.as_ref() == NATIVE_PET_MODE_ARG)
}

pub fn create_native_pet_process_spec(current_exe: &Path) -> NativePetProcessSpec {
    NativePetProcessSpec {
        program: current_exe.to_path_buf(),
        args: vec![
            NATIVE_PET_MODE_ARG,
            NATIVE_PET_LAYER_ARG,
            NativePetLayer::AlwaysOnTop.as_arg(),
        ],
    }
}

pub fn parse_native_pet_launch_config<I, S>(args: I) -> NativePetLaunchConfig
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut layer = NativePetLayer::AlwaysOnTop;
    let mut args = args.into_iter();
    while let Some(arg) = args.next() {
        if arg.as_ref() != NATIVE_PET_LAYER_ARG {
            continue;
        }

        if let Some(value) = args
            .next()
            .and_then(|value| NativePetLayer::from_arg(value.as_ref()))
        {
            layer = value;
        }
    }

    NativePetLaunchConfig { layer }
}

pub fn run_native_pet_sidecar_from_env() -> Option<BuddyResult<()>> {
    let args = std::env::args().collect::<Vec<_>>();
    if !is_native_pet_sidecar_mode(&args) {
        return None;
    }

    Some(run_native_pet_sidecar(parse_native_pet_launch_config(args)))
}

pub fn run_native_pet_smoke_command_from_env() -> Option<BuddyResult<String>> {
    run_native_pet_smoke_command(std::env::args())
}

pub fn run_native_pet_drag_replay_command_from_env() -> Option<BuddyResult<String>> {
    run_native_pet_drag_replay_command(std::env::args())
}

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
    let current_exe = std::env::current_exe()?;
    let spec = create_native_pet_process_spec(&current_exe);
    let mut command = Command::new(&spec.program);
    command
        .args(&spec.args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit());

    let mut child = command.spawn()?;
    let stdin = child.stdin.take();
    if let Some(stdout) = child.stdout.take() {
        thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                let Some(event) = parse_native_pet_sidecar_event(&line) else {
                    continue;
                };
                on_event(event);
            }
        });
    }

    Ok(NativePetSidecarProcess {
        child: Mutex::new(Some(child)),
        stdin: Mutex::new(stdin),
    })
}

pub(super) fn emit_native_pet_sidecar_event(event: NativePetSidecarEvent) -> BuddyResult<()> {
    let line = match event {
        NativePetSidecarEvent::OpenChat => "event:open_chat",
    };

    println!("{line}");
    std::io::stdout()
        .flush()
        .map_err(|error| BuddyError::Runtime(error.to_string()))
}

pub(super) fn parse_native_pet_sidecar_event(line: &str) -> Option<NativePetSidecarEvent> {
    match line.trim() {
        "event:open_chat" => Some(NativePetSidecarEvent::OpenChat),
        _ => None,
    }
}

pub(super) fn create_native_pet_control_channel() -> mpsc::Receiver<NativePetControlRequest> {
    let (sender, receiver) = mpsc::channel();
    spawn_native_pet_stdin_control_reader(sender.clone());
    spawn_native_pet_socket_control_reader(sender);

    receiver
}

fn spawn_native_pet_stdin_control_reader(sender: mpsc::Sender<NativePetControlRequest>) {
    thread::spawn(move || {
        let stdin = std::io::stdin();
        for line in stdin.lock().lines().map_while(Result::ok) {
            let Some(NativePetControlRequestKind::Command(message)) =
                parse_native_pet_control_request_kind(&line)
            else {
                continue;
            };
            if sender
                .send(NativePetControlRequest::command(message))
                .is_err()
            {
                break;
            }
        }
    });
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
            Ok(request) => on_request(request),
            Err(mpsc::TryRecvError::Empty) => return NativePetControlPoll::Connected,
            Err(mpsc::TryRecvError::Disconnected) => return NativePetControlPoll::Disconnected,
        }
    }
}

pub(super) fn native_pet_control_ok_response() -> serde_json::Value {
    serde_json::json!({ "ok": true })
}

pub(super) fn native_pet_control_capabilities_response() -> serde_json::Value {
    serde_json::json!({
        "ok": true,
        "protocolVersion": 1,
        "commands": ["state", "capabilities", "animation", "move"],
        "targets": ["center", "home", "edge", "position", "x"],
        "edges": ["left", "right", "top", "bottom"],
        "animations": NATIVE_PET_ANIMATION_NAMES
            .iter()
            .map(|animation| animation.manifest_key())
            .collect::<Vec<_>>(),
        "sequence": {
            "script": "lexora-buddy-pet.mjs",
            "waitsOn": "state.motion.active"
        }
    })
}

#[cfg(test)]
mod tests {
    use super::{
        drain_native_pet_control_requests, parse_native_pet_sidecar_event, NativePetControlMessage,
        NativePetControlPoll, NativePetControlRequest, NativePetControlRequestKind,
        NativePetSidecarEvent,
    };
    use crate::native_pet::animation::NativePetAnimationName;

    #[test]
    fn parses_native_pet_open_chat_event_from_sidecar_stdout() {
        assert_eq!(
            parse_native_pet_sidecar_event("event:open_chat"),
            Some(NativePetSidecarEvent::OpenChat)
        );
        assert_eq!(parse_native_pet_sidecar_event("animation:working"), None);
        assert_eq!(parse_native_pet_sidecar_event("event:unknown"), None);
    }

    #[test]
    fn detects_native_pet_control_channel_disconnect_after_draining_messages() {
        let (sender, receiver) = std::sync::mpsc::channel();
        sender
            .send(NativePetControlRequest::command(
                NativePetControlMessage::SetAnimation(NativePetAnimationName::Working),
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
                NativePetAnimationName::Working
            )]
        );
        assert_eq!(poll, NativePetControlPoll::Disconnected);
    }
}
