import type { BrowserWindow, MessageBoxOptions } from 'electron'
import type { LexoraConfig } from '../../shared/desktopApi'
import type { LexoraConfigStore } from '../config/LexoraConfigStore'
import type { DesktopEnvironment, DesktopQuitHost, DesktopQuitOptions } from './typing'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { app, dialog, ipcMain, Notification, shell } from 'electron'
import { translateDesktopNative } from '../desktopNativeI18n'
import { confirmDraftFlushBeforeQuit, requestRendererDraftFlush } from '../rendererDraftLifecycle'
import { recoveryRelaunchArgs } from './desktopRecovery'
import { describeDesktopStartupFailure, resolveStartupFailureDirectory } from './desktopStartupFailure'

export async function showDesktopStartupFailure(error: unknown, language: LexoraConfig['desktop']['language'], environment?: Pick<DesktopEnvironment, 'paths' | 'diagnostics'>): Promise<void> {
  const directory = environment ? resolveStartupFailureDirectory(error, environment.paths) : undefined
  const diagnostics = environment?.diagnostics
  diagnostics?.record({ scope: 'desktop', level: 'info', event: 'startup.recovery.presented' })
  const status = await diagnostics?.flushWithin()
  const logsAvailable = !!status && status.written > 0 && status.failed === 0 && status.dropped === 0 && status.pendingBytes === 0 && status.unconfirmed === 0
  const options = describeDesktopStartupFailure(error, language, diagnostics?.launchId, directory, logsAvailable)
  if (!app.isReady()) {
    dialog.showErrorBox(options.message, options.detail ?? '')
    return
  }
  if (!environment) {
    await dialog.showMessageBox({ ...options, buttons: [translateDesktopNative(language, 'quit')], cancelId: 0 })
    return
  }
  while (true) {
    const { response } = await dialog.showMessageBox(options)
    const recoveryAction = response === 0 ? 'retry' : response === 1 ? 'open_logs' : response === 2 && directory ? 'show_directory' : 'quit'
    const operationId = randomUUID()
    const context = { scope: 'desktop', recoveryAction, operationId } as const
    environment.diagnostics.record({ ...context, level: 'info', event: 'startup.recovery.action_requested' })
    try {
      if (recoveryAction === 'retry') {
        app.relaunch({ args: recoveryRelaunchArgs(process.argv, environment.diagnostics.launchId) })
      }
      else if (recoveryAction === 'open_logs') {
        if (await shell.openPath(environment.paths.logs))
          throw new Error('DIRECTORY_OPEN_FAILED')
      }
      else if (recoveryAction === 'show_directory' && directory) {
        shell.showItemInFolder(directory)
      }
      environment.diagnostics.record({ ...context, level: 'info', event: 'startup.recovery.action_dispatched' })
      if (recoveryAction === 'retry' || recoveryAction === 'quit')
        return
    }
    catch {
      environment.diagnostics.record({ ...context, level: 'warn', event: 'startup.recovery.action_failed', errorCode: recoveryAction === 'retry' ? 'RELAUNCH_FAILED' : 'DIRECTORY_OPEN_FAILED' })
      await dialog.showMessageBox({ type: 'warning', title: options.title, message: translateDesktopNative(language, recoveryAction === 'retry' ? 'restartFailed' : 'directoryOpenFailed') })
    }
  }
}

export function confirmDesktopQuit(host: DesktopQuitHost, options: DesktopQuitOptions): Promise<boolean> {
  return confirmDraftFlushBeforeQuit(
    () => requestRendererDraftFlush(host.getWindow(), ipcMain),
    options.discardDraftsOnFailure
      ? async () => 'discard'
      : async () => {
        const language = host.getLanguage()
        const options: MessageBoxOptions = {
          buttons: [
            translateDesktopNative(language, 'retrySave'),
            translateDesktopNative(language, 'cancel'),
            translateDesktopNative(language, 'quitWithoutSaving'),
          ],
          cancelId: 1,
          defaultId: 0,
          detail: translateDesktopNative(language, 'saveBeforeQuitBody'),
          message: translateDesktopNative(language, 'saveBeforeQuitTitle'),
          noLink: true,
          type: 'warning',
        }
        const window = host.getWindow()
        const result = await (window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options))
        return result.response === 0 ? 'retry' : result.response === 1 ? 'cancel' : 'discard'
      },
  )
}

export async function showBackgroundCloseNotice(configStore: LexoraConfigStore): Promise<void> {
  const config = await configStore.read()
  if (config.desktop.backgroundCloseNoticeShown || !config.desktop.notificationsEnabled || !Notification.isSupported())
    return
  new Notification({
    body: translateDesktopNative(config.desktop.language, 'backgroundCloseBody'),
    title: translateDesktopNative(config.desktop.language, 'backgroundCloseTitle'),
  }).show()
  await configStore.update({ desktop: { backgroundCloseNoticeShown: true } })
}

export function showLegacyPowerShellNotice(
  window: BrowserWindow,
  getLanguage: () => LexoraConfig['desktop']['language'],
  environment: DesktopEnvironment,
): void {
  const show = () => {
    const language = getLanguage()
    void dialog.showMessageBox(window, {
      type: 'warning',
      title: 'Lexora Buddy',
      message: translateDesktopNative(language, 'powerShellLegacyNotice'),
      buttons: [
        translateDesktopNative(language, 'continueWithLegacyPowerShell'),
        translateDesktopNative(language, 'viewPowerShellInstallGuide'),
      ],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    }).then(async ({ response }) => {
      if (response === 1)
        await shell.openExternal('https://learn.microsoft.com/powershell/scripting/install/install-powershell-on-windows')
    }).catch((error) => {
      environment.diagnostics.record({ scope: 'desktop', level: 'warn', event: 'powershell.notice_failed', error })
    })
  }
  if (window.isVisible())
    show()
  else
    window.once('show', show)
}
