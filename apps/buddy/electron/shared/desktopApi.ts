import type { DesktopCommandId, DesktopPlatform } from './desktopCommands'
import type { LocalChatApi } from './localChatApi'

export const DESKTOP_IPC_CHANNELS = {
  appCheckForUpdates: 'lexora:app:check-for-updates',
  appGetInfo: 'lexora:app:get-info',
  appOpenFeedbackIssue: 'lexora:app:open-feedback-issue',
  appOpenReleasePage: 'lexora:app:open-release-page',
  appOpenTarget: 'lexora:app:open-target',
  browserClose: 'lexora:browser:close',
  browserEnablePersonalProfile: 'lexora:browser:enable-personal-profile',
  browserEnsureSession: 'lexora:browser:ensure-session',
  browserFocusPage: 'lexora:browser:focus-page',
  browserGoBack: 'lexora:browser:go-back',
  browserGoForward: 'lexora:browser:go-forward',
  browserNavigate: 'lexora:browser:navigate',
  browserOpenLocalFile: 'lexora:browser:open-local-file',
  browserReload: 'lexora:browser:reload',
  browserResetPersonalProfile: 'lexora:browser:reset-personal-profile',
  browserSetSurface: 'lexora:browser:set-surface',
  browserStateChanged: 'lexora:browser:state-changed',
  browserStop: 'lexora:browser:stop',
  browserTakeControl: 'lexora:browser:take-control',
  browserToolbarFocusRequested: 'lexora:browser:toolbar-focus-requested',
  clipboardWriteText: 'lexora:clipboard:write-text',
  commandExecute: 'lexora:command:execute',
  settingsGet: 'lexora:settings:get',
  settingsUpdate: 'lexora:settings:update',
  windowGetState: 'lexora:window:get-state',
  windowMinimize: 'lexora:window:minimize',
  windowStateChanged: 'lexora:window:state-changed',
  windowToggleAlwaysOnTop: 'lexora:window:toggle-always-on-top',
  windowToggleMaximize: 'lexora:window:toggle-maximize',
} as const

export const DESKTOP_BROWSER_ERROR_CODES = [
  'BROWSER_CERTIFICATE_ERROR',
  'BROWSER_LOCAL_SERVER_UNREACHABLE',
  'BROWSER_NAVIGATION_BLOCKED',
  'BROWSER_PAGE_CRASHED',
  'BROWSER_PAGE_FAILED',
  'BROWSER_PAGE_UNRESPONSIVE',
  'BROWSER_PERMISSION_DENIED',
  'BROWSER_SESSION_EVICTED',
  'BROWSER_SESSION_LIMIT_REACHED',
  'BROWSER_SESSION_NOT_FOUND',
] as const

export const DESKTOP_BROWSER_SECURITY_KINDS = [
  'blank',
  'certificate-error',
  'insecure',
  'local',
  'secure',
] as const

export const DESKTOP_BROWSER_PROFILE_MODES = ['ephemeral', 'personal'] as const

export type DesktopBrowserErrorCode = typeof DESKTOP_BROWSER_ERROR_CODES[number]
export type DesktopBrowserProfileMode = typeof DESKTOP_BROWSER_PROFILE_MODES[number]
export type DesktopBrowserSecurityKind = typeof DESKTOP_BROWSER_SECURITY_KINDS[number]
export type DesktopBrowserStatus = 'error' | 'idle' | 'loading' | 'ready'

export interface DesktopBrowserBounds {
  height: number
  width: number
  x: number
  y: number
}

export interface DesktopBrowserError {
  code: DesktopBrowserErrorCode
  message: string
}

export type DesktopBrowserSecurityState = {
  kind: 'blank'
  origin: null
} | {
  kind: Exclude<DesktopBrowserSecurityKind, 'blank'>
  origin: string
}

export interface DesktopBrowserState {
  canGoBack: boolean
  canGoForward: boolean
  controller: 'agent' | 'human'
  controlEpoch: number
  conversationId: string
  error: DesktopBrowserError | null
  pageId: string
  profileMode: DesktopBrowserProfileMode
  security: DesktopBrowserSecurityState
  sessionId: string
  status: DesktopBrowserStatus
  title: string
  url: string
  visible: boolean
}

export interface DesktopBrowserToolbarFocusRequest {
  conversationId: string
  sessionId: string
}

export interface DesktopBrowserEnsureSessionInput {
  conversationId: string
}

export interface DesktopBrowserNavigateInput {
  sessionId: string
  url: string
}

