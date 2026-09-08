import { Buffer } from 'node:buffer'
import { join } from 'node:path'
import process from 'node:process'
import { describe, expect, it, vi } from 'vitest'
import { runNativeCommand } from '../nativeCommand'

const fixture = join(import.meta.dirname, 'command-fixture.mjs')
const env = { SystemRoot: process.env.SystemRoot }

describe('windows command transport', () => {
  it('sends Unicode and shell metacharacters as JSON data in a restricted environment', async () => {
    vi.stubEnv('BUDDY_COMMAND_TEST_SECRET', 'not-forwarded')
    const input = { serviceId: '示例服务; $(whoami) "quoted"', operation: 'read' }
    const result = await runNativeCommand(process.execPath, [fixture, 'echo'], input, { env })
    expect(result.code).toBe(0)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout.toString('utf8'))).toEqual({ input, secret: null })
  })

  it('preserves exact domain failures separately from missing executables', async () => {
    expect(await runNativeCommand(process.execPath, [fixture, 'failure'], {}, { env })).toEqual({ code: 1, stdout: Buffer.alloc(0), stderr: 'SYSTEM_TARGET_CHANGED' })
    await expect(runNativeCommand(join(import.meta.dirname, 'nonexistent-command'), [], {}, { env })).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it.each(['stdout-limit', 'stderr-limit'])('bounds %s output', async (mode) => {
    await expect(runNativeCommand(process.execPath, [fixture, mode], {}, { env, maxBytes: 1024 })).rejects.toThrow('Native host output limit exceeded')
  })

  it('terminates a timed-out child', async () => {
    await expect(runNativeCommand(process.execPath, [fixture, 'wait'], {}, { env, timeoutMs: 100 })).rejects.toThrow('Native host operation timed out')
  })

  it('cancels a running child and rejects an already-cancelled request', async () => {
    const controller = new AbortController()
    const running = runNativeCommand(process.execPath, [fixture, 'wait'], {}, { env, signal: controller.signal })
    const timer = setTimeout(() => controller.abort(new Error('cancelled by test')), 100)
    try {
      await expect(running).rejects.toThrow('Native host operation cancelled')
      await expect(runNativeCommand(process.execPath, [fixture, 'echo'], {}, { env, signal: controller.signal })).rejects.toThrow('cancelled by test')
    }
    finally {
      clearTimeout(timer)
    }
  })
})
