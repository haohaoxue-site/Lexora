import type { BrowserWindow } from 'electron'
import type { ApplicationLogReader } from '../diagnostics/ApplicationLogReader'
import { ipcMain } from 'electron'
import { applicationLogQuerySchema } from '../../../shared/diagnostics/applicationLog'
import { DESKTOP_IPC_CHANNELS } from '../../shared/desktopApi'
import { assertTrustedSender } from '../ipc'

export function registerApplicationLogIpc(reader: ApplicationLogReader, getWindow: () => BrowserWindow | null): () => void {
  ipcMain.handle(DESKTOP_IPC_CHANNELS.appLogsQuery, async (event, input: unknown) => {
    assertTrustedSender(event, getWindow())
    const query = applicationLogQuerySchema.parse(input)
    try {
      return await reader.query(query)
    }
    catch {
      throw new Error('APPLICATION_LOG_READ_FAILED')
    }
  })
  return () => ipcMain.removeHandler(DESKTOP_IPC_CHANNELS.appLogsQuery)
}
