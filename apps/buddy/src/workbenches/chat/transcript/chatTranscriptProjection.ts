import type {
  LocalArtifact,
  LocalChangeSetSummary,
  LocalConversationTimelineItem,
  LocalMessage,
  LocalRun,
  LocalRunEvent,
  LocalRunOutput,
} from '@buddy-electron/shared/localChatApi'
import type { ChatRunTranscriptProjection } from './chatRunTranscriptProjector'
import type {
  ChatAgentTurn,
  ChatRecoveryNotice,
} from './chatStreamingMessage'
import { projectConversationCompactionState } from './chatConversationTimeline'
import { isVisibleChatMessage } from './chatMessageContent'
import {
  projectChatAgentTurns,
  projectChatRecoveryNotices,
  projectStreamingAssistantMessage,
  selectChatRecoveryNotices,
  selectChatStreamingMessage,
} from './chatStreamingMessage'

export interface ChatTranscriptMessageRow {
  isAgentTurnResult: boolean
  key: string
  kind: 'message'
  message: LocalMessage
  streaming?: true
  turnChanges?: LocalChangeSetSummary
  turnOutputs: ChatTranscriptTurnOutputs | null
}

export interface ChatTranscriptTurnOutputs {
  artifacts: ReadonlyArray<LocalArtifact>
  runId: string
}

export interface ChatTranscriptCompactionRow {
  compaction: Extract<LocalConversationTimelineItem, { kind: 'compaction' }>
  key: string
  kind: 'compaction'
}

export interface ChatTranscriptAgentTurnRow {
  key: string
  kind: 'agent-turn'
  ownsResultActions?: true
  turn: ChatAgentTurn
}

export interface ChatTranscriptActivityRow {
  key: string
  kind: 'activity'
  turn: ChatAgentTurn
}

export interface ChatTranscriptRecoveryNoticeRow {
  key: string
  kind: 'recovery-notice'
  notice: ChatRecoveryNotice
}

export type ChatTranscriptRow
  = | ChatTranscriptActivityRow
    | ChatTranscriptAgentTurnRow
    | ChatTranscriptCompactionRow
    | ChatTranscriptMessageRow
    | ChatTranscriptRecoveryNoticeRow

export interface ChatTranscriptProjection {
  rows: ReadonlyArray<ChatTranscriptRow>
  update: ChatTranscriptProjectionUpdate
}

export interface ChatTranscriptRowPatch {
  deleteCount: 0 | 1
  index: number
  rows: ReadonlyArray<ChatTranscriptRow>
}

export type ChatTranscriptProjectionUpdate
  = | { kind: 'replace' }
    | {
      kind: 'patch'
      patches: ReadonlyArray<ChatTranscriptRowPatch>
      previousRows: ReadonlyArray<ChatTranscriptRow>
    }

export interface ChatTranscriptProjectionInput {
  agentTurns?: ReadonlyArray<ChatAgentTurn>
  changeSets?: ReadonlyArray<LocalChangeSetSummary>
  outputs: ReadonlyArray<LocalRunOutput>
  runEvents?: ReadonlyArray<LocalRunEvent>
  runProjections?: ReadonlyArray<ChatRunTranscriptProjection>
  runs: ReadonlyArray<LocalRun>
  timelineItems: ReadonlyArray<LocalConversationTimelineItem>
}

interface CachedChatTranscriptProjection {
  activityRowIndex: number | null
  activeRunId: string | null
  agentTurnRowIndexByRunId: ReadonlyMap<string, number>
  changeSets: ReadonlyArray<LocalChangeSetSummary>
  messages: ReadonlyArray<LocalMessage>
  outputs: ReadonlyArray<LocalRunOutput>
  projection: ChatTranscriptProjection
  runProjectionIds: ReadonlySet<string>
  runProjections: ReadonlyArray<ChatRunTranscriptProjection> | null
  runs: ReadonlyArray<LocalRun>
  streamingRowIndex: number | null
  timelineItems: ReadonlyArray<LocalConversationTimelineItem>
}

const EMPTY_CHANGE_SETS: ReadonlyArray<LocalChangeSetSummary> = []

