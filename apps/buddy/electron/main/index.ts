import type { AutomationStartupContext } from '../../shared/automation'
import type { LexoraConfig } from '../shared/desktopApi'
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import {
  app,
  crashReporter,
  Menu,
  nativeTheme,
  net,
  Notification,
  powerMonitor,
  screen,
  shell,
} from 'electron'
import buddyPackage from '../../package.json'
import desktopIconPath from '../../resources/icons/app-icon.png?asset'
import { DESKTOP_IPC_CHANNELS } from '../shared/desktopApi'
import { installAttachmentProtocol, registerAttachmentSchemePrivileges } from './attachmentProtocol'
import { LexoraConfigStore } from './config/LexoraConfigStore'
import { createDesktopCommandExecutor } from './desktopCommands'
import { DesktopDiagnosticLogger } from './desktopDiagnostics'
import { translateDesktopNative } from './desktopNativeI18n'
import { DesktopNotificationService } from './DesktopNotificationService'
import { checkForDesktopUpdate } from './desktopUpdateService'
import { DesktopWindowManager } from './DesktopWindowManager'
import {
  DesktopWindowStateStore,
  resolveVisibleWindowPlacement,
} from './desktopWindowState'
import { createFeedbackIssueUrl } from './feedbackIssue'
import { registerDesktopIpc } from './ipc'
import { resolveLinuxConfigDirectory, syncLinuxAutostart } from './linuxAutostart'
import { registerLocalChatIpc } from './localChatIpc'
import { resolveDesktopStoragePaths, resolveLexoraHome } from './paths'
import {
  probeNativePetControlSocket,
  reloadNativePetConfig,
} from './pet/nativePetControlSocket'
import {
  createNativePetProcessFactory,
  NativePetSupervisor,
} from './pet/NativePetSupervisor'
import { registerPetHostRpc } from './pet/registerPetHostRpc'
import { installRendererProtocol, registerRendererSchemePrivileges } from './rendererProtocol'
import {
  createBuddyServiceEnvironment,
  resolveBuddyServiceStartupContext,
} from './runtime/buddyServiceEnvironment'
import { forkBuddyServiceProcess } from './runtime/buddyServiceProcess'
import { BuddyServiceSupervisor } from './runtime/BuddyServiceSupervisor'
import { RuntimeRecoveryService } from './runtime/RuntimeRecoveryService'
import { createCredentialVault } from './secrets/CredentialVault'
import { registerCredentialHostRpc } from './secrets/registerCredentialHostRpc'
import { resolveDevelopmentRendererUrl } from './security/navigationPolicy'
import { resolveDesktopLaunchIntent } from './startupIntent'
import { createDesktopTray } from './tray'
import { applyDesktopWindowAppearance, createDesktopWindow } from './window'

let desktopWindowManager: DesktopWindowManager | null = null
let nativePetSupervisor: NativePetSupervisor | null = null
let buddyServiceSupervisor: BuddyServiceSupervisor | null = null
let runtimeRecoveryService: RuntimeRecoveryService | null = null
let stopLocalChatIpc: (() => void) | null = null
let stopBuddyServiceNotification: (() => void) | null = null
let stopRuntimeStateSubscription: (() => void) | null = null
let stopRuntimeRecoverySubscription: (() => void) | null = null
let stopSchedulerWakeSubscription: (() => void) | null = null
let stopAttachmentProtocol: (() => void) | null = null
let stopRendererProtocol: (() => void) | null = null
let desktopTray: ReturnType<typeof createDesktopTray> | null = null
let isQuitting = false
let quitCommitted = false
let quitPromise: Promise<void> | null = null
let desktopLanguage: LexoraConfig['desktop']['language'] = 'zh-CN'
let desktopConfig: LexoraConfig | null = null

const desktopStoragePaths = resolveDesktopStoragePaths({
  userHome: homedir(),
  xdgCacheHome: process.env.XDG_CACHE_HOME,
  xdgStateHome: process.env.XDG_STATE_HOME,
})
for (const path of Object.values(desktopStoragePaths))
  mkdirSync(path, { mode: 0o700, recursive: true })
