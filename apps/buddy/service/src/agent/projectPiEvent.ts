import type {
  AssistantMessage,
  AssistantMessageEvent,
  TextContent,
  ToolResultMessage,
} from '@earendil-works/pi-ai'
import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent'
import type { BuddyAssistantTextPhase } from '../../../shared/assistantTextPhase'
import type { BuddyRunProgress } from '../../../shared/runProgress'
import type { ArtifactOperation } from '../storage/artifactRepository'
import { randomUUID } from 'node:crypto'

import { redactSensitiveText } from '../../../shared/approvalReviewPayload'
import { buddyAssistantTextPhaseSchema } from '../../../shared/assistantTextPhase'
import { MAX_BUDDY_MESSAGE_TEXT_LENGTH } from '../../../shared/buddyMessageContent'
import { resolveBuddyReasoningKind } from '../../../shared/reasoningPresentation'
import { createBuddyToolPresentation } from './toolPresentation'

type PiThinkingEvent
  = Extract<AssistantMessageEvent, { type: 'thinking_start' }>
    | Extract<AssistantMessageEvent, { type: 'thinking_delta' }>
    | Extract<AssistantMessageEvent, { type: 'thinking_end' }>

export type BuddyProjectedEventType
  = 'context.compaction.cancelled'
    | 'context.compaction.completed'
    | 'context.compaction.failed'
    | 'context.compaction.started'
    | 'message.completed'
    | 'message.block.completed'
    | 'message.block.delta'
    | 'message.block.started'
    | 'message.delta'
    | 'message.started'
    | 'message.tool_result'
    | 'run.progress'
    | 'tool.completed'
    | 'tool.started'
    | 'tool.updated'

export interface BuddyProjectedEvent {
  payload: unknown
  type: BuddyProjectedEventType
}

export interface ProjectedArtifact {
  operation: ArtifactOperation
  requestedPath: string
  toolCallId: string
}

export interface PiEventProjection {
  artifact?: ProjectedArtifact
  events: BuddyProjectedEvent[]
  failureCode?: ModelRequestFailureCode | 'MODEL_REQUEST_ABORTED'
  failureMessage?: string
  sourceMessageId?: string
}

type ModelRequestFailureCode
  = 'MODEL_NOT_SUPPORTED'
    | 'MODEL_REQUEST_FAILED'
    | 'MODEL_REQUEST_TIMED_OUT'
    | 'MODEL_SERVICE_UNAVAILABLE'
    | 'MODEL_SERVICE_UNREACHABLE'
    | 'PROVIDER_ACCESS_DENIED'
    | 'PROVIDER_AUTHENTICATION_FAILED'
    | 'PROVIDER_RATE_LIMITED'

interface ToolCallState {
  arguments: unknown
  toolName: string
}

export interface PiEventProjectionState {
  assistantMessageId: string | null
  canonicalRoot?: string
  completedCommentaryBlockIndexes: Set<number>
  progress: BuddyRunProgress | null
  toolCalls: Map<string, ToolCallState>
}

type SessionMessage = Extract<AgentSessionEvent, { type: 'message_end' }>['message']

const MAX_DELTA_LENGTH = 64 * 1024
const MAX_FAILURE_MESSAGE_LENGTH = 4 * 1024
export function createPiEventProjectionState(
  options: { canonicalRoot?: string } = {},
): PiEventProjectionState {
  return {
    assistantMessageId: null,
    canonicalRoot: options.canonicalRoot,
    completedCommentaryBlockIndexes: new Set(),
    progress: null,
    toolCalls: new Map(),
  }
}

