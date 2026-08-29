import type {
  LocalConversationTimelineItem,
  LocalMessage,
  LocalRun,
  LocalRunEvent,
} from '@buddy-electron/shared/localChatApi'
import type { ApprovalReviewPayload } from '@buddy-shared/approvalReviewPayload'
import type { BuddyAssistantTextPhase } from '@buddy-shared/assistantTextPhase'
import type { BuddyReasoningKind } from '@buddy-shared/reasoningPresentation'
import type { BuddyToolPresentation } from '@buddy-shared/runEventPresentation'
import type { BuddyRunProgress } from '@buddy-shared/runProgress'
import { approvalReviewPayloadSchema } from '@buddy-shared/approvalReviewPayload'
import { buddyAssistantTextPhaseSchema } from '@buddy-shared/assistantTextPhase'
import {
  buddyReasoningKindSchema,
  resolveBuddyReasoningKind,
} from '@buddy-shared/reasoningPresentation'
import { buddyToolPresentationSchema } from '@buddy-shared/runEventPresentation'
import { buddyRunProgressSchema } from '@buddy-shared/runProgress'

export { resolveChatAgentTurnOpen } from './chatAgentTurnDisclosure'

export interface ChatAgentReasoningNode {
  contentIndex: number
  id: string
  kind: 'reasoning'
  reasoningKind: BuddyReasoningKind
  status: 'completed' | 'interrupted' | 'running'
  text: string
}

export interface ChatAgentNarrationNode {
  contentIndex?: number
  id: string
  kind: 'text'
  messageId: string
  phase?: 'commentary'
  text: string
}

export interface ChatAgentToolNode {
  approvalId?: string
  description: string | null
  id: string
  isError: boolean
  kind: 'tool'
  presentation: BuddyToolPresentation
  status: 'awaiting_approval' | 'completed' | 'denied' | 'failed' | 'interrupted' | 'preparing' | 'running'
  toolCallId: string
  toolName: string
}

export type ChatAgentTurnNode = ChatAgentNarrationNode | ChatAgentReasoningNode | ChatAgentToolNode

export interface ChatAgentReasoningEntry {
  detail: ChatAgentReasoningNode | null
  id: string
  summary: ChatAgentReasoningNode | null
}

export interface ChatAgentReasoningGroup {
  entries: ChatAgentReasoningEntry[]
  id: string
  kind: 'reasoning-group'
  reasoningKind: BuddyReasoningKind
}

export type ChatAgentTurnRow = ChatAgentNarrationNode | ChatAgentReasoningGroup | ChatAgentToolNode

export interface ChatAgentTurn {
  branchId: string
  completedAt: string | null
  failureCode?: string | null
  failureMessage?: string | null
  finalMessageId: string | null
  nodes: ChatAgentTurnNode[]
  progress: BuddyRunProgress | null
  reasoningLevel: string | null
  runId: string
  startedAt: string
  status: LocalRun['status']
  triggeringMessageId: string
}

export function projectChatAgentTurns(
  events: ReadonlyArray<LocalRunEvent>,
  runs: ReadonlyArray<LocalRun>,
): ChatAgentTurn[] {
  const eventsByRunId = new Map<string, LocalRunEvent[]>()
  for (const event of events) {
    const runEvents = eventsByRunId.get(event.runId) ?? []
    runEvents.push(event)
    eventsByRunId.set(event.runId, runEvents)
  }
  return runs
    .filter(run => run.purpose !== 'conversation.compaction')
    .map(run => projectChatAgentTurn(run, eventsByRunId.get(run.id) ?? []))
}

