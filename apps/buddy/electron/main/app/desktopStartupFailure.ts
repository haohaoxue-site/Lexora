import type { MessageBoxOptions } from 'electron'
import type { LexoraConfig } from '../../shared/desktopApi'
import { PowerShellUnavailableError } from '../../../platform/windows/powerShell'
import { readDiagnosticErrorCode } from '../../../shared/diagnostics/applicationDiagnostic'
import { translateDesktopNative } from '../desktopNativeI18n'

export function describeDesktopStartupFailure(error: unknown, language: LexoraConfig['desktop']['language'], launchId?: string): MessageBoxOptions {
  const code = readDiagnosticErrorCode(error)
  const reason = error instanceof PowerShellUnavailableError
    ? 'powerShellUnavailable'
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
      translateDesktopNative(language, reason),
      code,
      ...(launchId ? [`${translateDesktopNative(language, 'diagnosticReference')}: ${launchId}`] : []),
    ].join('\n\n'),
    buttons: [translateDesktopNative(language, 'quit'), translateDesktopNative(language, 'openLogs')],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  }
}
