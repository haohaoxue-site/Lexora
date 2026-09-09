import type { BrowserWindow } from 'electron'
import type { LexoraConfig } from '../../shared/desktopApi'
import type { ExecuteDesktopCommand } from '../desktopCommands'
import type { DesktopEnvironment } from './typing'
import process from 'node:process'
import { app, nativeTheme, screen } from 'electron'
import { currentPlatform } from '../../../platform/currentPlatform'
import { localTransports } from '../../../platform/ipc/localTransport'
import { DESKTOP_IPC_CHANNELS } from '../../shared/desktopApi'
import { BrowserAdapterServer } from '../browser/BrowserAdapterServer'
import { BrowserAdapterTestLeasePublisher } from '../browser/BrowserAdapterTestLeasePublisher'
import { BrowserHost } from '../browser/BrowserHost'
import { DesktopWindowManager } from '../DesktopWindowManager'
import { DesktopWindowStateStore, resolveVisibleWindowPlacement } from '../desktopWindowState'
import { resolveDevelopmentRendererUrl } from '../security/navigationPolicy'
import { applyDesktopWindowAppearance, createDesktopWindow } from '../window'

interface WindowBindings {
  executeCommand: ExecuteDesktopCommand
  isQuitting: () => boolean
  onHidden: () => void
}

export class DesktopWindowHost {
  readonly adapter: BrowserAdapterServer
  readonly #environment: DesktopEnvironment
  #adapterStarted = false
  #manager: DesktopWindowManager | null = null
  #browser: BrowserHost | null = null
  #testLeasePublisher: BrowserAdapterTestLeasePublisher | null = null

  constructor(environment: DesktopEnvironment) {
    this.#environment = environment
    this.adapter = new BrowserAdapterServer({
      getHost: () => this.browser,
      endpoint: localTransports[currentPlatform.transport](environment.paths.browserAdapterSocket),
    })
  }

  get browser(): BrowserHost | null {
    return this.#browser
  }

  get window(): BrowserWindow | null {
    return this.#manager?.window ?? null
  }

  async startAdapter(): Promise<void> {
    await this.adapter.start()
    this.#adapterStarted = true
    const brokerSocketPath = this.#environment.paths.profile === 'test'
      ? process.env.LEXORA_BUDDY_BROWSER_ADAPTER_TEST_BROKER_SOCKET
      : undefined
    if (brokerSocketPath) {
      this.#testLeasePublisher = new BrowserAdapterTestLeasePublisher({
        brokerSocketPath,
        issueLease: input => this.adapter.issueLease(input),
      })
    }
  }

  async initialize(bindings: WindowBindings): Promise<BrowserWindow> {
    const environment = this.#environment
    const stateStore = new DesktopWindowStateStore({ path: environment.paths.windowState })
    let placement = resolveVisibleWindowPlacement(
      await stateStore.read(),
      screen.getAllDisplays().map(display => display.bounds),
    )
    const manager = new DesktopWindowManager({
      createWindow: () => {
        const handle = createDesktopWindow({
          appName: environment.paths.appName,
          executeCommand: bindings.executeCommand,
          iconPath: environment.desktopIconPath,
          isQuitting: bindings.isQuitting,
          onHidden() {
            if (!handle.window.webContents.isDestroyed())
              handle.window.webContents.send(DESKTOP_IPC_CHANNELS.appHidden)
            bindings.onHidden()
          },
          onPlacementChanged(next) {
            placement = next
            void stateStore.write(next)
          },
          placement,
          rendererUrl: resolveDevelopmentRendererUrl(process.env.ELECTRON_RENDERER_URL, app.isPackaged),
          showOnReady: false,
        })
        applyDesktopWindowAppearance(handle.window, nativeTheme.shouldUseDarkColors)
        environment.events.publish({ level: 'info', event: 'window.created' })
        handle.window.webContents.once('did-finish-load', () => {
          environment.events.publish({ level: 'info', event: 'window.loaded' })
        })
        handle.window.once('closed', () => {
          environment.events.publish({ level: 'info', event: 'window.closed' })
        })
        handle.window.on('unresponsive', () => {
          environment.events.publish({ level: 'warn', event: 'window.unresponsive' })
        })
        handle.window.webContents.on('render-process-gone', () => {
          environment.events.publish({ level: 'error', event: 'renderer.exited_abnormally' })
        })
        this.#browser?.dispose()
        this.#browser = new BrowserHost({
          onGuestSetChanged() {
            if (!handle.window.isDestroyed())
              handle.window.webContents.send(DESKTOP_IPC_CHANNELS.browserGuestsChanged)
          },
          onSessionClosed: state => this.adapter.revokeSession(state.sessionId),
          onStateChanged: (state) => {
            this.#testLeasePublisher?.publish(state)
            if (!handle.window.isDestroyed())
              handle.window.webContents.send(DESKTOP_IPC_CHANNELS.browserStateChanged, state)
          },
          window: handle.window,
        })
        return handle
      },
    })
    this.#manager = manager
    if (!environment.isSmokeTest && environment.initialLaunchIntent === 'foreground')
      await manager.open()
    return manager.window ?? manager.load()
  }

  show(): void {
    void this.#manager?.open().catch((error) => {
      this.#environment.diagnostics.record({ scope: 'desktop', level: 'error', event: 'window.activate_failed', error })
    })
  }

  async openTarget(target: { conversationId: string, runId: string }): Promise<void> {
    if (!this.#manager)
      return
    await this.#manager.open()
    this.window?.webContents.send(DESKTOP_IPC_CHANNELS.appOpenTarget, target)
  }

  updateAppearance(): void {
    if (this.window)
      applyDesktopWindowAppearance(this.window, nativeTheme.shouldUseDarkColors)
  }

  applyConfig(config: LexoraConfig): void {
    nativeTheme.themeSource = config.desktop.theme
    this.updateAppearance()
    const contents = this.window?.webContents
    if (!config.desktop.developerToolsEnabled && contents?.isDevToolsOpened())
      contents.closeDevTools()
  }

  close(): void {
    this.#browser?.dispose()
    this.#browser = null
    this.#manager?.dispose()
    this.#manager = null
  }

  async stopAdapter(): Promise<void> {
    this.#testLeasePublisher?.dispose()
    this.#testLeasePublisher = null
    if (this.#adapterStarted) {
      this.#adapterStarted = false
      await this.adapter.dispose()
    }
  }
}