app.setPath('sessionData', desktopStoragePaths.sessionData)
app.setPath('crashDumps', desktopStoragePaths.crashDumps)
app.setAppLogsPath(desktopStoragePaths.logs)
crashReporter.start({
  productName: 'Lexora Buddy',
  uploadToServer: false,
})
const desktopDiagnostics = new DesktopDiagnosticLogger({
  directory: desktopStoragePaths.logs,
  userHome: homedir(),
})
const localServiceDiagnosticOutput = desktopDiagnostics.createWritable(
  'local-service',
  process.stderr,
)
const nativePetDiagnosticOutput = desktopDiagnostics.createWritable('native-pet', process.stderr)
nativeTheme.on('updated', () => {
  const window = desktopWindowManager?.window
  if (window)
    applyDesktopWindowAppearance(window, nativeTheme.shouldUseDarkColors)
})

registerAttachmentSchemePrivileges()
registerRendererSchemePrivileges()
const initialLaunchIntent = resolveDesktopLaunchIntent(process.argv)
const desktopName = app.isPackaged
  ? buddyPackage.desktopName
  : `${buddyPackage.desktopName}.Development`
if (process.platform === 'linux')
  app.setDesktopName(desktopName)

if (!app.requestSingleInstanceLock()) {
  writeDesktopDiagnostic('Existing instance detected; activating it')
  app.quit()
}
else {
  app.on('before-quit', (event) => {
    isQuitting = true
    if (quitCommitted)
      return

    event.preventDefault()
    void quitLexora()
  })

  app.on('second-instance', (_event, argv) => {
    if (resolveDesktopLaunchIntent(argv) === 'foreground')
      showDesktopWindow()
  })

  app.on('activate', () => {
    showDesktopWindow()
  })

  app.on('window-all-closed', () => {})

  void app.whenReady().then(async () => {
    app.setName('Lexora Buddy')
    app.setAppUserModelId(desktopName)
    Menu.setApplicationMenu(null)

    const isSmokeTest = process.env.LEXORA_DESKTOP_SMOKE_TEST === '1'
    const lexoraHome = resolveLexoraHome()
    const buddyHome = join(lexoraHome, 'buddy')
    const logDirectory = desktopStoragePaths.logs
    const configPath = join(lexoraHome, 'config.toml')
    const configStore = new LexoraConfigStore({ configPath })
    const credentialVault = createCredentialVault({ buddyHome })
    const initialConfig = await configStore.read()
    await applyDesktopConfig(initialConfig)
    nativePetSupervisor = new NativePetSupervisor({
      diagnosticOutput: nativePetDiagnosticOutput,
      onOpenDesktop: showDesktopWindow,
      spawnPet: createNativePetProcessFactory({
        appPath: app.getAppPath(),
        env: process.env,
        isPackaged: app.isPackaged,
        petPathOverride: process.env.LEXORA_BUDDY_PET_PATH,
        resourcesPath: process.resourcesPath,
      }),
    })
    if (initialConfig.pet.enabled && !(await safelyProbeNativePet()))
      nativePetSupervisor.start()
    const petSupervisor = nativePetSupervisor
    const builtinSkillsDirectory = app.isPackaged
      ? join(process.resourcesPath, 'service', 'resources', 'skills')
      : join(app.getAppPath(), 'service', 'resources', 'skills')
    let isRuntimeReplacementBlocked = () => false
    let automationStartupContext: AutomationStartupContext = {
      reason: 'normal',
      restoreToken: null,
    }
    const service = new BuddyServiceSupervisor({
      bindPeer(peer) {
        const disposers = [
          registerCredentialHostRpc(peer, credentialVault),
          registerPetHostRpc(peer, petSupervisor),
        ]
        return () => disposers.forEach(dispose => dispose())
      },
      diagnosticOutput: localServiceDiagnosticOutput,
      isReplacementBlocked: () => isRuntimeReplacementBlocked(),
      spawnService: onFatalError => forkBuddyServiceProcess({
        env: {
          ...createBuddyServiceEnvironment(process.env, buddyHome, automationStartupContext),
          LEXORA_BUDDY_SKILLS_DIR: builtinSkillsDirectory,
        },
        onFatalError,
        diagnosticOutput: localServiceDiagnosticOutput,
      }),
    })
    buddyServiceSupervisor = service
    const runtimeRecovery = new RuntimeRecoveryService({
      backupsDirectory: join(lexoraHome, 'backups', 'buddy'),
      buddyHome,
      getRuntimeState: () => service.state,
      openPath: path => shell.openPath(path),
    })
    runtimeRecoveryService = runtimeRecovery
    isRuntimeReplacementBlocked = () => runtimeRecovery.isDataMutationInProgress
    stopRuntimeRecoverySubscription = runtimeRecovery.onDataOperationChange((operation) => {
      if (operation.kind !== 'restore' || operation.status !== 'completed')
        return
      automationStartupContext = resolveBuddyServiceStartupContext(
        runtimeRecovery.getDataRecoveryReceipt(),
      )
    })
    const wakeOnResume = () => service.notify('scheduler.wake', { reason: 'resume' })
    const wakeOnUnlock = () => service.notify('scheduler.wake', { reason: 'unlock-screen' })
    powerMonitor.on('resume', wakeOnResume)
    powerMonitor.on('unlock-screen', wakeOnUnlock)
    stopSchedulerWakeSubscription = () => {
      powerMonitor.off('resume', wakeOnResume)
      powerMonitor.off('unlock-screen', wakeOnUnlock)
    }
    try {
      const recoveryReceipt = await runtimeRecovery.reconcileInterruptedDataOperations()
      automationStartupContext = resolveBuddyServiceStartupContext(recoveryReceipt)
      service.start()
    }
    catch (error) {
      const diagnostic = error instanceof Error ? error.name : 'unknown error'
      void desktopDiagnostics.write(
        'local-service',
        `Data restore reconciliation failed: ${diagnostic}`,
      )
      service.reportStartupFailure('EVENT_STORAGE_FAILED')
    }
    stopAttachmentProtocol = installAttachmentProtocol(service)
    stopRendererProtocol = installRendererProtocol()

    desktopTray = createDesktopTray({
      iconPath: desktopIconPath,
      language: desktopLanguage,
      onOpenDesktop: showDesktopWindow,
      onQuit() {
        void quitLexora()
      },
      runtime: service,
    })
    stopRuntimeStateSubscription = service.onStateChange((state) => {
      desktopTray?.setRuntimeState(state)
    })
    const desktopNotifications = new DesktopNotificationService({
      createNotification(input) {
        const notification = new Notification(input)
        return {
          onClick: listener => notification.on('click', listener),
          show: () => notification.show(),
        }
      },
      getLanguage: () => desktopLanguage,
      getSettings: () => ({
        notificationsEnabled: desktopConfig?.desktop.notificationsEnabled ?? true,
        notifyWhenFocused: desktopConfig?.desktop.notifyWhenFocused ?? false,
      }),
      isWindowFocused: () => desktopWindowManager?.window?.isFocused() ?? false,
      openTarget: openDesktopTarget,
      request: service.request.bind(service),
    })
    stopBuddyServiceNotification = service.onNotification((notification) => {
      if (notification.method === 'desktop.open')
        showDesktopWindow()
      void desktopNotifications.handle(notification).catch((error) => {
        const diagnostic = error instanceof Error ? error.name : 'unknown error'
        writeDesktopDiagnostic(`Notification failed: ${diagnostic}`)
      })
    })

    const executeDesktopCommand = createDesktopCommandExecutor({
      getWindow: () => desktopWindowManager?.window ?? null,
      isDeveloperToolsEnabled: () => desktopConfig?.desktop.developerToolsEnabled ?? false,
      logDirectory,
      openExternal: url => shell.openExternal(url),
      openPath: path => shell.openPath(path),
      requestQuit() {
        void quitLexora()
      },
    })
    registerDesktopIpc({
      checkForUpdates: () => checkForDesktopUpdate({
        currentVersion: app.getVersion(),
        fetchRelease: net.fetch,
      }),
      configPath,
      configStore,
      executeCommand: executeDesktopCommand,
      getWindow: () => desktopWindowManager?.window ?? null,
      onConfigUpdated: applyDesktopConfig,
      openFeedbackIssue: feedback => shell.openExternal(createFeedbackIssueUrl(feedback)),
      openReleasePage: url => shell.openExternal(url),
    })
    stopLocalChatIpc = registerLocalChatIpc({
      getLanguage: () => desktopLanguage,
      getWindow: () => desktopWindowManager?.window ?? null,
      runtime: service,
      runtimeRecovery,
    })

    const windowStateStore = new DesktopWindowStateStore({
      path: join(desktopStoragePaths.logs, '..', 'window-state.json'),
    })
    let windowPlacement = resolveVisibleWindowPlacement(
      await windowStateStore.read(),
      screen.getAllDisplays().map(display => display.bounds),
    )
    const desktop = new DesktopWindowManager({
      createWindow: () => {
        const handle = createDesktopWindow({
          executeCommand: executeDesktopCommand,
          iconPath: desktopIconPath,
          isQuitting: () => isQuitting,
          onHidden() {
            void showBackgroundCloseNotice(configStore)
          },
          onPlacementChanged(placement) {
            windowPlacement = placement
            void windowStateStore.write(placement)
          },
          placement: windowPlacement,
          rendererUrl: resolveDevelopmentRendererUrl(
            process.env.ELECTRON_RENDERER_URL,
            app.isPackaged,
          ),
          showOnReady: false,
        })
        applyDesktopWindowAppearance(handle.window, nativeTheme.shouldUseDarkColors)
        return handle
      },
    })
    desktopWindowManager = desktop
    if (!isSmokeTest && initialLaunchIntent === 'foreground')
      await desktop.open()
    const desktopWindow = desktop.window ?? await desktop.load()
    if (!desktopWindow)
      throw new Error('Lexora Buddy Desktop window is unavailable after loading')

    if (isSmokeTest) {
      const bridgeAvailable = await desktopWindow.webContents.executeJavaScript(
        'typeof globalThis.lexoraDesktop === "object"',
        true,
      )
      if (bridgeAvailable !== true)
        throw new Error('Lexora Buddy Desktop Preload bridge is unavailable')

      const providers = await desktopWindow.webContents.executeJavaScript(
        'globalThis.lexoraDesktop.localChat.providers.list()',
        true,
      )
      if (!Array.isArray(providers))
        throw new Error('Lexora Buddy Desktop Local Service provider registry is unavailable')

      const runtimeStatus = await desktopWindow.webContents.executeJavaScript(
        'globalThis.lexoraDesktop.localChat.runtime.getStatus()',
        true,
      )
      if (!runtimeStatus || typeof runtimeStatus !== 'object' || runtimeStatus.status !== 'ready')
        throw new Error('Lexora Buddy Desktop Preload local chat IPC is unavailable')

      const expectedRecoveryAction = process.env.LEXORA_DESKTOP_SMOKE_EXPECT_RECOVERY
      if (expectedRecoveryAction) {
        if (expectedRecoveryAction !== 'restored_previous_data')
          throw new Error('Lexora Buddy Desktop smoke recovery action is unsupported')

        const recoveryReceipt = await desktopWindow.webContents.executeJavaScript(
          'globalThis.lexoraDesktop.localChat.runtime.getDataRecoveryReceipt()',
          true,
        )
        if (
          !recoveryReceipt
          || typeof recoveryReceipt !== 'object'
          || recoveryReceipt.action !== expectedRecoveryAction
        ) {
          throw new Error('Lexora Buddy Desktop Preload recovery receipt IPC is unavailable')
        }

        const renderedRecoveryAction = await desktopWindow.webContents.executeJavaScript(
          `new Promise((resolve) => {
            globalThis.location.hash = '/settings/data'
            const deadline = Date.now() + 10_000
            const inspect = () => {
              const notice = globalThis.document.querySelector('[data-runtime-recovery-action]')
              if (notice) {
                resolve(notice.getAttribute('data-runtime-recovery-action'))
                return
              }
              if (Date.now() >= deadline) {
                resolve(null)
                return
              }
              globalThis.setTimeout(inspect, 25)
            }
            inspect()
          })`,
          true,
        )
        if (renderedRecoveryAction !== expectedRecoveryAction)
          throw new Error('Lexora Buddy Desktop Renderer recovery notice is unavailable')
      }

      await quitLexora()
    }
  }).catch(async (error) => {
    console.error('Lexora Buddy Desktop failed to start', error)
    isQuitting = true
    stopLocalChatIpc?.()
    stopAttachmentProtocol?.()
    stopRendererProtocol?.()
    stopBuddyServiceNotification?.()
    stopRuntimeStateSubscription?.()
    stopRuntimeRecoverySubscription?.()
    stopSchedulerWakeSubscription?.()
    await nativePetSupervisor?.stop()
    await runtimeRecoveryService?.shutdown()
    await buddyServiceSupervisor?.stop()
    desktopTray?.destroy()
    await desktopDiagnostics.close()
    app.exit(1)
  })
}

