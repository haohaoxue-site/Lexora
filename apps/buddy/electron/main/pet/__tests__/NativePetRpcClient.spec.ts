import type { Buffer } from 'node:buffer'
import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'

import { NativePetRpcClient } from '../NativePetRpcClient'

function createClient() {
  const fromPet = new PassThrough()
  const toPet = new PassThrough()
  const client = new NativePetRpcClient({ readable: fromPet, writable: toPet })
  return { client, fromPet, toPet }
}

async function readLine(stream: PassThrough): Promise<Record<string, unknown>> {
  const chunk = stream.read() ?? await new Promise<Buffer>(resolve => stream.once('data', resolve))
  return JSON.parse(String(chunk).trim())
}

describe('nativePetRpcClient', () => {
  it('waits for ready, emits open desktop, and correlates a primitive step', async () => {
    const { client, fromPet, toPet } = createClient()
    const openDesktop = vi.fn()
    client.onOpenDesktop(openDesktop)
    const ready = client.waitUntilReady(1000)

    fromPet.write('event:ready\n')
    fromPet.write('event:open_chat\n')
    await expect(ready).resolves.toBeUndefined()
    expect(openDesktop).toHaveBeenCalledOnce()

    const result = client.executeStep({
      animation: 'celebrate',
      completionBehavior: 'restoreIdle',
      interruptPolicy: 'finishStep',
      kind: 'playAction',
      playback: { durationMs: 1720, kind: 'once' },
      timeoutMs: 5000,
    })
    const request = await readLine(toPet)
    expect(request).toMatchObject({
      protocolVersion: 1,
      type: 'executeStep',
      step: { animation: 'celebrate', kind: 'playAction' },
    })
    fromPet.write(`${JSON.stringify({
      protocolVersion: 1,
      correlationId: request.messageId,
      type: 'stepCompleted',
      stepId: request.stepId,
      elapsedMs: 1720,
    })}\n`)

    await expect(result).resolves.toMatchObject({ status: 'completed', elapsedMs: 1720 })
  })

  it('reports a local interaction interruption as a terminal step result', async () => {
    const { client, fromPet, toPet } = createClient()
    fromPet.write('event:ready\n')
    await client.waitUntilReady(1000)

    const result = client.executeStep({
      animation: 'thinking',
      completionBehavior: 'restoreIdle',
      interruptPolicy: 'interruptible',
      kind: 'playAction',
      playback: { clipDurationMs: 2420, durationMs: 3000, kind: 'loopForDuration' },
      timeoutMs: 4000,
    })
    const request = await readLine(toPet)
    fromPet.write(`${JSON.stringify({
      protocolVersion: 1,
      correlationId: request.messageId,
      type: 'stepInterrupted',
      stepId: request.stepId,
      reasonCode: 'admission.preemptedByHigherPriorityPlan',
      elapsedMs: 80,
    })}\n`)

    await expect(result).resolves.toMatchObject({
      reasonCode: 'admission.preemptedByHigherPriorityPlan',
      status: 'interrupted',
    })
  })
})
