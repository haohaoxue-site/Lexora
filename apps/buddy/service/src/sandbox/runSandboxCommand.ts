import type { SandboxNetworkTarget, SandboxProcessInput, SandboxResult } from '../../../shared/permissions/shellSandbox'
import type { SandboxExecutionOptions } from './sandboxExecutionLifecycle'
import { Buffer } from 'node:buffer'
import { sandboxNetworkTargetSchema, ShellSandboxError } from '../../../shared/permissions/shellSandbox'
import { runLinuxSandbox } from './runLinuxSandbox'
import { runWindowsSandbox } from './runWindowsSandbox'
import { SandboxExecutionLifecycle } from './sandboxExecutionLifecycle'

export async function runSandboxCommand(input: SandboxProcessInput, options: Omit<SandboxExecutionOptions, 'onStarted'>): Promise<SandboxResult> {
  const lifecycle = new SandboxExecutionLifecycle(options.signal, input.timeout)
  const decisions = new Map<string, Promise<boolean>>()
  const requestNetwork = async (target: SandboxNetworkTarget) => {
    const parsed = sandboxNetworkTargetSchema.safeParse(target)
    if (!parsed.success || lifecycle.signal.aborted)
      return false
    const key = `${parsed.data.host.toLowerCase()}:${parsed.data.port}`
    let decision = decisions.get(key)
    if (!decision) {
      decision = lifecycle.approve(() => options.approveNetwork(parsed.data)).catch(() => false)
      decisions.set(key, decision)
    }
    return decision
  }
  try {
    lifecycle.signal.throwIfAborted()
    const execution: SandboxExecutionOptions = {
      ...options,
      signal: lifecycle.signal,
      approveNetwork: requestNetwork,
      onStarted: () => {
        if (!lifecycle.signal.aborted)
          lifecycle.start()
      },
    }
    const exitCode = input.backend.kind === 'windows-lpac'
      ? await runWindowsSandbox({ ...input, backend: input.backend }, execution)
      : await runLinuxSandbox({ ...input, backend: input.backend }, execution)
    if (lifecycle.signal.aborted)
      return { ok: false, code: lifecycle.timedOut ? 'SANDBOX_TIMEOUT' : 'SANDBOX_CANCELLED' }
    if (exitCode !== 0) {
      options.onData(Buffer.from('\n[Execution boundary] This command ran in a sandbox; a nonzero exit does not necessarily mean isolation blocked it. Additional directories require lexora_authorize_directory; host execution requires lexora_host_shell and separate approval. Do not retry a declined request.\n'))
    }
    return { ok: true, exitCode }
  }
  catch (error) {
    return {
      ok: false,
      code: lifecycle.signal.aborted
        ? lifecycle.timedOut ? 'SANDBOX_TIMEOUT' : 'SANDBOX_CANCELLED'
        : error instanceof ShellSandboxError ? error.code : lifecycle.started ? 'SANDBOX_FAILED' : 'SANDBOX_UNAVAILABLE',
    }
  }
  finally {
    lifecycle.finish()
  }
}
