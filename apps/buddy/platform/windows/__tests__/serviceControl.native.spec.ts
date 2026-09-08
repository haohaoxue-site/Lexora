import { join } from 'node:path'
import process from 'node:process'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WindowsSystemHost } from '../../../service/src/system/adapters/windows/WindowsSystemHost'
import { resolveBuddyServiceControl } from '../../native/nativeHost'

describe.skipIf(process.platform !== 'win32')('windows native service control', () => {
  beforeEach(() => {
    vi.stubEnv('LEXORA_BUDDY_SERVICE_CONTROL', resolveBuddyServiceControl({ appPath: join(import.meta.dirname, '../../..'), isPackaged: false, resourcesPath: '' }))
    vi.stubEnv('PATH', '')
  })

  it('reads SCM without PowerShell or PATH and refuses protected service actions', async () => {
    const host = new WindowsSystemHost()
    const signal = new AbortController().signal
    const targets = await host.resolveTargets({ kind: 'service', scope: 'system', serviceId: 'rpcss' }, signal)
    expect(targets).toHaveLength(1)
    const target = targets[0]!
    expect(target).toMatchObject({ kind: 'service', serviceId: 'RpcSs', activeState: 'active', allowedActions: [] })
    expect(await host.readTarget(target, signal)).toEqual(target)
    await expect(host.execute({ ...target, allowedActions: ['stop-service'] }, 'stop-service', signal)).rejects.toMatchObject({ code: 'SYSTEM_ACTION_NOT_ALLOWED' })
  })

  it('returns no targets for a missing SCM service without treating it as a command', async () => {
    const host = new WindowsSystemHost()
    expect(await host.resolveTargets({ kind: 'service', scope: 'system', serviceId: 'LexoraNonexistentContractTestService' }, new AbortController().signal)).toEqual([])
  })
})
