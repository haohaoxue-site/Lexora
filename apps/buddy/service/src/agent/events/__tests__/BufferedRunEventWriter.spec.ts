import type { AppendBuddyRunEventInput } from '../../../events/BuddyRunEvent'
import { describe, expect, it, vi } from 'vitest'

import { BufferedRunEventWriter } from '../BufferedRunEventWriter'

describe('bufferedRunEventWriter', () => {
  it('coalesces adjacent terminal output deltas before durable append', async () => {
    const appended: AppendBuddyRunEventInput[][] = []
    const appendBatch = vi.fn(async (events: readonly AppendBuddyRunEventInput[]) => {
      appended.push([...events])
      return []
    })
    const writer = new BufferedRunEventWriter(
      { appendBatch },
      'run-1',
      () => '2026-09-03T00:00:00.000Z',
    )

    writer.append(toolOutputDelta(0, 'first'))
    writer.append(toolOutputDelta(5, '\nsecond'))
    await writer.drain()

    expect(appended).toEqual([[
      {
        createdAt: '2026-09-03T00:00:00.000Z',
        payload: {
          presentationDelta: {
            card: 'terminal',
            outputDelta: 'first\nsecond',
            outputStart: 0,
            truncated: false,
          },
          toolCallId: 'tool-1',
          toolName: 'bash',
        },
        runId: 'run-1',
        type: 'tool.updated',
      },
    ]])
  })
})

function toolOutputDelta(outputStart: number, outputDelta: string) {
  return {
    payload: {
      presentationDelta: {
        card: 'terminal' as const,
        outputDelta,
        outputStart,
        truncated: false,
      },
      toolCallId: 'tool-1',
      toolName: 'bash',
    },
    type: 'tool.updated' as const,
  }
}
