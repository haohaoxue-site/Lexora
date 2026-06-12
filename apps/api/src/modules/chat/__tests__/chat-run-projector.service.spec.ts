import type { ChatGenerationEvent } from '@haohaoxue/samepage-contracts'
import {
  CHAT_MESSAGE_PART_TYPE,
  CHAT_SESSION_EVENT_TYPE,
} from '@haohaoxue/samepage-contracts'
import {
  ChatSessionMessagePartType,
  ChatSessionRunStatus,
} from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { ChatRunProjectorService } from '../chat-run-projector.service'

describe('chatRunProjectorService tool part projection', () => {
  it('keeps interleaved tool call and result parts on distinct orders', async () => {
    const { service, appendedEvents } = createProjectorHarness([
      createToolStartedEvent('call-a', 'search'),
      createToolStartedEvent('call-b', 'read_file'),
      createToolCompletedEvent('call-a', 'search'),
    ])

    await service.projectRun({
      runId: 'run-1',
      afterId: '0-0',
    })

    const partEvents = appendedEvents.filter(event =>
      event.type === CHAT_SESSION_EVENT_TYPE.MESSAGE_PART_DELTA,
    )
    const projectedParts = partEvents.map(event => ({
      partType: event.payload.partType,
      order: event.payload.order,
      toolCallId: event.payload.metadata?.toolCallId,
    }))

    expect(projectedParts).toEqual([
      {
        partType: CHAT_MESSAGE_PART_TYPE.TOOL_CALL,
        order: 10,
        toolCallId: 'call-a',
      },
      {
        partType: CHAT_MESSAGE_PART_TYPE.TOOL_CALL,
        order: 12,
        toolCallId: 'call-b',
      },
      {
        partType: CHAT_MESSAGE_PART_TYPE.TOOL_RESULT,
        order: 11,
        toolCallId: 'call-a',
      },
    ])
  })
})

function createProjectorHarness(events: ChatGenerationEvent[]) {
  interface StoredPart {
    id: string
    type: ChatSessionMessagePartType
    text: string
    order: number
    metadata: Record<string, unknown> | null
  }

  const partsByOrder = new Map<number, StoredPart>()
  const appendedEvents: Array<{
    type: string
    payload: {
      partType: string
      order: number
      metadata: Record<string, unknown> | null
    }
  }> = []

  const tx = {
    chatSessionRun: {
      findUnique: vi.fn().mockResolvedValue({
        status: ChatSessionRunStatus.RUNNING,
      }),
    },
    chatSessionMessagePart: {
      upsert: vi.fn(async (args) => {
        const order = args.where.messageId_order.order
        const existing = partsByOrder.get(order)
        if (existing) {
          existing.type = args.update.type
          existing.text = args.update.text
          existing.metadata = args.update.metadata ?? null
          return {
            id: existing.id,
            order: existing.order,
          }
        }

        const part: StoredPart = {
          id: `part-${order}`,
          type: args.create.type,
          text: args.create.text,
          order,
          metadata: args.create.metadata ?? null,
        }
        partsByOrder.set(order, part)
        return {
          id: part.id,
          order: part.order,
        }
      }),
    },
  }

  const prisma = {
    chatSessionRun: {
      findUnique: vi.fn().mockResolvedValue({
        runId: 'run-1',
        sessionId: 'session-1',
        assistantMessageId: 'message-1',
        commandContext: {
          expectedHistoryVersion: 0,
        },
        status: ChatSessionRunStatus.RUNNING,
      }),
    },
    chatSessionMessagePart: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(async callback => callback(tx)),
  }

  const agentGenerationEventsService = {
    consumeGenerationEvents: vi.fn(async (input) => {
      for (const [index, event] of events.entries()) {
        await input.onEvent(event, `${index + 1}-0`)
      }
    }),
  }

  const agentMemoryOperations = {
    finalizeGenerationOperations: vi.fn(),
    cleanupFinalizedMemoryIndexes: vi.fn(),
    rollbackGenerationOperations: vi.fn(),
    cleanupRolledBackMemoryIndexes: vi.fn(),
  }

  const chatSessionEvents = {
    hasSourceEvent: vi.fn().mockResolvedValue(false),
    appendEvents: vi.fn(async (_tx, _sessionId, events) => {
      appendedEvents.push(...events)
    }),
    getLatestSourceEventStreamId: vi.fn(),
  }

  return {
    service: new ChatRunProjectorService(
      prisma as never,
      agentGenerationEventsService as never,
      agentMemoryOperations as never,
      chatSessionEvents as never,
    ),
    appendedEvents,
  }
}

function createToolStartedEvent(toolCallId: string, toolName: string): ChatGenerationEvent {
  return {
    type: 'model.tool.call.started',
    generationId: 'run-1',
    payload: {
      toolCallId,
      toolName,
      toolKind: 'function',
    },
  }
}

function createToolCompletedEvent(toolCallId: string, toolName: string): ChatGenerationEvent {
  return {
    type: 'tool.execution.completed',
    generationId: 'run-1',
    payload: {
      toolCallId,
      toolName,
      toolKind: 'function',
      status: 'success',
      outputText: 'ok',
    },
  }
}
