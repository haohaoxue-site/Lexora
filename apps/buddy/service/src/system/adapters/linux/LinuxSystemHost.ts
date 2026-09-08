import type {
  ServiceSystemTarget,
  SystemActionKind,
  SystemHostPort,
  SystemTarget,
  SystemTargetSelector,
} from '../../systemCapability'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import process from 'node:process'

import { SystemCapabilityError } from '../../systemCapability'
import { NativeProcessHost } from '../NativeProcessHost'

const MAX_COMMAND_OUTPUT_BYTES = 2 * 1024 * 1024
const COMMAND_TIMEOUT_MS = 8_000
const SYSTEMCTL_PATH = '/usr/bin/systemctl'

interface CommandResult {
  exitCode: number | null
  stdout: string
}

interface ParsedSystemdUnit {
  activeState: string
  description: string
  subState: string
  systemdUnit: string
  unit: string
}

export interface LinuxSystemHostOptions {
  runCommand?: (
    executable: string,
    args: readonly string[],
    signal: AbortSignal,
  ) => Promise<CommandResult>
}

export class LinuxSystemHost implements SystemHostPort {
  readonly #processes = new NativeProcessHost()
  readonly #runCommand: NonNullable<LinuxSystemHostOptions['runCommand']>

  constructor(options: LinuxSystemHostOptions = {}) {
    this.#runCommand = options.runCommand ?? runCommand
  }

  async resolveTargets(
    selector: SystemTargetSelector,
    signal: AbortSignal,
  ): Promise<readonly SystemTarget[]> {
    signal.throwIfAborted()
    if (selector.kind === 'service' && (selector.scope !== 'user' || !selector.serviceId.endsWith('.service')))
      throw new SystemCapabilityError('SYSTEM_ACTION_INVALID')
    return selector.kind === 'process'
      ? this.#processes.resolveTargets(selector, signal)
      : this.#resolveServices(selector.serviceId, signal)
  }

  async readTarget(target: SystemTarget, signal: AbortSignal): Promise<SystemTarget | null> {
    signal.throwIfAborted()
    if (target.kind === 'process')
      return this.#processes.readTarget(target, signal)
    return this.#readServiceTarget(target, signal)
  }

  async execute(
    target: SystemTarget,
    action: SystemActionKind,
    signal: AbortSignal,
  ): Promise<void> {
    signal.throwIfAborted()
    if (!target.allowedActions.includes(action))
      throw new SystemCapabilityError('SYSTEM_ACTION_NOT_ALLOWED')
    if (target.kind === 'process')
      return this.#processes.execute(target, action, signal)
    if (!isServiceAction(action))
      throw new SystemCapabilityError('SYSTEM_ACTION_NOT_ALLOWED')
    const result = await this.#runCommand(
      SYSTEMCTL_PATH,
      ['--user', action.replace('-service', ''), '--', target.serviceId],
      signal,
    )
    if (result.exitCode !== 0)
      throw new SystemCapabilityError('SYSTEM_ACTION_INVALID')
  }

  async #resolveServices(
    unit: string,
    signal: AbortSignal,
  ): Promise<readonly ServiceSystemTarget[]> {
    const result = await this.#runCommand(SYSTEMCTL_PATH, [
      '--user',
      'list-units',
      '--type=service',
      '--all',
      '--no-legend',
      '--plain',
      '--no-pager',
    ], signal)
    if (result.exitCode !== 0)
      throw new Error('user service target resolution failed')
    const loadedTargets = parseSystemctlListUnits(result.stdout)
      .filter(service => service.systemdUnit === unit || service.unit === unit)
      .map(service => this.#toServiceTarget(service))
    if (loadedTargets.length)
      return loadedTargets

    const exact = await this.#runCommand(SYSTEMCTL_PATH, [
      '--user',
      'show',
      '--property=Id,LoadState,ActiveState,Description',
      '--no-pager',
      '--',
      unit,
    ], signal)
    if (exact.exitCode !== 0)
      return []
    const values = parseSystemctlShow(exact.stdout)
    if (!values.Id || values.LoadState === 'not-found')
      return []
    return [this.#toServiceTarget({
      activeState: values.ActiveState ?? 'unknown',
      description: values.Description ?? '',
      subState: 'unknown',
      systemdUnit: values.Id,
      unit: decodeSystemdEscapes(values.Id),
    })]
  }

  async #readServiceTarget(
    target: ServiceSystemTarget,
    signal: AbortSignal,
  ): Promise<ServiceSystemTarget | null> {
    const result = await this.#runCommand(SYSTEMCTL_PATH, [
      '--user',
      'show',
      '--property=Id,LoadState,ActiveState',
      '--no-pager',
      '--',
      target.serviceId,
    ], signal)
    if (result.exitCode !== 0)
      return null
    const values = parseSystemctlShow(result.stdout)
    if (values.Id !== target.serviceId || values.LoadState === 'not-found')
      return null
    return {
      ...target,
      activeState: values.ActiveState ?? 'unknown',
    }
  }

  #toServiceTarget(service: ParsedSystemdUnit): ServiceSystemTarget {
    return {
      activeState: service.activeState,
      allowedActions: isProtectedService(service.unit)
        ? []
        : ['start-service', 'stop-service', 'restart-service'],
      displayName: service.description || service.unit,
      displayId: service.unit,
      interruption: serviceInterruption(service.unit),
      kind: 'service',
      scope: 'user',
      serviceId: service.systemdUnit,
    }
  }
}

