import type { WebContents } from 'electron'
import type { z } from 'zod'
import type { ApplicationDiagnosticReporter } from '../../../shared/diagnostics/applicationDiagnostic'
import { readDiagnosticError } from '../../../shared/diagnostics/applicationDiagnostic'
import { processExitSchema } from '../../../shared/diagnostics/desktopStartupDiagnostic'

export function describeProcessExit(type: z.infer<typeof processExitSchema>['type'], details: { reason: string, exitCode: number }) {
  const reason = processExitSchema.shape.reason.safeParse(details.reason)
  return { type, reason: reason.success ? reason.data : 'unknown' as const, code: details.exitCode }
}

export function observeRendererDiagnostics(contents: WebContents, report: ApplicationDiagnosticReporter): void {
  contents.on('render-process-gone', (_event, details) => {
    const clean = details.reason === 'clean-exit'
    report({ level: clean ? 'info' : 'error', event: clean ? 'renderer.exited' : 'renderer.exited_abnormally', processExit: describeProcessExit('renderer', details) })
  })
  contents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
    if (isMainFrame)
      report({ level: code === -3 ? 'info' : 'error', event: 'renderer.load_failed', loadFailure: { stage: 'main_frame', code } })
  })
  contents.on('preload-error', (_event, _path, error) => {
    report({ level: 'error', event: 'renderer.preload_failed', loadFailure: { stage: 'preload' }, ...readDiagnosticError(error) })
  })
}
