import type { BrowserWindow } from 'electron'
import type { ApplicationEvents } from '../../../shared/observability/ApplicationEvents'
import type { DesktopStartup } from './DesktopStartup'
import { ipcMain } from 'electron'
import { applicationDiagnosticSchema } from '../../../shared/diagnostics/applicationDiagnostic'
import { DESKTOP_IPC_CHANNELS } from '../../shared/desktopApi'
import { assertTrustedSender } from '../ipc'

export function registerStartupIpc(startup: DesktopStartup, getWindow: () => BrowserWindow | null, events: ApplicationEvents): () => void {
  ipcMain.handle(DESKTOP_IPC_CHANNELS.appStartupGetState, (event) => {
    assertTrustedSender(event, getWindow())
    return startup.state
  })
  ipcMain.handle(DESKTOP_IPC_CHANNELS.appStartupReport, (event, input: unknown) => {
    assertTrustedSender(event, getWindow())
    const report = applicationDiagnosticSchema.parse(input)
    if (!report.component || !(report.component === 'renderer' || report.component.startsWith('renderer.')) || !(report.event.startsWith('component.') || report.event.startsWith('startup.step.')))
      throw new Error('Invalid renderer startup stage')
    events.publish(report)
  })
  const stop = startup.onStateChange((state) => {
    const contents = getWindow()?.webContents
    if (contents && !contents.isDestroyed())
      contents.send(DESKTOP_IPC_CHANNELS.appStartupStateChanged, state)
  })
  return () => {
    stop()
    ipcMain.removeHandler(DESKTOP_IPC_CHANNELS.appStartupGetState)
    ipcMain.removeHandler(DESKTOP_IPC_CHANNELS.appStartupReport)
  }
}
