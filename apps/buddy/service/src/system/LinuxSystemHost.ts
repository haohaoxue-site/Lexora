import type {
  HostApplicationObservation,
  HostListenerObservation,
  HostProcessObservation,
  HostServiceObservation,
  ProcessSystemTarget,
  ServiceSystemTarget,
  SystemActionKind,
  SystemHostInspection,
  SystemHostPort,
  SystemInspectionRequest,
  SystemInspectionSection,
  SystemProbeDiagnostic,
  SystemTarget,
} from './systemCapability'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { readdir, readFile, readlink } from 'node:fs/promises'
import { uptime as systemUptime } from 'node:os'
import { basename } from 'node:path'
import process from 'node:process'

import { redactSensitiveText } from '../../../shared/approvalReviewPayload'
import { SystemCapabilityError } from './systemCapability'

const MAX_PROCESS_CANDIDATES = 4_096
const MAX_PROCESS_RESULTS = 40
const PROCESS_READ_CONCURRENCY = 64
const MAX_SERVICE_RESULTS = 40
const MAX_LISTENER_RESULTS = 80
const MAX_COMMAND_OUTPUT_BYTES = 2 * 1024 * 1024
const COMMAND_TIMEOUT_MS = 8_000
const PROCESS_EXIT_WAIT_MS = 2_000
const PROCESS_POLL_MS = 100
const SYSTEMCTL_PATH = '/usr/bin/systemctl'
const SS_PATH = '/usr/bin/ss'

interface ProcProcess {
  commandName: string
  commandSummary: string | null
  executable: string | null
  memoryRssBytes: number | null
  parentPid: number | null
  pid: number
  serviceUnit: string | null
  startTicks: string
  startedAt: string
  state: HostProcessObservation['state']
  uid: number | null
}

interface CommandResult {
  exitCode: number | null
  stdout: string
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

