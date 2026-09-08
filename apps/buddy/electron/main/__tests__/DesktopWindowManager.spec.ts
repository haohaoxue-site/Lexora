import type { BrowserWindow } from 'electron'
import type { DesktopWindowHandle } from '../window'
import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'

import { DesktopWindowManager } from '../DesktopWindowManager'

class FakeWindow extends EventEmitter {
  readonly focus = vi.fn()
  readonly restore = vi.fn()
  readonly show = vi.fn()
  readonly webContents = new EventEmitter()
  destroyed = false
  minimized = false

  destroy(): void {
    this.destroyed = true
    this.emit('closed')
  }

  isDestroyed(): boolean {
    return this.destroyed
  }

  isMinimized(): boolean {
    return this.minimized
  }
}

describe('desktopWindowManager', () => {
  it('recreates a renderer that exited before activating the existing instance', async () => {
    const windows: FakeWindow[] = []
    const loads: Array<ReturnType<typeof vi.fn>> = []
    const manager = new DesktopWindowManager({
      createWindow() {
        const window = new FakeWindow()
        const load = vi.fn().mockResolvedValue(undefined)
        windows.push(window)
        loads.push(load)
        return {
          load,
          window: window as unknown as BrowserWindow,
        } satisfies DesktopWindowHandle
      },
    })

    await manager.open()
    windows[0]!.webContents.emit('render-process-gone')

    expect(manager.window).toBeNull()

    await manager.open()

    expect(windows).toHaveLength(2)
    expect(windows[0]!.destroyed).toBe(true)
    expect(loads[1]).toHaveBeenCalledOnce()
    expect(windows[1]!.show).toHaveBeenCalledOnce()
    expect(windows[1]!.focus).toHaveBeenCalledOnce()
    manager.dispose()
    expect(windows[1]!.destroyed).toBe(true)
    expect(manager.window).toBeNull()
  })
})
