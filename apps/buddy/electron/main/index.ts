import type { LexoraConfig } from '../shared/desktopApi'
import type { DesktopFeature } from './platform/desktopFeatures'
import { mkdirSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname } from 'node:path'
import process from 'node:process'
import {
  app,
  crashReporter,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  net,
  Notification,
  powerMonitor,
  screen,
  shell,
} from 'electron'
import { z } from 'zod'
import buddyPackage from '../../package.json'
import { currentPlatform } from '../../platform/currentPlatform'
import { localTransports } from '../../platform/localTransport'
import { createBuddyNativeEnvironment, resolveBuddyPrivateDirectories } from '../../platform/nativeHost'
import { ensurePrivateDirectories } from '../../platform/privateDirectories'
import { PowerShellUnavailableError, resolveWindowsPowerShell } from '../../platform/windows/powerShell'
import developmentDesktopIconPath from '../../resources/icons/app-icon-dev.png?asset'
import stableDesktopIconPath from '../../resources/icons/app-icon.png?asset'
import developmentTrayIconPath from '../../resources/icons/tray-icon-dev.png?asset'
import { DESKTOP_IPC_CHANNELS } from '../shared/desktopApi'
import { installAttachmentProtocol, registerAttachmentSchemePrivileges } from './attachmentProtocol'
import { BrowserAdapterServer } from './browser/BrowserAdapterServer'
import { BrowserAdapterTestLeasePublisher } from './browser/BrowserAdapterTestLeasePublisher'
import { BrowserHost } from './browser/BrowserHost'
import { registerBrowserDesktopIpc } from './browser/registerBrowserDesktopIpc'
import { registerBrowserHostRpc } from './browser/registerBrowserHostRpc'
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
import { registerLocalChatIpc } from './localChatIpc'
import { registerWebHostRpc } from './network/registerWebHostRpc'
import { resolveBuddyRuntimePaths } from './paths'
import { createDesktopFeatures } from './platform/desktopFeatures'
import { desktopHosts } from './platform/desktopHost'
import { confirmDraftFlushBeforeQuit, requestRendererDraftFlush } from './rendererDraftLifecycle'
import { installRendererProtocol, registerRendererSchemePrivileges } from './rendererProtocol'
import {
  createBuddyServiceEnvironment,
  resolveBuddySearchToolsDirectory,
} from './runtime/buddyServiceEnvironment'
import { forkBuddyServiceProcess } from './runtime/buddyServiceProcess'
import { BuddyServiceSupervisor } from './runtime/BuddyServiceSupervisor'
import { createCredentialVault } from './secrets/CredentialVault'
import { registerCredentialHostRpc } from './secrets/registerCredentialHostRpc'
import { resolveDevelopmentRendererUrl } from './security/navigationPolicy'
import { resolveDesktopLaunchIntent } from './startupIntent'
import { createDesktopTray } from './tray'
import { applyDesktopWindowAppearance, createDesktopWindow } from './window'

let desktopWindowManager: DesktopWindowManager | null = null
let browserAdapterServer: BrowserAdapterServer | null = null
let browserAdapterTestLeasePublisher: BrowserAdapterTestLeasePublisher | null = null
let browserHost: BrowserHost | null = null
let desktopFeatures: DesktopFeature[] = []
let buddyServiceSupervisor: BuddyServiceSupervisor | null = null
let stopLocalChatIpc: (() => void) | null = null
let stopBrowserDesktopIpc: (() => void) | null = null
let stopBuddyServiceNotification: (() => void) | null = null
let stopRuntimeStateSubscription: (() => void) | null = null
let stopSchedulerWakeSubscription: (() => void) | null = null
let stopAttachmentProtocol: (() => void) | null = null
let stopRendererProtocol: (() => void) | null = null
let desktopTray: ReturnType<typeof createDesktopTray> | null = null
let isQuitting = false
let quitCommitted = false
let quitPromise: Promise<void> | null = null

const browserArtifactEntrySchema = z.object({
  entryPath: z.string().min(1).max(32_768),
  rootPath: z.string().min(1).max(32_768),
}).strict()
let desktopLanguage: LexoraConfig['desktop']['language'] = 'zh-CN'
let desktopConfig: LexoraConfig | null = null

const commandLineUserData = app.commandLine.hasSwitch('user-data-dir')
  ? app.commandLine.getSwitchValue('user-data-dir')
  : undefined