export function projectChatTranscript(
  input: ChatTranscriptProjectionInput,
): ChatTranscriptProjection {
  const messages = input.timelineItems.filter(
    (item): item is Extract<LocalConversationTimelineItem, { kind: 'message' }> =>
      item.kind === 'message',
  )
  const runEvents = input.runEvents ?? []
  const agentTurns = input.runProjections?.map(projection => projection.turn)
    ?? input.agentTurns
    ?? projectChatAgentTurns(runEvents, input.runs)
  const recoveryNotices = input.runProjections
    ? selectChatRecoveryNotices(
        input.timelineItems,
        input.runProjections.flatMap(projection => projection.recoveryNotices),
        input.runs,
      )
    : projectChatRecoveryNotices(input.timelineItems, runEvents, input.runs)
  const streamingLocalMessage = input.runProjections
    ? selectChatStreamingMessage(
      messages,
      input.runProjections.flatMap(projection => projection.streamingMessages),
      input.runs,
    )?.message ?? null
    : projectLegacyStreamingLocalMessage(messages, runEvents, input.runs)
  const triggeringMessageIdByRunId = new Map(
    input.runs.map(run => [run.id, run.triggeringMessageId]),
  )
  const noticesByMessageId = new Map<string, ChatTranscriptRecoveryNoticeRow[]>()
  const noticesByRunId = new Map<string, ChatTranscriptRecoveryNoticeRow[]>()
  for (const notice of recoveryNotices) {
    const messageId = triggeringMessageIdByRunId.get(notice.runId)
    if (!messageId)
      continue
    const row: ChatTranscriptRecoveryNoticeRow = {
      key: `recovery-notice:${notice.runId}:${notice.sequence}`,
      kind: 'recovery-notice',
      notice,
    }
    const messageRows = noticesByMessageId.get(messageId) ?? []
    messageRows.push(row)
    noticesByMessageId.set(messageId, messageRows)
    const runRows = noticesByRunId.get(notice.runId) ?? []
    runRows.push(row)
    noticesByRunId.set(notice.runId, runRows)
  }

  const agentTurnRunIds = new Set(agentTurns.map(turn => turn.runId))
  const rows: ChatTranscriptRow[] = []
  for (const row of projectPersistedChatTranscriptRows(
    input.timelineItems,
    agentTurns,
    input.outputs,
    input.changeSets ?? [],
  )) {
    rows.push(row)
    if (row.kind === 'agent-turn') {
      rows.push(...(noticesByRunId.get(row.turn.runId) ?? []))
      continue
    }
    if (row.kind === 'message') {
      rows.push(...(noticesByMessageId.get(row.message.id) ?? []).filter(
        notice => !agentTurnRunIds.has(notice.notice.runId),
      ))
    }
  }
  const activeAgentTurn = [...rows].reverse().find(
    (row): row is ChatTranscriptAgentTurnRow => row.kind === 'agent-turn'
      && (row.turn.status === 'queued' || row.turn.status === 'running'),
  )?.turn
  if (streamingLocalMessage) {
    rows.push({
      isAgentTurnResult: agentTurnRunIds.has(streamingLocalMessage.runId ?? ''),
      key: `message:${streamingLocalMessage.id}`,
      kind: 'message',
      message: streamingLocalMessage,
      streaming: true,
      turnOutputs: null,
    })
  }
  if (activeAgentTurn) {
    rows.push({
      key: `activity:${activeAgentTurn.runId}`,
      kind: 'activity',
      turn: activeAgentTurn,
    })
  }

  return { rows, update: { kind: 'replace' } }
}

export function createChatTranscriptProjector() {
  let cached: CachedChatTranscriptProjection | null = null

  return {
    project(input: ChatTranscriptProjectionInput): ChatTranscriptProjection {
      const incremental = cached && projectIncrementalChatTranscript(cached, input)
      if (incremental) {
        cached = incremental.cache
        return incremental.projection
      }
      const projection = projectChatTranscript(input)
      cached = createChatTranscriptProjectionCache(input, projection)
      return projection
    },
  }
}

