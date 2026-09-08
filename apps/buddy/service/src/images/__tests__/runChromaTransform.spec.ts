import { Buffer } from 'node:buffer'
import * as childProcess from 'node:child_process'
import { join } from 'node:path'
import process from 'node:process'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveBuddyImageTransformer } from '../../../../platform/native/nativeHost'
import { runChromaTransform } from '../runChromaTransform'

const defaults = { color: '#00ff00', tolerance: 60, softness: 80, despill: 1 }

vi.mock('node:child_process', async (original) => {
  const module = await original<typeof childProcess>()
  return { ...module, spawn: vi.fn(module.spawn) }
})

beforeEach(() => {
  vi.stubEnv('LEXORA_BUDDY_IMAGE_TRANSFORMER', resolveBuddyImageTransformer({ appPath: join(import.meta.dirname, '../../../..'), isPackaged: false, resourcesPath: '' }))
})

function source() {
  return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAFElEQVR4AQEJAPb/AAD/AP//AAD/EPgD/UE7EkoAAAAASUVORK5CYII=', 'base64')
}

describe('rust chroma subprocess', () => {
  it('rejects invalid options with stable errors', async () => {
    for (const options of [
      { ...defaults, color: 'green' },
      { ...defaults, color: '#绿000' },
      { ...defaults, tolerance: Number.NaN },
      { ...defaults, tolerance: -1 },
      { ...defaults, softness: Infinity },
      { ...defaults, softness: 443 },
      { ...defaults, despill: -0.1 },
      { ...defaults, despill: 1.1 },
    ]) {
      await expect(runChromaTransform(source(), options)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    }
  })

  it('does not return image data for malformed or oversized input', async () => {
    await expect(runChromaTransform(new Uint8Array(24), defaults)).rejects.toMatchObject({ code: 'IMAGE_TRANSFORM_INVALID_IMAGE' })
    await expect(runChromaTransform(new Uint8Array(32 * 1024 * 1024 + 1), defaults)).rejects.toMatchObject({ code: 'IMAGE_TRANSFORM_INPUT_TOO_LARGE' })
  })

  it('fails closed when its packaged binary is unavailable', async () => {
    vi.stubEnv('LEXORA_BUDDY_IMAGE_TRANSFORMER', undefined)
    await expect(runChromaTransform(source(), defaults)).rejects.toMatchObject({ code: 'IMAGE_TRANSFORM_UNAVAILABLE' })
  })

  it('waits for the actual subprocess to exit when the run is cancelled', async () => {
    const spawned = vi.mocked(childProcess.spawn)
    spawned.mockClear()
    const controller = new AbortController()
    const cancelled = new Error('cancelled by fixture')
    const pending = runChromaTransform(source(), defaults, controller.signal)
    const child = spawned.mock.results[0]?.value as childProcess.ChildProcess
    expect(child.pid).toBeGreaterThan(0)
    controller.abort(cancelled)
    await expect(pending).rejects.toBe(cancelled)
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
    expect(() => process.kill(child.pid!, 0)).toThrow()
  })
})
