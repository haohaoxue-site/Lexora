import type {
  LocalConversationTimelineItem,
  LocalMessage,
  LocalRun,
  LocalRunEvent,
} from '@buddy-electron/shared/localChatApi'
import type { ApprovalReviewPayload } from '@buddy-shared/approvalReviewPayload'
import type { BuddyAssistantTextPhase } from '@buddy-shared/assistantTextPhase'
import type { BuddyReasoningKind } from '@buddy-shared/reasoningPresentation'
import type {
  BuddyToolPresentation,
  BuddyToolPresentationDelta,
} from '@buddy-shared/runEventPresentation'
import type { BuddyRunProgress } from '@buddy-shared/runProgress'
import { approvalReviewPayloadSchema } from '@buddy-shared/approvalReviewPayload'
import { buddyAssistantTextPhaseSchema } from '@buddy-shared/assistantTextPhase'
import {
  buddyReasoningKindSchema,
  resolveBuddyReasoningKind,
} from '@buddy-shared/reasoningPresentation'
import {
  buddyToolPresentationDeltaSchema,
  buddyToolPresentationSchema,
} from '@buddy-shared/runEventPresentation'
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

export interface ChatAgentCompactionNode {
  estimatedTokensAfter: number | null
  id: string
  kind: 'compaction'
  status: 'cancelled' | 'completed' | 'failed' | 'interrupted' | 'running'
  tokensBefore: number | null
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
  denialCode?: string
  description: string | null
  id: string
  isError: boolean
  kind: 'tool'
  presentation: BuddyToolPresentation
  status: 'awaiting_approval' | 'completed' | 'denied' | 'failed' | 'interrupted' | 'preparing' | 'running'
  toolCallId: string
  toolName: string
}

export type ChatAgentTurnNode
  = | ChatAgentCompactionNode
    | ChatAgentNarrationNode
    | ChatAgentReasoningNode
    | ChatAgentToolNode

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

export type ChatAgentTurnRow
  = | ChatAgentCompactionNode
    | ChatAgentNarrationNode
    | ChatAgentReasoningGroup
    | ChatAgentToolNode

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

