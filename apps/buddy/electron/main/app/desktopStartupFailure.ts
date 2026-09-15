import type { MessageBoxOptions } from 'electron'
import type { LexoraConfig } from '../../shared/desktopApi'
import type { BuddyRuntimePaths } from '../paths'
import { dirname } from 'node:path'
import { PowerShellUnavailableError } from '../../../platform/windows/powerShell'
import { PrivateDirectoryError } from '../../../platform/windows/privateDirectories'
import { readDiagnosticErrorCode } from '../../../shared/diagnostics/applicationDiagnostic'
import { translateDesktopNative } from '../desktopNativeI18n'
import { DesktopBootstrapError } from './desktopBootstrap'

export function resolveStartupFailureDirectory(error: unknown, paths: BuddyRuntimePaths): string | undefined {
  if (!(error instanceof PrivateDirectoryError) && !(error instanceof DesktopBootstrapError))
    return undefined
  switch (error.failure.directoryRole) {
    case 'lexora_home': return paths.lexoraHome
    case 'user_data': return paths.userData
    case 'session_data': return paths.sessionData
    case 'window_state': return dirname(paths.windowState)
    case 'crash_dumps': return paths.crashDumps
  }
}

export function describeDesktopStartupFailure(error: unknown, language: LexoraConfig['desktop']['language'], launchId?: string, directory?: string, logsAvailable = true): MessageBoxOptions {
  const code = readDiagnosticErrorCode(error)
  const unconfirmedPermissions = error instanceof PrivateDirectoryError && (error.failure.acl?.reason === 'unsupported_ace' || error.failure.acl?.principal === 'other')
  const reason = error instanceof PowerShellUnavailableError
    ? 'powerShellUnavailable'
    : unconfirmedPermissions
      ? 'privateDirectoriesUnconfirmed'
      : code === 'PRIVATE_DIRECTORIES_UNSAFE'
        ? 'privateDirectoriesUnsafe'
        : code.startsWith('PRIVATE_DIRECTORIES_')
          ? 'privateDirectoriesFailed'
          : 'startupFailureHelp'
  return {
    type: 'error',
    title: 'Lexora Buddy',
    message: translateDesktopNative(language, 'startupFailed'),
    detail: [
      translateDesktopNative(language, reason === 'startupFailureHelp' && !logsAvailable ? 'startupLogsUnavailable' : reason),
      ...(!logsAvailable && reason !== 'startupFailureHelp' ? [translateDesktopNative(language, 'startupLogsUnavailable')] : []),
      ...(error instanceof DesktopBootstrapError ? [`${translateDesktopNative(language, 'startupFailureStage')}: ${error.failure.operation}${error.failure.directoryRole ? ` / ${error.failure.directoryRole}` : ''}${error.failure.systemCode ? ` / ${error.failure.systemCode}` : ''}`] : []),
      ...(directory ? [`${translateDesktopNative(language, 'affectedDirectory')}: ${directory}`] : []),
      translateDesktopNative(language, 'startupRecoveryHelp'),
      code,
      ...(launchId ? [`${translateDesktopNative(language, 'diagnosticReference')}: ${launchId}`] : []),
    ].join('\n\n'),
    buttons: [
      translateDesktopNative(language, 'retryStartup'),
      translateDesktopNative(language, 'openLogs'),
      ...(directory ? [translateDesktopNative(language, 'openAffectedDirectory')] : []),
      translateDesktopNative(language, 'quit'),
    ],
    defaultId: 0,
    cancelId: directory ? 3 : 2,
    noLink: true,
  }
}
