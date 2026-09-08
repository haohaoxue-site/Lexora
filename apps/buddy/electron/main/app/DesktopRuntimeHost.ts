import type { LexoraConfig } from '../../shared/desktopApi'
import type { DesktopFeature } from '../platform/desktopFeatures'
import type { CredentialVault } from '../secrets/CredentialVault'
import type { DesktopWindowHost } from './DesktopWindowHost'
import type { DesktopEnvironment } from './typing'
import process from 'node:process'
import { app, powerMonitor } from 'electron'
import { currentPlatform } from '../../../platform/currentPlatform'
import { createBuddyNativeEnvironment } from '../../../platform/native/nativeHost'
import { resolveWindowsPowerShell } from '../../../platform/windows/powerShell'
import { automationNotifications } from '../../../shared/automation/automationApi'
import { installAttachmentProtocol } from '../attachmentProtocol'
import { registerBrowserHostRpc } from '../browser/registerBrowserHostRpc'
import { LexoraConfigStore } from '../config/LexoraConfigStore'
import { registerWebHostRpc } from '../network/registerWebHostRpc'
import { createDesktopFeatures } from '../platform/desktopFeatures'
import { installRendererProtocol } from '../rendererProtocol'
import { createBuddyServiceEnvironment, resolveBuddySearchToolsDirectory } from '../runtime/buddyServiceEnvironment'
import { forkBuddyServiceProcess } from '../runtime/buddyServiceProcess'
import { BuddyServiceSupervisor } from '../runtime/BuddyServiceSupervisor'
import { createCredentialVault } from '../secrets/CredentialVault'
import { registerCredentialHostRpc } from '../secrets/registerCredentialHostRpc'

export class DesktopRuntimeHost {
  readonly configStore: LexoraConfigStore
  readonly #environment: DesktopEnvironment
  readonly #windows: DesktopWindowHost
  #credentials: CredentialVault | null = null
  #config: LexoraConfig | null = null
  #features: DesktopFeature[] = []
  #service: BuddyServiceSupervisor | null = null
  #windowsPowerShell: string | undefined
  readonly #subscriptions: Array<() => void> = []

  constructor(environment: DesktopEnvironment, windows: DesktopWindowHost) {
    this.#environment = environment
    this.#windows = windows
    this.configStore = new LexoraConfigStore({ configPath: environment.paths.configPath })
  }

  get config(): LexoraConfig | null {
    return this.#config
  }

  get language(): LexoraConfig['desktop']['language'] {
    return this.#config?.desktop.language ?? 'zh-CN'
  }

  get windowsPowerShell(): string | undefined {
    return this.#windowsPowerShell
  }

  get service(): BuddyServiceSupervisor {
    if (!this.#service)
      throw new Error('Desktop Runtime is not prepared')
    return this.#service
  }

  async prepare(): Promise<LexoraConfig> {
    const environment = this.#environment
    const nativePaths = {
      appPath: app.getAppPath(),
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
    }
    const credentials = createCredentialVault({ buddyHome: environment.paths.buddyHome })
    this.#credentials = credentials
    const config = await this.configStore.read()
    this.#config = config
    this.#windowsPowerShell = currentPlatform.shell === 'powershell'
      ? await resolveWindowsPowerShell()
      : undefined
    const composition = createDesktopFeatures(currentPlatform, {
      ...nativePaths,
      diagnostics: environment.diagnostics,
      onOpenDesktop: () => this.#windows.show(),
      paths: environment.paths,
      writeDiagnostic: environment.writeDiagnostic,
    })
    this.#features = composition.features
    this.#service = new BuddyServiceSupervisor({
      bindPeer: (peer) => {
        const disposers = [
          registerWebHostRpc(peer),
          registerBrowserHostRpc(peer, {
            createAdapterLease: input => this.#windows.adapter.issueLease(input),
            getHost: () => this.#windows.browser,
          }),
          registerCredentialHostRpc(peer, credentials),
          ...this.#features.map(feature => feature.bindPeer(peer)),
        ]
        return () => disposers.forEach(dispose => dispose())
      },
      diagnosticOutput: environment.serviceDiagnosticOutput,
      spawnService: onFatalError => forkBuddyServiceProcess({
        env: {
          ...createBuddyServiceEnvironment(process.env, environment.paths.buddyHome),
          ...createBuddyNativeEnvironment(nativePaths),
          ...(this.#windowsPowerShell ? { PI_POWERSHELL_PATH: this.#windowsPowerShell } : {}),
          PI_TOOLS_DIR: resolveBuddySearchToolsDirectory(nativePaths),
          LEXORA_BUDDY_SKILLS_DIRS: JSON.stringify(composition.builtinSkillsDirectories),
        },
        onFatalError,
        diagnosticOutput: environment.serviceDiagnosticOutput,
      }),
    })
    return config
  }

  async applyConfig(config: LexoraConfig): Promise<void> {
    this.#config = config
    await Promise.all(this.#features.map(feature => feature.applyConfig(config)))
    if (app.isPackaged && !this.#environment.isSmokeTest)
      await this.#environment.setAutostart(config.desktop.launchAtLogin)
  }

  start(): void {
    const service = this.service
    const wakeOnResume = () => service.notify(automationNotifications.wake.method, { reason: 'resume' })
    const wakeOnUnlock = () => service.notify(automationNotifications.wake.method, { reason: 'unlock-screen' })
    powerMonitor.on('resume', wakeOnResume)
    powerMonitor.on('unlock-screen', wakeOnUnlock)
    this.#subscriptions.push(() => {
      powerMonitor.off('resume', wakeOnResume)
      powerMonitor.off('unlock-screen', wakeOnUnlock)
    })
    service.start()
    this.#subscriptions.push(installAttachmentProtocol(service))
    this.#subscriptions.push(installRendererProtocol())
  }

  readWebCredential(): Promise<unknown> {
    if (!this.#credentials)
      throw new Error('Desktop credential vault is not prepared')
    return this.#credentials.read('web', 'tavily')
  }

  async stop(): Promise<void> {
    for (const stop of this.#subscriptions.splice(0))
      stop()
    try {
      await Promise.all(this.#features.map(feature => feature.stop()))
    }
    finally {
      await this.#service?.stop()
    }
  }
}
