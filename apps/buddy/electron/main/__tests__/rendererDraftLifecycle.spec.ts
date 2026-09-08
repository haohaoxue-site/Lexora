import type { BrowserWindow, IpcMain, IpcMainEvent } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { DESKTOP_IPC_CHANNELS } from '../../shared/desktopApi'
import { confirmDraftFlushBeforeQuit, requestRendererDraftFlush } from '../rendererDraftLifecycle'

describe('renderer Draft lifecycle', () => {
  it.each([
    { decisions: ['retry', 'discard'] as const, expected: true, flushes: 2 },
    { decisions: ['cancel'] as const, expected: false, flushes: 1 },
  ])('handles an explicit $decisions save-failure decision', async ({ decisions, expected, flushes }) => {
    const flush = vi.fn(async () => false)
    const pending = [...decisions]

    await expect(confirmDraftFlushBeforeQuit(flush, async () => pending.shift()!))
      .resolves
      .toBe(expected)
    expect(flush).toHaveBeenCalledTimes(flushes)
  })

  it('continues without a prompt after a confirmed flush', async () => {
    const resolveFailure = vi.fn()
    await expect(confirmDraftFlushBeforeQuit(async () => true, resolveFailure)).resolves.toBe(true)
    expect(resolveFailure).not.toHaveBeenCalled()
  })

  it('accepts only the matching main-frame window acknowledgement', async () => {
    type AckListener = (event: IpcMainEvent, input: unknown) => void
    const listeners = new Map<string, AckListener>()
    const ipc = {
      off: vi.fn((channel: string) => listeners.delete(channel)),
      on: vi.fn((channel: string, listener: AckListener) => listeners.set(channel, listener)),
    } as unknown as Pick<IpcMain, 'off' | 'on'>
    const webContents = {
      isDestroyed: () => false,
      send: vi.fn(),
    }
    const window = {
      isDestroyed: () => false,
      webContents,
    } as unknown as BrowserWindow

    const flushing = requestRendererDraftFlush(window, ipc)
    const [, input] = webContents.send.mock.calls[0]!
    const acknowledge = listeners.get(DESKTOP_IPC_CHANNELS.appPrepareQuitAck)!
    acknowledge({ sender: {} } as IpcMainEvent, input)
    acknowledge({ sender: webContents } as unknown as IpcMainEvent, { requestId: 'wrong', saved: true })
    acknowledge({ sender: webContents } as unknown as IpcMainEvent, { ...input, saved: true })

    await expect(flushing).resolves.toBe(true)
    expect(ipc.off).toHaveBeenCalledWith(DESKTOP_IPC_CHANNELS.appPrepareQuitAck, acknowledge)
  })

  it('fails closed when the renderer does not acknowledge in time', async () => {
    vi.useFakeTimers()
    type AckListener = (event: IpcMainEvent, input: unknown) => void
    const listeners = new Map<string, AckListener>()
    const ipc = {
      off: vi.fn((channel: string) => listeners.delete(channel)),
      on: vi.fn((channel: string, listener: AckListener) => listeners.set(channel, listener)),
    } as unknown as Pick<IpcMain, 'off' | 'on'>
    const window = {
      isDestroyed: () => false,
      webContents: { isDestroyed: () => false, send: vi.fn() },
    } as unknown as BrowserWindow

    const flushing = requestRendererDraftFlush(window, ipc, 100)
    await vi.advanceTimersByTimeAsync(100)

    await expect(flushing).resolves.toBe(false)
    expect(listeners).toEqual(new Map())
  })
})