  async inspect(
    input: SystemInspectionRequest,
    signal: AbortSignal,
  ): Promise<SystemHostInspection> {
    if (this.#platform !== 'linux')
      return unsupportedInspection(input)
    signal.throwIfAborted()
    const include = new Set<SystemInspectionSection>(input.include ?? [
      'applications',
      'listeners',
      'processes',
      'services',
    ])
    const diagnostics: SystemProbeDiagnostic[] = []
    const processResult = include.has('processes') || include.has('applications') || include.has('listeners')
      ? await this.#inspectProcesses(input.subject, signal).catch(() => {
          signal.throwIfAborted()
          diagnostics.push(probeFailure('processes', 'SYSTEM_PROCESS_PROBE_FAILED'))
          return { all: [] as ProcProcess[], observations: [] as HostProcessObservation[] }
        })
      : { all: [], observations: [] }
    const services = include.has('services') || include.has('applications')
      ? await this.#inspectServices(input.subject, signal).catch(() => {
          signal.throwIfAborted()
          diagnostics.push(probeFailure('services', 'SYSTEM_SERVICE_PROBE_FAILED'))
          return []
        })
      : []
    const listeners = include.has('listeners')
      ? await this.#inspectListeners(input.subject, processResult.all, signal).catch(() => {
          signal.throwIfAborted()
          diagnostics.push(probeFailure('listeners', 'SYSTEM_LISTENER_PROBE_FAILED'))
          return []
        })
      : []
    signal.throwIfAborted()
    return {
      applications: include.has('applications')
        ? deriveApplications(processResult.observations, services)
        : [],
      diagnostics,
      listeners,
      observedAt: new Date(this.#now()).toISOString(),
      processes: include.has('processes') ? processResult.observations : [],
      services: include.has('services') ? services : [],
    }
  }

  async readTarget(target: SystemTarget, signal: AbortSignal): Promise<SystemTarget | null> {
    if (this.#platform !== 'linux')
      return null
    signal.throwIfAborted()
    if (target.kind === 'process') {
      const process = await readProcess(target.pid, this.#now).catch(() => null)
      return process ? this.#toProcessTarget(process, protectedProcessIds([])) : null
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
    if (target.scope !== 'user' || !isServiceAction(action))
      throw new SystemCapabilityError('SYSTEM_ACTION_NOT_ALLOWED')
    const result = await this.#runCommand(
      SYSTEMCTL_PATH,
      ['--user', action.replace('-service', ''), '--', target.unit],
      signal,
    )
    if (result.exitCode !== 0)
      throw new SystemCapabilityError('SYSTEM_ACTION_INVALID')
  }

  async #inspectProcesses(
    subject: string,
    signal: AbortSignal,
  ): Promise<{ all: ProcProcess[], observations: HostProcessObservation[] }> {
    const entries = await readdir('/proc', { withFileTypes: true })
    const pids = entries
      .filter(entry => entry.isDirectory() && /^\d+$/.test(entry.name))
      .map(entry => Number.parseInt(entry.name, 10))
      .filter(Number.isSafeInteger)
      .slice(0, MAX_PROCESS_CANDIDATES)
    const all = await readProcesses(pids, this.#now, signal)
    const matched = all.filter(item => matchesSubject(subject, [
      item.commandName,
      item.commandSummary,
      item.executable,
      item.serviceUnit,
      String(item.pid),
    ]))
    const matchedIds = new Set(matched.map(item => item.pid))
    const parentIds = new Set(matched.flatMap(item => item.parentPid === null
      ? []
      : [item.parentPid]))
    const protectedIds = protectedProcessIds(all)
    const selected = all
      .filter(item => matchedIds.has(item.pid)
        || parentIds.has(item.pid)
        || (item.parentPid !== null && matchedIds.has(item.parentPid)))
      .sort((left, right) => left.pid - right.pid)
      .slice(0, MAX_PROCESS_RESULTS)
    return {
      all,
      observations: selected.map(item => ({
        commandName: item.commandName,
        commandSummary: item.commandSummary,
        memoryRssBytes: item.memoryRssBytes,
        parentPid: item.parentPid,
        role: processRole(item),
        state: item.state,
        target: this.#toProcessTarget(item, protectedIds, matchedIds.has(item.pid)),
      })),
    }
  }

  async #inspectServices(
    subject: string,
    signal: AbortSignal,
  ): Promise<HostServiceObservation[]> {
    const scopes = await Promise.all((['user', 'system'] as const).map(async (scope) => {
      const args = [
        ...(scope === 'user' ? ['--user'] : []),
        'list-units',
        '--type=service',
        '--all',
        '--no-legend',
        '--plain',
        '--no-pager',
      ]
      const result = await this.#runCommand(SYSTEMCTL_PATH, args, signal)
      if (result.exitCode !== 0)
        throw new Error('service probe failed')
      return parseSystemctlListUnits(result.stdout).map(service => ({ ...service, scope }))
    }))
    const services = scopes.flat()
      .filter(service => matchesSubject(subject, [
        service.description,
        service.systemdUnit,
        service.unit,
      ]))
      .slice(0, MAX_SERVICE_RESULTS)
    const mainPids = await this.#inspectServiceMainPids(services, signal)
    return services
      .map((service) => {
        const allowedActions: SystemActionKind[] = service.scope === 'user'
          && !isProtectedService(service.unit)
          ? ['start-service', 'stop-service', 'restart-service']
          : []
        const target: ServiceSystemTarget | undefined = allowedActions.length
          ? {
              activeState: service.activeState,
              allowedActions,
              displayName: service.description || service.unit,
              displayUnit: service.unit,
              interruption: serviceInterruption(service.unit),
              kind: 'service',
              scope: service.scope,
              unit: service.systemdUnit,
            }
          : undefined
        return {
          activeState: service.activeState,
          description: service.description,
          mainPid: mainPids.get(serviceIdentityKey(service.scope, service.systemdUnit)) ?? null,
          scope: service.scope,
          subState: service.subState,
          target,
          unit: service.unit,
        }
      })
  }

  async #inspectServiceMainPids(
    services: readonly { scope: 'system' | 'user', systemdUnit: string }[],
    signal: AbortSignal,
  ): Promise<Map<string, number>> {
    const entries = await Promise.all((['user', 'system'] as const).map(async (scope) => {
      const units = services
        .filter(service => service.scope === scope)
        .map(service => service.systemdUnit)
      if (!units.length)
        return []
      const result = await this.#runCommand(SYSTEMCTL_PATH, [
        ...(scope === 'user' ? ['--user'] : []),
        'show',
        '--property=Id,MainPID',
        '--no-pager',
        '--',
        ...units,
      ], signal)
      if (result.exitCode !== 0)
        return []
      return parseSystemctlMainPids(result.stdout).map(([unit, mainPid]) => (
        [serviceIdentityKey(scope, unit), mainPid] as const
      ))
    }))
    return new Map(entries.flat())
  }

  async #inspectListeners(
    subject: string,
    processes: readonly ProcProcess[],
    signal: AbortSignal,
  ): Promise<HostListenerObservation[]> {
    const result = await this.#runCommand(SS_PATH, ['-H', '-lntup'], signal)
    if (result.exitCode !== 0)
      throw new Error('listener probe failed')
    const byPid = new Map(processes.map(item => [item.pid, item]))
    const protectedIds = protectedProcessIds(processes)
    return result.stdout.split('\n')
      .flatMap(line => parseSsListener(line) ? [parseSsListener(line)!] : [])
      .filter(listener => matchesSubject(subject, [
        listener.localAddress,
        listener.processName,
        listener.pid ? byPid.get(listener.pid)?.commandSummary : null,
        listener.pid ? byPid.get(listener.pid)?.executable : null,
        listener.pid ? byPid.get(listener.pid)?.serviceUnit : null,
      ]))
      .slice(0, MAX_LISTENER_RESULTS)
      .map((listener) => {
        const process = listener.pid ? byPid.get(listener.pid) : undefined
        return {
          ...listener,
          target: process ? this.#toProcessTarget(process, protectedIds) : undefined,
        }
      })
  }

  async #readServiceTarget(
    target: ServiceSystemTarget,
    signal: AbortSignal,
  ): Promise<ServiceSystemTarget | null> {
    const result = await this.#runCommand(SYSTEMCTL_PATH, [
      ...(target.scope === 'user' ? ['--user'] : []),
      'show',
      '--property=Id,LoadState,ActiveState,SubState,MainPID,Description',
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
    subjectMatched = true,
  ): ProcessSystemTarget {
    const ownUid = process.getuid?.() ?? null
    const mutable = subjectMatched
      && item.uid !== null
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
}