function projectChatAgentTurn(
  run: LocalRun,
  events: ReadonlyArray<LocalRunEvent>,
): ChatAgentTurn {
  const reasoning = new Map<string, ChatAgentReasoningNode & { order: number }>()
  const tools = new Map<string, ChatAgentToolNode & { order: number }>()
  const approvalTools = new Map<string, string>()
  const text = new Map<string, ChatAgentNarrationNode & { order: number }>()
  let failureMessage: string | null = null
  let finalMessageId: string | null = null
  let progress: BuddyRunProgress | null = null
  for (const event of events) {
    const payload = readPayload(event.payload)
    if (!payload)
      continue
    if (event.type === 'run.failed') {
      failureMessage = readString(payload.errorMessage) || null
      continue
    }
    if (event.type === 'run.progress') {
      const parsed = buddyRunProgressSchema.safeParse(payload)
      if (parsed.success)
        progress = parsed.data.phase === 'idle' ? null : parsed.data
      continue
    }
    if (event.type.startsWith('message.block.')) {
      const messageId = readString(payload.messageId)
      const contentIndex = readNonnegativeInteger(payload.contentIndex)
      if (!messageId || contentIndex === null)
        continue
      if (payload.kind === 'text') {
        const phase = readAssistantTextPhase(payload.phase)
        if (phase !== 'commentary')
          continue
        const id = `process-text:${messageId}:${contentIndex}`
        const current = text.get(id) ?? {
          contentIndex,
          id,
          kind: 'text' as const,
          messageId,
          order: event.sequence,
          phase: 'commentary' as const,
          text: '',
        }
        if (event.type === 'message.block.delta') {
          text.set(id, {
            ...current,
            text: current.text + readString(payload.delta),
          })
        }
        else if (event.type === 'message.block.completed') {
          text.set(id, {
            ...current,
            text: readString(payload.content),
          })
        }
        else {
          text.set(id, current)
        }
        continue
      }
      if (payload.kind !== 'reasoning')
        continue
      const id = `reasoning:${messageId}:${contentIndex}`
      const parsedReasoningKind = buddyReasoningKindSchema.safeParse(payload.reasoningKind)
      const reasoningKind = parsedReasoningKind.success
        ? parsedReasoningKind.data
        : reasoning.get(id)?.reasoningKind ?? resolveBuddyReasoningKind({ provider: run.providerId })
      const current = reasoning.get(id) ?? {
        contentIndex,
        id,
        kind: 'reasoning' as const,
        order: event.sequence,
        reasoningKind,
        status: 'running' as const,
        text: '',
      }
      if (event.type === 'message.block.delta') {
        reasoning.set(id, {
          ...current,
          reasoningKind,
          text: current.text + readString(payload.delta),
        })
      }
      else if (event.type === 'message.block.completed') {
        reasoning.set(id, {
          ...current,
          reasoningKind,
          status: 'completed',
          text: readString(payload.content),
        })
      }
      else {
        reasoning.set(id, current)
      }
      continue
    }
    if (event.type === 'message.delta') {
      const phase = readAssistantTextPhase(payload.phase)
      const messageId = readString(payload.messageId)
      const contentIndex = readNonnegativeInteger(payload.contentIndex)
      if (phase !== 'commentary' || !messageId || contentIndex === null)
        continue
      const id = `process-text:${messageId}:${contentIndex}`
      const current = text.get(id) ?? {
        contentIndex,
        id,
        kind: 'text' as const,
        messageId,
        order: event.sequence,
        phase: 'commentary' as const,
        text: '',
      }
      text.set(id, {
        ...current,
        text: current.text + readString(payload.delta),
      })
      continue
    }
    if (event.type === 'message.completed') {
      const messageId = readString(payload.messageId)
      const content = readPayload(payload.content)
      if (!messageId)
        continue
      const phase = readAssistantTextPhase(payload.phase)
      if (phase === 'commentary') {
        const value = readString(content?.text)
        const normalized = normalizeProcessNarration(value)
        const duplicatesReasoning = normalized && [...reasoning.values()].some(node => (
          normalizeProcessNarration(node.text) === normalized
        ))
        if (normalized && !duplicatesReasoning) {
          const existing = [...text.values()].filter(node => node.messageId === messageId)
          if (existing.length <= 1) {
            const current = existing[0]
            const id = current?.id ?? `process-text:${messageId}:message`
            text.set(id, {
              ...current,
              id,
              kind: 'text',
              messageId,
              order: current?.order ?? event.sequence,
              phase: 'commentary',
              text: value,
            })
          }
        }
      }
      else if (phase === 'final_answer') {
        finalMessageId = messageId
      }
      else if (payload.stopReason === 'tool_use') {
        const value = readString(content?.text)
        const normalized = normalizeProcessNarration(value)
        const duplicatesReasoning = normalized && [...reasoning.values()].some(node => (
          normalizeProcessNarration(node.text) === normalized
        ))
        if (normalized && !duplicatesReasoning) {
          const id = `process-text:${messageId}:message`
          text.set(id, {
            id,
            kind: 'text',
            messageId,
            order: event.sequence,
            text: value,
          })
        }
      }
      else {
        finalMessageId = messageId
      }
      continue
    }
    if (event.type === 'approval.requested') {
      const approvalId = readString(payload.id)
      const toolCallId = readString(payload.toolCallId)
      const current = tools.get(toolCallId)
      const review = approvalReviewPayloadSchema.safeParse(payload.review)
      const systemApprovalPresentation = review.success && review.data.card === 'system-action'
        ? approvalPresentation(review.data)
        : null
      const base = current
        ? systemApprovalPresentation
          ? {
              ...current,
              description: null,
              presentation: systemApprovalPresentation,
            }
          : current
        : review.success
          ? {
              id: `tool:${toolCallId}`,
              isError: false,
              kind: 'tool' as const,
              order: event.sequence,
              presentation: approvalPresentation(review.data),
              status: 'preparing' as const,
              toolCallId,
              toolName: review.data.toolName,
              description: review.data.card === 'system-action'
                ? null
                : readString(payload.summary) || null,
            }
          : null
      if (approvalId && toolCallId)
        approvalTools.set(approvalId, toolCallId)
      if (approvalId && toolCallId && base) {
        tools.set(toolCallId, {
          ...base,
          approvalId,
          status: 'awaiting_approval',
        })
      }
      continue
    }
    if (event.type === 'approval.resolved') {
      const approvalId = readString(payload.id)
      const toolCallId = approvalTools.get(approvalId)
      const current = toolCallId ? tools.get(toolCallId) : undefined
      if (current?.status === 'awaiting_approval') {
        const status = payload.status === 'approved'
          ? 'preparing'
          : payload.status === 'denied'
            ? 'denied'
            : 'interrupted'
        tools.set(current.toolCallId, {
          ...current,
          isError: payload.status !== 'approved',
          status,
        })
      }
      continue
    }
    if (
      event.type === 'tool.preparing'
      || event.type === 'tool.started'
      || event.type === 'tool.updated'
      || event.type === 'tool.completed'
    ) {
      const toolCallId = readString(payload.toolCallId)
      const toolName = readString(payload.toolName)
      const presentation = buddyToolPresentationSchema.safeParse(payload.presentation)
      if (!toolCallId || !toolName || !presentation.success)
        continue
      const current = tools.get(toolCallId)
      const isError = event.type === 'tool.completed' && payload.isError === true
      const narration = current ? null : [...text.values()].at(-1)
      const toolNarration = narration?.phase === 'commentary' ? null : narration
      const isStructuredTool = presentation.data.card === 'automation'
        || presentation.data.card === 'system'
      const description = isStructuredTool
        ? null
        : current?.description
          ?? toolNarration?.text
          ?? specificToolDescription(
            'description' in presentation.data ? presentation.data.description : null,
          )
          ?? null
      if (!isStructuredTool && toolNarration && description === toolNarration.text)
        text.delete(toolNarration.id)
      tools.set(toolCallId, {
        ...(current?.approvalId ? { approvalId: current.approvalId } : {}),
        description,
        id: `tool:${toolCallId}`,
        isError,
        kind: 'tool',
        order: current?.order ?? event.sequence,
        presentation: presentation.data,
        status: current?.status === 'denied' || current?.status === 'interrupted'
          ? current.status
          : event.type === 'tool.completed'
            ? isError ? 'failed' : 'completed'
            : current?.status === 'awaiting_approval'
              ? 'awaiting_approval'
              : event.type === 'tool.preparing'
                ? 'preparing'
                : 'running',
        toolCallId,
        toolName,
      })
    }
  }
  const terminal = run.status !== 'queued' && run.status !== 'running'
  const reasoningNodes = [...reasoning.values()].filter(node => node.text.trim())
  const narrationNodes = [...text.values()].filter(node => node.text.trim())
  const awaitingApproval = [...tools.values()]
    .filter(node => node.status === 'awaiting_approval')
    .sort((left, right) => right.order - left.order)[0]
  const nodes = [...reasoningNodes, ...narrationNodes, ...tools.values()]
    .sort((left, right) => left.order - right.order)
    .map(({ order: _order, ...node }) => {
      if (
        node.kind === 'text'
        || !terminal
        || (node.status !== 'preparing' && node.status !== 'running')
      ) {
        return node
      }
      return { ...node, status: 'interrupted' as const }
    })
  return {
    branchId: run.branchId,
    completedAt: run.completedAt,
    ...(run.status === 'failed'
      ? { failureCode: run.errorCode, failureMessage }
      : {}),
    finalMessageId,
    nodes,
    progress: terminal
      ? null
      : awaitingApproval
        ? { phase: 'awaiting_approval', toolName: awaitingApproval.toolName }
        : progress,
    reasoningLevel: run.reasoningLevel,
    runId: run.id,
    startedAt: run.startedAt,
    status: run.status,
    triggeringMessageId: run.triggeringMessageId,
  }
}