function quitLexora(): Promise<void> {
  isQuitting = true
  if (quitPromise)
    return quitPromise

  quitPromise = (async () => {
    stopLocalChatIpc?.()
    stopLocalChatIpc = null
    stopBuddyServiceNotification?.()
    stopBuddyServiceNotification = null
    stopRuntimeStateSubscription?.()
    stopRuntimeStateSubscription = null
    stopRuntimeRecoverySubscription?.()
    stopRuntimeRecoverySubscription = null
    stopSchedulerWakeSubscription?.()
    stopSchedulerWakeSubscription = null
    stopAttachmentProtocol?.()
    stopAttachmentProtocol = null
    stopRendererProtocol?.()
    stopRendererProtocol = null
    await nativePetSupervisor?.stop()
    await runtimeRecoveryService?.shutdown()
    await buddyServiceSupervisor?.stop()
    desktopTray?.destroy()
    desktopTray = null
    await desktopDiagnostics.close()
    quitCommitted = true
    app.quit()
  })()

  return quitPromise
}

function showDesktopWindow(): void {
  const manager = desktopWindowManager
  if (!manager)
    return

  void manager.open().catch((error) => {
    const diagnostic = error instanceof Error ? error.name : 'unknown error'
    writeDesktopDiagnostic(`Failed to activate window: ${diagnostic}`)
  })
}

