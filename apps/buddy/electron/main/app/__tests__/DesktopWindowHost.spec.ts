import type { DesktopEnvironment } from '../typing'
import { lstat, mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { describe, expect, it, vi } from 'vitest'
import { DesktopWindowHost } from '../DesktopWindowHost'

vi.mock('electron', () => ({ app: {}, BrowserWindow: {}, Menu: {}, nativeTheme: {}, screen: {}, shell: {} }))

describe.skipIf(process.platform !== 'linux')('desktop browser adapter ownership', () => {
  it('preserves an existing endpoint when startup fails before acquiring the adapter', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'buddy-window-host-'))
    const socket = join(directory, 'adapter.sock')
    const previousServer = createServer()
    await new Promise<void>((resolve, reject) => {
      previousServer.once('error', reject)
      previousServer.listen(socket, resolve)
    })
    try {
      const windows = new DesktopWindowHost(environment(socket))
      await windows.stopAdapter()
      expect((await lstat(socket)).isSocket()).toBe(true)
    }
    finally {
      await new Promise<void>(resolve => previousServer.close(() => resolve()))
      await rm(directory, { force: true, recursive: true })
    }
  })

  it('releases a successfully acquired endpoint and permits repeated cleanup', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'buddy-window-host-'))
    const socket = join(directory, 'adapter.sock')
    const windows = new DesktopWindowHost(environment(socket))
    try {
      await windows.startAdapter()
      expect((await lstat(socket)).isSocket()).toBe(true)
      await windows.stopAdapter()
      await expect(lstat(socket)).rejects.toMatchObject({ code: 'ENOENT' })
      await windows.stopAdapter()
    }
    finally {
      await windows.stopAdapter()
      await rm(directory, { force: true, recursive: true })
    }
  })
})

function environment(browserAdapterSocket: string): DesktopEnvironment {
  return { paths: { browserAdapterSocket, profile: 'development' } } as DesktopEnvironment
}
