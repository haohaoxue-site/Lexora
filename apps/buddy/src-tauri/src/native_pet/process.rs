use std::{
    fs,
    io::{BufRead, BufReader, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{mpsc, Mutex},
    thread,
    time::{Duration, Instant},
};

#[cfg(unix)]
use std::os::unix::{
    fs::{FileTypeExt, PermissionsExt},
    net::{UnixListener, UnixStream},
};

use crate::error::{BuddyError, BuddyResult};

use super::{
    animation::{NativePetAnimationName, NATIVE_PET_ANIMATION_NAMES},
    assets::create_native_pet_smoke_check_report,
    drag_replay::create_native_pet_drag_replay_check_report,
    window::run_native_pet_sidecar,
};

pub const NATIVE_PET_MODE_ARG: &str = "--native-pet";
pub const NATIVE_PET_LAYER_ARG: &str = "--native-pet-layer";

const NATIVE_PET_SMOKE_CHECK_ARG: &str = "--buddy-native-pet-smoke-check";
const NATIVE_PET_DRAG_REPLAY_CHECK_ARG: &str = "--buddy-native-pet-drag-replay-check";
const NATIVE_PET_CONTROL_SOCKET_ENV: &str = "LEXORA_BUDDY_PET_SOCKET";
const XDG_RUNTIME_DIR_ENV: &str = "XDG_RUNTIME_DIR";
const NATIVE_PET_RUNTIME_DIR_NAME: &str = "lexora-buddy";
const NATIVE_PET_CONTROL_SOCKET_FILE_NAME: &str = "native-pet.sock";
const NATIVE_PET_CONTROL_RESPONSE_TIMEOUT_MS: u64 = 1_500;

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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum NativePetWalkEdge {
    Left,
    Right,
    Top,
    Bottom,
}

impl NativePetWalkEdge {
    fn from_key(value: &str) -> Option<Self> {
        match value {
            "left" => Some(Self::Left),
            "right" => Some(Self::Right),
            "top" => Some(Self::Top),
            "bottom" => Some(Self::Bottom),
            _ => None,
        }
    }

    fn key(self) -> &'static str {
        match self {
            Self::Left => "left",
            Self::Right => "right",
            Self::Top => "top",
            Self::Bottom => "bottom",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum NativePetWalkTarget {
    Center,
    Home,
    Edge(NativePetWalkEdge),
    Position { x: i32, y: i32 },
    X { x: i32 },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum NativePetControlMessage {
    SetAnimation(NativePetAnimationName),
    WalkToEdge {
        edge: NativePetWalkEdge,
        after: Option<NativePetAnimationName>,
    },
    WalkToPosition {
        x: i32,
        y: i32,
        after: Option<NativePetAnimationName>,
    },
    WalkToX {
        x: i32,
        after: Option<NativePetAnimationName>,
    },
    WalkToTarget {
        target: NativePetWalkTarget,
        after: Option<NativePetAnimationName>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum NativePetControlRequestKind {
    Command(NativePetControlMessage),
    QueryState,
    QueryCapabilities,
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

fn execute_native_pet_host_action(
    process: &NativePetSidecarProcess,
    action: &serde_json::Value,
) -> BuddyResult<()> {
    let object = action.as_object().ok_or_else(|| {
        BuddyError::Validation("native pet host action must be an object".to_owned())
    })?;

    match read_native_pet_host_action_kind(object, "action")? {
        "animation" => {
            process.send_control_message(compile_native_pet_host_animation_action(object)?)
        }
        "move" => process.send_control_message(compile_native_pet_host_move_action(object)?),
        "sequence" => execute_native_pet_host_sequence_action(process, object),
        action => Err(BuddyError::Validation(format!(
            "unsupported native pet host action: {action}"
        ))),
    }
}

fn execute_native_pet_host_sequence_action(
    process: &NativePetSidecarProcess,
    object: &serde_json::Map<String, serde_json::Value>,
) -> BuddyResult<()> {
    let steps = object
        .get("steps")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| {
            BuddyError::Validation("native pet sequence action requires steps".to_owned())
        })?;
    if steps.is_empty() || steps.len() > 8 {
        return Err(BuddyError::Validation(
            "native pet sequence action requires 1 to 8 steps".to_owned(),
        ));
    }

    for (index, step) in steps.iter().enumerate() {
        let step_object = step.as_object().ok_or_else(|| {
            BuddyError::Validation("native pet sequence step must be an object".to_owned())
        })?;
        match read_native_pet_host_action_kind(step_object, "type")
            .or_else(|_| read_native_pet_host_action_kind(step_object, "action"))?
        {
            "animation" => {
                process
                    .send_control_message(compile_native_pet_host_animation_action(step_object)?)?;
                if let Some(duration) = read_native_pet_host_action_duration(step_object) {
                    thread::sleep(duration);
                }
            }
            "move" => {
                process.send_control_message(compile_native_pet_host_move_action(step_object)?)?;
                if index + 1 < steps.len() {
                    wait_native_pet_motion_idle()?;
                }
            }
            step_type => {
                return Err(BuddyError::Validation(format!(
                    "unsupported native pet sequence step: {step_type}"
                )));
            }
        }
    }

    Ok(())
}

#[cfg(test)]
fn compile_native_pet_host_action(
    action: &serde_json::Value,
) -> BuddyResult<Vec<NativePetControlMessage>> {
    let object = action.as_object().ok_or_else(|| {
        BuddyError::Validation("native pet host action must be an object".to_owned())
    })?;
    match read_native_pet_host_action_kind(object, "action")? {
        "animation" => Ok(vec![compile_native_pet_host_animation_action(object)?]),
        "move" => Ok(vec![compile_native_pet_host_move_action(object)?]),
        "sequence" => {
            let steps = object
                .get("steps")
                .and_then(serde_json::Value::as_array)
                .ok_or_else(|| {
                    BuddyError::Validation("native pet sequence action requires steps".to_owned())
                })?;
            if steps.is_empty() || steps.len() > 8 {
                return Err(BuddyError::Validation(
                    "native pet sequence action requires 1 to 8 steps".to_owned(),
                ));
            }

            steps
                .iter()
                .map(compile_native_pet_host_sequence_step)
                .collect()
        }
        action => Err(BuddyError::Validation(format!(
            "unsupported native pet host action: {action}"
        ))),
    }
}

#[cfg(test)]
fn compile_native_pet_host_sequence_step(
    step: &serde_json::Value,
) -> BuddyResult<NativePetControlMessage> {
    let object = step.as_object().ok_or_else(|| {
        BuddyError::Validation("native pet sequence step must be an object".to_owned())
    })?;
    match read_native_pet_host_action_kind(object, "type")
        .or_else(|_| read_native_pet_host_action_kind(object, "action"))?
    {
        "animation" => compile_native_pet_host_animation_action(object),
        "move" => compile_native_pet_host_move_action(object),
        step_type => Err(BuddyError::Validation(format!(
            "unsupported native pet sequence step: {step_type}"
        ))),
    }
}

fn compile_native_pet_host_animation_action(
    object: &serde_json::Map<String, serde_json::Value>,
) -> BuddyResult<NativePetControlMessage> {
    let animation = read_native_pet_host_action_kind(object, "animation")?;
    let animation = NativePetAnimationName::from_manifest_key(animation).ok_or_else(|| {
        BuddyError::Validation(format!("unknown native pet animation: {animation}"))
    })?;
    Ok(NativePetControlMessage::SetAnimation(animation))
}

fn compile_native_pet_host_move_action(
    object: &serde_json::Map<String, serde_json::Value>,
) -> BuddyResult<NativePetControlMessage> {
    let target = object
        .get("target")
        .ok_or_else(|| BuddyError::Validation("native pet move action requires target".to_owned()))?
        .clone();
    let mut request = serde_json::json!({
        "type": "move",
        "target": target,
    });
    if let Some(after) = object.get("after") {
        request["after"] = after.clone();
    }

    let line = serde_json::to_string(&request)?;
    match parse_native_pet_json_control_request_kind(&line) {
        Some(NativePetControlRequestKind::Command(message)) => Ok(message),
        _ => Err(BuddyError::Validation(
            "invalid native pet move action".to_owned(),
        )),
    }
}

fn read_native_pet_host_action_kind<'a>(
    object: &'a serde_json::Map<String, serde_json::Value>,
    key: &str,
) -> BuddyResult<&'a str> {
    object
        .get(key)
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| BuddyError::Validation(format!("native pet host action requires {key}")))
}

fn read_native_pet_host_action_duration(
    object: &serde_json::Map<String, serde_json::Value>,
) -> Option<Duration> {
    object
        .get("durationMs")
        .and_then(serde_json::Value::as_u64)
        .filter(|duration_ms| (100..=30_000).contains(duration_ms))
        .map(Duration::from_millis)
}

#[cfg(unix)]
fn wait_native_pet_motion_idle() -> BuddyResult<()> {
    let started_at = Instant::now();
    thread::sleep(Duration::from_millis(120));
    loop {
        let state = request_native_pet_control_socket_json(serde_json::json!({ "type": "state" }))?;
        let is_active = state
            .get("motion")
            .and_then(|motion| motion.get("active"))
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(false);
        if !is_active {
            return Ok(());
        }
        if started_at.elapsed() > Duration::from_secs(15) {
            return Err(BuddyError::Runtime(
                "native pet motion did not settle before host action timeout".to_owned(),
            ));
        }

        thread::sleep(Duration::from_millis(120));
    }
}

#[cfg(not(unix))]
fn wait_native_pet_motion_idle() -> BuddyResult<()> {
    Ok(())
}

#[cfg(unix)]
fn request_native_pet_control_socket_json(
    request: serde_json::Value,
) -> BuddyResult<serde_json::Value> {
    let socket_path = native_pet_control_socket_path()?;
    let mut stream = UnixStream::connect(&socket_path).map_err(|error| {
        BuddyError::Runtime(format!(
            "failed to connect native pet control socket {}: {error}",
            socket_path.display()
        ))
    })?;
    let serialized = serde_json::to_string(&request)?;
    stream.write_all(serialized.as_bytes())?;
    stream.write_all(b"\n")?;
    stream.flush()?;

    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    reader.read_line(&mut line)?;
    let response = serde_json::from_str::<serde_json::Value>(&line)?;
    if response.get("ok").and_then(serde_json::Value::as_bool) == Some(true) {
        return Ok(response);
    }

    Err(BuddyError::Runtime(format!(
        "native pet control socket rejected host action: {}",
        response
            .get("error")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("unknown_error")
    )))
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

pub(super) fn parse_native_pet_control_message(line: &str) -> Option<NativePetControlMessage> {
    let line = line.trim();
    if let Some(value) = line.strip_prefix("animation:") {
        return NativePetAnimationName::from_manifest_key(value)
            .map(NativePetControlMessage::SetAnimation);
    }

    if let Some(value) = line.strip_prefix("walk_to_edge:") {
        let mut parts = value.split(':');
        let edge = NativePetWalkEdge::from_key(parts.next()?)?;
        let after = parse_native_pet_optional_after_animation(parts.next())?;
        if parts.next().is_some() {
            return None;
        }

        return Some(NativePetControlMessage::WalkToEdge { edge, after });
    }

    if let Some(value) = line.strip_prefix("walk_to_x:") {
        let mut parts = value.split(':');
        let x = parts.next()?.parse().ok()?;
        let after = parse_native_pet_optional_after_animation(parts.next())?;
        if parts.next().is_some() {
            return None;
        }

        return Some(NativePetControlMessage::WalkToX { x, after });
    }

    if let Some(value) = line.strip_prefix("walk_to:") {
        let mut parts = value.split(':');
        let x = parts.next()?.parse().ok()?;
        let y = parts.next()?.parse().ok()?;
        let after = parse_native_pet_optional_after_animation(parts.next())?;
        if parts.next().is_some() {
            return None;
        }

        return Some(NativePetControlMessage::WalkToPosition { x, y, after });
    }

    None
}

pub(super) fn parse_native_pet_control_request_kind(
    line: &str,
) -> Option<NativePetControlRequestKind> {
    let line = line.trim();
    if line.starts_with('{') {
        return parse_native_pet_json_control_request_kind(line);
    }

    parse_native_pet_control_message(line).map(NativePetControlRequestKind::Command)
}

#[derive(Debug, serde::Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum NativePetJsonControlRequest {
    #[serde(rename = "state")]
    State,
    #[serde(rename = "capabilities")]
    Capabilities,
    #[serde(rename = "animation")]
    Animation { animation: String },
    #[serde(rename = "move")]
    Move {
        target: NativePetJsonWalkTarget,
        after: Option<String>,
    },
}

#[derive(Debug, serde::Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum NativePetJsonWalkTarget {
    Center,
    Home,
    Edge { edge: String },
    Position { x: i32, y: i32 },
    X { x: i32 },
}

fn parse_native_pet_json_control_request_kind(line: &str) -> Option<NativePetControlRequestKind> {
    let request = serde_json::from_str::<NativePetJsonControlRequest>(line).ok()?;
    match request {
        NativePetJsonControlRequest::State => Some(NativePetControlRequestKind::QueryState),
        NativePetJsonControlRequest::Capabilities => {
            Some(NativePetControlRequestKind::QueryCapabilities)
        }
        NativePetJsonControlRequest::Animation { animation } => {
            NativePetAnimationName::from_manifest_key(&animation)
                .map(NativePetControlMessage::SetAnimation)
                .map(NativePetControlRequestKind::Command)
        }
        NativePetJsonControlRequest::Move { target, after } => {
            let target = parse_native_pet_json_walk_target(target)?;
            let after = parse_native_pet_optional_after_animation(after.as_deref())?;
            Some(NativePetControlRequestKind::Command(
                NativePetControlMessage::WalkToTarget { target, after },
            ))
        }
    }
}

fn parse_native_pet_json_walk_target(
    target: NativePetJsonWalkTarget,
) -> Option<NativePetWalkTarget> {
    match target {
        NativePetJsonWalkTarget::Center => Some(NativePetWalkTarget::Center),
        NativePetJsonWalkTarget::Home => Some(NativePetWalkTarget::Home),
        NativePetJsonWalkTarget::Edge { edge } => {
            NativePetWalkEdge::from_key(&edge).map(NativePetWalkTarget::Edge)
        }
        NativePetJsonWalkTarget::Position { x, y } => Some(NativePetWalkTarget::Position { x, y }),
        NativePetJsonWalkTarget::X { x } => Some(NativePetWalkTarget::X { x }),
    }
}

fn parse_native_pet_optional_after_animation(
    value: Option<&str>,
) -> Option<Option<NativePetAnimationName>> {
    let Some(value) = value else {
        return Some(None);
    };
    if value.is_empty() {
        return Some(None);
    }

    NativePetAnimationName::from_manifest_key(value).map(Some)
}

fn format_native_pet_control_message(message: NativePetControlMessage) -> String {
    match message {
        NativePetControlMessage::SetAnimation(animation) => {
            format!("animation:{}", animation.manifest_key())
        }
        NativePetControlMessage::WalkToEdge { edge, after } => {
            format!(
                "walk_to_edge:{}{}",
                edge.key(),
                format_native_pet_after_suffix(after)
            )
        }
        NativePetControlMessage::WalkToPosition { x, y, after } => {
            format!("walk_to:{x}:{y}{}", format_native_pet_after_suffix(after))
        }
        NativePetControlMessage::WalkToX { x, after } => {
            format!("walk_to_x:{x}{}", format_native_pet_after_suffix(after))
        }
        NativePetControlMessage::WalkToTarget { target, after } => {
            let mut request = serde_json::json!({
                "type": "move",
                "target": format_native_pet_walk_target_json(target),
            });
            if let Some(after) = after {
                request["after"] = serde_json::Value::String(after.manifest_key().to_owned());
            }
            serde_json::to_string(&request).expect("native pet control JSON serializes")
        }
    }
}

fn format_native_pet_walk_target_json(target: NativePetWalkTarget) -> serde_json::Value {
    match target {
        NativePetWalkTarget::Center => serde_json::json!({ "kind": "center" }),
        NativePetWalkTarget::Home => serde_json::json!({ "kind": "home" }),
        NativePetWalkTarget::Edge(edge) => {
            serde_json::json!({ "kind": "edge", "edge": edge.key() })
        }
        NativePetWalkTarget::Position { x, y } => {
            serde_json::json!({ "kind": "position", "x": x, "y": y })
        }
        NativePetWalkTarget::X { x } => serde_json::json!({ "kind": "x", "x": x }),
    }
}

fn format_native_pet_after_suffix(after: Option<NativePetAnimationName>) -> String {
    after
        .map(|animation| format!(":{}", animation.manifest_key()))
        .unwrap_or_default()
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

#[cfg(unix)]
fn spawn_native_pet_socket_control_reader(sender: mpsc::Sender<NativePetControlRequest>) {
    thread::spawn(move || {
        if let Err(error) = run_native_pet_socket_control_reader(sender) {
            eprintln!("Lexora Buddy native pet control socket failed: {error}");
        }
    });
}

#[cfg(not(unix))]
fn spawn_native_pet_socket_control_reader(_sender: mpsc::Sender<NativePetControlRequest>) {}

#[cfg(unix)]
fn run_native_pet_socket_control_reader(
    sender: mpsc::Sender<NativePetControlRequest>,
) -> BuddyResult<()> {
    let socket_path = native_pet_control_socket_path()?;
    let uses_default_socket_path = std::env::var_os(NATIVE_PET_CONTROL_SOCKET_ENV).is_none();
    if let Some(parent) = socket_path.parent() {
        fs::create_dir_all(parent)?;
        if uses_default_socket_path {
            fs::set_permissions(parent, fs::Permissions::from_mode(0o700))?;
        }
    }
    if socket_path.symlink_metadata().is_ok() {
        if native_pet_control_socket_is_active(&socket_path) {
            return Err(BuddyError::Runtime(format!(
                "native pet control socket is already active: {}",
                socket_path.display()
            )));
        }
        let file_type = socket_path.symlink_metadata()?.file_type();
        if !file_type.is_socket() {
            return Err(BuddyError::Runtime(format!(
                "native pet control socket path exists but is not a socket: {}",
                socket_path.display()
            )));
        }
        fs::remove_file(&socket_path)?;
    }

    let listener = UnixListener::bind(&socket_path)?;
    for stream in listener.incoming() {
        let stream = match stream {
            Ok(stream) => stream,
            Err(error) => {
                eprintln!("Lexora Buddy native pet control connection failed: {error}");
                continue;
            }
        };
        if let Err(error) = handle_native_pet_control_socket_stream(stream, &sender) {
            eprintln!("Lexora Buddy native pet control command failed: {error}");
        }
    }

    Ok(())
}

#[cfg(unix)]
fn native_pet_control_socket_is_active(socket_path: &Path) -> bool {
    UnixStream::connect(socket_path).is_ok()
}

#[cfg(unix)]
fn native_pet_control_socket_path() -> BuddyResult<PathBuf> {
    if let Some(path) = std::env::var_os(NATIVE_PET_CONTROL_SOCKET_ENV) {
        let path = PathBuf::from(path);
        if !path.is_absolute() {
            return Err(BuddyError::Validation(format!(
                "{NATIVE_PET_CONTROL_SOCKET_ENV} must be an absolute path"
            )));
        }
        return Ok(path);
    }

    Ok(default_native_pet_control_socket_path())
}

#[cfg(unix)]
fn default_native_pet_control_socket_path() -> PathBuf {
    if let Some(runtime_dir) =
        std::env::var_os(XDG_RUNTIME_DIR_ENV).filter(|value| !value.is_empty())
    {
        return PathBuf::from(runtime_dir)
            .join(NATIVE_PET_RUNTIME_DIR_NAME)
            .join(NATIVE_PET_CONTROL_SOCKET_FILE_NAME);
    }

    std::env::temp_dir()
        .join(format!("lexora-buddy-uid-{}", unsafe { libc::geteuid() }))
        .join(NATIVE_PET_CONTROL_SOCKET_FILE_NAME)
}

#[cfg(unix)]
fn handle_native_pet_control_socket_stream(
    stream: UnixStream,
    sender: &mpsc::Sender<NativePetControlRequest>,
) -> BuddyResult<()> {
    let mut writer = stream.try_clone()?;
    let reader = BufReader::new(stream);
    for line in reader.lines().map_while(Result::ok) {
        if line.trim().is_empty() {
            continue;
        }

        let Some(kind) = parse_native_pet_control_request_kind(&line) else {
            write_native_pet_control_socket_response(
                &mut writer,
                native_pet_control_error_response("invalid_control_message"),
            )?;
            continue;
        };

        let (request, response_receiver) = NativePetControlRequest::socket(kind);
        if sender.send(request).is_err() {
            write_native_pet_control_socket_response(
                &mut writer,
                native_pet_control_error_response("control_channel_closed"),
            )?;
            continue;
        }

        let response = response_receiver
            .recv_timeout(Duration::from_millis(
                NATIVE_PET_CONTROL_RESPONSE_TIMEOUT_MS,
            ))
            .unwrap_or_else(|_| native_pet_control_error_response("control_response_timeout"));
        write_native_pet_control_socket_response(&mut writer, response)?;
    }

    Ok(())
}

#[cfg(unix)]
fn write_native_pet_control_socket_response(
    writer: &mut UnixStream,
    response: serde_json::Value,
) -> BuddyResult<()> {
    let serialized = serde_json::to_string(&response)?;
    writer.write_all(serialized.as_bytes())?;
    writer.write_all(b"\n")?;
    writer.flush()?;
    Ok(())
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

fn native_pet_control_error_response(error: &'static str) -> serde_json::Value {
    serde_json::json!({
        "ok": false,
        "error": error,
    })
}

#[cfg(test)]
mod tests {
    use super::{
        compile_native_pet_host_action, drain_native_pet_control_requests,
        parse_native_pet_control_message, parse_native_pet_control_request_kind,
        parse_native_pet_sidecar_event, NativePetControlMessage, NativePetControlPoll,
        NativePetControlRequest, NativePetControlRequestKind, NativePetSidecarEvent,
        NativePetWalkEdge, NativePetWalkTarget,
    };
    use crate::native_pet::animation::NativePetAnimationName;

    static ENV_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    #[test]
    fn parses_native_pet_animation_control_message() {
        assert_eq!(
            parse_native_pet_control_message("animation:working"),
            Some(NativePetControlMessage::SetAnimation(
                NativePetAnimationName::Working
            ))
        );
        assert_eq!(parse_native_pet_control_message("animation:unknown"), None);
        assert_eq!(parse_native_pet_control_message("unknown"), None);
    }

    #[test]
    fn parses_native_pet_scripted_walk_control_messages() {
        assert_eq!(
            parse_native_pet_control_message("walk_to_edge:left:celebrate"),
            Some(NativePetControlMessage::WalkToEdge {
                edge: NativePetWalkEdge::Left,
                after: Some(NativePetAnimationName::Celebrate)
            })
        );
        assert_eq!(
            parse_native_pet_control_message("walk_to_edge:right"),
            Some(NativePetControlMessage::WalkToEdge {
                edge: NativePetWalkEdge::Right,
                after: None
            })
        );
        assert_eq!(
            parse_native_pet_control_message("walk_to:120:-40:curious"),
            Some(NativePetControlMessage::WalkToPosition {
                x: 120,
                y: -40,
                after: Some(NativePetAnimationName::Curious)
            })
        );
        assert_eq!(
            parse_native_pet_control_message("walk_to_x:320:explain"),
            Some(NativePetControlMessage::WalkToX {
                x: 320,
                after: Some(NativePetAnimationName::Explain)
            })
        );

        assert_eq!(
            parse_native_pet_control_message("walk_to_edge:top:celebrate"),
            Some(NativePetControlMessage::WalkToEdge {
                edge: NativePetWalkEdge::Top,
                after: Some(NativePetAnimationName::Celebrate)
            })
        );
        assert_eq!(
            parse_native_pet_control_message("walk_to_edge:bottom"),
            Some(NativePetControlMessage::WalkToEdge {
                edge: NativePetWalkEdge::Bottom,
                after: None
            })
        );
        assert_eq!(
            parse_native_pet_control_message("walk_to_edge:diagonal:celebrate"),
            None
        );
        assert_eq!(
            parse_native_pet_control_message("walk_to_x:left:celebrate"),
            None
        );
    }

    #[test]
    fn parses_native_pet_json_control_queries_and_targets() {
        assert_eq!(
            parse_native_pet_control_request_kind(r#"{"type":"state"}"#),
            Some(NativePetControlRequestKind::QueryState)
        );
        assert_eq!(
            parse_native_pet_control_request_kind(r#"{"type":"capabilities"}"#),
            Some(NativePetControlRequestKind::QueryCapabilities)
        );
        assert_eq!(
            parse_native_pet_control_request_kind(
                r#"{"type":"move","target":{"kind":"center"},"after":"celebrate"}"#
            ),
            Some(NativePetControlRequestKind::Command(
                NativePetControlMessage::WalkToTarget {
                    target: NativePetWalkTarget::Center,
                    after: Some(NativePetAnimationName::Celebrate),
                }
            ))
        );
        assert_eq!(
            parse_native_pet_control_request_kind(
                r#"{"type":"move","target":{"kind":"edge","edge":"left"},"after":"sleep"}"#
            ),
            Some(NativePetControlRequestKind::Command(
                NativePetControlMessage::WalkToTarget {
                    target: NativePetWalkTarget::Edge(NativePetWalkEdge::Left),
                    after: Some(NativePetAnimationName::Sleep),
                }
            ))
        );
        assert_eq!(
            parse_native_pet_control_request_kind(
                r#"{"type":"move","target":{"kind":"position","x":120,"y":640}}"#
            ),
            Some(NativePetControlRequestKind::Command(
                NativePetControlMessage::WalkToTarget {
                    target: NativePetWalkTarget::Position { x: 120, y: 640 },
                    after: None,
                }
            ))
        );
    }

    #[test]
    fn compiles_native_pet_host_action_sequence_to_control_messages() {
        let messages = compile_native_pet_host_action(&serde_json::json!({
            "action": "sequence",
            "steps": [
                { "type": "move", "target": { "kind": "center" } },
                { "type": "animation", "animation": "celebrate", "durationMs": 3000 },
                { "type": "move", "target": { "kind": "home" }, "after": "sleep" }
            ]
        }))
        .expect("compile host action");

        assert_eq!(
            messages,
            vec![
                NativePetControlMessage::WalkToTarget {
                    target: NativePetWalkTarget::Center,
                    after: None,
                },
                NativePetControlMessage::SetAnimation(NativePetAnimationName::Celebrate),
                NativePetControlMessage::WalkToTarget {
                    target: NativePetWalkTarget::Home,
                    after: Some(NativePetAnimationName::Sleep),
                },
            ]
        );
    }

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

    #[cfg(unix)]
    #[test]
    fn detects_active_native_pet_control_socket() {
        use std::os::unix::net::UnixListener;

        let socket_path = std::env::temp_dir().join(format!(
            "lexora-buddy-native-pet-test-{}-{}.sock",
            std::process::id(),
            "active"
        ));
        let _ = std::fs::remove_file(&socket_path);
        let listener = UnixListener::bind(&socket_path).expect("bind test socket");

        assert!(super::native_pet_control_socket_is_active(&socket_path));

        drop(listener);
        let _ = std::fs::remove_file(socket_path);
    }

    #[cfg(unix)]
    #[test]
    fn defaults_native_pet_control_socket_to_xdg_runtime_dir() {
        let _guard = ENV_LOCK.lock().expect("env lock");
        let previous_runtime_dir = std::env::var_os("XDG_RUNTIME_DIR");
        let runtime_dir = std::env::temp_dir().join(format!(
            "lexora-buddy-xdg-runtime-test-{}",
            std::process::id(),
        ));
        std::env::set_var("XDG_RUNTIME_DIR", &runtime_dir);

        let socket_path = super::default_native_pet_control_socket_path();

        assert_eq!(
            socket_path,
            runtime_dir.join("lexora-buddy").join("native-pet.sock"),
        );
        assert_eq!(
            socket_path.file_name().and_then(|value| value.to_str()),
            Some("native-pet.sock"),
        );

        match previous_runtime_dir {
            Some(value) => std::env::set_var("XDG_RUNTIME_DIR", value),
            None => std::env::remove_var("XDG_RUNTIME_DIR"),
        }
    }

    #[cfg(unix)]
    #[test]
    fn falls_back_native_pet_control_socket_to_private_uid_temp_path_without_xdg_runtime_dir() {
        let _guard = ENV_LOCK.lock().expect("env lock");
        let previous_runtime_dir = std::env::var_os("XDG_RUNTIME_DIR");
        std::env::remove_var("XDG_RUNTIME_DIR");

        let socket_path = super::default_native_pet_control_socket_path();
        let parent = socket_path.parent().expect("socket parent");
        let parent_name = parent
            .file_name()
            .and_then(|value| value.to_str())
            .expect("socket parent name");

        assert!(socket_path.starts_with(std::env::temp_dir()));
        assert_eq!(
            parent_name,
            format!("lexora-buddy-uid-{}", unsafe { libc::geteuid() }),
        );
        assert_eq!(
            socket_path.file_name().and_then(|value| value.to_str()),
            Some("native-pet.sock"),
        );

        match previous_runtime_dir {
            Some(value) => std::env::set_var("XDG_RUNTIME_DIR", value),
            None => std::env::remove_var("XDG_RUNTIME_DIR"),
        }
    }

    #[cfg(unix)]
    #[test]
    fn rejects_relative_native_pet_control_socket_override() {
        let _guard = ENV_LOCK.lock().expect("env lock");
        let previous_socket_path = std::env::var_os(super::NATIVE_PET_CONTROL_SOCKET_ENV);
        std::env::set_var(super::NATIVE_PET_CONTROL_SOCKET_ENV, "native-pet.sock");

        let error = super::native_pet_control_socket_path()
            .expect_err("relative socket override should be rejected");

        assert!(error
            .to_string()
            .contains("LEXORA_BUDDY_PET_SOCKET must be an absolute path"));

        match previous_socket_path {
            Some(value) => std::env::set_var(super::NATIVE_PET_CONTROL_SOCKET_ENV, value),
            None => std::env::remove_var(super::NATIVE_PET_CONTROL_SOCKET_ENV),
        }
    }
}