function writeDesktopDiagnostic(message: string): void {
  process.stderr.write(`[Lexora Buddy Desktop] ${message}\n`)
  void desktopDiagnostics.write('desktop', message)
}

async function openDesktopTarget(target: { conversationId: string, runId: string }): Promise<void> {
  const manager = desktopWindowManager
  if (!manager)
    return
  await manager.open()
  manager.window?.webContents.send(DESKTOP_IPC_CHANNELS.appOpenTarget, target)
}

async function showBackgroundCloseNotice(configStore: LexoraConfigStore): Promise<void> {
  const config = await configStore.read()
  if (
    config.desktop.backgroundCloseNoticeShown
    || !config.desktop.notificationsEnabled
    || !Notification.isSupported()
  ) {
    return
  }
  new Notification({
    body: translateDesktopNative(config.desktop.language, 'backgroundCloseBody'),
    title: translateDesktopNative(config.desktop.language, 'backgroundCloseTitle'),
  }).show()
  await configStore.update({ desktop: { backgroundCloseNoticeShown: true } })
}

async function applyDesktopConfig(config: LexoraConfig): Promise<void> {
  desktopConfig = config
  desktopLanguage = config.desktop.language
  desktopTray?.setLanguage(desktopLanguage)
  nativeTheme.themeSource = config.desktop.theme
  const window = desktopWindowManager?.window
  if (window) {
    applyDesktopWindowAppearance(window, nativeTheme.shouldUseDarkColors)
    if (!config.desktop.developerToolsEnabled && window.webContents.isDevToolsOpened())
      window.webContents.closeDevTools()
  }
  await applyNativePetConfig(config.pet)
  if (!app.isPackaged || process.env.LEXORA_DESKTOP_SMOKE_TEST === '1')
    return

  if (process.platform === 'linux') {
    await syncLinuxAutostart({
      configDirectory: resolveLinuxConfigDirectory(
        app.getPath('home'),
        process.env.XDG_CONFIG_HOME,
      ),
      enabled: config.desktop.launchAtLogin,
      executablePath: process.execPath,
    })
    return
  }

  app.setLoginItemSettings({
    openAtLogin: config.desktop.launchAtLogin,
  })
}

async function applyNativePetConfig(config: LexoraConfig['pet']): Promise<void> {
  if (!config.enabled) {
    await safelyReloadNativePetConfig()
    await nativePetSupervisor?.stop()
    return
  }

  if (nativePetSupervisor?.reloadConfig())
    return
  if (!(await safelyReloadNativePetConfig()))
    nativePetSupervisor?.start()
}

async function safelyProbeNativePet(): Promise<boolean> {
  try {
    return await probeNativePetControlSocket()
  }
  catch (error) {
    writeDesktopDiagnostic(`Native pet probe failed: ${diagnosticName(error)}`)
    return false
  }
}

async function safelyReloadNativePetConfig(): Promise<boolean> {
  try {
    return await reloadNativePetConfig()
  }
  catch (error) {
    writeDesktopDiagnostic(`Native pet config reload failed: ${diagnosticName(error)}`)
    return false
  }
}

function diagnosticName(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : 'unknown error'
}