export function projectPiEvent(
  event: AgentSessionEvent,
  state: PiEventProjectionState,
): PiEventProjection {
  switch (event.type) {
    case 'agent_start':
      return progressProjection(state, 'preparing')
    case 'agent_settled':
      return progressProjection(state, 'idle')
    case 'turn_start':
    case 'auto_retry_start':
      return progressProjection(state, 'model_requesting')
    case 'compaction_start':
      return {
        events: [{
          payload: { reason: event.reason },
          type: 'context.compaction.started',
        }],
      }
    case 'compaction_end':
      return projectCompactionEnd(event)
    case 'message_start':
      return projectMessageStart(event.message, state)
    case 'message_update':
      return projectMessageUpdate(event.assistantMessageEvent, state)
    case 'message_end':
      return projectMessageEnd(event.message, state)
    case 'tool_execution_start':
      state.toolCalls.set(event.toolCallId, {
        arguments: event.args,
        toolName: event.toolName,
      })
      return {
        events: [
          {
            payload: {
              presentation: createBuddyToolPresentation({
                arguments: event.args,
                canonicalRoot: state.canonicalRoot,
                toolName: event.toolName,
              }),
              toolCallId: event.toolCallId,
              toolName: event.toolName,
            },
            type: 'tool.started',
          },
          ...progressProjection(state, 'tool_executing', event.toolName).events,
        ],
      }
    case 'tool_execution_update':
      return {
        events: [{
          payload: {
            presentation: createBuddyToolPresentation({
              arguments: event.args,
              canonicalRoot: state.canonicalRoot,
              result: event.partialResult,
              toolName: event.toolName,
            }),
            toolCallId: event.toolCallId,
            toolName: event.toolName,
          },
          type: 'tool.updated',
        }],
      }
    case 'tool_execution_end': {
      const tool = state.toolCalls.get(event.toolCallId)
      state.toolCalls.delete(event.toolCallId)
      return {
        artifact: event.isError ? undefined : detectArtifact(event.toolCallId, tool),
        events: [{
          payload: {
            isError: event.isError,
            presentation: createBuddyToolPresentation({
              arguments: tool?.arguments,
              canonicalRoot: state.canonicalRoot,
              isError: event.isError,
              result: event.result,
              toolName: event.toolName,
            }),
            toolCallId: event.toolCallId,
            toolName: event.toolName,
          },
          type: 'tool.completed',
        }],
      }
    }
  }
  return { events: [] }
}

function projectCompactionEnd(
  event: Extract<AgentSessionEvent, { type: 'compaction_end' }>,
): PiEventProjection {
  if (event.result) {
    return {
      events: [{
        payload: {
          estimatedTokensAfter: event.result.estimatedTokensAfter ?? null,
          reason: event.reason,
          tokensBefore: event.result.tokensBefore,
          willRetry: event.willRetry,
        },
        type: 'context.compaction.completed',
      }],
    }
  }
  if (event.aborted) {
    return {
      events: [{
        payload: { reason: event.reason, willRetry: event.willRetry },
        type: 'context.compaction.cancelled',
      }],
    }
  }
  return {
    events: [{
      payload: {
        errorCode: 'COMPACTION_FAILED',
        reason: event.reason,
        willRetry: event.willRetry,
      },
      type: 'context.compaction.failed',
    }],
  }
}

function projectMessageStart(
  message: { role: string },
  state: PiEventProjectionState,
): PiEventProjection {
  if (message.role !== 'assistant')
    return { events: [] }
  const messageId = randomUUID()
  state.assistantMessageId = messageId
  state.completedCommentaryBlockIndexes.clear()
  return {
    events: [
      {
        payload: { messageId, role: 'assistant' },
        type: 'message.started',
      },
      ...progressProjection(state, 'model_streaming').events,
    ],
  }
}

function progressProjection(
  state: PiEventProjectionState,
  phase: BuddyRunProgress['phase'],
  toolName: string | null = null,
): PiEventProjection {
  const progress: BuddyRunProgress = {
    phase,
    toolName: toolName?.slice(0, 256) || null,
  }
  if (
    state.progress?.phase === progress.phase
    && state.progress.toolName === progress.toolName
  ) {
    return { events: [] }
  }
  state.progress = progress
  return {
    events: [{ payload: progress, type: 'run.progress' }],
  }
}

