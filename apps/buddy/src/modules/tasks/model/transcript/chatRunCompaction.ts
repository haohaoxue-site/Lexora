import type { LocalRunEvent } from '@buddy-shared/runs/runApi'

import type { ChatProjectionReducer } from './chatRunEventProjection'
import { readNonnegativeInteger, readPayload } from './chatRunEventProjection'

export interface ChatAgentCompactionNode {
  estimatedTokensAfter: number | null
  id: string
  kind: 'compaction'
  status: 'cancelled' | 'completed' | 'failed' | 'interrupted' | 'running'
  tokensBefore: number | null
}

interface OrderedCompaction {
  node: ChatAgentCompactionNode
  sequence: number
}

export function createChatRunCompactionReducer(
  runId: string,
): ChatProjectionReducer<ReadonlyArray<OrderedCompaction>> {
  const compactions = new Map<string, OrderedCompaction>()
  let activeCompactionId: string | null = null

  function append(events: ReadonlyArray<LocalRunEvent>) {
    for (const event of events) {
      const payload = readPayload(event.payload)
      if (!payload)
        continue
      if (event.type === 'context.compaction.started') {
        activeCompactionId = `compaction:${runId}:${event.sequence}`
        compactions.set(activeCompactionId, {
          node: {
            estimatedTokensAfter: null,
            id: activeCompactionId,
            kind: 'compaction',
            status: 'running',
            tokensBefore: null,
          },
          sequence: event.sequence,
        })
        continue
      }
      if (
        event.type !== 'context.compaction.completed'
        && event.type !== 'context.compaction.failed'
        && event.type !== 'context.compaction.cancelled'
      ) {
        continue
      }
      const id = activeCompactionId ?? `compaction:${runId}:${event.sequence}`
      compactions.set(id, {
        node: {
          estimatedTokensAfter: event.type === 'context.compaction.completed'
            ? readNonnegativeInteger(payload.estimatedTokensAfter)
            : null,
          id,
          kind: 'compaction',
          status: event.type === 'context.compaction.completed'
            ? 'completed'
            : event.type === 'context.compaction.failed'
              ? 'failed'
              : 'cancelled',
          tokensBefore: event.type === 'context.compaction.completed'
            ? readNonnegativeInteger(payload.tokensBefore)
            : null,
        },
        sequence: compactions.get(id)?.sequence ?? event.sequence,
      })
      activeCompactionId = null
    }
  }

  return {
    append,
    project: () => [...compactions.values()],
  }
}
