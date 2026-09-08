import { execFileSync, spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WindowsSystemHost } from '../../../service/src/system/adapters/windows/WindowsSystemHost'
import { createBuddyNativeEnvironment, resolveBuddyPrivateDirectories } from '../../native/nativeHost'
import { ensureWindowsPrivateDirectories } from '../privateDirectories'

const roots: string[] = []
const nativePaths = { appPath: fileURLToPath(new URL('../../../', import.meta.url)), resourcesPath: '', isPackaged: false }
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe.skipIf(process.platform !== 'win32')('windows native host', () => {
  beforeEach(() => {
    for (const [name, value] of Object.entries(createBuddyNativeEnvironment(nativePaths)))
      vi.stubEnv(name, value)
  })
  it('resolves and force-stops only its own disposable child by pinned identity', async () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { windowsHide: true, stdio: 'ignore' })
    const exited = once(child, 'exit')
    try {
      await once(child, 'spawn')
      if (!child.pid)
        throw new Error('Disposable child did not start')
      const host = new WindowsSystemHost()
      const signal = AbortSignal.timeout(45_000)
      const targets = await host.resolveTargets({ kind: 'process', pid: child.pid }, signal)
      expect(targets).toHaveLength(1)
      const target = targets[0]!
      expect(target.allowedActions).toContain('kill-process')
      await host.execute(target, 'kill-process', signal)
      await exited
      expect(await host.readTarget(target, signal)).toBeNull()
    }
    finally {
      if (child.exitCode === null && child.signalCode === null)
        child.kill()
      await exited
    }
  }, 60_000)

  it('fails closed on an existing broadly accessible storage directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'buddy-windows-private-'))
    roots.push(root)
    const helper = resolveBuddyPrivateDirectories(nativePaths)
    await expect(ensureWindowsPrivateDirectories([join(root, 'private')], helper)).resolves.toBeUndefined()
    execFileSync(join(process.env.SystemRoot!, 'System32', 'icacls.exe'), [join(root, 'private'), '/grant', '*S-1-1-0:(RX)'])
    await expect(ensureWindowsPrivateDirectories([join(root, 'private')], helper)).rejects.toThrow('private storage')
  }, 30_000)
})