function projectMessageUpdate(
  event: AssistantMessageEvent,
  state: PiEventProjectionState,
): PiEventProjection {
  const messageId = state.assistantMessageId ?? randomUUID()
  state.assistantMessageId = messageId
  if (event.type === 'thinking_start') {
    const reasoningKind = resolvePiReasoningKind(event)
    return {
      events: [{
        payload: {
          contentIndex: event.contentIndex,
          kind: 'reasoning',
          messageId,
          reasoningKind,
        },
        type: 'message.block.started',
      }],
    }
  }
  if (event.type === 'thinking_delta' && event.delta) {
    const reasoningKind = resolvePiReasoningKind(event)
    return {
      events: [{
        payload: {
          contentIndex: event.contentIndex,
          delta: event.delta.slice(0, MAX_DELTA_LENGTH),
          kind: 'reasoning',
          messageId,
          reasoningKind,
        },
        type: 'message.block.delta',
      }],
    }
  }
  if (event.type === 'thinking_end') {
    const reasoningKind = resolvePiReasoningKind(event)
    return {
      events: [{
        payload: {
          content: event.content.slice(0, MAX_BUDDY_MESSAGE_TEXT_LENGTH),
          contentIndex: event.contentIndex,
          kind: 'reasoning',
          messageId,
          reasoningKind,
        },
        type: 'message.block.completed',
      }],
    }
  }
  if (event.type === 'text_start') {
    const phase = resolvePiTextPhase(event.partial.content[event.contentIndex])
    if (phase !== 'commentary')
      return { events: [] }
    return {
      events: [{
        payload: {
          contentIndex: event.contentIndex,
          kind: 'text',
          messageId,
          phase,
        },
        type: 'message.block.started',
      }],
    }
  }
  if (event.type === 'text_delta' && event.delta) {
    const phase = resolvePiTextPhase(event.partial.content[event.contentIndex])
    return {
      events: [{
        payload: {
          contentIndex: event.contentIndex,
          delta: event.delta.slice(0, MAX_DELTA_LENGTH),
          messageId,
          ...(phase ? { phase } : {}),
        },
        type: 'message.delta',
      }],
    }
  }
  if (event.type === 'text_end') {
    const phase = resolvePiTextPhase(event.partial.content[event.contentIndex])
    if (phase !== 'commentary')
      return { events: [] }
    state.completedCommentaryBlockIndexes.add(event.contentIndex)
    return {
      events: [{
        payload: {
          content: event.content.slice(0, MAX_BUDDY_MESSAGE_TEXT_LENGTH),
          contentIndex: event.contentIndex,
          kind: 'text',
          messageId,
          phase,
        },
        type: 'message.block.completed',
      }],
    }
  }
  return { events: [] }
}

function resolvePiReasoningKind(event: PiThinkingEvent) {
  const content = event.partial.content[event.contentIndex]
  return resolveBuddyReasoningKind({
    api: event.partial.api,
    provider: event.partial.provider,
    reasoningKind: content?.type === 'thinking' ? content.reasoningKind : undefined,
  })
}

function projectMessageEnd(
  message: SessionMessage,
  state: PiEventProjectionState,
): PiEventProjection {
  if (message.role === 'assistant')
    return projectAssistantMessageEnd(message, state)
  if (message.role === 'toolResult')
    return projectToolMessageEnd(message)
  return { events: [] }
}

function projectAssistantMessageEnd(
  message: AssistantMessage,
  state: PiEventProjectionState,
): PiEventProjection {
  const messageId = state.assistantMessageId ?? randomUUID()
  state.assistantMessageId = null
  const textBlocks = message.content.flatMap((content, contentIndex) => (
    content.type === 'text'
      ? [{ content, contentIndex, phase: resolvePiTextPhase(content) }]
      : []
  ))
  const phase = resolveCompletedTextPhase(textBlocks)
  const text = selectCompletedText(textBlocks)
  const missingTextBlockEvents: BuddyProjectedEvent[] = textBlocks.flatMap((block) => {
    if (
      block.phase !== 'commentary'
      || state.completedCommentaryBlockIndexes.has(block.contentIndex)
    ) {
      return []
    }
    return [{
      payload: {
        content: block.content.text.slice(0, MAX_BUDDY_MESSAGE_TEXT_LENGTH),
        contentIndex: block.contentIndex,
        kind: 'text',
        messageId,
        phase: block.phase,
      },
      type: 'message.block.completed' as const,
    }]
  })
  state.completedCommentaryBlockIndexes.clear()
  const modelFailure = message.stopReason === 'error'
    ? normalizeModelRequestFailure(message.errorMessage)
    : null
  const failureCode = modelFailure?.code
    ?? (message.stopReason === 'aborted' ? 'MODEL_REQUEST_ABORTED' : undefined)
  return {
    events: [
      ...missingTextBlockEvents,
      {
        payload: {
          content: { text },
          messageId,
          ...(phase ? { phase } : {}),
          role: 'assistant',
          stopReason: normalizeStopReason(message.stopReason),
        },
        type: 'message.completed',
      },
    ],
    ...(failureCode ? { failureCode } : {}),
    ...(modelFailure?.message ? { failureMessage: modelFailure.message } : {}),
    sourceMessageId: messageId,
  }
}

interface ProjectedTextBlock {
  content: TextContent
  contentIndex: number
  phase: BuddyAssistantTextPhase | undefined
}

function selectCompletedText(blocks: readonly ProjectedTextBlock[]): string {
  const selected = blocks.some(block => block.phase === 'final_answer')
    ? blocks.filter(block => block.phase === 'final_answer')
    : blocks
  return selected
    .map(block => block.content.text)
    .join('')
    .slice(0, MAX_BUDDY_MESSAGE_TEXT_LENGTH)
}

