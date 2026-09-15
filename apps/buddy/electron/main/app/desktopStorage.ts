import type { PrivateDirectoryFailure } from '../../../shared/diagnostics/privateDirectoryFailure'
import type { BuddyRuntimePaths } from '../paths'
import { randomUUID } from 'node:crypto'
import { open, readFile, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { ensurePrivateDirectories } from '../../../platform/filesystem/privateDirectories'
import { PrivateDirectoryError } from '../../../platform/windows/privateDirectories'
import { DesktopBootstrapError } from './desktopBootstrap'

type DirectoryRole = NonNullable<PrivateDirectoryFailure['directoryRole']>

export async function checkDesktopDirectories(directories: Partial<Record<DirectoryRole, string>>, executable?: string): Promise<void> {
  const entries = Object.entries(directories) as [DirectoryRole, string][]
  const unique = entries.filter(([, path], index) => entries.findIndex(([, candidate]) => candidate === path) === index)
  try {
    await ensurePrivateDirectories(unique.map(([, path]) => path), executable)
  }
  catch (error) {
    if (error instanceof PrivateDirectoryError && error.failure.directoryIndex !== undefined)
      error.failure.directoryRole = unique[error.failure.directoryIndex]?.[0]
    throw error
  }
  for (const [role, directory] of unique) {
    try {
      await probeDirectory(directory)
    }
    catch (error) {
      throw new DesktopBootstrapError({ kind: 'desktop_bootstrap', operation: 'probe_directory', directoryRole: role }, error)
    }
  }
}

export function criticalDesktopDirectories(paths: BuddyRuntimePaths) {
  return { lexora_home: paths.lexoraHome, user_data: paths.userData, session_data: paths.sessionData } as const
}

async function probeDirectory(directory: string): Promise<void> {
  const source = join(directory, `.lexora-startup-${randomUUID()}.tmp`)
  const target = `${source}.renamed`
  const handle = await open(source, 'wx', 0o600)
  let current = source
  try {
    try {
      await handle.writeFile('Lexora startup check', 'utf8')
      await handle.sync()
    }
    finally {
      await handle.close()
    }
    if (await readFile(source, 'utf8') !== 'Lexora startup check')
      throw Object.assign(new Error('Directory probe could not be verified'), { code: 'EIO' })
    await rename(source, target)
    current = target
  }
  finally {
    await rm(current)
  }
}