const desktopHost = desktopHosts[currentPlatform.id]
const runtimePaths = resolveBuddyRuntimePaths({
  defaultUserData: app.getPath('userData'),
  desktopName: buddyPackage.desktopName,
  isPackaged: app.isPackaged,
  localAppData: process.env.LOCALAPPDATA,
  lexoraHomeOverride: process.env.LEXORA_HOME,
  nativePetSocketOverride: process.env.LEXORA_BUDDY_PET_SOCKET,
  nativePetStateOverride: process.env.LEXORA_BUDDY_PET_STATE_PATH,
  profileOverride: process.env.LEXORA_BUDDY_PROFILE,
  smokeTest: process.env.LEXORA_DESKTOP_SMOKE_TEST === '1',
  temporaryDirectory: tmpdir(),
  userDataOverride: commandLineUserData,
  userHome: homedir(),
  userId: process.geteuid?.() ?? 0,
  xdgCacheHome: process.env.XDG_CACHE_HOME,
  xdgConfigHome: process.env.XDG_CONFIG_HOME,
  xdgRuntimeDirectory: process.env.XDG_RUNTIME_DIR,
  xdgStateHome: process.env.XDG_STATE_HOME,
})
const desktopIconPath = runtimePaths.iconVariant === 'development'
  ? developmentDesktopIconPath
  : stableDesktopIconPath
const trayIconPath = runtimePaths.iconVariant === 'development'
  ? developmentTrayIconPath
  : stableDesktopIconPath
for (const path of new Set([
  runtimePaths.crashDumps,
  runtimePaths.logs,
  runtimePaths.sessionData,
  runtimePaths.userData,
  dirname(runtimePaths.windowState),
])) {
  mkdirSync(path, { mode: 0o700, recursive: true })
}
app.setName(runtimePaths.appName)
app.setPath('userData', runtimePaths.userData)
app.setPath('sessionData', runtimePaths.sessionData)
app.setPath('crashDumps', runtimePaths.crashDumps)
app.setAppLogsPath(runtimePaths.logs)
crashReporter.start({
  productName: runtimePaths.appName,
  uploadToServer: false,
})
const desktopDiagnostics = new DesktopDiagnosticLogger({
  directory: runtimePaths.logs,
  userHome: homedir(),
})
const localServiceDiagnosticOutput = desktopDiagnostics.createWritable(
  'local-service',
  process.stderr,
)
nativeTheme.on('updated', () => {
  const window = desktopWindowManager?.window
  if (window)
    applyDesktopWindowAppearance(window, nativeTheme.shouldUseDarkColors)
})

registerAttachmentSchemePrivileges()
registerRendererSchemePrivileges()
const initialLaunchIntent = resolveDesktopLaunchIntent(process.argv)
desktopHost.setIdentity(runtimePaths.desktopName)

