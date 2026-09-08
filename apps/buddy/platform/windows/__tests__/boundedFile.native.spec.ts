import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { readNativeBoundedFile as readWindowsBoundedFile } from '../../filesystem/nativeBoundedFile'
import { resolveBuddyFileReader } from '../../native/nativeHost'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe.skipIf(process.platform !== 'win32')('windows Rust file reader', () => {
  const previousReader = process.env.LEXORA_BUDDY_FILE_READER
  beforeAll(() => {
    process.env.LEXORA_BUDDY_FILE_READER = resolveBuddyFileReader({ appPath: join(import.meta.dirname, '../../..'), isPackaged: false, resourcesPath: '' })
  })
  afterAll(() => {
    if (previousReader === undefined)
      delete process.env.LEXORA_BUDDY_FILE_READER
    else
      process.env.LEXORA_BUDDY_FILE_READER = previousReader
  })

  it('reads binary and Unicode files without PowerShell, enforces size and rejects escaping junctions', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'buddy-windows-file-')))
    roots.push(root)
    const workspace = join(root, 'workspace')
    const outside = join(root, 'workspace-other')
    await Promise.all([mkdir(workspace), mkdir(outside)])
    const file = join(workspace, '文档.bin')
    const bytes = Buffer.from([0, 1, 2, 128, 255])
    await writeFile(file, bytes)
    expect(await readWindowsBoundedFile(workspace, file, bytes.length)).toEqual(bytes)
    await expect(readWindowsBoundedFile(workspace, file, bytes.length - 1)).rejects.toMatchObject({ code: 'BOUNDED_FILE_OUTPUT_LIMIT' })
    await writeFile(join(workspace, 'empty'), '')
    expect(await readWindowsBoundedFile(workspace, join(workspace, 'empty'), 0)).toEqual(Buffer.alloc(0))
    await writeFile(join(outside, 'secret'), 'outside')
    await symlink(outside, join(workspace, 'escape'), 'junction')
    for (const path of [workspace, join(outside, 'secret'), join(workspace, 'escape', 'secret')])
      await expect(readWindowsBoundedFile(workspace, path, 64)).rejects.toMatchObject({ code: 'BOUNDED_FILE_READ_FAILED' })
    await symlink(outside, join(root, 'swapped-root'), 'junction')
    await expect(readWindowsBoundedFile(join(root, 'swapped-root'), join(outside, 'secret'), 64)).rejects.toMatchObject({ code: 'BOUNDED_FILE_READ_FAILED' })
  }, 60_000)

  it('rejects malformed native requests without returning file bytes or host paths', async () => {
    for (const request of [
      { root: 'C:\\', path: 'C:\\NUL', maxBytes: 32 },
      { root: 'C:\\', path: '\\\\?\\GLOBALROOT\\Device\\HarddiskVolume1', maxBytes: 32 },
      { root: 'C:\\', path: 'C:\\file:stream', maxBytes: 32 },
      { root: 'C:\\', path: 'C:\\file', maxBytes: 67_108_865 },
      { root: 'C:\\', path: 'C:\\file', maxBytes: 32, command: 'whoami' },
    ]) {
      const result = await new Promise<{ code: unknown, stdout: Buffer, stderr: Buffer }>((resolve) => {
        const child = execFile(process.env.LEXORA_BUDDY_FILE_READER!, [], { encoding: 'buffer', windowsHide: true, timeout: 30_000 }, (error, stdout, stderr) => {
          resolve({ code: error?.code, stdout, stderr })
        })
        child.stdin?.on('error', () => {})
        child.stdin?.end(JSON.stringify(request))
      })
      expect(result.code).toBe(1)
      expect(result.stdout).toEqual(Buffer.alloc(0))
      expect(result.stderr.toString('utf8').trim()).toMatch(/^BOUNDED_FILE_(READ_FAILED|OUTPUT_LIMIT)$/)
    }
  }, 60_000)
})
