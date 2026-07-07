import type { BuddyTranslate } from '@/i18n/buddyI18n'
import type { BuddyRuntime, BuddyRuntimeDiagnostics, BuddyRuntimeSmokeStatus } from '@/lib/tauriRuntime'

export interface BuddyRuntimeDiagnosticRow {
  label: string
  value: string
}

const missingValueLabel = '-'

export function createRuntimeDiagnosticRows(
  diagnostics: BuddyRuntimeDiagnostics,
  runtime: BuddyRuntime,
  t: BuddyTranslate,
): ReadonlyArray<BuddyRuntimeDiagnosticRow> {
  if (runtime === 'codex') {
    return [
      {
        label: 'CODEX_HOME',
        value: diagnostics.codex.codexHome || missingValueLabel,
      },
      {
        label: t('diagnostics.appServerSmoke'),
        value: resolveSmokeStatusLabel(diagnostics.codex.appServerSmoke.status, diagnostics.codex.appServerSmoke.message, t),
      },
      {
        label: t('diagnostics.envPassedKeys'),
        value: formatKeyList(diagnostics.codex.subprocessEnv.passedKeys),
      },
      {
        label: t('diagnostics.envBlockedKeys'),
        value: formatKeyList(diagnostics.codex.subprocessEnv.blockedKeys),
      },
    ]
  }

  return [
    {
      label: t('diagnostics.memoryIsolation'),
      value: diagnostics.claude.status.memoryIsolationAvailable ? t('common.available') : t('common.unavailable'),
    },
    {
      label: t('diagnostics.envPassedKeys'),
      value: formatKeyList(diagnostics.claude.subprocessEnv.passedKeys),
    },
    {
      label: t('diagnostics.envBlockedKeys'),
      value: formatKeyList(diagnostics.claude.subprocessEnv.blockedKeys),
    },
  ]
}

function resolveSmokeStatusLabel(
  status: BuddyRuntimeSmokeStatus,
  message: string | null,
  t: BuddyTranslate,
) {
  if (status === 'passed')
    return t('diagnostics.smokePassed')

  if (status === 'skipped')
    return t('diagnostics.smokeSkipped')

  return message ? t('diagnostics.smokeFailedWithMessage', { message }) : t('diagnostics.smokeFailed')
}

function formatKeyList(keys: ReadonlyArray<string>) {
  return keys.length > 0 ? keys.join(', ') : missingValueLabel
}
