import type { BuddyPlatformId } from '../shared/platform'
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { parse, resolve } from 'node:path'
import { currentPlatform } from './currentPlatform'
import { validateWindowsFilePath } from './windows/filePath'
import { ensureWindowsPrivateDirectories } from './windows/privateDirectories'

const adapters: Record<BuddyPlatformId, (paths: string[], executable?: string) => Promise<void>> = {
  async linux(paths) {
    await Promise.all(paths.map(path => mkdir(path, { recursive: true, mode: 0o700 })))
  },
  win32: ensureWindowsPrivateDirectories,
}

export async function ensurePrivateDirectories(paths: readonly string[], windowsExecutable?: string): Promise<void> {
  const windows = currentPlatform.id === 'win32'
  const directories = [...new Set(paths.map(path => windows ? validateWindowsFilePath(path) : resolve(path)))]
  const samePath = (left: string, right: string) => windows ? left.toLowerCase() === right.toLowerCase() : left === right
  if (directories.some(path => samePath(path, parse(path).root) || samePath(path, homedir())))
    throw new Error('Buddy private storage must use an application directory')
  if (directories.length)
    await adapters[currentPlatform.id](directories, windowsExecutable)
}