export interface DesktopBrowserOpenLocalFileInput {
  sessionId: string
}

export interface DesktopBrowserSessionInput {
  sessionId: string
}

export type DesktopBrowserSetSurfaceInput = {
  bounds: DesktopBrowserBounds
  sessionId: string
  visible: true
} | {
  sessionId: string
  visible: false
}

export interface DesktopBrowserApi {
  close: (sessionId: string) => Promise<void>
  enablePersonalProfile: (sessionId: string) => Promise<DesktopBrowserState>
  ensureSession: (conversationId: string) => Promise<DesktopBrowserState>
  focusPage: (sessionId: string) => Promise<void>
  goBack: (sessionId: string) => Promise<void>
  goForward: (sessionId: string) => Promise<void>
  navigate: (sessionId: string, url: string) => Promise<DesktopBrowserState>
  onStateChanged: (listener: (state: DesktopBrowserState) => void) => () => void
  onToolbarFocusRequested: (
    listener: (request: DesktopBrowserToolbarFocusRequest) => void,
  ) => () => void
  openLocalFile: (sessionId: string) => Promise<DesktopBrowserState | null>
  reload: (sessionId: string) => Promise<void>
  resetPersonalProfile: (sessionId: string) => Promise<DesktopBrowserState>
  setSurface: (input: DesktopBrowserSetSurfaceInput) => Promise<void>
  stop: (sessionId: string) => Promise<void>
  takeControl: (sessionId: string) => Promise<DesktopBrowserState>
}

export interface DesktopUpdateCheckResult {
  currentVersion: string
  latestVersion: string
  releaseUrl: string
  status: 'up_to_date' | 'update_available'
}

export interface DesktopOpenTarget {
  conversationId: string
  runId: string
}

export interface DesktopWindowState {
  isAlwaysOnTop: boolean
  isMaximized: boolean
}

export interface DesktopAppInfo {
  chromiumVersion: string
  configPath: string
  electronVersion: string
  nodeVersion: string
  platform: DesktopPlatform
  version: string
}

export interface DesktopTaskPinnedItem {
  id: string
  kind: 'conversation' | 'space'
}

export const DESKTOP_CHAT_WELCOME_VARIANT_IDS = [
  'writing',
  'planning',
  'orchestrating',
  'listening',
] as const

export type DesktopChatWelcomeVariantId = typeof DESKTOP_CHAT_WELCOME_VARIANT_IDS[number]
export type DesktopChatWelcomePreference = 'random' | DesktopChatWelcomeVariantId

export interface LexoraConfig {
  desktop: {
    backgroundCloseNoticeShown: boolean
    taskSidebarPinnedItems: DesktopTaskPinnedItem[]
    developerToolsEnabled: boolean
    language: 'zh-CN' | 'en-US'
    launchAtLogin: boolean
    notificationsEnabled: boolean
    notifyWhenFocused: boolean
    sidebarCollapsed: boolean
    theme: 'system' | 'light' | 'dark'
    welcomeVariant: DesktopChatWelcomePreference
  }
  pet: {
    alwaysOnTop: boolean
    enabled: boolean
    rememberPosition: boolean
  }
}

export interface LexoraConfigPatch {
  desktop?: Partial<LexoraConfig['desktop']>
  pet?: Partial<LexoraConfig['pet']>
}

export interface LexoraDesktopApi {
  app: {
    checkForUpdates: () => Promise<DesktopUpdateCheckResult>
    getInfo: () => Promise<DesktopAppInfo>
    onOpenTarget: (listener: (target: DesktopOpenTarget) => void) => () => void
    openFeedbackIssue: (feedback: string) => Promise<void>
    openReleasePage: (url: string) => Promise<void>
  }
  browser: DesktopBrowserApi
  clipboard: {
    writeText: (text: string) => Promise<void>
  }
  commands: {
    execute: (commandId: DesktopCommandId) => Promise<void>
  }
  settings: {
    get: () => Promise<LexoraConfig>
    update: (patch: LexoraConfigPatch) => Promise<LexoraConfig>
  }
  window: {
    getState: () => Promise<DesktopWindowState>
    minimize: () => Promise<void>
    onStateChanged: (listener: (state: DesktopWindowState) => void) => () => void
    toggleAlwaysOnTop: () => Promise<DesktopWindowState>
    toggleMaximize: () => Promise<DesktopWindowState>
  }
  localChat: LocalChatApi
}
