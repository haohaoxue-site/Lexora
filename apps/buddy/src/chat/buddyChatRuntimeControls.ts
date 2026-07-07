import type {
  BuddyAppSettings,
  BuddyClaudeRuntimeStatus,
  BuddyCodexRuntimeStatus,
  BuddyRuntime,
} from '@/lib/tauriRuntime'

export type BuddyChatRuntimeDisabledReason = 'control-disabled' | 'runtime-unavailable'

export interface BuddyChatRuntimeOption {
  runtime: BuddyRuntime
  disabledReason: BuddyChatRuntimeDisabledReason | null
  isSelectable: boolean
  label: string
}

export function createBuddyChatRuntimeOptions(options: {
  appSettings: BuddyAppSettings
  claudeStatus: BuddyClaudeRuntimeStatus
  codexStatus: BuddyCodexRuntimeStatus
}): ReadonlyArray<BuddyChatRuntimeOption> {
  return [
    createRuntimeOption({
      runtime: 'codex',
      controlEnabled: options.appSettings.runtimeDialogVisibility.codex,
      label: 'Codex',
      runtimeReady: isCodexRuntimeReady(options.codexStatus),
    }),
    createRuntimeOption({
      runtime: 'claude',
      controlEnabled: options.appSettings.runtimeDialogVisibility.claude,
      label: 'Claude',
      runtimeReady: isClaudeRuntimeReady(options.claudeStatus),
    }),
  ]
}

export function resolveSelectableBuddyChatRuntime(
  currentRuntime: BuddyRuntime,
  options: ReadonlyArray<BuddyChatRuntimeOption>,
): BuddyRuntime {
  if (options.some(option => option.runtime === currentRuntime && option.isSelectable))
    return currentRuntime

  return options.find(option => option.isSelectable)?.runtime
    ?? options.find(option => option.disabledReason === 'runtime-unavailable')?.runtime
    ?? options.find(option => option.runtime === currentRuntime)?.runtime
    ?? 'codex'
}

function createRuntimeOption(options: {
  runtime: BuddyRuntime
  controlEnabled: boolean
  label: string
  runtimeReady: boolean
}): BuddyChatRuntimeOption {
  const disabledReason = resolveDisabledReason(options)
  return {
    runtime: options.runtime,
    disabledReason,
    isSelectable: disabledReason === null,
    label: options.label,
  }
}

function resolveDisabledReason(options: {
  controlEnabled: boolean
  runtimeReady: boolean
}): BuddyChatRuntimeDisabledReason | null {
  if (!options.controlEnabled)
    return 'control-disabled'

  if (!options.runtimeReady)
    return 'runtime-unavailable'

  return null
}

function isCodexRuntimeReady(status: BuddyCodexRuntimeStatus) {
  return status.cliAvailable && status.activeProtocol !== 'unavailable'
}

function isClaudeRuntimeReady(status: BuddyClaudeRuntimeStatus) {
  return status.cliAvailable
    && status.executionEnabled
    && status.loginStatus === 'logged_in'
}
