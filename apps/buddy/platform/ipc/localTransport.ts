import { chmod, lstat, mkdir, unlink } from 'node:fs/promises'
import { dirname, isAbsolute } from 'node:path'
import { isLocalNamedPipe } from '../../shared/platform/localEndpoint'

export interface LocalEndpoint {
  address: string
  prepare: () => Promise<void>
  secure: () => Promise<void>
  dispose: () => Promise<void>
}

export const localTransports = {
  unix: createUnixEndpoint,
  namedPipe: createNamedPipeEndpoint,
}

function createNamedPipeEndpoint(address: string): LocalEndpoint {
  if (!isLocalNamedPipe(address))
    throw new Error('Expected a local named pipe endpoint')
  return { address, prepare: async () => {}, secure: async () => {}, dispose: async () => {} }
}

function createUnixEndpoint(address: string): LocalEndpoint {
  if (!isAbsolute(address))
    throw new Error('Expected an absolute Unix socket endpoint')
  return {
    address,
    async prepare() {
      await mkdir(dirname(address), { mode: 0o700, recursive: true })
      const metadata = await socketMetadata(address)
      if (!metadata)
        return
      if (!metadata.isSocket())
        throw new Error('Local socket path is occupied by a non-socket file')
      await unlink(address)
    },
    secure: () => chmod(address, 0o600),
    async dispose() {
      if ((await socketMetadata(address))?.isSocket())
        await unlink(address)
    },
  }
}

async function socketMetadata(address: string) {
  try {
    return await lstat(address)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return null
    throw error
  }
}
