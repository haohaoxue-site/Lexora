import type { BrowserWindow, MessageBoxOptions } from 'electron'
import type { LexoraConfig } from '../../shared/desktopApi'
import type { LexoraConfigStore } from '../config/LexoraConfigStore'
import type { DesktopEnvironment, DesktopQuitHost, DesktopQuitOptions } from './typing'
import { dialog, ipcMain, Notification, shell } from 'electron'
import { translateDesktopNative } from '../desktopNativeI18n'
import { confirmDraftFlushBeforeQuit, requestRendererDraftFlush } from '../rendererDraftLifecycle'

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
    }).catch(() => environment.writeDiagnostic('PowerShell notice could not be displayed'))
  }
  if (window.isVisible())
    show()
  else
    window.once('show', show)
}
