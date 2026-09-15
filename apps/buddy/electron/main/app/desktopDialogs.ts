import type { BrowserWindow, MessageBoxOptions } from 'electron'
import type { LexoraConfig } from '../../shared/desktopApi'
import type { LexoraConfigStore } from '../config/LexoraConfigStore'
import type { DesktopEnvironment, DesktopQuitHost, DesktopQuitOptions } from './typing'
import { app, dialog, ipcMain, Notification, shell } from 'electron'
import { translateDesktopNative } from '../desktopNativeI18n'
import { confirmDraftFlushBeforeQuit, requestRendererDraftFlush } from '../rendererDraftLifecycle'
import { describeDesktopStartupFailure, resolveStartupFailureDirectory } from './desktopStartupFailure'

export async function showDesktopStartupFailure(error: unknown, language: LexoraConfig['desktop']['language'], environment?: Pick<DesktopEnvironment, 'paths' | 'diagnostics'>): Promise<void> {
  const directory = environment ? resolveStartupFailureDirectory(error, environment.paths) : undefined
  const options = describeDesktopStartupFailure(error, language, environment?.diagnostics.launchId, directory)
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
    if (response === 0) {
      app.relaunch()
      return
    }
    if (response !== 1 && !(response === 2 && directory))
      return
    try {
      if (response === 1) {
        if (await shell.openPath(environment.paths.logs))
          throw new Error('DIRECTORY_OPEN_FAILED')
      }
      else if (directory) {
        shell.showItemInFolder(directory)
      }
    }
    catch {
      await dialog.showMessageBox({ type: 'warning', title: options.title, message: translateDesktopNative(language, 'directoryOpenFailed') })
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
