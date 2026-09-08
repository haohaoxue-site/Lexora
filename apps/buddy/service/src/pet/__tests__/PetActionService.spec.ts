import type { RuntimeRpcPeerContract } from '../../../../shared/runtime/rpcPeer'
import { describe, expect, it, vi } from 'vitest'

import { PetActionService } from '../PetActionService'
import { classifyPetTool, PET_TOOL_NAME } from '../petToolContract'

function createPeer(result: unknown): RuntimeRpcPeerContract {
  return {
    close: vi.fn(),
    notify: vi.fn(),
    onNotification: vi.fn(() => () => {}),
    onRequest: vi.fn(() => () => {}),
    request: vi.fn(async () => result),
  }
}

describe('petActionService', () => {
  it('compiles approval into a bounded primitive and restores idle afterwards', async () => {
    const peer = createPeer({ status: 'completed', completedSteps: 1 })
    const events: unknown[] = []
    const service = new PetActionService({
      eventSink: event => events.push(event),
      peer,
    })

    await expect(service.execute({
      macro: 'awaitApproval',
      runId: 'run-1',
      toolCallId: 'tool-1',
    })).resolves.toEqual({ status: 'completed', completedSteps: 1 })

    expect(peer.request).toHaveBeenCalledWith(
      'host.pet.executeSequence',
      expect.objectContaining({
        priority: 30,
        requestId: expect.stringMatching(/^pet_/),
        steps: [{
          animation: 'approval',
          completionBehavior: 'restoreIdle',
          interruptPolicy: 'interruptible',
          kind: 'playAction',
          playback: {
            clipDurationMs: 2540,
            durationMs: 5000,
            kind: 'loopForDuration',
          },
          timeoutMs: 6000,
        }],
      }),
      20_000,
    )
    expect(events).toEqual([
      expect.objectContaining({
        runId: 'run-1',
        type: 'tool.updated',
        payload: expect.objectContaining({
          macro: 'awaitApproval',
          presentation: {
            card: 'pet',
            description: null,
            macro: 'awaitApproval',
            status: 'completed',
          },
          status: 'completed',
          toolCallId: 'tool-1',
          toolName: 'lexora_buddy_pet',
        }),
      }),
    ])
  })

  it('classifies only the owned tool as a first-party visual action', () => {
    expect(classifyPetTool({ toolName: PET_TOOL_NAME })).toEqual({
      access: 'visual',
    })
    expect(classifyPetTool({ toolName: 'read' })).toBeNull()
  })

  it('normalizes an unavailable host without leaking its raw error', async () => {
    const peer = createPeer(null)
    vi.mocked(peer.request).mockRejectedValue(new Error('secret host detail'))
    const service = new PetActionService({ peer })

    await expect(service.execute({ macro: 'thinking' })).resolves.toEqual({
      code: 'PET_UNAVAILABLE',
      completedSteps: 0,
      status: 'failed',
    })
  })
})
