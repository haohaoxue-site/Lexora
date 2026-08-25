import type {
  ProcessSystemTarget,
  ServiceSystemTarget,
  SystemActionKind,
  SystemHostPort,
  SystemTarget,
  SystemTargetSelector,
} from './systemCapability'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { readdir, readFile, readlink } from 'node:fs/promises'
import { uptime as systemUptime } from 'node:os'
import { basename } from 'node:path'
import process from 'node:process'

import { SystemCapabilityError } from './systemCapability'

const MAX_PROCESS_CANDIDATES = 4_096
const PROCESS_READ_CONCURRENCY = 64
const MAX_COMMAND_OUTPUT_BYTES = 2 * 1024 * 1024
const COMMAND_TIMEOUT_MS = 8_000
const PROCESS_EXIT_WAIT_MS = 2_000
const PROCESS_POLL_MS = 100
const SYSTEMCTL_PATH = '/usr/bin/systemctl'

type ProcessState = 'running' | 'sleeping' | 'stopped' | 'zombie' | 'unknown'

interface ProcProcess {
  commandName: string
  executable: string | null
  parentPid: number | null
  pid: number
  startTicks: string
  startedAt: string
  uid: number | null
}

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
  now?: () => number
  platform?: NodeJS.Platform
  runCommand?: (
    executable: string,
    args: readonly string[],
    signal: AbortSignal,
  ) => Promise<CommandResult>
}

export class LinuxSystemHost implements SystemHostPort {
  readonly #now: () => number
  readonly #platform: NodeJS.Platform
  readonly #runCommand: NonNullable<LinuxSystemHostOptions['runCommand']>

  constructor(options: LinuxSystemHostOptions = {}) {
    this.#now = options.now ?? Date.now
    this.#platform = options.platform ?? process.platform
    this.#runCommand = options.runCommand ?? runCommand
  }

