import { join } from 'node:path'
import { createTemporaryDirectory } from '@buddy-tests/temporaryDirectories'
import { describe, expect, it } from 'vitest'
import {
  DesktopWindowStateStore,
  resolveVisibleWindowPlacement,
} from '../desktopWindowState'

describe('desktop window state', () => {
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
    const store = new DesktopWindowStateStore({ path: join(directory, 'window-state.json') })
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
})
