import type { DirectoryGrant } from '../resolveGrantedPath'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { GrantedPathError, resolveGrantedPath } from '../resolveGrantedPath'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { force: true, recursive: true })))
})

describe('resolveGrantedPath', () => {
  it('allows existing files and new paths inside an authorized canonical root', async () => {
    const fixture = await createFixture()
    const existing = join(fixture.directory, 'notes.md')
    await writeFile(existing, 'hello')

    await expect(resolveGrantedPath(fixture.grants, existing, 'existing')).resolves.toEqual({
      canonicalPath: existing,
      grantId: 'directory-1',
      root: fixture.directory,
    })
    await expect(resolveGrantedPath(
      fixture.grants,
      join(fixture.directory, 'drafts', 'article.md'),
      'create',
    )).resolves.toEqual({
      canonicalPath: join(fixture.directory, 'drafts', 'article.md'),
      grantId: 'directory-1',
      root: fixture.directory,
    })
  })

  it('rejects traversal and absolute outside paths without offering approval', async () => {
    for (const requestedPath of [
      (directory: string) => join(directory, '..', 'outside.txt'),
      (_directory: string, root: string) => join(root, 'outside.txt'),
    ]) {
      const fixture = await createFixture()
      await expect(resolveGrantedPath(
        fixture.grants,
        requestedPath(fixture.directory, fixture.root),
        'create',
      )).rejects.toMatchObject({ code: 'PATH_OUTSIDE_GRANTED_DIRECTORY' })
    }
  })

  it('rejects existing targets reached through a symlink outside the grant', async () => {
    const fixture = await createFixture()
    const outside = join(fixture.root, 'outside')
    await mkdir(outside)
    await writeFile(join(outside, 'secret.txt'), 'secret')
    await symlink(outside, join(fixture.directory, 'escape'))

    await expect(resolveGrantedPath(
      fixture.grants,
      join(fixture.directory, 'escape', 'secret.txt'),
      'existing',
    )).rejects.toBeInstanceOf(GrantedPathError)
  })

  it('rejects a create target beneath an existing regular file', async () => {
    const fixture = await createFixture()
    const file = join(fixture.directory, 'notes.md')
    await writeFile(file, 'fixture')
    await expect(resolveGrantedPath(fixture.grants, join(file, 'child.md'), 'create'))
      .rejects
      .toMatchObject({ code: 'INVALID_PATH' })
  })

  it('does not grant a missing target through a dangling symlink', async () => {
    const fixture = await createFixture()
    const link = join(fixture.directory, 'new.txt')
    await symlink(join(fixture.root, 'outside.txt'), link)
    await expect(resolveGrantedPath(fixture.grants, link, 'create'))
      .rejects
      .toMatchObject({ code: 'INVALID_PATH' })
  })

  it('rejects new targets whose nearest existing parent is a symlink outside the grant', async () => {
    const fixture = await createFixture()
    const outside = join(fixture.root, 'outside')
    await mkdir(outside)
    await symlink(outside, join(fixture.directory, 'escape'))

    await expect(resolveGrantedPath(
      fixture.grants,
      join(fixture.directory, 'escape', 'new', 'document.md'),
      'create',
    )).rejects.toMatchObject({ code: 'PATH_OUTSIDE_GRANTED_DIRECTORY' })
  })
})

async function createFixture(): Promise<{
  directory: string
  grants: DirectoryGrant[]
  root: string
}> {
  const root = await mkdtemp(join(tmpdir(), 'lexora-buddy-paths-'))
  directories.push(root)
  const directory = join(root, 'directory')
  await mkdir(directory)
  return {
    directory,
    grants: [{ canonicalRoot: directory, grantId: 'directory-1', kind: 'workspace' as const, root: directory }],
    root,
  }
}