export function projectChatAgentTurnRows(nodes: ReadonlyArray<ChatAgentTurnNode>): ChatAgentTurnRow[] {
  const rows: ChatAgentTurnRow[] = []
  let reasoning: ChatAgentReasoningNode[] = []
  const flushReasoning = () => {
    if (reasoning.length === 0)
      return
    rows.push({
      entries: projectReasoningEntries(reasoning),
      id: `reasoning-group:${reasoning[0]!.id}`,
      kind: 'reasoning-group',
      reasoningKind: reasoning.some(node => node.reasoningKind === 'thinking')
        ? 'thinking'
        : 'summary',
    })
    reasoning = []
  }

  for (const node of nodes) {
    if (node.kind === 'reasoning') {
      reasoning.push(node)
      continue
    }
    flushReasoning()
    rows.push(node)
  }
  flushReasoning()
  return rows
}

const GENERIC_TOOL_DESCRIPTIONS = new Set([
  'run a shell command in the authorized directory',
  'execute a shell command',
  'execute bash commands',
])

function specificToolDescription(value: string | null): string | null {
  if (!value)
    return null
  return GENERIC_TOOL_DESCRIPTIONS.has(normalizeProcessNarration(value).toLowerCase())
    ? null
    : value
}

function projectReasoningEntries(nodes: ReadonlyArray<ChatAgentReasoningNode>): ChatAgentReasoningEntry[] {
  const entries: ChatAgentReasoningEntry[] = []
  for (const node of nodes) {
    if (node.reasoningKind === 'summary') {
      entries.push({
        detail: null,
        id: `reasoning-entry:${node.id}`,
        summary: node,
      })
      continue
    }
    const previous = entries.at(-1)
    if (previous?.summary && !previous.detail) {
      previous.detail = node
      continue
    }
    entries.push({
      detail: node,
      id: `reasoning-entry:${node.id}`,
      summary: null,
    })
  }
  return entries
}

