import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createTemporaryDirectory } from '@buddy-tests/temporaryDirectories'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PrivateDirectoryError } from '../../../../platform/windows/privateDirectories'
import { checkDesktopDirectories } from '../desktopStorage'

const native = vi.hoisted(() => ({ failure: undefined as unknown }))
vi.mock('../../../../platform/filesystem/privateDirectories', () => ({ ensurePrivateDirectories: async () => {
  if (native.failure)
    throw native.failure
} }))
beforeEach(() => {
  native.failure = undefined
})

describe('startup data directory checks', () => {
  it('verifies file access and cleans up only its own probe, preserving existing data', async () => {
    const directory = await createTemporaryDirectory('buddy-storage-')
    await writeFile(join(directory, 'preserved.txt'), 'existing data')
    await checkDesktopDirectories({ lexora_home: directory, user_data: directory })
    expect(await readdir(directory)).toEqual(['preserved.txt'])
    expect(await readFile(join(directory, 'preserved.txt'), 'utf8')).toBe('existing data')
  })

  it('does not probe any directory until the entire ACL check succeeds and maps deduplicated failure roles', async () => {
    const directory = await createTemporaryDirectory('buddy-storage-')
    const child = join(directory, 'child')
    await mkdir(child)
    native.failure = new PrivateDirectoryError('PRIVATE_DIRECTORIES_UNSAFE', { kind: 'private_directories', operation: 'validate_acl', directoryIndex: 1 })
    await expect(checkDesktopDirectories({ lexora_home: directory, user_data: directory, session_data: child })).rejects.toMatchObject({ failure: { directoryRole: 'session_data' } })
    expect(await readdir(child)).toEqual([])
    expect(await readdir(directory)).toEqual(['child'])
  })

  it('reports a bounded access-probe failure even when ACL verification passed', async () => {
    const directory = await createTemporaryDirectory('buddy-storage-')
    await expect(checkDesktopDirectories({ user_data: join(directory, 'missing') })).rejects.toMatchObject({ code: 'DESKTOP_BOOTSTRAP_FAILED', failure: { kind: 'desktop_bootstrap', operation: 'probe_directory', directoryRole: 'user_data', systemCode: 'ENOENT' } })
  })
})
