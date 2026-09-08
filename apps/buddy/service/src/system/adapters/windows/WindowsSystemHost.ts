import type { NativeCommandResult } from '../../../../../platform/nativeCommand'
import type { SystemActionKind, SystemHostPort, SystemTarget, SystemTargetSelector } from '../../systemCapability'
import process from 'node:process'
import { runNativeProcessControl } from '../../../../../platform/processControl'
import { runWindowsServiceControl } from '../../../../../platform/windows/serviceControl'
import { SystemCapabilityError } from '../../systemCapability'

import { systemTargetsSchema } from '../systemTargetSchema'

type WindowsSystemCommand = (input: {
  operation: 'resolve' | 'read' | 'execute'
  target: SystemTarget | SystemTargetSelector
  action?: SystemActionKind
  protectedPids: number[]
}, signal: AbortSignal) => Promise<NativeCommandResult>

export class WindowsSystemHost implements SystemHostPort {
  readonly #run: WindowsSystemCommand

  constructor(run: WindowsSystemCommand = runSystemCommand) {
    this.#run = run
  }

  resolveTargets(target: SystemTargetSelector, signal: AbortSignal): Promise<SystemTarget[]> {
    return this.#request('resolve', target, signal)
  }

  async readTarget(target: SystemTarget, signal: AbortSignal): Promise<SystemTarget | null> {
    const targets = await this.#request('read', target, signal)
    if (targets.length > 1)
      throw new SystemCapabilityError('SYSTEM_TARGET_AMBIGUOUS')
    return targets[0] ?? null
  }

  async execute(target: SystemTarget, action: SystemActionKind, signal: AbortSignal): Promise<void> {
    if (!target.allowedActions.includes(action))
      throw new SystemCapabilityError('SYSTEM_ACTION_NOT_ALLOWED')
    await this.#request('execute', target, signal, action)
  }

  async #request(operation: 'resolve' | 'read' | 'execute', target: SystemTarget | SystemTargetSelector, signal: AbortSignal, action?: SystemActionKind): Promise<SystemTarget[]> {
    signal.throwIfAborted()
    if (target.kind === 'service' && target.scope !== 'system')
      throw new SystemCapabilityError('SYSTEM_ACTION_INVALID')
    const result = await this.#run({ operation, target, action, protectedPids: [process.pid, process.ppid] }, signal)
    signal.throwIfAborted()
    if (result.code !== 0) {
      const code = result.stderr.trim()
      if (code === 'SYSTEM_TARGET_CHANGED' || code === 'SYSTEM_ACTION_NOT_ALLOWED' || code === 'SYSTEM_ACTION_INVALID' || code === 'SYSTEM_ACCESS_DENIED')
        throw new SystemCapabilityError(code)
      throw new Error('Windows system operation failed')
    }
    return systemTargetsSchema.parse(JSON.parse(result.stdout.toString('utf8')))
  }
}

function runSystemCommand(input: Parameters<WindowsSystemCommand>[0], signal: AbortSignal): Promise<NativeCommandResult> {
  if (input.target.kind === 'process') {
    const { target, operation, protectedPids } = input
    if (operation === 'resolve') {
      const selector = 'pid' in target ? { pid: target.pid } : { name: target.name }
      return runNativeProcessControl({ operation, selector, protectedPids }, signal)
    }
    if (!('pid' in target))
      throw new SystemCapabilityError('SYSTEM_ACTION_INVALID')
    if (operation === 'read')
      return runNativeProcessControl({ operation, pid: target.pid, protectedPids }, signal)
    if (!('instanceId' in target) || !target.executable || (input.action !== 'kill-process' && input.action !== 'terminate-process'))
      throw new SystemCapabilityError('SYSTEM_ACTION_INVALID')
    return runNativeProcessControl({ operation, pid: target.pid, instanceId: target.instanceId, executable: target.executable, action: input.action, protectedPids }, signal)
  }
  if (input.action && input.action !== 'start-service' && input.action !== 'stop-service' && input.action !== 'restart-service')
    throw new SystemCapabilityError('SYSTEM_ACTION_INVALID')
  return runWindowsServiceControl({
    operation: input.operation,
    serviceId: input.target.serviceId,
    action: input.action,
  }, signal)
}
