import type { ProcessControlRequest } from '../../../../platform/process/processControl'
import type { ProcessSystemTarget, SystemActionKind, SystemTargetSelector } from '../systemCapability'
import process from 'node:process'
import { runNativeProcessControl } from '../../../../platform/process/processControl'
import { SystemCapabilityError } from '../systemCapability'
import { processTargetSchema } from './systemTargetSchema'

export class NativeProcessHost {
  resolveTargets(target: Extract<SystemTargetSelector, { kind: 'process' }>, signal: AbortSignal): Promise<ProcessSystemTarget[]> {
    return request({ operation: 'resolve', selector: 'pid' in target ? { pid: target.pid } : { name: target.name }, protectedPids: protectedPids() }, signal)
  }

  async readTarget(target: ProcessSystemTarget, signal: AbortSignal): Promise<ProcessSystemTarget | null> {
    const targets = await request({ operation: 'read', pid: target.pid, protectedPids: protectedPids() }, signal)
    if (targets.length > 1)
      throw new SystemCapabilityError('SYSTEM_TARGET_AMBIGUOUS')
    return targets[0] ?? null
  }

  async execute(target: ProcessSystemTarget, action: SystemActionKind, signal: AbortSignal): Promise<void> {
    if (!target.allowedActions.includes(action) || !target.executable || (action !== 'terminate-process' && action !== 'kill-process'))
      throw new SystemCapabilityError('SYSTEM_ACTION_NOT_ALLOWED')
    await request({ operation: 'execute', pid: target.pid, instanceId: target.instanceId, executable: target.executable, action, protectedPids: protectedPids() }, signal)
  }
}

function protectedPids(): number[] {
  return [process.pid, process.ppid].filter(pid => pid > 0)
}

async function request(input: ProcessControlRequest, signal: AbortSignal): Promise<ProcessSystemTarget[]> {
  const result = await runNativeProcessControl(input, signal)
  signal.throwIfAborted()
  if (result.code !== 0) {
    const code = result.stderr.trim()
    if (code === 'SYSTEM_TARGET_CHANGED' || code === 'SYSTEM_ACTION_NOT_ALLOWED' || code === 'SYSTEM_ACTION_INVALID')
      throw new SystemCapabilityError(code)
    throw new Error('Native process operation failed')
  }
  return processTargetSchema.array().max(4096).parse(JSON.parse(result.stdout.toString('utf8')))
}
