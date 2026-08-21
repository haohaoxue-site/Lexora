import { homedir } from 'node:os'
import { isAbsolute, join, normalize } from 'node:path'
import process from 'node:process'

export function resolveLexoraHome(
  override = process.env.LEXORA_HOME,
  userHome = homedir(),
): string {
  if (!override)
    return join(userHome, '.lexora')

  if (!isAbsolute(override))
    throw new Error('LEXORA_HOME must be an absolute path')

  return normalize(override)
}

export interface DesktopStoragePathOptions {
  userHome: string
  xdgCacheHome: string | undefined
  xdgStateHome: string | undefined
}

export interface DesktopStoragePaths {
  crashDumps: string
  logs: string
  sessionData: string
}

export function resolveDesktopStoragePaths(
  options: DesktopStoragePathOptions,
): DesktopStoragePaths {
  const cacheHome = resolveAbsoluteXdgDirectory(
    options.xdgCacheHome,
    join(options.userHome, '.cache'),
  )
  const stateHome = resolveAbsoluteXdgDirectory(
    options.xdgStateHome,
    join(options.userHome, '.local', 'state'),
  )
  const stateRoot = join(stateHome, 'lexora-buddy')
  return {
    crashDumps: join(stateRoot, 'crashes'),
    logs: join(stateRoot, 'logs'),
    sessionData: join(cacheHome, 'lexora-buddy', 'chromium'),
  }
}

function resolveAbsoluteXdgDirectory(value: string | undefined, fallback: string): string {
  return value && isAbsolute(value) ? normalize(value) : fallback
}
