import type { LocalRunEvent } from '@buddy-shared/runs/runApi'

import { describe, expect, it } from 'vitest'
import {
  mergeChatRunEventBuckets,
  replaceChatRunEventBuckets,
} from '../chatRunEventBuckets'

describe('chat run event buckets', () => {
  it('appends ordered events without rescanning existing sort keys', () => {
    let existingCreatedAtReads = 0
    const existing = event('run-a', 1)
    Object.defineProperty(existing, 'createdAt', {
      enumerable: true,
      get() {
        existingCreatedAtReads += 1
        return '2026-09-03T00:00:01.000Z'
      },
    })
    const initial = replaceChatRunEventBuckets([existing])
    existingCreatedAtReads = 0
    const appended = event('run-a', 2)

    const updated = mergeChatRunEventBuckets(initial, [appended])
    const bucket = updated.get('run-a')

    expect(existingCreatedAtReads).toBe(0)
    expect(bucket?.events).toEqual([existing, appended])
    expect(bucket?.update).toEqual({
      events: [appended],
      kind: 'append',
      previousRevision: initial.get('run-a')?.revision,
    })
  })
})

function event(runId: string, sequence: number): LocalRunEvent {
  return {
    createdAt: `2026-09-03T00:00:0${sequence}.000Z`,
    payload: {
      delta: `${sequence}`,
      messageId: `assistant-${runId}`,
    },
    runId,
    sequence,
    type: 'message.delta',
  }
}