export interface ParsedProcStat {
  parentPid: number | null
  startTicks: string
  state: HostProcessObservation['state']
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

export function parseSystemctlListUnits(
  value: string,
): Array<Omit<HostServiceObservation, 'scope' | 'target'> & { systemdUnit: string }> {
  return value.split('\n').flatMap((line) => {
    const [systemdUnit, , activeState, subState, ...description] = line.trim().split(/\s+/)
    if (!systemdUnit || !activeState || !subState)
      return []
    return [{
      activeState,
      description: description.join(' '),
      mainPid: null,
      subState,
      systemdUnit,
      unit: decodeSystemdEscapes(systemdUnit),
    }]
  })
}

export function parseSsListener(value: string): HostListenerObservation | null {
  const fields = value.trim().split(/\s+/)
  const protocol = fields[0]
  const localAddress = fields[4]
  if ((protocol !== 'tcp' && protocol !== 'udp') || !localAddress)
    return null
  const owner = value.match(/users:\(\("([^"]+)",pid=(\d+),/)
  const pid = owner?.[2] ? Number.parseInt(owner[2], 10) : null
  return {
    localAddress,
    pid: pid !== null && Number.isSafeInteger(pid) ? pid : null,
    processName: owner?.[1] ?? null,
    protocol,
  }
}

async function readProcess(pid: number, now: () => number): Promise<ProcProcess | null> {
  const root = `/proc/${pid}`
  const [statText, statusText, commText, commandBuffer, cgroupText, executable] = await Promise.all([
    readFile(`${root}/stat`, 'utf8'),
    readFile(`${root}/status`, 'utf8'),
    readFile(`${root}/comm`, 'utf8'),
    readFile(`${root}/cmdline`).catch(() => Buffer.alloc(0)),
    readFile(`${root}/cgroup`, 'utf8').catch(() => ''),
    readlink(`${root}/exe`).catch(() => null),
  ])
  const stat = parseProcStat(statText)
  if (!stat)
    return null
  const uid = readStatusNumber(statusText, 'Uid')
  const rssKb = readStatusNumber(statusText, 'VmRSS')
  return {
    commandName: sanitizeDisplayName(commText.trim()),
    commandSummary: summarizeCommand(commandBuffer),
    executable,
    memoryRssBytes: rssKb === null ? null : rssKb * 1024,
    parentPid: stat.parentPid,
    pid,
    serviceUnit: readServiceUnit(cgroupText),
    startTicks: stat.startTicks,
    startedAt: processStartedAt(stat.startTicks, now()),
    state: stat.state,
    uid,
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
      const process = await readProcess(pid, now).catch(() => null)
      if (process)
        processes.push(process)
    }
  }
  await Promise.all(Array.from(
    { length: Math.min(PROCESS_READ_CONCURRENCY, pids.length) },
    worker,
  ))
  signal.throwIfAborted()
  return processes
}

function summarizeCommand(value: Buffer): string | null {
  const arguments_ = value.subarray(0, 4_096).toString('utf8').split('\0').filter(Boolean).slice(0, 12)
  if (!arguments_.length)
    return null
  const sanitized: string[] = []
  let redactNext = false
  for (const argument of arguments_) {
    if (redactNext) {
      sanitized.push('[redacted]')
      redactNext = false
      continue
    }
    const bounded = argument.slice(0, 160)
    if (/^--?(?:api[-_]?key|authorization|credential|password|secret|token)$/i.test(bounded)) {
      sanitized.push(bounded)
      redactNext = true
      continue
    }
    sanitized.push(redactSensitiveText(bounded))
  }
  return sanitized.join(' ').slice(0, 1_024)
}

function readStatusNumber(value: string, key: string): number | null {
  const match = value.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'))
  if (!match)
    return null
  const result = Number.parseInt(match[1]!, 10)
  return Number.isSafeInteger(result) ? result : null
}

function readServiceUnit(value: string): string | null {
  const match = value.match(/(?:^|\/)([^/\n]+\.service)(?:$|\n)/m)
  return match?.[1] ? decodeSystemdEscapes(match[1]) : null
}

function processState(value: string | undefined): HostProcessObservation['state'] {
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
  const uptimeSeconds = systemUptime()
  const startedAt = now - uptimeSeconds * 1_000 + ticks * 10
  return new Date(Math.min(now, Math.max(0, startedAt))).toISOString()
}

function protectedProcessIds(processes: readonly ProcProcess[]): Set<number> {
  const byPid = new Map(processes.map(item => [item.pid, item]))
  const protectedIds = new Set<number>()
  let current: number | null = process.pid
  while (current && !protectedIds.has(current)) {
    protectedIds.add(current)
    current = byPid.get(current)?.parentPid ?? null
  }
  protectedIds.add(process.ppid)
  return protectedIds
}

function matchesSubject(subject: string, values: readonly (string | null | undefined)[]): boolean {
  const tokens = subject.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(token => token.length > 1)
  if (tokens.includes('clash'))
    tokens.push('mihomo')
  if (tokens.includes('mihomo'))
    tokens.push('clash')
  if (!tokens.length)
    return false
  const haystack = values.filter(Boolean).join(' ').toLowerCase()
  return tokens.some(token => haystack.includes(token))
}

function decodeSystemdEscapes(value: string): string {
  return value.replaceAll(/\\x([0-9a-f]{2})/gi, (_match, hexadecimal: string) => (
    String.fromCodePoint(Number.parseInt(hexadecimal, 16))
  ))
}

function processRole(process: ProcProcess): HostProcessObservation['role'] {
  if (process.state === 'zombie')
    return 'sidecar'
  if (process.serviceUnit?.startsWith('app-') || process.executable?.startsWith('/opt/'))
    return 'application'
  if (/sh|bash|zsh|systemd/i.test(process.commandName))
    return 'launcher'
  return 'unknown'
}

function processInterruption(process: ProcProcess): ProcessSystemTarget['interruption'] {
  return /clash|mihomo|proxy|vpn/i.test([
    process.commandName,
    process.executable,
    process.serviceUnit,
  ].filter(Boolean).join(' '))
    ? 'network'
    : processRole(process) === 'application' ? 'application' : 'none'
}

function serviceInterruption(unit: string): ServiceSystemTarget['interruption'] {
  if (/clash|mihomo|proxy|vpn|network/i.test(unit))
    return 'network'
  return unit.startsWith('app-') ? 'application' : 'service'
}

function deriveApplications(
  processes: readonly HostProcessObservation[],
  services: readonly HostServiceObservation[],
): HostApplicationObservation[] {
  const applications = new Map<string, HostApplicationObservation>()
  for (const process of processes.filter(item => item.role === 'application')) {
    applications.set(process.target.displayName, {
      displayName: process.target.displayName,
      processIds: [process.target.pid],
      status: 'running',
      target: process.target,
    })
  }
  for (const service of services.filter(item => item.unit.startsWith('app-'))) {
    applications.set(service.description || service.unit, {
      displayName: service.description || service.unit,
      processIds: service.mainPid ? [service.mainPid] : [],
      status: service.activeState === 'active' ? 'running' : 'stopped',
      target: service.target,
    })
  }
  return [...applications.values()]
}

function parseSystemctlShow(value: string): Record<string, string> {
  return Object.fromEntries(value.split('\n').flatMap((line) => {
    const separator = line.indexOf('=')
    return separator > 0 ? [[line.slice(0, separator), line.slice(separator + 1)]] : []
  }))
}

function parseSystemctlMainPids(value: string): Array<readonly [string, number]> {
  return value.split(/\n\s*\n/).flatMap((block) => {
    const values = parseSystemctlShow(block)
    const mainPid = Number.parseInt(values.MainPID ?? '', 10)
    return values.Id && Number.isSafeInteger(mainPid) && mainPid > 0
      ? [[values.Id, mainPid] as const]
      : []
  })
}

function serviceIdentityKey(scope: 'system' | 'user', unit: string): string {
  return `${scope}:${unit}`
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

function probeFailure(
  probe: SystemInspectionSection,
  code: string,
): SystemProbeDiagnostic {
  return {
    code,
    message: `The ${probe} probe was unavailable; absence of results is not proof that no target exists`,
    probe,
  }
}

function unsupportedInspection(input: SystemInspectionRequest): SystemHostInspection {
  const include = input.include ?? ['applications', 'listeners', 'processes', 'services']
  return {
    applications: [],
    diagnostics: include.map(probe => ({
      code: 'SYSTEM_HOST_UNSUPPORTED',
      message: 'Lexora Buddy host inspection is not supported on this operating system',
      probe,
    })),
    listeners: [],
    observedAt: new Date().toISOString(),
    processes: [],
    services: [],
  }
}

async function waitForProcessIdentityChange(
  target: ProcessSystemTarget,
  signal: AbortSignal,
): Promise<void> {
  const deadline = Date.now() + PROCESS_EXIT_WAIT_MS
  while (Date.now() < deadline) {
    signal.throwIfAborted()
    const process = await readProcess(target.pid, Date.now).catch(() => null)
    if (!process || process.startTicks !== target.startTicks || process.executable !== target.executable)
      return
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
