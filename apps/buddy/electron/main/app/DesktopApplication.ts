import type { Event } from 'electron'
import type { DesktopEnvironment } from './typing'
import process from 'node:process'
import { app, dialog, nativeTheme } from 'electron'
import { PowerShellUnavailableError } from '../../../platform/windows/powerShell'
import { readDiagnosticErrorCode } from '../../../shared/diagnostics/applicationDiagnostic'
import { ServiceHost } from '../../../shared/lifecycle/ServiceHost'
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
  readonly #host: ServiceHost
  readonly #quit: ReturnType<typeof createDesktopQuitLifecycle>
  #disposePromise: Promise<void> | null = null

  constructor(environment: DesktopEnvironment) {
    this.#environment = environment
    this.#host = new ServiceHost(environment.events)
    this.#windows = new DesktopWindowHost(environment)
    this.#runtime = new DesktopRuntimeHost(environment, this.#windows)
    this.#quit = createDesktopQuitLifecycle({
      events: environment.events,
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
      void this.#quit.request({ discardDraftsOnFailure: true }).catch(async (error) => {
        this.#environment.events.publish({ level: 'error', event: 'app.interrupt_failed', errorCode: readDiagnosticErrorCode(error) })
        await this.#environment.diagnostics.close()
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
      this.#environment.events.publish({ level: 'info', event: 'app.second_instance' })
      if (resolveDesktopLaunchIntent(argv) === 'foreground')
        this.#windows.show()
    })
    app.on('activate', () => this.#windows.show())
    app.on('window-all-closed', () => {})
  }

  async start(): Promise<void> {
    const host = this.#host
    const window = await host.start('desktop', async () => {
      await host.step('desktop.electron', () => app.whenReady())
      await host.step('desktop.environment', () => prepareDesktopReady(this.#environment), ['desktop.electron'])
      await host.start('desktop.browser_adapter', ({ defer }) => {
        defer(() => this.#windows.stopAdapter())
        return this.#windows.startAdapter()
      }, ['desktop.environment'])
      const config = await host.start('desktop.runtime', ({ defer }) => {
        defer(() => this.#runtime.stop())
        return this.#runtime.prepare()
      }, ['desktop.browser_adapter'])
      await host.step('desktop.features', () => this.#integrations.applyConfig(config), ['desktop.runtime'])
      this.#runtime.start()
      await host.start('desktop.integrations', ({ defer }) => {
        defer(() => this.#integrations.destroyTray())
        defer(() => this.#integrations.stopSubscriptions())
        this.#integrations.start()
      }, ['desktop.runtime'])
      return host.start('desktop.window', ({ defer }) => {
        defer(() => this.#windows.close())
        return this.#windows.initialize({
          executeCommand: this.#integrations.executeCommand,
          isQuitting: () => this.#quit.quitting,
          onHidden: () => { void showBackgroundCloseNotice(this.#runtime.configStore) },
        })
      }, ['desktop.integrations'])
    })
    if (this.#runtime.windowsPowerShell?.endsWith('\\powershell.exe') && !this.#environment.isSmokeTest)
      showLegacyPowerShellNotice(window, () => this.#runtime.language, this.#environment)
    if (this.#environment.isSmokeTest) {
      await checkDesktopSmokeBridge(window)
      await this.#quit.request()
    }
  }

  async handleStartupFailure(error: unknown): Promise<void> {
    this.#environment.events.publish({ level: 'error', event: 'app.start_failed', errorCode: readDiagnosticErrorCode(error) })
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
      this.#environment.events.publish({ level: 'error', event: 'app.stop_failed', errorCode: readDiagnosticErrorCode(error) })
      if (this.#quit.quitting)
        app.exit(1)
    })
  }

  #dispose(): Promise<void> {
    this.#disposePromise ??= (async () => {
      this.#environment.events.publish({ level: 'info', event: 'app.stopping' })
      this.#environment.startup.stopping()
      const failures: unknown[] = []
      try {
        await this.#host.stop()
      }
      catch (error) {
        failures.push(error)
      }
      this.#environment.events.publish({ level: failures.length ? 'error' : 'info', event: failures.length ? 'app.stop_failed' : 'app.stopped' })
      this.#environment.startup.stopped()
      await this.#environment.diagnostics.close()
      if (failures.length)
        throw new AggregateError(failures, 'Desktop application cleanup failed')
    })()
    return this.#disposePromise
  }
}

export function startDesktopApplication(): void {
  const environment = prepareDesktopEnvironment()
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }
  environment.events.publish({ level: 'info', event: 'app.starting' })
  const application = new DesktopApplication(environment)
  application.bindEvents()
  void application.start().catch(error => application.handleStartupFailure(error))
}
