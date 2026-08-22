import type { BrowserWindow } from 'electron'
import type { DesktopWindowHandle } from './window'

export interface DesktopWindowManagerOptions {
  createWindow: () => DesktopWindowHandle
}

interface ManagedDesktopWindow {
  handle: DesktopWindowHandle
  loadPromise: Promise<void> | null
  rendererAvailable: boolean
}

export class DesktopWindowManager {
  readonly #createWindow: () => DesktopWindowHandle
  #managedWindow: ManagedDesktopWindow | null = null

  constructor(options: DesktopWindowManagerOptions) {
    this.#createWindow = options.createWindow
  }

  get window(): BrowserWindow | null {
    const managedWindow = this.#managedWindow
    if (
      !managedWindow
      || !managedWindow.rendererAvailable
      || managedWindow.handle.window.isDestroyed()
    ) {
      return null
    }
    return managedWindow.handle.window
  }

  async load(): Promise<BrowserWindow> {
    let managedWindow = this.#managedWindow
    if (
      !managedWindow
      || !managedWindow.rendererAvailable
      || managedWindow.handle.window.isDestroyed()
    ) {
      managedWindow = this.#replaceWindow()
    }

    managedWindow.loadPromise ??= managedWindow.handle.load().catch((error) => {
      if (this.#managedWindow === managedWindow) {
        this.#managedWindow = null
        if (!managedWindow.handle.window.isDestroyed())
          managedWindow.handle.window.destroy()
      }
      throw error
    })
    await managedWindow.loadPromise

    if (
      this.#managedWindow !== managedWindow
      || !managedWindow.rendererAvailable
      || managedWindow.handle.window.isDestroyed()
    ) {
      throw new Error('Lexora Buddy Desktop renderer exited while loading')
    }
    return managedWindow.handle.window
  }

  async open(): Promise<void> {
    const window = await this.load()
    if (window.isMinimized())
      window.restore()
    window.show()
    window.focus()
  }

  #replaceWindow(): ManagedDesktopWindow {
    const previousWindow = this.#managedWindow
    this.#managedWindow = null
    if (previousWindow && !previousWindow.handle.window.isDestroyed())
      previousWindow.handle.window.destroy()

    const handle = this.#createWindow()
    const managedWindow: ManagedDesktopWindow = {
      handle,
      loadPromise: null,
      rendererAvailable: true,
    }
    this.#managedWindow = managedWindow
    handle.window.once('closed', () => {
      if (this.#managedWindow === managedWindow)
        this.#managedWindow = null
    })
    handle.window.webContents.on('render-process-gone', () => {
      if (this.#managedWindow === managedWindow)
        managedWindow.rendererAvailable = false
    })
    return managedWindow
  }
}
