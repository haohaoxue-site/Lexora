import type { z } from 'zod'
import { desktopBootstrapFailureSchema } from '../../../shared/diagnostics/desktopStartupDiagnostic'

type BootstrapFailure = z.infer<typeof desktopBootstrapFailureSchema>

export class DesktopBootstrapError extends Error {
  readonly code = 'DESKTOP_BOOTSTRAP_FAILED'
  readonly failure: BootstrapFailure

  constructor(failure: BootstrapFailure, cause: unknown) {
    super('Desktop environment initialization failed', { cause })
    this.name = 'DesktopBootstrapError'
    const systemCode = desktopBootstrapFailureSchema.shape.systemCode.safeParse(cause && typeof cause === 'object' && 'code' in cause ? cause.code : undefined)
    this.failure = { ...failure, ...(systemCode.success && systemCode.data ? { systemCode: systemCode.data } : {}) }
  }
}

export function bootstrapStep<T>(operation: BootstrapFailure['operation'], run: () => T, directoryRole?: BootstrapFailure['directoryRole']): T {
  try {
    return run()
  }
  catch (error) {
    throw new DesktopBootstrapError({ kind: 'desktop_bootstrap', operation, ...(directoryRole ? { directoryRole } : {}) }, error)
  }
}
