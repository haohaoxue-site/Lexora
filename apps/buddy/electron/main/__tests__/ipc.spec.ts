import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import type { LexoraConfigStore } from '../config/LexoraConfigStore'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerDesktopIpc } from '../ipc'

const electron = vi.hoisted(() => ({
  handlers: new Map<string, (event: IpcMainInvokeEvent, input?: unknown) => unknown>(),
  writeText: vi.fn(),
}))

vi.mock('electron', () => ({
  app: { getVersion: () => '0.1.0' },
  clipboard: { writeText: electron.writeText },
  ipcMain: {
    handle: vi.fn((channel, handler) => electron.handlers.set(channel, handler)),
  },
}))

beforeEach(() => {
  electron.handlers.clear()
})

describe('registerDesktopIpc', () => {
  it('writes validated text to the system clipboard for the trusted Renderer only', () => {
    const webContents = { mainFrame: {} }
    const window = { webContents } as unknown as BrowserWindow
    registerDesktopIpc({
      checkForUpdates: vi.fn(),
      configPath: '/home/example/.lexora/config.toml',
      configStore: {
        read: vi.fn(),
        update: vi.fn(),
      } as unknown as LexoraConfigStore,
      executeCommand: vi.fn(),
      getWindow: () => window,
      onConfigUpdated: vi.fn(),
      openFeedbackIssue: vi.fn(),
      openReleasePage: vi.fn(),
    })
    const writeText = electron.handlers.get('lexora:clipboard:write-text')

    if (!writeText)
      throw new Error('Clipboard IPC handler was not registered')

    const trustedEvent = {
      sender: webContents,
      senderFrame: webContents.mainFrame,
    } as unknown as IpcMainInvokeEvent
    const untrustedEvent = {
      sender: {},
      senderFrame: {},
    } as unknown as IpcMainInvokeEvent

    expect(writeText(trustedEvent, { text: '完整回复' })).toBeUndefined()
    expect(electron.writeText).toHaveBeenCalledExactlyOnceWith('完整回复')
    expect(() => writeText(trustedEvent, { text: '回复', unexpected: true })).toThrow()
    expect(() => writeText(untrustedEvent, { text: '回复' })).toThrow(
      'Untrusted Desktop IPC sender',
    )
    expect(electron.writeText).toHaveBeenCalledOnce()
  })
})
