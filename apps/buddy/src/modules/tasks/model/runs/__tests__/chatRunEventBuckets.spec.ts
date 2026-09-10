import type { LocalRunEvent } from '@buddy-shared/runs/runApi'

import { describe, expect, it } from 'vitest'
import {
  mergeChatRunEventBuckets,
  replaceChatRunEventBuckets,
} from '../chatRunEventBuckets'

describe('chat run event buckets', () => {
  it('preserves unchanged run projections when an older run is added', () => {
    const latest = event('run-b', 1)
    const initial = replaceChatRunEventBuckets([latest])
    const older = event('run-a', 1)
    const updated = replaceChatRunEventBuckets([older, latest], initial)

    expect(updated.get('run-b')).toBe(initial.get('run-b'))
    expect(updated.get('run-a')?.events).toEqual([older])
    const replacement = { ...latest, payload: { delta: 'corrected', messageId: 'assistant-run-b' } }
    const corrected = replaceChatRunEventBuckets([replacement], updated)
    expect([...corrected.keys()]).toEqual(['run-b'])
    expect(corrected.get('run-b')?.events).toEqual([replacement])
    expect(corrected.get('run-b')).not.toBe(updated.get('run-b'))
  })

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