  async resolveTargets(
    selector: SystemTargetSelector,
    signal: AbortSignal,
  ): Promise<readonly SystemTarget[]> {
    if (this.#platform !== 'linux')
      return []
    signal.throwIfAborted()
    return selector.kind === 'process'
      ? this.#resolveProcesses(selector, signal)
      : this.#resolveServices(selector.unit, signal)
  }

  async readTarget(target: SystemTarget, signal: AbortSignal): Promise<SystemTarget | null> {
    if (this.#platform !== 'linux')
      return null
    signal.throwIfAborted()
    if (target.kind === 'process') {
      const current = await readProcess(target.pid, this.#now).catch(() => null)
      if (!current)
        return null
      return {
        ...target,
        displayName: current.commandName,
        executable: current.executable,
        startedAt: current.startedAt,
        startTicks: current.startTicks,
      }
    }
    return this.#readServiceTarget(target, signal)
  }

  async execute(
    target: SystemTarget,
    action: SystemActionKind,
    signal: AbortSignal,
  ): Promise<void> {
    if (this.#platform !== 'linux')
      throw new SystemCapabilityError('SYSTEM_ACTION_NOT_ALLOWED')
    signal.throwIfAborted()
    if (!target.allowedActions.includes(action))
      throw new SystemCapabilityError('SYSTEM_ACTION_NOT_ALLOWED')
    if (target.kind === 'process') {
      if (action !== 'terminate-process' && action !== 'kill-process')
        throw new SystemCapabilityError('SYSTEM_ACTION_NOT_ALLOWED')
      try {
        process.kill(target.pid, action === 'terminate-process' ? 'SIGTERM' : 'SIGKILL')
      }
      catch (error) {
        if (!isMissingProcessError(error))
          throw error
      }
      await waitForProcessIdentityChange(target, signal)
      return
    }
    if (!isServiceAction(action))
      throw new SystemCapabilityError('SYSTEM_ACTION_NOT_ALLOWED')
    const result = await this.#runCommand(
      SYSTEMCTL_PATH,
      ['--user', action.replace('-service', ''), '--', target.unit],
      signal,
    )
    if (result.exitCode !== 0)
      throw new SystemCapabilityError('SYSTEM_ACTION_INVALID')
  }

  async #resolveProcesses(
    selector: Extract<SystemTargetSelector, { kind: 'process' }>,
    signal: AbortSignal,
  ): Promise<readonly ProcessSystemTarget[]> {
    const protectedIds = await readProtectedProcessIds(this.#now, signal)
    if ('pid' in selector) {
      const target = await readProcess(selector.pid, this.#now).catch(() => null)
      return target ? [this.#toProcessTarget(target, protectedIds)] : []
    }
    const entries = await readdir('/proc', { withFileTypes: true })
    const pids = entries
      .filter(entry => entry.isDirectory() && /^\d+$/.test(entry.name))
      .map(entry => Number.parseInt(entry.name, 10))
      .filter(Number.isSafeInteger)
      .slice(0, MAX_PROCESS_CANDIDATES)
    const processes = await readProcesses(pids, this.#now, signal)
    return processes
      .filter(item => matchesProcessSelector(item, selector))
      .map(item => this.#toProcessTarget(item, protectedIds))
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
      target.unit,
    ], signal)
    if (result.exitCode !== 0)
      return null
    const values = parseSystemctlShow(result.stdout)
    if (values.Id !== target.unit || values.LoadState === 'not-found')
      return null
    return {
      ...target,
      activeState: values.ActiveState ?? 'unknown',
    }
  }

  #toProcessTarget(
    item: ProcProcess,
    protectedIds: ReadonlySet<number>,
  ): ProcessSystemTarget {
    const ownUid = process.getuid?.() ?? null
    const mutable = item.uid !== null
      && ownUid !== null
      && item.uid === ownUid
      && item.pid > 1
      && !protectedIds.has(item.pid)
    return {
      allowedActions: mutable ? ['terminate-process', 'kill-process'] : [],
      displayName: item.commandName,
      executable: item.executable,
      interruption: processInterruption(item),
      kind: 'process',
      pid: item.pid,
      startedAt: item.startedAt,
      startTicks: item.startTicks,
    }
  }

  #toServiceTarget(service: ParsedSystemdUnit): ServiceSystemTarget {
    return {
      activeState: service.activeState,
      allowedActions: isProtectedService(service.unit)
        ? []
        : ['start-service', 'stop-service', 'restart-service'],
      displayName: service.description || service.unit,
      displayUnit: service.unit,
      interruption: serviceInterruption(service.unit),
      kind: 'service',
      scope: 'user',
      unit: service.systemdUnit,
    }
  }
}

export interface ParsedProcStat {
  parentPid: number | null
  startTicks: string
  state: ProcessState
}

export function parseProcStat(value: string): ParsedProcStat | null {
  const close = value.lastIndexOf(')')
  if (close < 0)
    return null
  const fields = value.slice(close + 1).trim().split(/\s+/)
  const startTicks = fields[19]
  if (!startTicks || !/^\d+$/.test(startTicks))
    return null
  const parentPid = Number.parseInt(fields[1] ?? '', 10)
  return {
    parentPid: Number.isSafeInteger(parentPid) && parentPid >= 0 ? parentPid : null,
    startTicks,
    state: processState(fields[0]),
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

export function matchesProcessSelector(
  processIdentity: Pick<ProcProcess, 'commandName' | 'executable' | 'pid'>,
  selector: Extract<SystemTargetSelector, { kind: 'process' }>,
): boolean {
  if ('pid' in selector)
    return processIdentity.pid === selector.pid
  const expected = selector.name.trim().toLocaleLowerCase()
  if (!expected)
    return false
  return processIdentity.commandName.toLocaleLowerCase() === expected
    || (processIdentity.executable !== null
      && basename(processIdentity.executable).toLocaleLowerCase() === expected)
}

async function readProcess(pid: number, now: () => number): Promise<ProcProcess | null> {
  const root = `/proc/${pid}`
  const [statText, statusText, commText, executable] = await Promise.all([
    readFile(`${root}/stat`, 'utf8'),
    readFile(`${root}/status`, 'utf8'),
    readFile(`${root}/comm`, 'utf8'),
    readlink(`${root}/exe`).catch(() => null),
  ])
  const stat = parseProcStat(statText)
  if (!stat)
    return null
  return {
    commandName: sanitizeDisplayName(commText.trim()),
    executable,
    parentPid: stat.parentPid,
    pid,
    startTicks: stat.startTicks,
    startedAt: processStartedAt(stat.startTicks, now()),
    uid: readStatusNumber(statusText, 'Uid'),
  }
}

async function readProcesses(
  pids: readonly number[],
  now: () => number,
  signal: AbortSignal,
): Promise<ProcProcess[]> {
  const processes: ProcProcess[] = []
  let cursor = 0
  const worker = async () => {
    while (cursor < pids.length) {
      signal.throwIfAborted()
      const pid = pids[cursor]
      cursor += 1
      if (pid === undefined)
        continue
      const item = await readProcess(pid, now).catch(() => null)
      if (item)
        processes.push(item)
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(PROCESS_READ_CONCURRENCY, pids.length) },
    worker,
  ))
  signal.throwIfAborted()
  return processes
}

function readStatusNumber(value: string, key: string): number | null {
  const match = value.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'))
  if (!match)
    return null
  const result = Number.parseInt(match[1]!, 10)
  return Number.isSafeInteger(result) ? result : null
}

function processState(value: string | undefined): ProcessState {
  switch (value) {
    case 'R': return 'running'
    case 'S':
    case 'D':
    case 'I': return 'sleeping'
    case 'T':
    case 't': return 'stopped'
    case 'Z': return 'zombie'
    default: return 'unknown'
  }
}

function processStartedAt(startTicks: string, now: number): string {
  const ticks = Number.parseInt(startTicks, 10)
  const startedAt = now - systemUptime() * 1_000 + ticks * 10
  return new Date(Math.min(now, Math.max(0, startedAt))).toISOString()
}

async function readProtectedProcessIds(
  now: () => number,
  signal: AbortSignal,
): Promise<Set<number>> {
  const protectedIds = new Set<number>()
  let current: number | null = process.pid
  while (current && !protectedIds.has(current) && protectedIds.size < 64) {
    signal.throwIfAborted()
    protectedIds.add(current)
    current = (await readProcess(current, now).catch(() => null))?.parentPid ?? null
  }
  protectedIds.add(process.ppid)
  return protectedIds
}

function decodeSystemdEscapes(value: string): string {
  return value.replaceAll(/\\x([0-9a-f]{2})/gi, (_match, hexadecimal: string) => (
    String.fromCodePoint(Number.parseInt(hexadecimal, 16))
  ))
}

function processInterruption(processIdentity: Pick<ProcProcess, 'commandName' | 'executable'>): ProcessSystemTarget['interruption'] {
  const identity = [processIdentity.commandName, processIdentity.executable]
    .filter(Boolean)
    .join(' ')
  if (/clash|mihomo|proxy|vpn/i.test(identity))
    return 'network'
  return processIdentity.executable?.startsWith('/opt/') ? 'application' : 'none'
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

function isMissingProcessError(error: unknown): boolean {
  return error instanceof Error
    && 'code' in error
    && error.code === 'ESRCH'
}

function isProtectedService(unit: string): boolean {
  return /lexora[-_.]?buddy/i.test(unit)
}

function sanitizeDisplayName(value: string): string {
  const sanitized = [...value].map((character) => {
    const code = character.codePointAt(0) ?? 0
    return code < 32 || code === 127 ? ' ' : character
  }).join('')
  return basename(sanitized).slice(0, 256) || 'unknown'
}

async function waitForProcessIdentityChange(
  target: ProcessSystemTarget,
  signal: AbortSignal,
): Promise<void> {
  const deadline = Date.now() + PROCESS_EXIT_WAIT_MS
  while (Date.now() < deadline) {
    signal.throwIfAborted()
    const current = await readProcess(target.pid, Date.now).catch(() => null)
    if (!current
      || current.startTicks !== target.startTicks
      || current.executable !== target.executable) {
      return
    }
    await abortableDelay(PROCESS_POLL_MS, signal)
  }
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(finish, milliseconds)
    const abort = () => finish(signal.reason ?? new Error('aborted'))
    function finish(error?: unknown) {
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
      error ? reject(error) : resolve()
    }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted)
      abort()
  })
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
