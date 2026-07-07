import type { BuddyAnimationName } from '@/pet/buddyAnimation'
import type { BuddyNativePetHostAction } from '@/pet/buddyHostAction'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { invokeBuddyCommand, isTauriRuntime } from '@/lib/invokeClient'

export type BuddyRuntimeShell = 'browser' | 'tauri'

export type BuddyNativePetAnimationName = BuddyAnimationName

export type BuddyWindowResizeDirection
  = | 'East'
    | 'North'
    | 'NorthEast'
    | 'NorthWest'
    | 'South'
    | 'SouthEast'
    | 'SouthWest'
    | 'West'

export const BUDDY_APP_SETTINGS_CHANGED_EVENT = 'buddy-app-settings-changed'
export const BUDDY_RUN_STATE_CHANGED_EVENT = 'buddy-run-state-changed'
const BROWSER_APP_SETTINGS_STORAGE_KEY = 'lexora-buddy.browser-app-settings'

export interface BuddyAppSettings {
  allowNativeContextMenu: boolean
  runtimeDialogVisibility: {
    claude: boolean
    codex: boolean
  }
  configPath: string
  language: string
}

export interface UpdateBuddyAppSettingsRequest {
  allowNativeContextMenu?: boolean
  runtimeDialogVisibility?: {
    claude: boolean
    codex: boolean
  }
  language?: string
}

export interface BuddyRuntimeStatus {
  shell: BuddyRuntimeShell
  appName: string
  version: string
  desktopReady: boolean
}

export interface BuddyWindowFrameState {
  isMaximized: boolean
  isAlwaysOnTop: boolean
}

export interface BuddyLocalStateStatus {
  paths: {
    dataDir: string
    attachmentsDir: string
    artifactsDir: string
    cacheDir: string
    configPath: string
    conversationsDir: string
    logDir: string
    memoriesDir: string
    runsDir: string
    sqliteDir: string
    databasePath: string
  }
  storage: {
    databasePath: string
    schemaVersion: number
  }
}

export interface BuddyCodexRuntimeStatus {
  cliAvailable: boolean
  version: string | null
  loginStatus: BuddyClaudeLoginStatus
  appServerAvailable: boolean
  execJsonAvailable: boolean
  preferredProtocol: 'codex_app_server'
  activeProtocol: 'codex_app_server' | 'codex_exec_json_fallback' | 'unavailable'
}

export type BuddyClaudeLoginStatus = 'logged_in' | 'logged_out' | 'unknown' | 'unavailable'

export interface BuddyClaudeRuntimeStatus {
  cliAvailable: boolean
  version: string | null
  loginStatus: BuddyClaudeLoginStatus
  authMethod: string | null
  apiProvider: string | null
  printModeAvailable: boolean
  streamJsonAvailable: boolean
  memoryIsolationAvailable: boolean
  preferredProtocol: 'claude_print_stream_json'
  activeProtocol: 'status_only' | 'unavailable'
  executionEnabled: boolean
}

export type BuddyRuntimeSmokeStatus = 'passed' | 'failed' | 'skipped'

export interface BuddyAgentSubprocessEnvSummary {
  passedKeys: ReadonlyArray<string>
  blockedKeys: ReadonlyArray<string>
}

export interface BuddyRuntimeSmokeDiagnostics {
  message: string | null
  status: BuddyRuntimeSmokeStatus
}

export interface BuddyRuntimeDiagnostics {
  codex: {
    appServerSmoke: BuddyRuntimeSmokeDiagnostics
    codexHome: string | null
    status: BuddyCodexRuntimeStatus
    subprocessEnv: BuddyAgentSubprocessEnvSummary
  }
  claude: {
    status: BuddyClaudeRuntimeStatus
    subprocessEnv: BuddyAgentSubprocessEnvSummary
  }
}

export type BuddyUsageSourceStatus = 'available' | 'empty' | 'unavailable'

export interface BuddyUsageSourceSnapshot {
  runtime: BuddyRuntime
  status: BuddyUsageSourceStatus
  source: string
  updatedAt: string | null
  message: string | null
}

export interface BuddyUsageTotals {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  totalTokens: number
  recordCount: number
}

