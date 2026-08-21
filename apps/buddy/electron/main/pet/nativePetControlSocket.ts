import { createConnection } from 'node:net'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import process from 'node:process'

const CONTROL_TIMEOUT_MS = 1500

interface NativePetControlSocketPathOptions {
  env: NodeJS.ProcessEnv
  temporaryDirectory: string
  userId: number
}

export function resolveNativePetControlSocketPath(
  options: NativePetControlSocketPathOptions,
): string {
  const override = options.env.LEXORA_BUDDY_PET_SOCKET
  if (override) {
    if (!isAbsolute(override))
      throw new Error('LEXORA_BUDDY_PET_SOCKET must be an absolute path')
    return override
  }
  if (options.env.XDG_RUNTIME_DIR) {
    return join(options.env.XDG_RUNTIME_DIR, 'lexora-buddy', 'native-pet.sock')
  }
  return join(
    options.temporaryDirectory,
    `lexora-buddy-uid-${options.userId}`,
    'native-pet.sock',
  )
}

export function sendNativePetControlRequest(
  request: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const socketPath = resolveNativePetControlSocketPath({
    env,
    temporaryDirectory: tmpdir(),
    userId: process.geteuid?.() ?? 0,
  })

  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath)
    let buffer = ''
    let connected = false
    let settled = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    const finish = (result: boolean) => {
      if (settled)
        return
      settled = true
      if (timeout)
        clearTimeout(timeout)
      socket.destroy()
      resolve(result)
    }
    const finishAfterTimeout = () => finish(connected)
    timeout = setTimeout(finishAfterTimeout, CONTROL_TIMEOUT_MS)
    socket.setEncoding('utf8')
    socket.once('connect', () => {
      connected = true
      socket.write(`${JSON.stringify(request)}\n`)
    })
    socket.on('data', (chunk: string) => {
      buffer += chunk
      if (buffer.includes('\n'))
        finish(true)
    })
    socket.once('error', (error: NodeJS.ErrnoException) => {
      if (connected) {
        finish(true)
        return
      }
      if (error.code === 'ENOENT' || error.code === 'ECONNREFUSED') {
        finish(false)
        return
      }
      if (!settled) {
        settled = true
        if (timeout)
          clearTimeout(timeout)
        reject(error)
      }
    })
  })
}

export function probeNativePetControlSocket(
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  return sendNativePetControlRequest({ type: 'state' }, env)
}

export function reloadNativePetConfig(
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  return sendNativePetControlRequest({ type: 'reload_config' }, env)
}