if (!app.requestSingleInstanceLock()) {
  writeDesktopDiagnostic('Existing instance detected; activating it')
  app.quit()
}
else {
  process.once('SIGINT', () => {
    void quitLexora({ discardDraftsOnFailure: true }).catch((error) => {
      console.error('Lexora Buddy Desktop failed to stop after SIGINT', error)
      app.exit(1)
    })
  })

  app.on('before-quit', (event) => {
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
    const nativePaths = {
      appPath: app.getAppPath(),
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
    }
    await ensurePrivateDirectories([
      runtimePaths.lexoraHome,
      runtimePaths.userData,
      runtimePaths.sessionData,
      dirname(runtimePaths.windowState),
    ], resolveBuddyPrivateDirectories(nativePaths))
    app.setAppUserModelId(runtimePaths.desktopName)
    Menu.setApplicationMenu(null)
    const adapterServer = new BrowserAdapterServer({
      getHost: () => browserHost,
      endpoint: localTransports[currentPlatform.transport](runtimePaths.browserAdapterSocket),
    })
    await adapterServer.start()
    browserAdapterServer = adapterServer
    const adapterTestBrokerSocket = runtimePaths.profile === 'test'
      ? process.env.LEXORA_BUDDY_BROWSER_ADAPTER_TEST_BROKER_SOCKET
      : undefined
    if (adapterTestBrokerSocket) {
      browserAdapterTestLeasePublisher = new BrowserAdapterTestLeasePublisher({
        brokerSocketPath: adapterTestBrokerSocket,
        issueLease: input => adapterServer.issueLease(input),
      })
    }

    const isSmokeTest = process.env.LEXORA_DESKTOP_SMOKE_TEST === '1'
    const buddyHome = runtimePaths.buddyHome
    const logDirectory = runtimePaths.logs
    const configPath = runtimePaths.configPath
    const configStore = new LexoraConfigStore({ configPath })
    const credentialVault = createCredentialVault({ buddyHome })
    const initialConfig = await configStore.read()
    desktopLanguage = initialConfig.desktop.language
    const windowsPowerShell = currentPlatform.shell === 'powershell'
      ? await resolveWindowsPowerShell()
      : undefined
    const featureComposition = createDesktopFeatures(currentPlatform, {
      appPath: app.getAppPath(),
      diagnostics: desktopDiagnostics,
      isPackaged: app.isPackaged,
      onOpenDesktop: showDesktopWindow,
      paths: runtimePaths,
      resourcesPath: process.resourcesPath,
      writeDiagnostic: writeDesktopDiagnostic,
    })
    desktopFeatures = featureComposition.features
    await applyDesktopConfig(initialConfig)
    const service = new BuddyServiceSupervisor({
      bindPeer(peer) {
        const disposers = [
          registerWebHostRpc(peer),
          registerBrowserHostRpc(peer, {
            createAdapterLease: input => adapterServer.issueLease(input),
            getHost: () => browserHost,
          }),
          registerCredentialHostRpc(peer, credentialVault),
          ...desktopFeatures.map(feature => feature.bindPeer(peer)),
        ]
        return () => disposers.forEach(dispose => dispose())
      },
      diagnosticOutput: localServiceDiagnosticOutput,
      spawnService: onFatalError => forkBuddyServiceProcess({
        env: {
          ...createBuddyServiceEnvironment(process.env, buddyHome),
          ...createBuddyNativeEnvironment(nativePaths),
          ...(windowsPowerShell ? { PI_POWERSHELL_PATH: windowsPowerShell } : {}),
          PI_TOOLS_DIR: resolveBuddySearchToolsDirectory({
            appPath: app.getAppPath(),
            isPackaged: app.isPackaged,
            resourcesPath: process.resourcesPath,
          }),
          LEXORA_BUDDY_SKILLS_DIRS: JSON.stringify(featureComposition.builtinSkillsDirectories),
        },
        onFatalError,
        diagnosticOutput: localServiceDiagnosticOutput,
      }),
    })
    buddyServiceSupervisor = service
    const wakeOnResume = () => service.notify('scheduler.wake', { reason: 'resume' })
    const wakeOnUnlock = () => service.notify('scheduler.wake', { reason: 'unlock-screen' })
    powerMonitor.on('resume', wakeOnResume)
    powerMonitor.on('unlock-screen', wakeOnUnlock)
    stopSchedulerWakeSubscription = () => {
      powerMonitor.off('resume', wakeOnResume)
      powerMonitor.off('unlock-screen', wakeOnUnlock)
    }
    service.start()
    stopAttachmentProtocol = installAttachmentProtocol(service)
    stopRendererProtocol = installRendererProtocol()

    desktopTray = createDesktopTray({
      appName: runtimePaths.appName,
      iconPath: trayIconPath,
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
    stopBrowserDesktopIpc = registerBrowserDesktopIpc({
      getHost: () => browserHost,
      getWindow: () => desktopWindowManager?.window ?? null,
      resolveArtifactEntry: async input => browserArtifactEntrySchema.parse(
        await service.request('artifacts.resolveBrowserEntry', input),
      ),
    })
    stopLocalChatIpc = registerLocalChatIpc({
      readWebCredential: () => credentialVault.read('web', 'tavily'),
      getLanguage: () => desktopLanguage,
      getWindow: () => desktopWindowManager?.window ?? null,
      runtime: service,
    })

    const windowStateStore = new DesktopWindowStateStore({
      path: runtimePaths.windowState,
    })
    let windowPlacement = resolveVisibleWindowPlacement(
      await windowStateStore.read(),
      screen.getAllDisplays().map(display => display.bounds),
    )
    const desktop = new DesktopWindowManager({
      createWindow: () => {
        const handle = createDesktopWindow({
          appName: runtimePaths.appName,
          executeCommand: executeDesktopCommand,
          iconPath: desktopIconPath,
          isQuitting: () => isQuitting,
          onHidden() {
            if (!handle.window.webContents.isDestroyed())
              handle.window.webContents.send(DESKTOP_IPC_CHANNELS.appHidden)
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
        browserHost?.dispose()
        browserHost = new BrowserHost({
          onGuestSetChanged() {
            if (!handle.window.isDestroyed()) {
              handle.window.webContents.send(
                DESKTOP_IPC_CHANNELS.browserGuestsChanged,
              )
            }
          },
          onSessionClosed(state) {
            browserAdapterServer?.revokeSession(state.sessionId)
          },
          onStateChanged(state) {
            browserAdapterTestLeasePublisher?.publish(state)
            if (!handle.window.isDestroyed()) {
              handle.window.webContents.send(
                DESKTOP_IPC_CHANNELS.browserStateChanged,
                state,
              )
            }
          },
          window: handle.window,
        })
        return handle
      },
    })
    desktopWindowManager = desktop
    if (!isSmokeTest && initialLaunchIntent === 'foreground')
      await desktop.open()
    const desktopWindow = desktop.window ?? await desktop.load()
    if (!desktopWindow)
      throw new Error('Lexora Buddy Desktop window is unavailable after loading')

    if (windowsPowerShell?.endsWith('\\powershell.exe') && !isSmokeTest) {
      const showLegacyShellNotice = () => {
        void dialog.showMessageBox(desktopWindow, {
          type: 'warning',
          title: 'Lexora Buddy',
          message: translateDesktopNative(desktopLanguage, 'powerShellLegacyNotice'),
          buttons: [
            translateDesktopNative(desktopLanguage, 'continueWithLegacyPowerShell'),
            translateDesktopNative(desktopLanguage, 'viewPowerShellInstallGuide'),
          ],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        }).then(async ({ response }) => {
          if (response === 1)
            await shell.openExternal('https://learn.microsoft.com/powershell/scripting/install/install-powershell-on-windows')
        }).catch(() => writeDesktopDiagnostic('PowerShell notice could not be displayed'))
      }
      if (desktopWindow.isVisible())
        showLegacyShellNotice()
      else
        desktopWindow.once('show', showLegacyShellNotice)
    }

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

      await quitLexora()
    }
  }).catch(async (error) => {
    console.error('Lexora Buddy Desktop failed to start', error)
    if (error instanceof PowerShellUnavailableError)
      dialog.showErrorBox('Lexora Buddy', translateDesktopNative(desktopLanguage, 'powerShellUnavailable'))
    stopBrowserDesktopIpc?.()
    browserAdapterTestLeasePublisher?.dispose()
    browserAdapterTestLeasePublisher = null
    await browserAdapterServer?.dispose()
    browserAdapterServer = null
    browserHost?.dispose()
    stopLocalChatIpc?.()
    stopAttachmentProtocol?.()
    stopRendererProtocol?.()
    stopBuddyServiceNotification?.()
    stopRuntimeStateSubscription?.()
    stopSchedulerWakeSubscription?.()
    await Promise.all(desktopFeatures.map(feature => feature.stop()))
    await buddyServiceSupervisor?.stop()
    desktopTray?.destroy()
    await desktopDiagnostics.close()
    app.exit(1)
  })
}

function quitLexora(options: { discardDraftsOnFailure?: boolean } = {}): Promise<void> {
  if (quitPromise)
    return quitPromise

  quitPromise = (async () => {
    const shouldQuit = await confirmDraftFlushBeforeQuit(
      () => requestRendererDraftFlush(desktopWindowManager?.window ?? null, ipcMain),
      options.discardDraftsOnFailure
        ? async () => 'discard'
        : async () => {
          const options: Electron.MessageBoxOptions = {
            buttons: [
              translateDesktopNative(desktopLanguage, 'retrySave'),
              translateDesktopNative(desktopLanguage, 'cancel'),
              translateDesktopNative(desktopLanguage, 'quitWithoutSaving'),
            ],
            cancelId: 1,
            defaultId: 0,
            detail: translateDesktopNative(desktopLanguage, 'saveBeforeQuitBody'),
            message: translateDesktopNative(desktopLanguage, 'saveBeforeQuitTitle'),
            noLink: true,
            type: 'warning',
          }
          const window = desktopWindowManager?.window
          const result = await (window
            ? dialog.showMessageBox(window, options)
            : dialog.showMessageBox(options))
          return result.response === 0 ? 'retry' : result.response === 1 ? 'cancel' : 'discard'
        },
    )
    if (!shouldQuit) {
      quitPromise = null
      return
    }
    isQuitting = true
    browserHost?.dispose()
    browserHost = null
    desktopWindowManager?.dispose()
    stopBrowserDesktopIpc?.()
    stopBrowserDesktopIpc = null
    browserAdapterTestLeasePublisher?.dispose()
    browserAdapterTestLeasePublisher = null
    await browserAdapterServer?.dispose()
    browserAdapterServer = null
    stopLocalChatIpc?.()
    stopLocalChatIpc = null
    stopBuddyServiceNotification?.()
    stopBuddyServiceNotification = null
    stopRuntimeStateSubscription?.()
    stopRuntimeStateSubscription = null
    stopSchedulerWakeSubscription?.()
    stopSchedulerWakeSubscription = null
    stopAttachmentProtocol?.()
    stopAttachmentProtocol = null
    stopRendererProtocol?.()
    stopRendererProtocol = null
    await Promise.all(desktopFeatures.map(feature => feature.stop()))
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
  await Promise.all(desktopFeatures.map(feature => feature.applyConfig(config)))
  if (!app.isPackaged || process.env.LEXORA_DESKTOP_SMOKE_TEST === '1')
    return

  await desktopHost.setAutostart(config.desktop.launchAtLogin)
}