export interface ChatProjectionReducer<T> {
  append: (events: ReadonlyArray<LocalRunEvent>) => void
  project: () => T
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

export function projectChatAgentTurn(
  run: LocalRun,
  events: ReadonlyArray<LocalRunEvent>,
): ChatAgentTurn {
  const reducer = createChatAgentTurnReducer(run)
  reducer.append(events)
  return reducer.project()
}

export function createChatAgentTurnReducer(
  run: LocalRun,
): ChatProjectionReducer<ChatAgentTurn> {
  const compactions = new Map<string, ChatAgentCompactionNode>()
  const reasoning = new Map<string, ChatAgentReasoningNode>()
  const tools = new Map<string, ChatAgentToolNode>()
  const approvalTools = new Map<string, string>()
  const text = new Map<string, ChatAgentNarrationNode>()
  const nodeOrder = new Map<string, number>()
  let activeCompactionId: string | null = null
  let failureMessage: string | null = null
  let finalMessageId: string | null = null
  let progress: BuddyRunProgress | null = null
  let projection: ChatAgentTurn | null = null

  function append(events: ReadonlyArray<LocalRunEvent>) {
    for (const event of events) {
      if (canAffectChatAgentTurn(event))
        projection = null
      apply(event)
    }
  }

  function apply(event: LocalRunEvent) {
    const payload = readPayload(event.payload)
    if (!payload)
      return
    if (event.type === 'run.failed') {
      failureMessage = readString(payload.errorMessage) || null
      return
    }
    if (event.type === 'run.progress') {
      const parsed = buddyRunProgressSchema.safeParse(payload)
      if (parsed.success)
        progress = parsed.data.phase === 'idle' ? null : parsed.data
      return
    }
    if (event.type === 'context.compaction.started') {
      activeCompactionId = `compaction:${run.id}:${event.sequence}`
      nodeOrder.set(activeCompactionId, event.sequence)
      compactions.set(activeCompactionId, {
        estimatedTokensAfter: null,
        id: activeCompactionId,
        kind: 'compaction',
        status: 'running',
        tokensBefore: null,
      })
      return
    }
    if (
      event.type === 'context.compaction.completed'
      || event.type === 'context.compaction.failed'
      || event.type === 'context.compaction.cancelled'
    ) {
      const id = activeCompactionId ?? `compaction:${run.id}:${event.sequence}`
      const current = compactions.get(id)
      if (!current)
        nodeOrder.set(id, event.sequence)
      compactions.set(id, {
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
      })
      activeCompactionId = null
      return
    }
    if (event.type.startsWith('message.block.')) {
      const messageId = readString(payload.messageId)
      const contentIndex = readNonnegativeInteger(payload.contentIndex)
      if (!messageId || contentIndex === null)
        return
      if (payload.kind === 'text') {
        const phase = readAssistantTextPhase(payload.phase)
        if (phase !== 'commentary')
          return
        const id = `process-text:${messageId}:${contentIndex}`
        const current = text.get(id)
        if (!current)
          nodeOrder.set(id, event.sequence)
        const node = current ?? {
          contentIndex,
          id,
          kind: 'text' as const,
          messageId,
          phase: 'commentary' as const,
          text: '',
        }
        if (event.type === 'message.block.delta') {
          text.set(id, {
            ...node,
            text: node.text + readString(payload.delta),
          })
        }
        else if (event.type === 'message.block.completed') {
          text.set(id, {
            ...node,
            text: readString(payload.content),
          })
        }
        else {
          text.set(id, node)
        }
        return
      }
      if (payload.kind !== 'reasoning')
        return
      const id = `reasoning:${messageId}:${contentIndex}`
      const parsedReasoningKind = buddyReasoningKindSchema.safeParse(payload.reasoningKind)
      const current = reasoning.get(id)
      const reasoningKind = parsedReasoningKind.success
        ? parsedReasoningKind.data
        : current?.reasoningKind ?? resolveBuddyReasoningKind({ provider: run.providerId })
      if (!current)
        nodeOrder.set(id, event.sequence)
      const node = current ?? {
        contentIndex,
        id,
        kind: 'reasoning' as const,
        reasoningKind,
        status: 'running' as const,
        text: '',
      }
      if (event.type === 'message.block.delta') {
        reasoning.set(id, {
          ...node,
          reasoningKind,
          text: node.text + readString(payload.delta),
        })
      }
      else if (event.type === 'message.block.completed') {
        reasoning.set(id, {
          ...node,
          reasoningKind,
          status: 'completed',
          text: readString(payload.content),
        })
      }
      else {
        reasoning.set(id, node)
      }
      return
    }
    if (event.type === 'message.delta') {
      const phase = readAssistantTextPhase(payload.phase)
      const messageId = readString(payload.messageId)
      const contentIndex = readNonnegativeInteger(payload.contentIndex)
      if (phase !== 'commentary' || !messageId || contentIndex === null)
        return
      const id = `process-text:${messageId}:${contentIndex}`
      const current = text.get(id)
      if (!current)
        nodeOrder.set(id, event.sequence)
      const node = current ?? {
        contentIndex,
        id,
        kind: 'text' as const,
        messageId,
        phase: 'commentary' as const,
        text: '',
      }
      text.set(id, {
        ...node,
        text: node.text + readString(payload.delta),
      })
      return
    }
    if (event.type === 'message.completed') {
      const messageId = readString(payload.messageId)
      const content = readPayload(payload.content)
      if (!messageId)
        return
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
            if (!current)
              nodeOrder.set(id, event.sequence)
            text.set(id, {
              ...current,
              id,
              kind: 'text',
              messageId,
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
          nodeOrder.set(id, event.sequence)
          text.set(id, {
            id,
            kind: 'text',
            messageId,
            text: value,
          })
        }
      }
      else {
        finalMessageId = messageId
      }
      return
    }
    if (event.type === 'approval.requested') {
      const approvalId = readString(payload.id)
      const toolCallId = readString(payload.toolCallId)
      const current = tools.get(toolCallId)
      const review = approvalReviewPayloadSchema.safeParse(payload.review)
      const structuredApprovalPresentation = review.success
        && review.data.card === 'system-action'
        ? approvalPresentation(review.data)
        : null
      const base = current
        ? structuredApprovalPresentation
          ? {
              ...current,
              description: null,
              presentation: structuredApprovalPresentation,
            }
          : current
        : review.success
          ? {
              id: `tool:${toolCallId}`,
              isError: false,
              kind: 'tool' as const,
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
        if (!current)
          nodeOrder.set(base.id, event.sequence)
        tools.set(toolCallId, {
          ...base,
          approvalId,
          status: 'awaiting_approval',
        })
      }
      return
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
      return
    }
    if (event.type === 'tool.denied') {
      const toolCallId = readString(payload.toolCallId)
      const current = toolCallId ? tools.get(toolCallId) : undefined
      const denialCode = readString(payload.denialCode)
      if (current) {
        tools.set(current.toolCallId, {
          ...current,
          ...(denialCode ? { denialCode } : {}),
          isError: true,
          status: 'denied',
        })
      }
      return
    }
    if (
      event.type === 'tool.preparing'
      || event.type === 'tool.started'
      || event.type === 'tool.updated'
      || event.type === 'tool.completed'
    ) {
      const toolCallId = readString(payload.toolCallId)
      const toolName = readString(payload.toolName)
      if (!toolCallId || !toolName)
        return
      const current = tools.get(toolCallId)
      const presentation = readToolPresentationUpdate(payload, current?.presentation)
      if (!presentation)
        return
      const isError = event.type === 'tool.completed' && payload.isError === true
      const narration = current ? null : [...text.values()].at(-1)
      const toolNarration = narration?.phase === 'commentary' ? null : narration
      const isStructuredTool = presentation.card === 'automation'
        || presentation.card === 'directory-authorization'
        || presentation.card === 'system'
      const description = isStructuredTool
        ? null
        : current?.description
          ?? toolNarration?.text
          ?? specificToolDescription(
            'description' in presentation ? presentation.description : null,
          )
          ?? null
      if (!isStructuredTool && toolNarration && description === toolNarration.text)
        text.delete(toolNarration.id)
      if (!current)
        nodeOrder.set(`tool:${toolCallId}`, event.sequence)
      tools.set(toolCallId, {
        ...(current?.approvalId ? { approvalId: current.approvalId } : {}),
        ...(current?.denialCode ? { denialCode: current.denialCode } : {}),
        description,
        id: `tool:${toolCallId}`,
        isError: isError || Boolean(current?.denialCode),
        kind: 'tool',
        presentation,
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

  function readToolPresentationUpdate(
    payload: Record<string, unknown>,
    current: BuddyToolPresentation | undefined,
  ): BuddyToolPresentation | null {
    const presentation = buddyToolPresentationSchema.safeParse(payload.presentation)
    if (presentation.success)
      return presentation.data
    const delta = buddyToolPresentationDeltaSchema.safeParse(payload.presentationDelta)
    if (!delta.success || current?.card !== 'terminal')
      return null
    return appendTerminalPresentationDelta(current, delta.data)
  }

  function readNodeOrder(node: ChatAgentTurnNode): number {
    return nodeOrder.get(node.id) ?? Number.MAX_SAFE_INTEGER
  }

  function project(): ChatAgentTurn {
    if (projection)
      return projection
    const terminal = run.status !== 'queued' && run.status !== 'running'
    const reasoningNodes = [...reasoning.values()].filter(node => node.text.trim())
    const narrationNodes = [...text.values()].filter(node => node.text.trim())
    const awaitingApproval = [...tools.values()]
      .filter(node => node.status === 'awaiting_approval')
      .sort((left, right) => readNodeOrder(right) - readNodeOrder(left))[0]
    const nodes = [...reasoningNodes, ...narrationNodes, ...tools.values(), ...compactions.values()]
      .sort((left, right) => readNodeOrder(left) - readNodeOrder(right))
      .map((node) => {
        if (
          node.kind === 'text'
          || !terminal
          || (node.status !== 'preparing' && node.status !== 'running')
        ) {
          return node
        }
        return { ...node, status: 'interrupted' as const }
      })
    projection = {
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
    return projection
  }

  return { append, project }
}

function canAffectChatAgentTurn(event: LocalRunEvent): boolean {
  const payload = readPayload(event.payload)
  if (!payload)
    return false
  if (event.type === 'message.delta')
    return readAssistantTextPhase(payload.phase) === 'commentary'
  if (event.type.startsWith('message.block.')) {
    return payload.kind === 'reasoning'
      || (payload.kind === 'text' && readAssistantTextPhase(payload.phase) === 'commentary')
  }
  return event.type === 'run.failed'
    || event.type === 'run.progress'
    || event.type.startsWith('context.compaction.')
    || event.type === 'message.completed'
    || event.type.startsWith('approval.')
    || event.type.startsWith('tool.')
}

function appendTerminalPresentationDelta(
  current: Extract<BuddyToolPresentation, { card: 'terminal' }>,
  delta: BuddyToolPresentationDelta,
): BuddyToolPresentation | null {
  const output = current.output ?? ''
  if (output.length !== delta.outputStart)
    return null
  const nextOutput = output + delta.outputDelta
  return {
    ...current,
    output: nextOutput || null,
    truncated: delta.truncated,
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

export function createChatAgentTurnRowProjector() {
  let source: ReadonlyArray<ChatAgentTurnNode> | null = null
  let rows: ReadonlyArray<ChatAgentTurnRow> = []

  function project(nodes: ReadonlyArray<ChatAgentTurnNode>): ReadonlyArray<ChatAgentTurnRow> {
    if (nodes === source)
      return rows
    const previousById = new Map(rows.map(row => [row.id, row]))
    rows = projectChatAgentTurnRows(nodes).map((row) => {
      const previous = previousById.get(row.id)
      return previous && isSameChatAgentTurnRow(previous, row) ? previous : row
    })
    source = nodes
    return rows
  }

  return { project }
}

function isSameChatAgentTurnRow(
  previous: ChatAgentTurnRow,
  current: ChatAgentTurnRow,
): boolean {
  if (previous === current)
    return true
  if (previous.kind !== 'reasoning-group' || current.kind !== 'reasoning-group')
    return false
  return previous.reasoningKind === current.reasoningKind
    && previous.entries.length === current.entries.length
    && previous.entries.every((entry, index) => {
      const currentEntry = current.entries[index]
      return currentEntry !== undefined
        && entry.id === currentEntry.id
        && entry.summary === currentEntry.summary
        && entry.detail === currentEntry.detail
    })
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
  if (review.card === 'browser-action') {
    return {
      argumentNames: [],
      card: 'generic',
      description: null,
      output: null,
      truncated: false,
    }
  }
  if (review.card === 'web') {
    return {
      card: 'web',
      description: null,
      operation: review.operation,
      output: null,
      provider: review.provider,
      target: review.target,
      truncated: false,
    }
  }
  const argumentNames = review.card === 'arguments'
    ? review.argumentNames
    : review.targets.length > 0 ? ['targets'] : []
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

export interface ChatRunStreamingMessage {
  message: LocalMessage
  orderCreatedAt: string
  orderSequence: number
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
  return selectChatRecoveryNotices(
    timelineItems,
    projectChatRunRecoveryNotices(events),
    runs,
  )
}

export function projectChatRunRecoveryNotices(
  events: ReadonlyArray<LocalRunEvent>,
): ReadonlyArray<ChatRecoveryNotice> {
  const reducer = createChatRunRecoveryNoticeReducer()
  reducer.append(events)
  return reducer.project()
}

export function createChatRunRecoveryNoticeReducer(): ChatProjectionReducer<ReadonlyArray<ChatRecoveryNotice>> {
  let notices: ReadonlyArray<ChatRecoveryNotice> = []

  function append(events: ReadonlyArray<LocalRunEvent>) {
    const appended = events.flatMap((event): ChatRecoveryNotice[] => {
      if (event.type !== 'session.recovery.degraded')
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
    })
    if (appended.length > 0)
      notices = [...notices, ...appended]
  }

  return {
    append,
    project: () => notices,
  }
}

export function selectChatRecoveryNotices(
  timelineItems: ReadonlyArray<LocalConversationTimelineItem>,
  notices: ReadonlyArray<ChatRecoveryNotice>,
  runs: ReadonlyArray<LocalRun>,
): ReadonlyArray<ChatRecoveryNotice> {
  const loadedMessageIds = new Set(timelineItems.flatMap(item => (
    item.kind === 'message' ? [item.id] : []
  )))
  const runById = new Map(runs.map(run => [run.id, run]))
  return notices.filter((notice) => {
    const run = runById.get(notice.runId)
    return !!run && loadedMessageIds.has(run.triggeringMessageId)
  }).sort((left, right) => (
    left.createdAt.localeCompare(right.createdAt) || left.sequence - right.sequence
  ))
}

export function projectStreamingAssistantMessage(
  messages: ReadonlyArray<LocalMessage>,
  events: ReadonlyArray<LocalRunEvent>,
  runs: ReadonlyArray<LocalRun>,
): StreamingAssistantMessage | null {
  const eventsByRunId = new Map<string, LocalRunEvent[]>()
  for (const event of events) {
    const runEvents = eventsByRunId.get(event.runId) ?? []
    runEvents.push(event)
    eventsByRunId.set(event.runId, runEvents)
  }
  const latest = selectChatStreamingMessage(
    messages,
    runs.flatMap(run => projectChatRunStreamingMessages(
      run,
      eventsByRunId.get(run.id) ?? [],
    )),
    runs,
  )
  return latest
    ? { id: latest.message.id, text: latest.text }
    : null
}

export function projectChatRunStreamingMessages(
  run: LocalRun,
  events: ReadonlyArray<LocalRunEvent>,
): ReadonlyArray<ChatRunStreamingMessage> {
  const reducer = createChatRunStreamingMessageReducer(run)
  reducer.append(events)
  return reducer.project()
}

export function createChatRunStreamingMessageReducer(
  run: LocalRun,
): ChatProjectionReducer<ReadonlyArray<ChatRunStreamingMessage>> {
  const isActive = run.status === 'queued' || run.status === 'running'
  const messageStartedAtById = new Map<string, string>()
  const candidates = new Map<string, {
    orderCreatedAt: string
    orderSequence: number
    sourceCreatedAt: string
    text: string
  }>()

  function append(events: ReadonlyArray<LocalRunEvent>) {
    for (const event of events) {
      const payload = readPayload(event.payload)
      if (!payload)
        continue
      const messageId = typeof payload.messageId === 'string' ? payload.messageId : null
      if (!messageId)
        continue
      if (event.type === 'message.started') {
        if (!messageStartedAtById.has(messageId))
          messageStartedAtById.set(messageId, event.createdAt)
        if (!isActive)
          continue
        const current = candidates.get(messageId)
        candidates.set(messageId, {
          orderCreatedAt: current?.orderCreatedAt ?? event.createdAt,
          orderSequence: current?.orderSequence ?? event.sequence,
          sourceCreatedAt: event.createdAt,
          text: '',
        })
        continue
      }
      if (!isActive && event.type !== 'message.completed')
        continue
      if (event.type === 'message.delta') {
        if (readAssistantTextPhase(payload.phase) === 'commentary') {
          candidates.delete(messageId)
          continue
        }
        const delta = typeof payload.delta === 'string' ? payload.delta : ''
        const current = candidates.get(messageId)
        candidates.set(messageId, {
          orderCreatedAt: current?.orderCreatedAt ?? event.createdAt,
          orderSequence: current?.orderSequence ?? event.sequence,
          sourceCreatedAt: event.createdAt,
          text: (current?.text ?? '') + delta,
        })
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
        const current = candidates.get(messageId)
        candidates.set(messageId, {
          orderCreatedAt: current?.orderCreatedAt ?? event.createdAt,
          orderSequence: current?.orderSequence ?? event.sequence,
          sourceCreatedAt: event.createdAt,
          text,
        })
      }
    }
  }

  function project(): ReadonlyArray<ChatRunStreamingMessage> {
    return [...candidates.entries()].flatMap(([messageId, candidate]): ChatRunStreamingMessage[] => {
      if (!candidate.text.trim())
        return []
      return [{
        message: {
          attachments: [],
          branchId: run.branchId,
          content: { text: candidate.text },
          conversationId: run.conversationId,
          createdAt: messageStartedAtById.get(messageId) ?? candidate.sourceCreatedAt,
          id: messageId,
          role: 'assistant',
          runId: run.id,
        },
        orderCreatedAt: candidate.orderCreatedAt,
        orderSequence: candidate.orderSequence,
        text: candidate.text,
      }]
    })
  }

  return { append, project }
}

export function selectChatStreamingMessage(
  messages: ReadonlyArray<LocalMessage>,
  candidates: ReadonlyArray<ChatRunStreamingMessage>,
  runs: ReadonlyArray<LocalRun>,
): ChatRunStreamingMessage | null {
  const persistedMessageIds = new Set(messages.map(message => message.id))
  const loadedMessageIds = new Set(persistedMessageIds)
  const runById = new Map(runs.map(run => [run.id, run]))
  const latest = candidates.filter((candidate) => {
    if (persistedMessageIds.has(candidate.message.id) || !candidate.message.runId)
      return false
    const run = runById.get(candidate.message.runId)
    return !!run && (
      run.status === 'queued'
      || run.status === 'running'
      || loadedMessageIds.has(run.triggeringMessageId)
    )
  }).sort(compareRunStreamingMessages).at(-1)
  return latest ?? null
}

function compareRunStreamingMessages(
  left: ChatRunStreamingMessage,
  right: ChatRunStreamingMessage,
): number {
  return left.orderCreatedAt.localeCompare(right.orderCreatedAt)
    || left.orderSequence - right.orderSequence
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
