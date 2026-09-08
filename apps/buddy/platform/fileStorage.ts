import type { BuddyPlatformId } from '../shared/platform'
import { open, rename, stat } from 'node:fs/promises'
import { currentPlatform } from './currentPlatform'

export interface FileStorage {
  durability: 'file-and-directory-sync' | 'file-sync'
  replace: (source: string, destination: string) => Promise<void>
  syncDirectory: (path: string) => Promise<void>
}

export const fileStorageAdapters: Record<BuddyPlatformId, FileStorage> = {
  linux: {
    durability: 'file-and-directory-sync',
    replace: rename,
    async syncDirectory(path) {
      const directory = await open(path, 'r')
      try {
        await directory.sync()
      }
      finally {
        await directory.close()
      }
    },
  },
  win32: {
    durability: 'file-sync',
    replace: rename,
    async syncDirectory(path) {
      if (!(await stat(path)).isDirectory())
        throw new Error('Storage commit parent is not a directory')
    },
  },
}

export const fileStorage = fileStorageAdapters[currentPlatform.id]
