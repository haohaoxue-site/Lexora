import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it } from 'vitest'
import { readBoundedFile } from '../boundedFile'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe.skipIf(process.platform !== 'linux')('linux native bounded reads', () => {
  it('resolves internal absolute links and rejects escaping links', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'buddy-bounded-')))
    roots.push(root)
    const workspace = join(root, 'workspace')
    await mkdir(workspace)
    await writeFile(join(workspace, '文档.txt'), 'inside')
    await symlink(join(workspace, '文档.txt'), join(workspace, 'link'))
    expect((await readBoundedFile(workspace, join(workspace, 'link'), 6)).toString()).toBe('inside')
    await expect(readBoundedFile(workspace, join(workspace, 'link'), 5)).rejects.toMatchObject({ code: 'BOUNDED_FILE_OUTPUT_LIMIT' })
    await writeFile(join(root, 'outside'), 'secret')
    await symlink(join(root, 'outside'), join(workspace, 'escape'))
    await expect(readBoundedFile(workspace, join(workspace, 'escape'))).rejects.toMatchObject({ code: 'BOUNDED_FILE_READ_FAILED' })
  })

  it('does not return bytes after cancellation', async () => {
    await expect(readBoundedFile('/tmp', '/tmp/unused', 10, AbortSignal.abort())).rejects.toMatchObject({ code: 'BOUNDED_FILE_READ_FAILED' })
  })
})