function approvalPresentation(review: ApprovalReviewPayload): BuddyToolPresentation {
  if (review.card === 'shell') {
    return {
      card: 'terminal',
      command: review.command,
      cwd: null,
      description: null,
      exitCode: null,
      output: null,
      signal: null,
      truncated: false,
    }
  }
  if (review.card === 'system-action') {
    return {
      action: review.action,
      card: 'system',
      description: null,
      output: null,
      status: 'awaiting-approval',
      target: review.target.displayName,
      truncated: false,
      verified: null,
    }
  }
  if (review.card === 'automation') {
    return {
      automationId: null,
      card: 'automation',
      itemCount: null,
      name: review.name,
      nextRunAt: null,
      occurrenceId: null,
      operation: review.operation,
      status: 'awaiting-approval',
    }
  }
  const argumentNames = review.card === 'arguments'
    ? review.argumentNames
    : review.targetPaths.length > 0 ? ['targetPaths'] : []
  if (review.toolName.startsWith('mcp__')) {
    const [, connector = 'connector', ...toolParts] = review.toolName.split('__')
    return {
      argumentNames,
      card: 'connector',
      connector,
      description: null,
      output: null,
      tool: toolParts.join('__') || review.toolName,
      truncated: false,
    }
  }
  return {
    argumentNames,
    card: 'generic',
    description: null,
    output: null,
    truncated: false,
  }
}

export interface ChatRecoveryNotice {
  createdAt: string
  missingAttachmentCount: number
  runId: string
  sequence: number
}