export function parseSystemctlListUnits(value: string): ParsedSystemdUnit[] {
  return value.split('\n').flatMap((line) => {
    const [systemdUnit, , activeState, subState, ...description] = line.trim().split(/\s+/)
    if (!systemdUnit || !activeState || !subState)
      return []
    return [{
      activeState,
      description: description.join(' '),
      subState,
      systemdUnit,
      unit: decodeSystemdEscapes(systemdUnit),
    }]
  })
}

function decodeSystemdEscapes(value: string): string {
  return value.replaceAll(/\\x([0-9a-f]{2})/gi, (_match, hexadecimal: string) => (
    String.fromCodePoint(Number.parseInt(hexadecimal, 16))
  ))
}

function serviceInterruption(unit: string): ServiceSystemTarget['interruption'] {
  if (/clash|mihomo|proxy|vpn|network/i.test(unit))
    return 'network'
  return unit.startsWith('app-') ? 'application' : 'service'
}

function parseSystemctlShow(value: string): Record<string, string> {
  return Object.fromEntries(value.split('\n').flatMap((line) => {
    const separator = line.indexOf('=')
    return separator > 0 ? [[line.slice(0, separator), line.slice(separator + 1)]] : []
  }))
}

function isServiceAction(action: SystemActionKind): boolean {
  return action === 'restart-service' || action === 'start-service' || action === 'stop-service'
}

function isProtectedService(unit: string): boolean {
  return /lexora[-_.]?buddy/i.test(unit)
}

function runCommand(
  executable: string,
  args: readonly string[],
  signal: AbortSignal,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...args], {
      env: process.env,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const chunks: Buffer[] = []
    let bytes = 0
    let settled = false
    const timeout = setTimeout(() => child.kill('SIGKILL'), COMMAND_TIMEOUT_MS)
    timeout.unref()
    const abort = () => child.kill('SIGTERM')
    const finish = (operation: () => void) => {
      if (settled)
        return
      settled = true
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
      operation()
    }
    child.stdout.on('data', (chunk: Buffer) => {
      if (bytes >= MAX_COMMAND_OUTPUT_BYTES)
        return
      const remaining = MAX_COMMAND_OUTPUT_BYTES - bytes
      const bounded = chunk.subarray(0, remaining)
      chunks.push(bounded)
      bytes += bounded.length
    })
    child.once('error', error => finish(() => reject(error)))
    child.once('close', exitCode => finish(() => {
      if (signal.aborted) {
        reject(signal.reason ?? new Error('aborted'))
        return
      }
      resolve({ exitCode, stdout: Buffer.concat(chunks).toString('utf8') })
    }))
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted)
      abort()
  })
}
