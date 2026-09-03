import { createConnection } from 'node:net'
import { isLoopbackBrowserUrl } from './BrowserSecurityPolicy'

const DEFAULT_TIMEOUT_MS = 1_500

export async function probeBrowserLocalServer(
  rawUrl: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<boolean> {
  if (!isLoopbackBrowserUrl(rawUrl))
    return false

  const url = new URL(rawUrl)
  const host = url.hostname.replace(/^\[|\]$/g, '')
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80

  return new Promise((resolve) => {
    const socket = createConnection({ host, port })
    let isSettled = false
    const settle = (isReady: boolean) => {
      if (isSettled)
        return
      isSettled = true
      socket.destroy()
      resolve(isReady)
    }
    socket.once('connect', () => settle(true))
    socket.once('error', () => settle(false))
    socket.once('timeout', () => settle(false))
    socket.setTimeout(timeoutMs)
  })
}
