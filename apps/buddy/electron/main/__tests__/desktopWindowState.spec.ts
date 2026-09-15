import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createTemporaryDirectory } from '@buddy-tests/temporaryDirectories'
import { describe, expect, it } from 'vitest'
import {
  DesktopWindowStateStore,
  resolveVisibleWindowPlacement,
} from '../desktopWindowState'

describe('desktop window state', () => {
  it('uses default placement and skips persistence when optional storage is unavailable', async () => {
    const failures: unknown[] = []
    const store = new DesktopWindowStateStore({ path: null, onError: error => failures.push(error) })
    await expect(store.read()).resolves.toBeNull()
    await expect(store.write({ height: 820, width: 1280, maximized: false, x: 40, y: 60 })).resolves.toBeUndefined()
    expect(failures).toEqual([])
  })
  it('restores only placements that still intersect a display', () => {
    const displays = [{ height: 1080, width: 1920, x: 0, y: 0 }]
    expect(resolveVisibleWindowPlacement({
      height: 820,
      maximized: true,
      width: 1280,
      x: 200,
      y: 100,
    }, displays)).toMatchObject({ maximized: true, x: 200, y: 100 })
    expect(resolveVisibleWindowPlacement({
      height: 820,
      maximized: false,
      width: 1280,
      x: 4_000,
      y: 4_000,
    }, displays)).toBeNull()
  })

  it('persists a private placement file', async () => {
    const directory = await createTemporaryDirectory('lexora-window-state-')
    const store = new DesktopWindowStateStore({ path: join(directory, 'window-state.json'), onError: () => {} })
    const placement = {
      height: 820,
      maximized: false,
      width: 1280,
      x: 40,
      y: 60,
    }

    await store.write(placement)

    await expect(store.read()).resolves.toEqual(placement)
  })

  it('uses default placement when an existing state location cannot be read', async () => {
    const directory = await createTemporaryDirectory('lexora-window-state-')
    const failures: unknown[] = []
    const store = new DesktopWindowStateStore({ path: directory, onError: (operation, error) => failures.push({ operation, error }) })
    await expect(store.read()).resolves.toBeNull()
    expect(failures).toMatchObject([{ operation: 'read', error: { code: 'EISDIR' } }])
  })

  it('preserves blocked storage and can persist again after the location is repaired', async () => {
    const directory = await createTemporaryDirectory('lexora-window-state-')
    const parent = join(directory, 'state')
    await writeFile(parent, 'existing-user-file')
    const failures: unknown[] = []
    const store = new DesktopWindowStateStore({ path: join(parent, 'window-state.json'), onError: (operation, error) => failures.push({ operation, error }) })
    const placement = { height: 820, width: 1280, maximized: false, x: 40, y: 60 }
    await expect(store.write(placement)).resolves.toBeUndefined()
    expect(await readFile(parent, 'utf8')).toBe('existing-user-file')
    expect(failures).toMatchObject([{ operation: 'write', error: { code: 'EEXIST' } }])
    await rm(parent)
    await mkdir(parent)
    await store.write(placement)
    await expect(store.read()).resolves.toEqual(placement)
    expect(failures).toHaveLength(1)
  })
})