function projectIncrementalChatTranscript(
  cached: CachedChatTranscriptProjection,
  input: ChatTranscriptProjectionInput,
): {
  cache: CachedChatTranscriptProjection
  projection: ChatTranscriptProjection
} | null {
  const runProjections = input.runProjections
  if (
    !runProjections
    || !cached.runProjections
    || cached.timelineItems !== input.timelineItems
    || cached.runs !== input.runs
    || cached.outputs !== input.outputs
    || cached.changeSets !== (input.changeSets ?? EMPTY_CHANGE_SETS)
    || cached.runProjections.length !== runProjections.length
  ) {
    return null
  }

  const changed: Array<{
    next: ChatRunTranscriptProjection
    previous: ChatRunTranscriptProjection
  }> = []
  for (let index = 0; index < runProjections.length; index += 1) {
    const previous = cached.runProjections[index]!
    const next = runProjections[index]!
    if (previous.turn.runId !== next.turn.runId)
      return null
    if (previous === next)
      continue
    if (
      !hasSameRecoveryNotices(previous, next)
      || !hasSameTurnRowStructure(previous.turn, next.turn)
    ) {
      return null
    }
    changed.push({ next, previous })
  }

  if (changed.length === 0) {
    return {
      cache: { ...cached, runProjections },
      projection: cached.projection,
    }
  }

  let rows: ChatTranscriptRow[] | null = null
  const patches: ChatTranscriptRowPatch[] = []
  const editableRows = () => rows ??= [...cached.projection.rows]
  const patchRows = (patch: ChatTranscriptRowPatch) => {
    editableRows().splice(patch.index, patch.deleteCount, ...patch.rows)
    patches.push(patch)
  }
  for (const { next, previous } of changed) {
    if (next.turn === previous.turn)
      continue
    const rowIndex = cached.agentTurnRowIndexByRunId.get(next.turn.runId)
    if (rowIndex === undefined)
      continue
    const row = cached.projection.rows[rowIndex]
    if (row?.kind !== 'agent-turn')
      return null
    patchRows({
      deleteCount: 1,
      index: rowIndex,
      rows: [{ ...row, turn: next.turn }],
    })
  }

  const streamingMessage = selectChatStreamingMessage(
    cached.messages,
    runProjections.flatMap(projection => projection.streamingMessages),
    input.runs,
  )?.message ?? null
  let streamingRowIndex = cached.streamingRowIndex
  let activityRowIndex = cached.activityRowIndex
  if (streamingMessage) {
    const nextStreamingRow: ChatTranscriptMessageRow = {
      isAgentTurnResult: cached.runProjectionIds.has(streamingMessage.runId ?? ''),
      key: `message:${streamingMessage.id}`,
      kind: 'message',
      message: streamingMessage,
      streaming: true,
      turnOutputs: null,
    }
    if (streamingRowIndex === null) {
      streamingRowIndex = activityRowIndex ?? cached.projection.rows.length
      patchRows({
        deleteCount: 0,
        index: streamingRowIndex,
        rows: [nextStreamingRow],
      })
      if (activityRowIndex !== null)
        activityRowIndex += 1
    }
    else {
      patchRows({
        deleteCount: 1,
        index: streamingRowIndex,
        rows: [nextStreamingRow],
      })
    }
  }
  else if (streamingRowIndex !== null) {
    patchRows({
      deleteCount: 1,
      index: streamingRowIndex,
      rows: [],
    })
    if (activityRowIndex !== null && activityRowIndex > streamingRowIndex)
      activityRowIndex -= 1
    streamingRowIndex = null
  }

  if (activityRowIndex !== null && cached.activeRunId) {
    const nextActiveTurn = runProjections.find(
      projection => projection.turn.runId === cached.activeRunId,
    )?.turn
    const row = (rows ?? cached.projection.rows)[activityRowIndex]
    if (!nextActiveTurn || row?.kind !== 'activity')
      return null
    if (row.turn !== nextActiveTurn) {
      patchRows({
        deleteCount: 1,
        index: activityRowIndex,
        rows: [{ ...row, turn: nextActiveTurn }],
      })
    }
  }

  const projection: ChatTranscriptProjection = rows
    ? {
        rows,
        update: {
          kind: 'patch',
          patches,
          previousRows: cached.projection.rows,
        },
      }
    : cached.projection
  return {
    cache: {
      ...cached,
      activityRowIndex,
      projection,
      runProjections,
      streamingRowIndex,
    },
    projection,
  }
}

function createChatTranscriptProjectionCache(
  input: ChatTranscriptProjectionInput,
  projection: ChatTranscriptProjection,
): CachedChatTranscriptProjection {
  const agentTurnRowIndexByRunId = new Map<string, number>()
  let activityRowIndex: number | null = null
  let activeRunId: string | null = null
  let streamingRowIndex: number | null = null
  projection.rows.forEach((row, index) => {
    if (row.kind === 'agent-turn') {
      agentTurnRowIndexByRunId.set(row.turn.runId, index)
    }
    else if (row.kind === 'activity') {
      activityRowIndex = index
      activeRunId = row.turn.runId
    }
    else if (row.kind === 'message' && row.streaming) {
      streamingRowIndex = index
    }
  })
  const runProjections = input.runProjections ?? null
  return {
    activityRowIndex,
    activeRunId,
    agentTurnRowIndexByRunId,
    changeSets: input.changeSets ?? EMPTY_CHANGE_SETS,
    messages: input.timelineItems.filter(
      (item): item is Extract<LocalConversationTimelineItem, { kind: 'message' }> =>
        item.kind === 'message',
    ),
    outputs: input.outputs,
    projection,
    runProjectionIds: new Set(runProjections?.map(item => item.turn.runId) ?? []),
    runProjections,
    runs: input.runs,
    streamingRowIndex,
    timelineItems: input.timelineItems,
  }
}

