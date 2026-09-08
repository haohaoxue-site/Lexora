import type { DesktopEnvironment } from './typing'
import { mkdirSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname } from 'node:path'
import process from 'node:process'
import { app, crashReporter, Menu } from 'electron'
import buddyPackage from '../../../package.json'
import { currentPlatform } from '../../../platform/currentPlatform'
import { ensurePrivateDirectories } from '../../../platform/filesystem/privateDirectories'
import { resolveBuddyPrivateDirectories } from '../../../platform/native/nativeHost'
import developmentDesktopIconPath from '../../../resources/icons/app-icon-dev.png?asset'
import stableDesktopIconPath from '../../../resources/icons/app-icon.png?asset'
import developmentTrayIconPath from '../../../resources/icons/tray-icon-dev.png?asset'
import { registerAttachmentSchemePrivileges } from '../attachmentProtocol'
import { DesktopDiagnosticLogger } from '../desktopDiagnostics'
import { resolveBuddyRuntimePaths } from '../paths'
import { desktopHosts } from '../platform/desktopHost'
import { registerRendererSchemePrivileges } from '../rendererProtocol'
import { resolveDesktopLaunchIntent } from '../startupIntent'

export function prepareDesktopEnvironment(): DesktopEnvironment {
  const desktopHost = desktopHosts[currentPlatform.id]
  const isSmokeTest = process.env.LEXORA_DESKTOP_SMOKE_TEST === '1'
  const paths = resolveBuddyRuntimePaths({
    defaultUserData: app.getPath('userData'),
    desktopName: buddyPackage.desktopName,
    isPackaged: app.isPackaged,
    localAppData: process.env.LOCALAPPDATA,
    lexoraHomeOverride: process.env.LEXORA_HOME,
    nativePetSocketOverride: process.env.LEXORA_BUDDY_PET_SOCKET,
    nativePetStateOverride: process.env.LEXORA_BUDDY_PET_STATE_PATH,
    profileOverride: process.env.LEXORA_BUDDY_PROFILE,
    smokeTest: isSmokeTest,
    temporaryDirectory: tmpdir(),
    userDataOverride: app.commandLine.hasSwitch('user-data-dir')
      ? app.commandLine.getSwitchValue('user-data-dir')
      : undefined,
    userHome: homedir(),
    userId: process.geteuid?.() ?? 0,
    xdgCacheHome: process.env.XDG_CACHE_HOME,
    xdgConfigHome: process.env.XDG_CONFIG_HOME,
    xdgRuntimeDirectory: process.env.XDG_RUNTIME_DIR,
    xdgStateHome: process.env.XDG_STATE_HOME,
  })
  for (const directory of new Set([
    paths.crashDumps,
    paths.logs,
    paths.sessionData,
    paths.userData,
    dirname(paths.windowState),
  ])) {
    mkdirSync(directory, { mode: 0o700, recursive: true })
  }
  app.setName(paths.appName)
  app.setPath('userData', paths.userData)
  app.setPath('sessionData', paths.sessionData)
  app.setPath('crashDumps', paths.crashDumps)
  app.setAppLogsPath(paths.logs)
  crashReporter.start({ productName: paths.appName, uploadToServer: false })
  const diagnostics = new DesktopDiagnosticLogger({ directory: paths.logs, userHome: homedir() })
  registerAttachmentSchemePrivileges()
  registerRendererSchemePrivileges()
  desktopHost.setIdentity(paths.desktopName)
  return {
    diagnostics,
    desktopIconPath: paths.iconVariant === 'development' ? developmentDesktopIconPath : stableDesktopIconPath,
    initialLaunchIntent: resolveDesktopLaunchIntent(process.argv),
    isSmokeTest,
    paths,
    serviceDiagnosticOutput: diagnostics.createWritable('local-service', process.stderr),
    setAutostart: desktopHost.setAutostart,
    trayIconPath: paths.iconVariant === 'development' ? developmentTrayIconPath : stableDesktopIconPath,
    writeDiagnostic(message) {
      process.stderr.write(`[Lexora Buddy Desktop] ${message}\n`)
      void diagnostics.write('desktop', message)
    },
  }
}

export async function prepareDesktopReady(environment: DesktopEnvironment): Promise<void> {
  const { paths } = environment
  await ensurePrivateDirectories([
    paths.lexoraHome,
    paths.userData,
    paths.sessionData,
    dirname(paths.windowState),
  ], resolveBuddyPrivateDirectories({
    appPath: app.getAppPath(),
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
  }))
  app.setAppUserModelId(paths.desktopName)
  Menu.setApplicationMenu(null)
}
