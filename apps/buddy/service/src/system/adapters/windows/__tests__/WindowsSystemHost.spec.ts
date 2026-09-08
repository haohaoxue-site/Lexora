import type { ProcessSystemTarget } from '../../../systemCapability'
import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { SystemCapabilityService } from '../../../systemCapability'
import { createSystemToolFailure, parseSystemToolFailure, serializeSystemToolFailure } from '../../../systemToolFailure'
import { WindowsSystemHost } from '../WindowsSystemHost'

const signal = new AbortController().signal
const target: ProcessSystemTarget = {
  kind: 'process',
  pid: 4200,
  instanceId: '638000000000000000',
  startedAt: '2026-09-07T00:00:00.000Z',
  executable: 'C:\\Apps\\sample.exe',
  displayName: 'sample',
  interruption: 'application',
  allowedActions: ['kill-process'],
}
const success = (value: unknown) => ({ code: 0, stdout: Buffer.from(JSON.stringify(value)), stderr: '' })

describe('windows SystemHost contract', () => {
  it('preserves OS access denial without suggesting retry or elevation', async () => {
    const host = new WindowsSystemHost(async () => ({ code: 1, stdout: Buffer.alloc(0), stderr: 'SYSTEM_ACCESS_DENIED\n' }))
    await expect(host.resolveTargets({ kind: 'service', scope: 'system', serviceId: 'QueryOnlyFixture' }, signal)).rejects.toMatchObject({ code: 'SYSTEM_ACCESS_DENIED' })
    expect(createSystemToolFailure('SYSTEM_ACCESS_DENIED')).toEqual({ error: { code: 'SYSTEM_ACCESS_DENIED', recoverable: false } })
    expect(parseSystemToolFailure(serializeSystemToolFailure('SYSTEM_ACCESS_DENIED'))).toEqual({ error: { code: 'SYSTEM_ACCESS_DENIED', recoverable: false } })
  })

  it('distinguishes missing targets from inaccessible or malformed host output', async () => {
    const absent = new WindowsSystemHost(async () => success([]))
    expect(await absent.readTarget(target, signal)).toBeNull()
    const inaccessible = new WindowsSystemHost(async () => ({ code: 1, stdout: Buffer.alloc(0), stderr: 'Access denied' }))
    await expect(inaccessible.readTarget(target, signal)).rejects.toThrow('Windows system operation failed')
    const malformed = new WindowsSystemHost(async () => success([{ ...target, instanceId: null }]))
    await expect(malformed.readTarget(target, signal)).rejects.toThrow()
  })

  it('accepts Windows SCM service names without a Linux suffix and rejects user scope', async () => {
    const service = {
      kind: 'service',
      scope: 'system',
      serviceId: 'ExampleService',
      displayId: 'ExampleService',
      displayName: 'Example Service',
      activeState: 'active',
      interruption: 'service',
      allowedActions: ['stop-service'],
    }
    const host = new WindowsSystemHost(async () => success([service]))
    expect(await host.resolveTargets({ kind: 'service', scope: 'system', serviceId: 'ExampleService' }, signal)).toEqual([service])
    await expect(host.resolveTargets({ kind: 'service', scope: 'user', serviceId: 'ExampleService' }, signal)).rejects.toMatchObject({ code: 'SYSTEM_ACTION_INVALID' })
  })

  it('refuses to execute an approved PID after its instance identity changes', async () => {
    const operations: string[] = []
    const host = new WindowsSystemHost(async (input) => {
      operations.push(input.operation)
      if (input.operation === 'execute')
        throw new Error('A replaced target must never be executed')
      return success([{ ...target, instanceId: input.operation === 'resolve' ? target.instanceId : '638000000000000001' }])
    })
    const service = new SystemCapabilityService({ host })
    const request = { action: 'kill-process' as const, target: { kind: 'process' as const, pid: target.pid }, reason: 'Stop the sample process' }
    await service.prepareAction('call-1', request, signal)
    await expect(service.act('call-1', request, signal)).rejects.toMatchObject({ code: 'SYSTEM_TARGET_CHANGED' })
    expect(operations).toEqual(['resolve', 'read'])
  })

  it('preserves adapter-side last-moment identity failures', async () => {
    const host = new WindowsSystemHost(async () => ({ code: 1, stdout: Buffer.alloc(0), stderr: 'SYSTEM_TARGET_CHANGED' }))
    await expect(host.execute(target, 'kill-process', signal)).rejects.toMatchObject({ code: 'SYSTEM_TARGET_CHANGED' })
  })
})