function hasSameRecoveryNotices(
  previous: ChatRunTranscriptProjection,
  next: ChatRunTranscriptProjection,
): boolean {
  return previous.recoveryNotices === next.recoveryNotices
    || (
      previous.recoveryNotices.length === next.recoveryNotices.length
      && previous.recoveryNotices.every((notice, index) => next.recoveryNotices[index] === notice)
    )
}

function hasSameTurnRowStructure(previous: ChatAgentTurn, next: ChatAgentTurn): boolean {
  return previous.runId === next.runId
    && previous.branchId === next.branchId
    && previous.triggeringMessageId === next.triggeringMessageId
    && previous.finalMessageId === next.finalMessageId
    && previous.startedAt === next.startedAt
    && previous.status === next.status
    && shouldShowAgentTurn(previous) === shouldShowAgentTurn(next)
    && hasSameProcessMessageIds(previous, next)
}

function hasSameProcessMessageIds(previous: ChatAgentTurn, next: ChatAgentTurn): boolean {
  const previousIds = previous.nodes.flatMap(node => (
    node.kind === 'text' && node.messageId !== previous.finalMessageId ? [node.messageId] : []
  ))
  const nextIds = next.nodes.flatMap(node => (
    node.kind === 'text' && node.messageId !== next.finalMessageId ? [node.messageId] : []
  ))
  return previousIds.length === nextIds.length
    && previousIds.every((messageId, index) => nextIds[index] === messageId)
}

function projectLegacyStreamingLocalMessage(
  messages: ReadonlyArray<LocalMessage>,
  events: ReadonlyArray<LocalRunEvent>,
  runs: ReadonlyArray<LocalRun>,
): LocalMessage | null {
  const streamingMessage = projectStreamingAssistantMessage(messages, events, runs)
  return streamingMessage
    ? projectStreamingLocalMessage(streamingMessage.id, streamingMessage.text, events, runs)
    : null
}

function projectStreamingLocalMessage(
  messageId: string,
  text: string,
  events: ReadonlyArray<LocalRunEvent>,
  runs: ReadonlyArray<LocalRun>,
): LocalMessage | null {
  const sourceEvent = [...events].reverse().find(event => (
    readMessageId(event.payload) === messageId
  ))
  if (!sourceEvent)
    return null
  const run = runs.find(item => item.id === sourceEvent.runId)
  if (!run)
    return null
  const startedAt = events.find(event => (
    event.runId === run.id
    && event.type === 'message.started'
    && readMessageId(event.payload) === messageId
  ))?.createdAt ?? sourceEvent.createdAt
  return {
    attachments: [],
    branchId: run.branchId,
    content: { text },
    conversationId: run.conversationId,
    createdAt: startedAt,
    id: messageId,
    role: 'assistant',
    runId: run.id,
  }
}

function readMessageId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    return null
  const messageId = (payload as Record<string, unknown>).messageId
  return typeof messageId === 'string' ? messageId : null
}

export function projectPersistedChatTranscriptRows(
  items: ReadonlyArray<LocalConversationTimelineItem>,
  turns: ReadonlyArray<ChatAgentTurn>,
  outputs: ReadonlyArray<LocalRunOutput> = [],
  changeSets: ReadonlyArray<LocalChangeSetSummary> = [],
): Array<
  ChatTranscriptAgentTurnRow
  | ChatTranscriptCompactionRow
  | ChatTranscriptMessageRow