export interface BuddyUsageRecord {
  runtime: BuddyRuntime
  date: string | null
  sessionId: string | null
  projectPath: string | null
  model: string | null
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  totalTokens: number
}

export interface BuddyUsageWindow {
  runtime: BuddyRuntime
  key: 'codex_5h_limit' | 'codex_weekly_limit' | 'claude_5h_limit' | 'claude_weekly_limit'
  status: BuddyUsageSourceStatus
  usedTokens: number | null
  percentage: number | null
  resetsAt: string | null
}

export interface BuddyUsageSnapshot {
  sources: ReadonlyArray<BuddyUsageSourceSnapshot>
  totals: BuddyUsageTotals
  records: ReadonlyArray<BuddyUsageRecord>
  windows: ReadonlyArray<BuddyUsageWindow>
}

export interface CreateBuddyConversationRequest {
  scope: 'global' | 'project'
  projectRoot: string | null
  title: string | null
  sourceConversationId: string | null
  forkedFromMessageId: string | null
  sourceRunId: string | null
}

export interface BuddyConversation {
  id: string
  activeBranchId: string
  scope: 'global' | 'project'
  projectRoot: string | null
  title: string | null
  logPath: string
  sourceConversationId: string | null
  forkedFromMessageId: string | null
  sourceRunId: string | null
  createdAt: string
  updatedAt: string
}

