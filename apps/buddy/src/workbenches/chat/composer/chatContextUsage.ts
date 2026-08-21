import type {
  LocalContextUsageSnapshot,
  LocalRunEvent,
  LocalRuntimeModelOption,
} from '@buddy-electron/shared/localChatApi'

export type ChatContextUsageSegmentKind = 'mcp' | 'messages' | 'skills' | 'systemPrompt' | 'tools'
export type ChatContextUsageStatus = 'pending' | 'ready'

export interface ChatContextUsageSegment {
  kind: ChatContextUsageSegmentKind
  tokens: number
}

export interface ChatContextUsage {
  contextWindow: number
  modelName: string
  modelId: string
  percent: number | null
  providerId: string
  recordedAt: string | null
  segments: ReadonlyArray<ChatContextUsageSegment>
  status: ChatContextUsageStatus
  totalTokens: number | null
}

interface CreateChatContextUsageInput {
  events: ReadonlyArray<LocalRunEvent>
  models: ReadonlyArray<LocalRuntimeModelOption>
  selectedModel: LocalRuntimeModelOption | null
  snapshot?: LocalContextUsageSnapshot | null
}

interface ContextUsageValues {
  mcpTokens: number
  messageTokens: number
  modelId: string
  providerId: string
  skillTokens: number
  systemPromptTokens: number
  toolTokens: number
  totalTokens: number
}

interface AttributedContextUsage extends ContextUsageValues {
  event: LocalRunEvent
}

const EMPTY_SEGMENTS: ReadonlyArray<ChatContextUsageSegment> = [
  { kind: 'systemPrompt', tokens: 0 },
  { kind: 'tools', tokens: 0 },
  { kind: 'skills', tokens: 0 },
  { kind: 'mcp', tokens: 0 },
  { kind: 'messages', tokens: 0 },
]

export function createChatContextUsage(
  input: CreateChatContextUsageInput,
): ChatContextUsage | null {
  const recorded = latestAttributedContextUsage(input.events)
  const snapshot = readContextUsageSnapshot(input.snapshot)
  const model = recorded
    ? input.models.find(candidate => (
      candidate.providerId === recorded.providerId
      && candidate.modelId === recorded.modelId
    )) ?? input.selectedModel
    : input.selectedModel
  if (!model)
    return null

  if (!recorded && snapshot) {
    const snapshotModel = input.models.find(candidate => (
      candidate.providerId === snapshot.providerId
      && candidate.modelId === snapshot.modelId
    )) ?? model
    return readyContextUsage(snapshot, snapshotModel, snapshot.createdAt)
  }

  if (!recorded) {
    return {
      contextWindow: model.contextWindow,
      modelName: model.displayName,
      modelId: model.modelId,
      percent: null,
      providerId: model.providerId,
      recordedAt: null,
      segments: EMPTY_SEGMENTS,
      status: 'pending',
      totalTokens: null,
    }
  }

  const latestCompaction = input.events
    .filter(event => event.type === 'context.compaction.completed')
    .sort(compareEvents)
    .at(-1)
  if (latestCompaction && compareEvents(latestCompaction, recorded.event) > 0) {
    if (snapshot && snapshot.createdAt >= latestCompaction.createdAt) {
      const snapshotModel = input.models.find(candidate => (
        candidate.providerId === snapshot.providerId
        && candidate.modelId === snapshot.modelId
      )) ?? model
      return readyContextUsage(snapshot, snapshotModel, snapshot.createdAt)
    }
    return {
      contextWindow: model.contextWindow,
      modelName: model.displayName,
      modelId: model.modelId,
      percent: null,
      providerId: model.providerId,
      recordedAt: recorded.event.createdAt,
      segments: EMPTY_SEGMENTS,
      status: 'pending',
      totalTokens: null,
    }
  }

  return readyContextUsage(recorded, model, recorded.event.createdAt)
}

function readyContextUsage(
  usage: ContextUsageValues & { contextWindow?: number },
  model: LocalRuntimeModelOption,
  recordedAt: string,
): ChatContextUsage {
  return {
    contextWindow: usage.contextWindow ?? model.contextWindow,
    modelName: model.displayName,
    modelId: usage.modelId,
    percent: usage.totalTokens / (usage.contextWindow ?? model.contextWindow) * 100,
    providerId: usage.providerId,
    recordedAt,
    segments: [
      { kind: 'systemPrompt', tokens: usage.systemPromptTokens },
      { kind: 'tools', tokens: usage.toolTokens },
      { kind: 'skills', tokens: usage.skillTokens },
      { kind: 'mcp', tokens: usage.mcpTokens },
      { kind: 'messages', tokens: usage.messageTokens },
    ],
    status: 'ready',
    totalTokens: usage.totalTokens,
  }
}

function readContextUsageSnapshot(
  snapshot: LocalContextUsageSnapshot | null | undefined,
): (Omit<AttributedContextUsage, 'event'> & {
  contextWindow: number
  createdAt: string
}) | null {
  if (!snapshot || snapshot.totalTokens <= 0)
    return null
  return snapshot
}

function latestAttributedContextUsage(
  events: ReadonlyArray<LocalRunEvent>,
): AttributedContextUsage | null {
  let latest: AttributedContextUsage | null = null
  for (const event of events) {
    const usage = readAttributedContextUsage(event)
    if (!usage || usage.totalTokens <= 0)
      continue
    if (!latest || compareEvents(event, latest.event) > 0)
      latest = usage
  }
  return latest
}

function readAttributedContextUsage(event: LocalRunEvent): AttributedContextUsage | null {
  if (event.type !== 'context.usage.updated')
    return null

  const mcpTokens = readNonnegativeInteger(event.payload.mcpTokens)
  const messageTokens = readNonnegativeInteger(event.payload.messageTokens)
  const skillTokens = readNonnegativeInteger(event.payload.skillTokens)
  const systemPromptTokens = readNonnegativeInteger(event.payload.systemPromptTokens)
  const toolTokens = readNonnegativeInteger(event.payload.toolTokens)
  const totalTokens = readNonnegativeInteger(event.payload.totalTokens)
  const modelId = readNonemptyString(event.payload.model)
  const providerId = readNonemptyString(event.payload.provider)
  if (
    mcpTokens === null
    || messageTokens === null
    || skillTokens === null
    || systemPromptTokens === null
    || toolTokens === null
    || totalTokens === null
    || modelId === null
    || providerId === null
  ) {
    return null
  }

  if (
    mcpTokens
    + messageTokens
    + skillTokens
    + systemPromptTokens
    + toolTokens !== totalTokens
  ) {
    return null
  }

  return {
    event,
    mcpTokens,
    messageTokens,
    modelId,
    providerId,
    skillTokens,
    systemPromptTokens,
    toolTokens,
    totalTokens,
  }
}

function compareEvents(left: LocalRunEvent, right: LocalRunEvent): number {
  return left.createdAt.localeCompare(right.createdAt)
    || left.runId.localeCompare(right.runId)
    || left.sequence - right.sequence
}

function readNonemptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function readNonnegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}
