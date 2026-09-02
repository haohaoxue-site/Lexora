import type { BrowserWindow, IpcMainInvokeEvent } from 'electron'
import type { BrowserHost } from './BrowserHost'
import { dirname } from 'node:path'
import { dialog, ipcMain } from 'electron'
import { DESKTOP_IPC_CHANNELS } from '../../shared/desktopApi'
import {
  browserEnsureSessionInputSchema,
  browserNavigateInputSchema,
  browserOpenLocalFileInputSchema,
  browserSessionInputSchema,
  browserSetSurfaceInputSchema,
  desktopBrowserStateSchema,
} from '../../shared/desktopApiSchemas'
import { assertTrustedSender } from '../ipc'

export interface RegisterBrowserDesktopIpcOptions {
  getHost: () => BrowserHost | null
  getWindow: () => BrowserWindow | null
}

export function registerBrowserDesktopIpc(
  options: RegisterBrowserDesktopIpcOptions,
): () => void {
  const registeredChannels: string[] = []
  const handle = (
    channel: string,
    handler: (host: BrowserHost, input: unknown) => unknown,
  ) => {
    registeredChannels.push(channel)
    ipcMain.handle(channel, async (event: IpcMainInvokeEvent, input: unknown) => {
      assertTrustedSender(event, options.getWindow())
      const host = requireBrowserHost(options.getHost())
      return handler(host, input)
    })
  }

  handle(DESKTOP_IPC_CHANNELS.browserEnsureSession, (host, input) => {
    const { conversationId } = browserEnsureSessionInputSchema.parse(input)
    return desktopBrowserStateSchema.parse(host.ensureSession(conversationId))
  })
  handle(DESKTOP_IPC_CHANNELS.browserEnablePersonalProfile, async (host, input) => {
    const { sessionId } = browserSessionInputSchema.parse(input)
    takeHumanControl(host, sessionId)
    return desktopBrowserStateSchema.parse(await host.enablePersonalProfile(sessionId))
  })
  handle(DESKTOP_IPC_CHANNELS.browserFocusPage, (host, input) => {
    const { sessionId } = browserSessionInputSchema.parse(input)
    takeHumanControl(host, sessionId)
    host.focusPage(sessionId)
  })
  handle(DESKTOP_IPC_CHANNELS.browserGoBack, (host, input) => {
    const { sessionId } = browserSessionInputSchema.parse(input)
    takeHumanControl(host, sessionId)
    host.goBack(sessionId)
  })
  handle(DESKTOP_IPC_CHANNELS.browserGoForward, (host, input) => {
    const { sessionId } = browserSessionInputSchema.parse(input)
    takeHumanControl(host, sessionId)
    host.goForward(sessionId)
  })
  handle(DESKTOP_IPC_CHANNELS.browserNavigate, async (host, input) => {
    const { sessionId, url } = browserNavigateInputSchema.parse(input)
    takeHumanControl(host, sessionId)
    return desktopBrowserStateSchema.parse(await host.navigate(sessionId, url))
  })
  handle(DESKTOP_IPC_CHANNELS.browserOpenLocalFile, async (host, input) => {
    const { sessionId } = browserOpenLocalFileInputSchema.parse(input)
    takeHumanControl(host, sessionId)
    const window = options.getWindow()
    if (!window)
      throw new Error('Browser window is unavailable')
    const result = await dialog.showOpenDialog(window, {
      filters: [{ extensions: ['html', 'htm'], name: 'HTML' }],
      properties: ['openFile'],
    })
    const entryPath = result.canceled ? null : result.filePaths[0] ?? null
    if (!entryPath)
      return null
    return desktopBrowserStateSchema.parse(await host.openLocalFile(sessionId, {
      entryPath,
      rootPath: dirname(entryPath),
    }))
  })
  handle(DESKTOP_IPC_CHANNELS.browserReload, (host, input) => {
    const { sessionId } = browserSessionInputSchema.parse(input)
    takeHumanControl(host, sessionId)
    host.reload(sessionId)
  })
  handle(DESKTOP_IPC_CHANNELS.browserResetPersonalProfile, async (host, input) => {
    const { sessionId } = browserSessionInputSchema.parse(input)
    takeHumanControl(host, sessionId)
    return desktopBrowserStateSchema.parse(await host.resetPersonalProfile(sessionId))
  })
  handle(DESKTOP_IPC_CHANNELS.browserSetSurface, (host, input) => {
    host.setSurface(browserSetSurfaceInputSchema.parse(input))
  })
  handle(DESKTOP_IPC_CHANNELS.browserStop, (host, input) => {
    const { sessionId } = browserSessionInputSchema.parse(input)
    takeHumanControl(host, sessionId)
    host.stop(sessionId)
  })
  handle(DESKTOP_IPC_CHANNELS.browserTakeControl, (host, input) => {
    const { sessionId } = browserSessionInputSchema.parse(input)
    return desktopBrowserStateSchema.parse(host.takeControl(sessionId))
  })
  handle(DESKTOP_IPC_CHANNELS.browserClose, (host, input) => {
    const { sessionId } = browserSessionInputSchema.parse(input)
    host.close(sessionId)
  })

  return () => {
    for (const channel of registeredChannels)
      ipcMain.removeHandler(channel)
  }
}

function requireBrowserHost(host: BrowserHost | null): BrowserHost {
  if (!host)
    throw new Error('Browser host is unavailable')
  return host
}

function takeHumanControl(host: BrowserHost, sessionId: string): void {
  if (host.getState(sessionId).controller === 'agent')
    host.takeControl(sessionId)
}