function resolveCompletedTextPhase(
  blocks: readonly ProjectedTextBlock[],
): BuddyAssistantTextPhase | undefined {
  if (blocks.some(block => block.phase === 'final_answer'))
    return 'final_answer'
  return blocks.length > 0 && blocks.every(block => block.phase === 'commentary')
    ? 'commentary'
    : undefined
}

function resolvePiTextPhase(
  content: AssistantMessage['content'][number] | undefined,
): BuddyAssistantTextPhase | undefined {
  if (content?.type !== 'text' || !content.textSignature)
    return undefined
  try {
    const signature = JSON.parse(content.textSignature) as unknown
    if (!signature || typeof signature !== 'object' || Array.isArray(signature))
      return undefined
    const record = signature as Record<string, unknown>
    if (record.v !== 1 || typeof record.id !== 'string')
      return undefined
    const phase = buddyAssistantTextPhaseSchema.safeParse(record.phase)
    return phase.success ? phase.data : undefined
  }
  catch {
    return undefined
  }
}

function normalizeModelRequestFailure(value: string | undefined): {
  code: ModelRequestFailureCode
  message?: string
} {
  const normalized = value ? redactSensitiveText(value).trim() : ''
  const message = normalized ? normalized.slice(0, MAX_FAILURE_MESSAGE_LENGTH) : undefined
  return {
    code: classifyModelRequestFailure(message),
    ...(message ? { message } : {}),
  }
}

function classifyModelRequestFailure(message: string | undefined): ModelRequestFailureCode {
  if (!message)
    return 'MODEL_REQUEST_FAILED'
  if (
    /(?:unknown|unsupported|invalid)\s+model|model.{0,80}(?:not found|does not exist|not supported|unsupported)|(?:不支持|找不到|不存在|未知).{0,20}模型|模型.{0,20}(?:不支持|找不到|不存在|未知)/i.test(message)
  ) {
    return 'MODEL_NOT_SUPPORTED'
  }
  if (/\b401\b|unauthori[sz]ed|authentication failed|invalid api[-_ ]?key|认证失败|密钥无效/i.test(message))
    return 'PROVIDER_AUTHENTICATION_FAILED'
  if (/\b403\b|forbidden|access denied|permission denied|无权访问|权限不足/i.test(message))
    return 'PROVIDER_ACCESS_DENIED'
  if (/\b429\b|too many requests|rate limit|速率限制|请求过多/i.test(message))
    return 'PROVIDER_RATE_LIMITED'
  if (/\b504\b|ETIMEDOUT|timed? out|timeout|请求超时|响应超时/i.test(message))
    return 'MODEL_REQUEST_TIMED_OUT'
  if (/\b5\d{2}\b|service unavailable|服务不可用/i.test(message))
    return 'MODEL_SERVICE_UNAVAILABLE'
  if (
    /\b404\b|ECONN(?:REFUSED|RESET)|ENOTFOUND|EAI_AGAIN|fetch failed|network error|socket hang up|unable to connect|failed to connect|无法连接|连接失败|网络错误/i.test(message)
  ) {
    return 'MODEL_SERVICE_UNREACHABLE'
  }
  return 'MODEL_REQUEST_FAILED'
}

function projectToolMessageEnd(message: ToolResultMessage): PiEventProjection {
  const messageId = randomUUID()
  return {
    events: [{
      payload: {
        content: {
          isError: message.isError,
          toolCallId: message.toolCallId,
          toolName: message.toolName,
        },
        messageId,
        role: 'tool',
      },
      type: 'message.tool_result',
    }],
    sourceMessageId: messageId,
  }
}

function detectArtifact(
  toolCallId: string,
  tool: ToolCallState | undefined,
): ProjectedArtifact | undefined {
  if (!tool || (tool.toolName !== 'write' && tool.toolName !== 'edit'))
    return undefined
  const requestedPath = readPath(tool.arguments)
  if (!requestedPath)
    return undefined
  return {
    operation: tool.toolName === 'write' ? 'created' : 'edited',
    requestedPath,
    toolCallId,
  }
}

function readPath(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return null
  const path = (value as Record<string, unknown>).path
  return typeof path === 'string' && path.trim() ? path : null
}

function normalizeStopReason(reason: AssistantMessage['stopReason']): string {
  if (reason === 'error' || reason === 'aborted')
    return 'failed'
  if (reason === 'toolUse')
    return 'tool_use'
  if (reason === 'length')
    return 'length'
  if (reason === 'deferred')
    return 'deferred'
  return 'completed'
}