export interface StreamingAssistantMessage {
  id: string
  text: string
}

export function projectLatestRunActivity(
  events: ReadonlyArray<LocalRunEvent>,
  runs: ReadonlyArray<LocalRun>,
): LocalRunEvent | null {
  const activeRunIds = new Set(runs
    .filter(run => run.status === 'queued' || run.status === 'running')
    .map(run => run.id))
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!
    if (
      activeRunIds.has(event.runId)
      && !event.type.startsWith('message.')
      && !event.type.startsWith('session.')
      && !event.type.startsWith('usage.')
    ) {
      return event
    }
  }
  return null
}

export function projectChatRecoveryNotices(
  timelineItems: ReadonlyArray<LocalConversationTimelineItem>,
  events: ReadonlyArray<LocalRunEvent>,
  runs: ReadonlyArray<LocalRun>,
): ReadonlyArray<ChatRecoveryNotice> {
  const loadedMessageIds = new Set(timelineItems.flatMap(item =>
    item.kind === 'message' ? [item.id] : [],
  ))
  const runById = new Map(runs.map(run => [run.id, run]))

  return events.flatMap((event): ChatRecoveryNotice[] => {
    if (event.type !== 'session.recovery.degraded')
      return []
    const run = runById.get(event.runId)
    if (!run || !loadedMessageIds.has(run.triggeringMessageId))
      return []
    const payload = readPayload(event.payload)
    const missingAttachmentCount = payload?.missingAttachmentCount
    if (
      typeof missingAttachmentCount !== 'number'
      || !Number.isSafeInteger(missingAttachmentCount)
      || missingAttachmentCount <= 0
    ) {
      return []
    }
    return [{
      createdAt: event.createdAt,
      missingAttachmentCount,
      runId: event.runId,
      sequence: event.sequence,
    }]
  }).sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt) || left.sequence - right.sequence,
  )
}

export function projectStreamingAssistantMessage(
  messages: ReadonlyArray<LocalMessage>,
  events: ReadonlyArray<LocalRunEvent>,
  runs: ReadonlyArray<LocalRun>,
): StreamingAssistantMessage | null {
  const persistedIds = new Set(messages.map(message => message.id))
  const runById = new Map(runs.map(run => [run.id, run]))
  const candidates = new Map<string, StreamingAssistantMessage>()
  for (const event of events) {
    const run = runById.get(event.runId)
    const isActive = run?.status === 'queued' || run?.status === 'running'
    const isPendingPersistedFinal = event.type === 'message.completed'
      && !!run
      && persistedIds.has(run.triggeringMessageId)
    if (!isActive && !isPendingPersistedFinal)
      continue
    const payload = readPayload(event.payload)
    if (!payload)
      continue
    const messageId = typeof payload?.messageId === 'string' ? payload.messageId : null
    if (!messageId || persistedIds.has(messageId))
      continue
    if (event.type === 'message.started') {
      candidates.set(messageId, { id: messageId, text: '' })
      continue
    }
    if (event.type === 'message.delta') {
      if (readAssistantTextPhase(payload.phase) === 'commentary') {
        candidates.delete(messageId)
        continue
      }
      const delta = typeof payload.delta === 'string' ? payload.delta : ''
      const current = candidates.get(messageId) ?? { id: messageId, text: '' }
      candidates.set(messageId, { ...current, text: current.text + delta })
      continue
    }
    if (event.type === 'message.completed') {
      const phase = readAssistantTextPhase(payload.phase)
      if (phase === 'commentary' || (!phase && payload.stopReason === 'tool_use')) {
        candidates.delete(messageId)
        continue
      }
      const content = readPayload(payload.content)
      const text = typeof content?.text === 'string'
        ? content.text
        : candidates.get(messageId)?.text ?? ''
      candidates.set(messageId, { id: messageId, text })
    }
  }
  const latest = [...candidates.values()].at(-1)
  return latest?.text.trim() ? latest : null
}

function readPayload(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readNonnegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null
}

function readAssistantTextPhase(value: unknown): BuddyAssistantTextPhase | null {
  const phase = buddyAssistantTextPhaseSchema.safeParse(value)
  return phase.success ? phase.data : null
}

function normalizeProcessNarration(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_~`#>]/g, '')
    .replace(/^\s*[-+]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}
