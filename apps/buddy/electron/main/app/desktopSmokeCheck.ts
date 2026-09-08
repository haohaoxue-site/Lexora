import type { BrowserWindow } from 'electron'

export async function checkDesktopSmokeBridge(window: BrowserWindow): Promise<void> {
  const bridgeAvailable = await window.webContents.executeJavaScript(
    'typeof globalThis.lexoraDesktop === "object"',
    true,
  )
  if (bridgeAvailable !== true)
    throw new Error('Lexora Buddy Desktop Preload bridge is unavailable')
  const providers = await window.webContents.executeJavaScript(
    'globalThis.lexoraDesktop.localChat.providers.list()',
    true,
  )
  if (!Array.isArray(providers))
    throw new Error('Lexora Buddy Desktop Local Service provider registry is unavailable')
  const status = await window.webContents.executeJavaScript(
    'globalThis.lexoraDesktop.localChat.runtime.getStatus()',
    true,
  )
  if (!status || typeof status !== 'object' || status.status !== 'ready')
    throw new Error('Lexora Buddy Desktop Preload local chat IPC is unavailable')
}