export interface BuddyProject {
  root: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface BuddySetting {
  key: string
  value: unknown
  updatedAt: string
}

export interface BuddyMessage {
  id: string
  sessionId: string | null
  conversationId: string | null
  branchId: string | null
  runId: string | null
  parentMessageId: string | null
  versionGroupId: string | null
  versionIndex: number | null
  versionStatus: 'active' | 'superseded' | null
  role: BuddyMessageRole
  content: string
  attachments: ReadonlyArray<BuddyMessageAttachment>
  createdAt: string
}

export interface BuddyMessageAttachment {
  attachmentId?: string
  dataUrl?: string
  kind: BuddyChatAttachmentKind
  mimeType: string
  name: string
  previewPath?: string
  sizeBytes: number
}

export type BuddyChatAttachmentKind = 'image' | 'text' | 'binary'

export interface BuddyChatAttachment {
  attachmentId?: string
  dataUrl?: string
  kind: BuddyChatAttachmentKind
  mimeType: string
  name: string
  previewPath?: string
  sizeBytes: number
  text?: string
}

export interface BuddyClipboardImage {
  attachmentId?: string
  dataUrl?: string
  mimeType: 'image/png'
  name: string
  previewPath?: string
  sizeBytes: number
}

export interface BuddyClipboardFile {
  attachmentId?: string
  dataUrl?: string
  kind: BuddyChatAttachmentKind
  mimeType: string
  name: string
  previewPath?: string
  sizeBytes: number
  text?: string
}

export type BuddyPromptContextOptionKind = 'slashCommand' | 'skill' | 'plugin' | 'file'

export interface BuddyPromptContextOption {
  description: string | null
  kind: BuddyPromptContextOptionKind
  label: string
  path: string | null
  value: string
}

export interface BuddyCodexTextElement {
  byteRange: {
    start: number
    end: number
  }
  placeholder: string | null
}

export type BuddyCodexUserInput
  = | {
    type: 'text'
    text: string
    text_elements: ReadonlyArray<BuddyCodexTextElement>
  }
  | {
    type: 'image'
    detail?: 'auto' | 'low' | 'high'
    url: string
  }
  | {
    type: 'localImage'
    detail?: 'auto' | 'low' | 'high'
    path: string
  }
  | {
    type: 'skill'
    name: string
    path: string
  }
  | {
    type: 'mention'
    name: string
    path: string
  }

export interface BuddyChatPromptContextItem {
  description: string | null
  kind: BuddyPromptContextOptionKind
  label: string
  path: string | null
  value: string
}

export interface BuddyModelServiceTier {
  id: string
  name: string
  description: string | null
}

export interface BuddyReasoningEffortOption {
  reasoningEffort: string
  description: string | null
}

export interface BuddyRuntimeModelOption {
  runtime: BuddyRuntime
  id: string
  model: string
  displayName: string
  description: string | null
  isDefault: boolean
  defaultReasoningEffort: string | null
  supportedReasoningEfforts: ReadonlyArray<BuddyReasoningEffortOption>
  serviceTiers: ReadonlyArray<BuddyModelServiceTier>
  defaultServiceTier: string | null
}

export interface BuddyChatModelSelection {
  runtime: BuddyRuntime
  model: string | null
  serviceTier: string | null
  effort: string | null
}

export interface StartBuddyAgentTurnRequest {
  runtime: BuddyRuntime
  conversationId?: string | null
  conversationSeed?: CreateBuddyConversationRequest | null
  content: string
  cwd: string | null
  attachments?: ReadonlyArray<BuddyChatAttachment>
  contextItems?: ReadonlyArray<BuddyChatPromptContextItem>
  inputs?: ReadonlyArray<BuddyCodexUserInput>
  modelSelection?: BuddyChatModelSelection | null
}

export interface BuddyCodexPromptContextOptions {
  files: ReadonlyArray<BuddyPromptContextOption>
  plugins: ReadonlyArray<BuddyPromptContextOption>
  skills: ReadonlyArray<BuddyPromptContextOption>
}

export interface BuddyAgentTurnStart {
  assistantMessage: BuddyMessage | null
  conversation: BuddyConversation
  intent: 'companion_chat' | 'direct_answer' | 'agent_task' | 'project_task' | 'attachment_task'
  userMessage: BuddyMessage
  run: BuddyRun | null
}

export type BuddyApprovalStatus = 'pending' | 'approved' | 'denied' | 'cancelled'

export interface BuddyApproval {
  id: string
  runId: string | null
  kind: string
  status: BuddyApprovalStatus
  payload: unknown
  createdAt: string
  resolvedAt: string | null
}

export interface BuddyReadOnlyTaskDenial {
  approval: BuddyApproval
  events: ReadonlyArray<BuddyRunEvent>
  run: BuddyRun
}

export interface BuddyReadOnlyTaskApprovalTurn {
  approval: BuddyApproval
  userMessage: BuddyMessage
  assistantMessage: BuddyMessage
  run: BuddyRun
  events: ReadonlyArray<BuddyRunEvent>
}

export interface BuddyResolvedCodexAppServerRequestApproval {
  approval: BuddyApproval
  event: BuddyRunEvent
}

export interface BuddyRun {
  id: string
  sessionId: string | null
  conversationId: string | null
  branchId: string | null
  triggeringMessageId: string | null
  intent: string | null
  logPath: string | null
  runtime: BuddyRuntime
  cwd: string | null
  status: BuddyRunStatus
  externalThreadId: string | null
  externalRunId: string | null
  startedAt: string
  completedAt: string | null
}

export type BuddyRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface BuddyRunStateChangedEvent {
  runId: string
  sessionId: string | null
  eventId: number | null
  eventType: BuddyRunEventType | null
  status: BuddyRunStatus | null
}

export interface BuddyRunDiagnostics {
  runId: string
  contextPack: {
    available: boolean
    injected: boolean
    key: string
    notModified: boolean
    packHashPrefix: string | null
    sourceCount: number
    updatedAt: string | null
  }
}

export interface BuddyRunEvent {
  id: number
  runId: string
  eventType: BuddyRunEventType
  payload: unknown
  createdAt: string
}

export interface BuddyChatRunEvent {
  id: number
  runId: string
  eventType: BuddyRunEventType
  payload: unknown
  createdAt: string
}

export interface BuddyRunEventCount {
  runId: string
  eventCount: number
}

export interface BuddyRunEventSummary {
  id: number
  runId: string
  eventType: BuddyRunEventType
  payloadPreview: string
  payloadChars: number
  createdAt: string
}

export type BuddyRuntime = 'codex' | 'claude'

export type BuddyMessageRole = 'system' | 'user' | 'assistant' | 'tool'

export type BuddyRunEventType
  = | 'animation.intent'
    | 'approval.requested'
    | 'approval.resolved'
    | 'assistant.references'
    | 'codex.notification'
    | 'host.action'
    | 'memory.candidate.created'
    | 'memory.context_pack'
    | 'plan.delta'
    | 'plan.updated'
    | 'run.started'
    | 'reasoning.delta'
    | 'reasoning.summary_delta'
    | 'reasoning.summary_part_added'
    | 'reasoning.completed'
    | 'router.decision'
    | 'message.delta'
    | 'message.completed'
    | 'turn.completed'
    | 'turn.diff.updated'
    | 'tool.started'
    | 'tool.output_delta'
    | 'tool.patch_updated'
    | 'tool.progress'
    | 'tool.terminal_interaction'
    | 'tool.finished'
    | 'user_input.requested'
    | 'run.external_refs.updated'
    | 'run.completed'
    | 'run.failed'
    | 'run.cancelled'

export function resolveBuddyAppVersion(version = __LEXORA_BUDDY_VERSION__): string {
  const normalizedVersion = version.trim()
  return normalizedVersion.length > 0 ? normalizedVersion : '0.0.0-dev'
}

export function createBrowserRuntimeStatus(): BuddyRuntimeStatus {
  return {
    shell: 'browser',
    appName: 'Lexora',
    version: resolveBuddyAppVersion(),
    desktopReady: false,
  }
}

export function createBrowserLocalStateStatus(): BuddyLocalStateStatus {
  return {
    paths: {
      dataDir: '',
      attachmentsDir: '',
      artifactsDir: '',
      cacheDir: '',
      configPath: '',
      conversationsDir: '',
      logDir: '',
      memoriesDir: '',
      runsDir: '',
      sqliteDir: '',
      databasePath: '',
    },
    storage: {
      databasePath: '',
      schemaVersion: 0,
    },
  }
}

export function createBrowserCodexRuntimeStatus(): BuddyCodexRuntimeStatus {
  return {
    activeProtocol: 'unavailable',
    appServerAvailable: false,
    cliAvailable: false,
    execJsonAvailable: false,
    loginStatus: 'unavailable',
    preferredProtocol: 'codex_app_server',
    version: null,
  }
}

export function createBrowserClaudeRuntimeStatus(): BuddyClaudeRuntimeStatus {
  return {
    activeProtocol: 'unavailable',
    apiProvider: null,
    authMethod: null,
    cliAvailable: false,
    executionEnabled: false,
    loginStatus: 'unavailable',
    memoryIsolationAvailable: false,
    preferredProtocol: 'claude_print_stream_json',
    printModeAvailable: false,
    streamJsonAvailable: false,
    version: null,
  }
}

export function createBrowserRuntimeDiagnostics(): BuddyRuntimeDiagnostics {
  return {
    claude: {
      status: createBrowserClaudeRuntimeStatus(),
      subprocessEnv: {
        blockedKeys: [],
        passedKeys: [],
      },
    },
    codex: {
      appServerSmoke: {
        message: null,
        status: 'skipped',
      },
      codexHome: null,
      status: createBrowserCodexRuntimeStatus(),
      subprocessEnv: {
        blockedKeys: [],
        passedKeys: [],
      },
    },
  }
}

export function createBrowserUsageSnapshot(): BuddyUsageSnapshot {
  return {
    records: [],
    sources: [
      {
        runtime: 'codex',
        message: null,
        source: '',
        status: 'unavailable',
        updatedAt: null,
      },
      {
        runtime: 'claude',
        message: null,
        source: '',
        status: 'unavailable',
        updatedAt: null,
      },
    ],
    totals: {
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      recordCount: 0,
      totalTokens: 0,
    },
    windows: [
      {
        runtime: 'codex',
        key: 'codex_5h_limit',
        percentage: null,
        resetsAt: null,
        status: 'unavailable',
        usedTokens: null,
      },
      {
        runtime: 'codex',
        key: 'codex_weekly_limit',
        percentage: null,
        resetsAt: null,
        status: 'unavailable',
        usedTokens: null,
      },
      {
        runtime: 'claude',
        key: 'claude_5h_limit',
        percentage: null,
        resetsAt: null,
        status: 'unavailable',
        usedTokens: null,
      },
      {
        runtime: 'claude',
        key: 'claude_weekly_limit',
        percentage: null,
        resetsAt: null,
        status: 'unavailable',
        usedTokens: null,
      },
    ],
  }
}

export function createBrowserAppSettings(): BuddyAppSettings {
  return readBrowserAppSettings({
    allowNativeContextMenu: false,
    runtimeDialogVisibility: {
      claude: false,
      codex: true,
    },
    configPath: '',
    language: 'zh-CN',
  })
}

export function writeBrowserAppSettings(settings: BuddyAppSettings) {
  if (typeof window === 'undefined')
    return

  try {
    window.localStorage.setItem(BROWSER_APP_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  }
  catch {
    // Browser preview storage is best-effort only.
  }
}

function readBrowserAppSettings(defaultSettings: BuddyAppSettings): BuddyAppSettings {
  if (typeof window === 'undefined')
    return defaultSettings

  try {
    const rawSettings = window.localStorage.getItem(BROWSER_APP_SETTINGS_STORAGE_KEY)
    if (!rawSettings)
      return defaultSettings

    const storedSettings = JSON.parse(rawSettings) as Partial<BuddyAppSettings>
    return {
      ...defaultSettings,
      ...storedSettings,
      runtimeDialogVisibility: {
        ...defaultSettings.runtimeDialogVisibility,
        ...storedSettings.runtimeDialogVisibility,
      },
    }
  }
  catch {
    return defaultSettings
  }
}

export async function loadBuddyRuntimeStatus(): Promise<BuddyRuntimeStatus> {
  if (!isTauriRuntime())
    return createBrowserRuntimeStatus()

  return invokeBuddyCommand<BuddyRuntimeStatus>('get_buddy_runtime_status')
}

export async function loadBuddyCodexRuntimeStatus(): Promise<BuddyCodexRuntimeStatus> {
  if (!isTauriRuntime())
    return createBrowserCodexRuntimeStatus()

  return invokeBuddyCommand<BuddyCodexRuntimeStatus>('get_buddy_codex_runtime_status')
}

export async function loadBuddyClaudeRuntimeStatus(): Promise<BuddyClaudeRuntimeStatus> {
  if (!isTauriRuntime())
    return createBrowserClaudeRuntimeStatus()

  return invokeBuddyCommand<BuddyClaudeRuntimeStatus>('get_buddy_claude_runtime_status')
}

export async function loadBuddyRuntimeDiagnostics(): Promise<BuddyRuntimeDiagnostics> {
  if (!isTauriRuntime())
    return createBrowserRuntimeDiagnostics()

  return invokeBuddyCommand<BuddyRuntimeDiagnostics>('get_buddy_runtime_diagnostics')
}

export async function loadBuddyLocalStateStatus(): Promise<BuddyLocalStateStatus> {
  if (!isTauriRuntime())
    return createBrowserLocalStateStatus()

  return invokeBuddyCommand<BuddyLocalStateStatus>('get_buddy_local_state_status')
}

export async function loadBuddyUsageSnapshot(): Promise<BuddyUsageSnapshot> {
  if (!isTauriRuntime())
    return createBrowserUsageSnapshot()

  return invokeBuddyCommand<BuddyUsageSnapshot>('get_buddy_usage_snapshot')
}

export async function loadBuddyAppSettings(): Promise<BuddyAppSettings> {
  if (!isTauriRuntime())
    return createBrowserAppSettings()

  return invokeBuddyCommand<BuddyAppSettings>('get_buddy_app_settings')
}

export async function updateBuddyAppSettings(
  request: UpdateBuddyAppSettingsRequest,
): Promise<BuddyAppSettings> {
  assertDesktopCommandAvailable()

  return invokeBuddyCommand<BuddyAppSettings>('update_buddy_app_settings', { request })
}

export async function listenBuddyAppSettingsChanged(
  handler: (settings: BuddyAppSettings) => void,
): Promise<() => void> {
  if (!isTauriRuntime())
    return () => {}

  return listen<BuddyAppSettings>(
    BUDDY_APP_SETTINGS_CHANGED_EVENT,
    event => handler(event.payload),
  )
}

export async function listenBuddyRunStateChanged(
  handler: (event: BuddyRunStateChangedEvent) => void,
): Promise<() => void> {
  if (!isTauriRuntime())
    return () => {}

  return listen<BuddyRunStateChangedEvent>(
    BUDDY_RUN_STATE_CHANGED_EVENT,
    event => handler(event.payload),
  )
}

export async function authorizeBuddyProjectFromFolderPicker(): Promise<BuddyProject | null> {
  assertDesktopCommandAvailable()

  return invokeBuddyCommand<BuddyProject | null>('authorize_buddy_project_from_folder_picker')
}

export async function listBuddyProjects(limit = 200): Promise<ReadonlyArray<BuddyProject>> {
  if (!isTauriRuntime())
    return []

  return invokeBuddyCommand<ReadonlyArray<BuddyProject>>('list_buddy_projects', { limit })
}

export async function readBuddySettingJson(key: string): Promise<BuddySetting | null> {
  if (!isTauriRuntime()) {
    if (typeof window === 'undefined')
      return null

    try {
      const raw = window.localStorage.getItem(`lexora-buddy.setting.${key}`)
      if (!raw)
        return null

      return {
        key,
        updatedAt: new Date().toISOString(),
        value: JSON.parse(raw),
      }
    }
    catch {
      return null
    }
  }

  return invokeBuddyCommand<BuddySetting | null>('read_buddy_setting_json', { key })
}

export async function writeBuddySettingJson(
  key: string,
  value: unknown,
): Promise<BuddySetting> {
  if (!isTauriRuntime()) {
    if (typeof window !== 'undefined')
      window.localStorage.setItem(`lexora-buddy.setting.${key}`, JSON.stringify(value))

    return {
      key,
      updatedAt: new Date().toISOString(),
      value,
    }
  }

  return invokeBuddyCommand<BuddySetting>('write_buddy_setting_json', { key, value })
}

export async function listBuddyConversationMessages(options: {
  conversationId: string
  limit?: number
}): Promise<ReadonlyArray<BuddyMessage>> {
  if (!isTauriRuntime())
    return []

  return invokeBuddyCommand<ReadonlyArray<BuddyMessage>>('list_buddy_conversation_messages', {
    conversationId: options.conversationId,
    limit: options.limit ?? 100,
  })
}

export async function listBuddyConversations(limit = 50): Promise<ReadonlyArray<BuddyConversation>> {
  if (!isTauriRuntime())
    return []

  return invokeBuddyCommand<ReadonlyArray<BuddyConversation>>('list_buddy_conversations', { limit })
}

export async function deleteBuddyConversation(conversationId: string): Promise<boolean> {
  assertDesktopCommandAvailable()

  return invokeBuddyCommand<boolean>('delete_buddy_conversation', { conversationId })
}

export async function listBuddyRuns(options: {
  sessionId?: string | null
  limit?: number
} = {}): Promise<ReadonlyArray<BuddyRun>> {
  if (!isTauriRuntime())
    return []

  return invokeBuddyCommand<ReadonlyArray<BuddyRun>>('list_buddy_runs', {
    limit: options.limit ?? 50,
    sessionId: options.sessionId ?? null,
  })
}

export async function getBuddyRun(runId: string): Promise<BuddyRun> {
  assertDesktopCommandAvailable()

  return invokeBuddyCommand<BuddyRun>('get_buddy_run', { runId })
}

export async function getBuddyRunDiagnostics(runId: string): Promise<BuddyRunDiagnostics> {
  assertDesktopCommandAvailable()

  return invokeBuddyCommand<BuddyRunDiagnostics>('get_buddy_run_diagnostics', { runId })
}

export async function startBuddyAgentTurn(
  request: StartBuddyAgentTurnRequest,
): Promise<BuddyAgentTurnStart> {
  assertDesktopCommandAvailable()

  return invokeBuddyCommand<BuddyAgentTurnStart>('start_buddy_agent_turn', { request })
}

export async function cancelBuddyChatRun(runId: string): Promise<BuddyRun> {
  assertDesktopCommandAvailable()

  return invokeBuddyCommand<BuddyRun>('cancel_buddy_chat_run', { runId })
}

export async function listBuddyCodexPromptContextOptions(options: {
  cwd?: string | null
  fileQuery?: string | null
} = {}): Promise<BuddyCodexPromptContextOptions> {
  if (!isTauriRuntime()) {
    return {
      files: [],
      plugins: [],
      skills: [],
    }
  }

  return invokeBuddyCommand<BuddyCodexPromptContextOptions>(
    'list_buddy_codex_prompt_context_options',
    {
      request: {
        cwd: options.cwd ?? null,
        fileQuery: options.fileQuery ?? null,
      },
    },
  )
}

export async function listBuddyRuntimeModelOptions(): Promise<ReadonlyArray<BuddyRuntimeModelOption>> {
  if (!isTauriRuntime())
    return []

  return invokeBuddyCommand<ReadonlyArray<BuddyRuntimeModelOption>>(
    'list_buddy_runtime_model_options',
  )
}

export async function listBuddyApprovals(options: {
  status?: BuddyApprovalStatus | null
  limit?: number
} = {}): Promise<ReadonlyArray<BuddyApproval>> {
  if (!isTauriRuntime())
    return []

  return invokeBuddyCommand<ReadonlyArray<BuddyApproval>>('list_buddy_approvals', {
    limit: options.limit ?? 50,
    status: options.status ?? null,
  })
}

export async function approveBuddyReadOnlyTask(
  approvalId: string,
): Promise<BuddyReadOnlyTaskApprovalTurn> {
  assertDesktopCommandAvailable()

  return invokeBuddyCommand<BuddyReadOnlyTaskApprovalTurn>(
    'approve_buddy_read_only_task',
    { approvalId },
  )
}

export async function approveBuddyCodexAppServerRequestApproval(
  approvalId: string,
): Promise<BuddyResolvedCodexAppServerRequestApproval> {
  assertDesktopCommandAvailable()

  return invokeBuddyCommand<BuddyResolvedCodexAppServerRequestApproval>(
    'approve_buddy_codex_app_server_request_approval',
    { approvalId },
  )
}

export async function denyBuddyApproval(
  approvalId: string,
): Promise<BuddyReadOnlyTaskDenial | BuddyResolvedCodexAppServerRequestApproval> {
  assertDesktopCommandAvailable()

  return invokeBuddyCommand<
    BuddyReadOnlyTaskDenial | BuddyResolvedCodexAppServerRequestApproval
  >('deny_buddy_approval', { approvalId })
}

export async function listBuddyRunEvents(options: {
  runId: string
  afterId?: number | null
  limit?: number
}): Promise<ReadonlyArray<BuddyRunEvent>> {
  if (!isTauriRuntime())
    return []

  return invokeBuddyCommand<ReadonlyArray<BuddyRunEvent>>('list_buddy_run_events', {
    afterId: options.afterId ?? null,
    limit: options.limit ?? 100,
    runId: options.runId,
  })
}

export async function listBuddyChatRunEvents(options: {
  runId: string
  afterId?: number | null
  limit?: number
}): Promise<ReadonlyArray<BuddyChatRunEvent>> {
  if (!isTauriRuntime())
    return []

  return invokeBuddyCommand<ReadonlyArray<BuddyChatRunEvent>>('list_buddy_chat_run_events', {
    afterId: options.afterId ?? null,
    limit: options.limit ?? 100,
    runId: options.runId,
  })
}

export async function countBuddyRunEvents(
  runIds: ReadonlyArray<string>,
): Promise<ReadonlyArray<BuddyRunEventCount>> {
  if (!isTauriRuntime())
    return []

  return invokeBuddyCommand<ReadonlyArray<BuddyRunEventCount>>('count_buddy_run_events', {
    runIds,
  })
}

export async function listBuddyRunEventSummaries(options: {
  runId: string
  afterId?: number | null
  limit?: number
  payloadPreviewChars?: number
}): Promise<ReadonlyArray<BuddyRunEventSummary>> {
  if (!isTauriRuntime())
    return []

  return invokeBuddyCommand<ReadonlyArray<BuddyRunEventSummary>>(
    'list_buddy_run_event_summaries',
    {
      afterId: options.afterId ?? null,
      limit: options.limit ?? 100,
      payloadPreviewChars: options.payloadPreviewChars ?? 360,
      runId: options.runId,
    },
  )
}

export async function listBuddyConversationRunEvents(options: {
  conversationId: string
  afterId?: number | null
  runLimit?: number
  eventLimit?: number
}): Promise<ReadonlyArray<BuddyRunEvent>> {
  if (!isTauriRuntime())
    return []

  return invokeBuddyCommand<ReadonlyArray<BuddyRunEvent>>('list_buddy_conversation_run_events', {
    afterId: options.afterId ?? null,
    conversationId: options.conversationId,
    eventLimit: options.eventLimit ?? 2000,
    runLimit: options.runLimit ?? 40,
  })
}

export async function listBuddyChatConversationEvents(options: {
  conversationId: string
  afterId?: number | null
  runLimit?: number
  eventLimit?: number
}): Promise<ReadonlyArray<BuddyChatRunEvent>> {
  if (!isTauriRuntime())
    return []

  return invokeBuddyCommand<ReadonlyArray<BuddyChatRunEvent>>('list_buddy_chat_conversation_events', {
    afterId: options.afterId ?? null,
    conversationId: options.conversationId,
    eventLimit: options.eventLimit ?? 2000,
    runLimit: options.runLimit ?? 40,
  })
}

export async function showBuddyPanel(): Promise<void> {
  if (!isTauriRuntime())
    return

  await invokeBuddyCommand<void>('show_buddy_panel')
}

export async function showBuddyChat(): Promise<void> {
  if (!isTauriRuntime())
    return

  await invokeBuddyCommand<void>('show_buddy_chat')
}

export async function hideBuddyCurrentWindow(): Promise<void> {
  if (!isTauriRuntime())
    return

  await invokeBuddyCommand<void>('hide_buddy_current_window')
}

export async function getBuddyCurrentWindowFrameState(): Promise<BuddyWindowFrameState> {
  if (!isTauriRuntime()) {
    return {
      isAlwaysOnTop: false,
      isMaximized: false,
    }
  }

  return invokeBuddyCommand<BuddyWindowFrameState>('get_buddy_current_window_frame_state')
}

export async function setBuddyCurrentWindowAlwaysOnTop(
  alwaysOnTop: boolean,
): Promise<BuddyWindowFrameState> {
  assertDesktopCommandAvailable()

  return invokeBuddyCommand<BuddyWindowFrameState>(
    'set_buddy_current_window_always_on_top',
    { alwaysOnTop },
  )
}

export async function minimizeBuddyCurrentWindow(): Promise<void> {
  if (!isTauriRuntime())
    return

  await invokeBuddyCommand<void>('minimize_buddy_current_window')
}

export async function toggleBuddyCurrentWindowMaximize(): Promise<BuddyWindowFrameState> {
  if (!isTauriRuntime()) {
    return {
      isAlwaysOnTop: false,
      isMaximized: false,
    }
  }

  return invokeBuddyCommand<BuddyWindowFrameState>('toggle_buddy_current_window_maximize')
}

export async function startBuddyCurrentWindowDragging(): Promise<void> {
  if (!isTauriRuntime())
    return

  await invokeBuddyCommand<void>('start_buddy_current_window_dragging')
}

export async function readBuddyClipboardImage(): Promise<BuddyClipboardImage | null> {
  if (!isTauriRuntime())
    return null

  return invokeBuddyCommand<BuddyClipboardImage | null>('read_buddy_clipboard_image')
}

export async function readBuddyClipboardFiles(): Promise<ReadonlyArray<BuddyClipboardFile>> {
  if (!isTauriRuntime())
    return []

  return invokeBuddyCommand<ReadonlyArray<BuddyClipboardFile>>('read_buddy_clipboard_files', { paths: [] })
}

export async function selectBuddyChatAttachmentFiles(): Promise<ReadonlyArray<BuddyClipboardFile>> {
  if (!isTauriRuntime())
    return []

  return invokeBuddyCommand<ReadonlyArray<BuddyClipboardFile>>('select_buddy_chat_attachment_files')
}

export async function startBuddyCurrentWindowResizing(
  direction: BuddyWindowResizeDirection,
): Promise<void> {
  if (!isTauriRuntime())
    return

  await getCurrentWindow().startResizeDragging(direction)
}

export async function setBuddyNativePetAnimation(
  animation: BuddyNativePetAnimationName,
): Promise<void> {
  if (!isTauriRuntime())
    return

  await invokeBuddyCommand<void>('set_buddy_native_pet_animation', { animation })
}

export async function controlBuddyNativePetHostAction(
  action: BuddyNativePetHostAction,
): Promise<void> {
  if (!isTauriRuntime())
    return

  await invokeBuddyCommand<void>('control_buddy_native_pet_host_action', { action })
}

function assertDesktopCommandAvailable() {
  if (!isTauriRuntime())
    throw new Error('仅桌面模式可执行 Lexora 本地命令')
}
