import type { BuddyServiceMessageProcess } from '../BuddyServicePeer'
import type { BuddyServiceProcessInstance } from '../buddyServiceProcess'
import { EventEmitter } from 'node:events'
import { Writable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { BUDDY_SERVICE_PROTOCOL_VERSION } from '../../../../shared/runtime/runtimeProtocol'
import { BuddyServicePeer } from '../BuddyServicePeer'
import { BuddyServiceSupervisor } from '../BuddyServiceSupervisor'

class FakeUtilityProcess extends EventEmitter implements BuddyServiceProcessInstance, BuddyServiceMessageProcess {
  readonly outbound: unknown[] = []
  readonly pid: number
  killed = false

  constructor(pid: number) {
    super()
    this.pid = pid
  }

  postMessage(message: unknown): void {
    this.outbound.push(message)
  }

  kill(): boolean {
    this.killed = true
    return true
  }

  notify(method: string, params: unknown): void {
    this.emit('message', { jsonrpc: '2.0', method, params })
  }

  respond(index: number, result: unknown): void {
    const request = this.outbound[index] as { id: string }
    this.emit('message', { id: request.id, jsonrpc: '2.0', result })
  }

  exit(code = 0): void {
    this.emit('exit', code)
  }
}

function createSupervisor(
  restartDelaysMs: number[] = [5],
) {
  const processes: FakeUtilityProcess[] = []
  const supervisor = new BuddyServiceSupervisor({
    diagnosticOutput: new Writable({
      write(_chunk, _encoding, callback) {
        callback()
      },
    }),
    forceKillTimeoutMs: 10,
    readinessTimeoutMs: 100,
    restartDelaysMs,
    shutdownTimeoutMs: 20,
    spawnService(onFatalError) {
      const process = new FakeUtilityProcess(1000 + processes.length)
      processes.push(process)
      return {
        peer: new BuddyServicePeer({ onFatalError, process }),
        process,
      }
    },
    stableResetMs: 60_000,
  })
  return { processes, supervisor }
}

describe('buddyServiceSupervisor utility process lifecycle', () => {
  it('waits for the versioned ready notification before forwarding requests', async () => {
    const { processes, supervisor } = createSupervisor()
    const notifications: unknown[] = []
    supervisor.onNotification(notification => notifications.push(notification))
    supervisor.start()
    const pending = supervisor.request('runtime.status', {})

    expect(supervisor.state.status).toBe('starting')
    expect(processes[0]!.outbound).toEqual([])
    processes[0]!.notify('run.event', { runId: 'recovery-run' })
    expect(supervisor.notify('scheduler.wake', { reason: 'resume' })).toBe(false)

    processes[0]!.notify('runtime.ready', {
      protocolVersion: BUDDY_SERVICE_PROTOCOL_VERSION,
    })
    await new Promise(resolve => setImmediate(resolve))
    expect(supervisor.state.status).toBe('ready')
    expect(processes[0]!.outbound).toHaveLength(1)

    processes[0]!.respond(0, { ready: true })
    await expect(pending).resolves.toEqual({ ready: true })
    processes[0]!.notify('run.event', { runId: 'run-1' })
    expect(notifications).toEqual([{ method: 'run.event', params: { runId: 'run-1' } }])
    expect(supervisor.notify('scheduler.wake', { reason: 'unlock-screen' })).toBe(true)
    expect(processes[0]!.outbound.at(-1)).toEqual({
      jsonrpc: '2.0',
      method: 'scheduler.wake',
      params: { reason: 'unlock-screen' },
    })
  })

  it('preserves a stable startup failure after bounded restart is exhausted', async () => {
    vi.useFakeTimers()
    try {
      const { processes, supervisor } = createSupervisor([5])
      supervisor.start()
      processes[0]!.notify('runtime.failed', { code: 'RUNTIME_START_FAILED' })
      await vi.advanceTimersByTimeAsync(0)
      expect(processes[0]!.killed).toBe(true)
      processes[0]!.exit(1)

      await vi.advanceTimersByTimeAsync(5)
      expect(processes).toHaveLength(2)
      processes[1]!.notify('runtime.failed', { code: 'RUNTIME_START_FAILED' })
      await vi.advanceTimersByTimeAsync(0)
      expect(processes[1]!.killed).toBe(true)
      processes[1]!.exit(1)
      await vi.advanceTimersByTimeAsync(0)

      expect(supervisor.state).toEqual({
        lastError: 'RUNTIME_START_FAILED',
        pid: null,
        restartAttempt: 1,
        status: 'offline',
      })
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('keeps a corrupted event log offline until a manual restart', async () => {
    vi.useFakeTimers()
    try {
      const { processes, supervisor } = createSupervisor([5])
      supervisor.start()

      processes[0]!.notify('runtime.failed', { code: 'EVENT_LOG_CORRUPTED' })
      await vi.advanceTimersByTimeAsync(0)
      expect(processes[0]!.killed).toBe(true)
      expect(supervisor.state).toEqual({
        lastError: 'EVENT_LOG_CORRUPTED',
        pid: processes[0]!.pid,
        restartAttempt: 0,
        status: 'stopping',
      })
      processes[0]!.exit(1)
      await vi.advanceTimersByTimeAsync(0)

      expect(supervisor.state).toEqual({
        lastError: 'EVENT_LOG_CORRUPTED',
        pid: null,
        restartAttempt: 0,
        status: 'offline',
      })
      await vi.advanceTimersByTimeAsync(100)
      expect(processes).toHaveLength(1)
      supervisor.start()
      expect(processes).toHaveLength(2)
      expect(supervisor.state).toEqual({
        lastError: null,
        pid: processes[1]!.pid,
        restartAttempt: 0,
        status: 'starting',
      })
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('takes an incompatible protocol offline without scheduling a restart', async () => {
    vi.useFakeTimers()
    try {
      const { processes, supervisor } = createSupervisor([5])
      supervisor.start()

      processes[0]!.notify('runtime.ready', {
        protocolVersion: BUDDY_SERVICE_PROTOCOL_VERSION + 1,
      })
      await vi.advanceTimersByTimeAsync(0)
      processes[0]!.exit(1)
      await vi.advanceTimersByTimeAsync(0)

      expect(supervisor.state).toEqual({
        lastError: 'RUNTIME_PROTOCOL_INCOMPATIBLE',
        pid: null,
        restartAttempt: 0,
        status: 'offline',
      })
      await vi.advanceTimersByTimeAsync(100)
      expect(processes).toHaveLength(1)
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('refuses to replace a runtime generation that could not be terminated', async () => {
    vi.useFakeTimers()
    try {
      const { processes, supervisor } = createSupervisor([5])
      supervisor.start()
      processes[0]!.notify('runtime.failed', { code: 'EVENT_LOG_CORRUPTED' })

      await vi.advanceTimersByTimeAsync(10)
      expect(supervisor.state).toEqual({
        lastError: 'RUNTIME_TERMINATION_FAILED',
        pid: processes[0]!.pid,
        restartAttempt: 0,
        status: 'offline',
      })

      await expect(supervisor.restart()).rejects.toMatchObject({
        code: 'RUNTIME_UNAVAILABLE',
      })
      await vi.advanceTimersByTimeAsync(100)

      expect(processes).toHaveLength(1)
      expect(supervisor.state).toEqual({
        lastError: 'RUNTIME_TERMINATION_FAILED',
        pid: processes[0]!.pid,
        restartAttempt: 0,
        status: 'offline',
      })
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('treats an invalid failure notification as a protocol failure', async () => {
    vi.useFakeTimers()
    try {
      const { processes, supervisor } = createSupervisor([])
      supervisor.start()

      processes[0]!.notify('runtime.failed', {
        code: 'RAW_FILESYSTEM_ERROR',
        detail: '/private/path',
      })
      await vi.advanceTimersByTimeAsync(0)
      processes[0]!.exit(1)
      await vi.advanceTimersByTimeAsync(0)

      expect(supervisor.state).toEqual({
        lastError: 'RUNTIME_PROTOCOL_FAILED',
        pid: null,
        restartAttempt: 0,
        status: 'offline',
      })
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('uses bounded restart after an unexpected exit', async () => {
    vi.useFakeTimers()
    const { processes, supervisor } = createSupervisor([5])
    supervisor.start()
    processes[0]!.exit(1)
    expect(supervisor.state.status).toBe('restarting')

    await vi.advanceTimersByTimeAsync(5)
    expect(processes).toHaveLength(2)
    vi.useRealTimers()
  })

  it('requests graceful shutdown before killing the utility process', async () => {
    const { processes, supervisor } = createSupervisor()
    supervisor.start()
    processes[0]!.notify('runtime.ready', {
      protocolVersion: BUDDY_SERVICE_PROTOCOL_VERSION,
    })
    const stopping = supervisor.stop()
    await new Promise(resolve => setImmediate(resolve))

    const shutdown = processes[0]!.outbound[0] as { method: string }
    expect(shutdown.method).toBe('runtime.shutdown')
    processes[0]!.respond(0, { accepted: true })
    processes[0]!.exit(0)

    await stopping
    expect(supervisor.state.status).toBe('stopped')
    expect(processes[0]!.killed).toBe(false)
  })
})
