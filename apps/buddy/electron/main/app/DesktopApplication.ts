import type { Event } from 'electron'
import type { DesktopEnvironment } from './typing'
import process from 'node:process'
import { app, dialog, nativeTheme } from 'electron'
import { PowerShellUnavailableError } from '../../../platform/windows/powerShell'
import { translateDesktopNative } from '../desktopNativeI18n'
import { resolveDesktopLaunchIntent } from '../startupIntent'
import { confirmDesktopQuit, showBackgroundCloseNotice, showLegacyPowerShellNotice } from './desktopDialogs'
import { DesktopIntegrations } from './DesktopIntegrations'
import { createDesktopQuitLifecycle } from './desktopQuitLifecycle'
import { DesktopRuntimeHost } from './DesktopRuntimeHost'
import { checkDesktopSmokeBridge } from './desktopSmokeCheck'
import { DesktopWindowHost } from './DesktopWindowHost'
import { prepareDesktopEnvironment, prepareDesktopReady } from './environment'

class DesktopApplication {
  readonly #environment: DesktopEnvironment
  readonly #windows: DesktopWindowHost
  readonly #runtime: DesktopRuntimeHost
  readonly #integrations: DesktopIntegrations
  readonly #quit: ReturnType<typeof createDesktopQuitLifecycle>
  #disposePromise: Promise<void> | null = null

  constructor(environment: DesktopEnvironment) {
    this.#environment = environment
    this.#windows = new DesktopWindowHost(environment)
    this.#runtime = new DesktopRuntimeHost(environment, this.#windows)
    this.#quit = createDesktopQuitLifecycle({
      confirm: options => confirmDesktopQuit({
        getWindow: () => this.#windows.window,
        getLanguage: () => this.#runtime.language,
      }, options),
      dispose: () => this.#dispose(),
      quit: () => app.quit(),
    })
    this.#integrations = new DesktopIntegrations(environment, this.#runtime, this.#windows, () => this.#requestQuit())
  }

  bindEvents(): void {
    nativeTheme.on('updated', () => this.#windows.updateAppearance())
    process.once('SIGINT', () => {
      void this.#quit.request({ discardDraftsOnFailure: true }).catch((error) => {
        console.error('Lexora Buddy Desktop failed to stop after SIGINT', error)
        app.exit(1)
      })
    })
    app.on('before-quit', (event: Event) => {
      if (this.#quit.committed)
        return
      event.preventDefault()
      this.#requestQuit()
    })
    app.on('second-instance', (_event, argv) => {
      if (resolveDesktopLaunchIntent(argv) === 'foreground')
        this.#windows.show()
    })
    app.on('activate', () => this.#windows.show())
    app.on('window-all-closed', () => {})
  }

  async start(): Promise<void> {
    await app.whenReady()
    await prepareDesktopReady(this.#environment)
    await this.#windows.startAdapter()
    const config = await this.#runtime.prepare()
    await this.#integrations.applyConfig(config)
    this.#runtime.start()
    this.#integrations.start()
    const window = await this.#windows.initialize({
      executeCommand: this.#integrations.executeCommand,
      isQuitting: () => this.#quit.quitting,
      onHidden: () => { void showBackgroundCloseNotice(this.#runtime.configStore) },
    })
    if (this.#runtime.windowsPowerShell?.endsWith('\\powershell.exe') && !this.#environment.isSmokeTest)
      showLegacyPowerShellNotice(window, () => this.#runtime.language, this.#environment)
    if (this.#environment.isSmokeTest) {
      await checkDesktopSmokeBridge(window)
      await this.#quit.request()
    }
  }

  async handleStartupFailure(error: unknown): Promise<void> {
    console.error('Lexora Buddy Desktop failed to start', error)
    if (error instanceof PowerShellUnavailableError)
      dialog.showErrorBox('Lexora Buddy', translateDesktopNative(this.#runtime.language, 'powerShellUnavailable'))
    try {
      await this.#dispose()
    }
    finally {
      app.exit(1)
    }
  }

  #requestQuit(): void {
    void this.#quit.request().catch((error) => {
      console.error('Lexora Buddy Desktop failed to stop', error)
    })
  }

  #dispose(): Promise<void> {
    this.#disposePromise ??= (async () => {
      const failures: unknown[] = []
      for (const dispose of [
        () => this.#windows.close(),
        () => this.#integrations.stopSubscriptions(),
        () => this.#windows.stopAdapter(),
        () => this.#runtime.stop(),
        () => this.#integrations.destroyTray(),
        () => this.#environment.diagnostics.close(),
      ]) {
        try {
          await dispose()
        }
        catch (error) {
          failures.push(error)
        }
      }
      if (failures.length)
        throw new AggregateError(failures, 'Desktop application cleanup failed')
    })()
    return this.#disposePromise
  }
}

export function startDesktopApplication(): void {
  const environment = prepareDesktopEnvironment()
  if (!app.requestSingleInstanceLock()) {
    environment.writeDiagnostic('Existing instance detected; activating it')
    app.quit()
    return
  }
  const application = new DesktopApplication(environment)
  application.bindEvents()
  void application.start().catch(error => application.handleStartupFailure(error))
}