> {
  const rows: Array<
    ChatTranscriptAgentTurnRow
    | ChatTranscriptCompactionRow
    | ChatTranscriptMessageRow
  > = []
  const turnsByTrigger = new Map<string, ChatAgentTurn[]>()
  const turnsByRunId = new Map(turns.map(turn => [turn.runId, turn]))
  const visibleTurnsByRunId = new Map(
    turns.filter(shouldShowAgentTurn).map(turn => [turn.runId, turn]),
  )
  const outputsByRunId = projectTurnOutputs(outputs)
  const changesByRunId = new Map(changeSets
    .filter(changeSet => changeSet.fileCount > 0)
    .map(changeSet => [changeSet.runId, changeSet]))
  const renderedResultRunIds = new Set(items.flatMap((item) => {
    if (
      item.kind !== 'message'
      || !item.runId
      || !isFinalTurnMessage(item, turnsByRunId)
      || (
        !isVisibleChatMessage(item)
        && !outputsByRunId.has(item.runId)
        && !changesByRunId.has(item.runId)
      )
    ) {
      return []
    }
    return [item.runId]
  }))
  const processMessageIds = new Set<string>()
  for (const turn of turns) {
    for (const node of turn.nodes) {
      if (node.kind === 'text' && node.messageId !== turn.finalMessageId)
        processMessageIds.add(node.messageId)
    }
    if (!shouldShowAgentTurn(turn))
      continue
    const candidates = turnsByTrigger.get(turn.triggeringMessageId) ?? []
    candidates.push(turn)
    turnsByTrigger.set(turn.triggeringMessageId, candidates)
  }

  for (const item of items) {
    if (item.kind === 'compaction') {
      if (projectConversationCompactionState(item.status, item.errorCode) === 'not_needed')
        continue
      rows.push({
        compaction: item,
        key: `compaction:${item.id}`,
        kind: 'compaction',
      })
      continue
    }
    if (processMessageIds.has(item.id))
      continue
    const isAgentTurnResult = isFinalTurnMessage(item, visibleTurnsByRunId)
    const turnOutputs = isFinalTurnMessage(item, turnsByRunId) && item.runId
      ? outputsByRunId.get(item.runId) ?? null
      : null
    const turnChanges = isFinalTurnMessage(item, turnsByRunId) && item.runId
      ? changesByRunId.get(item.runId) ?? null
      : null
    if (!isVisibleChatMessage(item) && turnOutputs === null && turnChanges === null)
      continue
    const row: ChatTranscriptMessageRow = {
      isAgentTurnResult,
      key: `message:${item.id}`,
      kind: 'message',
      message: item,
      turnOutputs,
    }
    if (turnChanges)
      row.turnChanges = turnChanges
    rows.push(row)
    rows.push(...(turnsByTrigger.get(item.id) ?? []).map((turn) => {
      const ownsResultActions = (
        turn.status === 'failed'
        || turn.status === 'cancelled'
      ) && !renderedResultRunIds.has(turn.runId)
      return {
        ...(ownsResultActions ? { ownsResultActions: true as const } : {}),
        key: `agent-turn:${turn.runId}`,
        kind: 'agent-turn' as const,
        turn,
      }
    }))
  }
  return rows
}

function isFinalTurnMessage(
  message: LocalMessage,
  turnsByRunId: ReadonlyMap<string, ChatAgentTurn>,
): boolean {
  if (message.role !== 'assistant' || !message.runId)
    return false
  const turn = turnsByRunId.get(message.runId)
  if (!turn)
    return false
  return turn.finalMessageId === message.id
}

function projectTurnOutputs(
  outputs: ReadonlyArray<LocalRunOutput>,
): ReadonlyMap<string, ChatTranscriptTurnOutputs> {
  const artifactsByRunId = new Map<string, LocalArtifact[]>()
  const artifactIdsByRunId = new Map<string, Set<string>>()
  for (const output of outputs) {
    const artifacts = artifactsByRunId.get(output.runId) ?? []
    const artifactIds = artifactIdsByRunId.get(output.runId) ?? new Set<string>()
    for (const artifact of output.artifacts) {
      if (artifactIds.has(artifact.artifactId)) {
        artifacts[artifacts.findIndex(item => item.artifactId === artifact.artifactId)] = artifact
      }
      else {
        artifactIds.add(artifact.artifactId)
        artifacts.push(artifact)
      }
    }
    artifactsByRunId.set(output.runId, artifacts)
    artifactIdsByRunId.set(output.runId, artifactIds)
  }
  return new Map([...artifactsByRunId].map(([runId, artifacts]) => [
    runId,
    { artifacts, runId },
  ]))
}

function shouldShowAgentTurn(turn: ChatAgentTurn): boolean {
  return turn.nodes.length > 0
    || turn.status === 'queued'
    || turn.status === 'running'
    || turn.status === 'failed'
    || turn.status === 'cancelled'
}
