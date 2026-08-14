import type { FileHandle } from 'node:fs/promises'
import type { DatabaseSync } from 'node:sqlite'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import {
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  unlink,
} from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { z } from 'zod'

import {
  approvalReviewPayloadMatchesKind,
  approvalReviewPayloadSchema,
} from '../../../shared/approvalReviewPayload'
import { MAX_BUDDY_MESSAGE_TEXT_LENGTH } from '../../../shared/buddyMessageContent'
import { withTransaction } from '../storage/database'

const runIdSchema = z.string().regex(/^[A-Z0-9][\w-]{0,127}$/i)
const eventTemporaryFilePattern
  = /^\.[A-Z0-9][\w-]{0,127}\.[1-9]\d*\.[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\.tmp$/i
const messageIdSchema = z.string().min(1).max(256)
const approvalRequestPayloadSchema = z.object({
  createdAt: z.iso.datetime(),
  id: z.string().min(1),
  kind: z.enum(['delete', 'mcp', 'network', 'shell', 'system']),
  payload: approvalReviewPayloadSchema,
  resolvedAt: z.null(),
  runId: runIdSchema,
  status: z.literal('pending'),
  summary: z.string(),
  toolCallId: z.string().min(1),
}).strict().refine(
  approval => approvalReviewPayloadMatchesKind(approval.payload, approval.kind),
  { path: ['payload'] },
)
const approvalResolutionPayloadSchema = z.object({
  id: z.string().min(1),
  resolvedAt: z.iso.datetime(),
  status: z.enum(['approved', 'denied', 'cancelled']),
}).strict()
const artifactPayloadSchema = z.object({
  canonicalPath: z.string().min(1),
  createdAt: z.iso.datetime(),
  id: z.string().min(1),
  mimeType: z.string().nullable(),
  operation: z.enum(['created', 'deleted', 'edited']),
  projectId: z.string().nullable(),
  runId: runIdSchema,
}).strict()
const usageEventPayloadSchema = z.object({
  cacheReadCost: z.number().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteCost: z.number().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
  inputCost: z.number().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  model: z.string().min(1),
  outputCost: z.number().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  provider: z.string().min(1),
  purpose: z.enum(['compaction', 'tool', 'turn']),
  reasoningTokens: z.number().int().nonnegative().nullable(),
  sourceEntryId: z.string().min(1),
  totalCost: z.number().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  usageRecordId: z.string().min(1),
}).strict()
const completedMessagePayloadSchema = z.object({
  content: z.object({
    text: z.string().max(MAX_BUDDY_MESSAGE_TEXT_LENGTH),
  }).strict(),
  messageId: messageIdSchema,
  role: z.literal('assistant'),
  stopReason: z.enum(['completed', 'deferred', 'failed', 'length', 'tool_use']),
}).strict()
const toolResultMessagePayloadSchema = z.object({
  content: z.object({
    isError: z.boolean(),
    toolCallId: z.string().min(1).max(256),
    toolName: z.string().min(1).max(256),
  }).strict(),
  messageId: messageIdSchema,
  role: z.literal('tool'),
}).strict()
const interruptedMessagePayloadSchema = z.object({
  content: z.object({
    state: z.literal('interrupted'),
    text: z.string().max(MAX_BUDDY_MESSAGE_TEXT_LENGTH),
    truncated: z.boolean(),
  }).strict(),
  messageId: messageIdSchema,
  reason: z.literal('runtime_restarted'),
  role: z.literal('assistant'),
}).strict()

export const buddyRunEventSchema = z.object({
  runId: runIdSchema,
  sequence: z.number().int().positive(),
  type: z.string().min(1),
  payload: z.unknown(),
  createdAt: z.iso.datetime(),
}).strict()

export interface BuddyRunEvent extends z.infer<typeof buddyRunEventSchema> {}

export interface AppendBuddyRunEventInput {
  runId: string
  type: string
  payload: unknown
  createdAt?: string
}

export interface RunEventLogOptions {
  database: DatabaseSync
  eventsDirectory: string
  onEvent?: (event: BuddyRunEvent) => void
  onEventDeliveryError?: (error: Error, event: BuddyRunEvent) => void
  onFatalFailure?: (error: RunEventLogFatalError) => void
}

export interface ListBuddyRunEventsOptions {
  afterSequence?: number
  limit?: number
}

export interface RunEventFailureScope {
  firstSequence: number | null
  lastSequence: number | null
  runId: string
}

interface RunEventRow {
  run_id: string
  sequence: number
  event_type: string
  payload_json: string
  created_at: string
}

export abstract class RunEventLogFatalError extends Error {
  abstract readonly code: string
  abstract readonly commitState: 'committed' | 'not_applicable' | 'unknown'
  readonly firstSequence: number | null
  readonly lastSequence: number | null
  readonly runId: string

  constructor(message: string, scope: RunEventFailureScope, options?: ErrorOptions) {
    super(message, options)
    this.firstSequence = scope.firstSequence
    this.lastSequence = scope.lastSequence
    this.runId = scope.runId
  }
}

export class RunEventCorruptionError extends RunEventLogFatalError {
  readonly code = 'EVENT_LOG_CORRUPTED'
  readonly commitState = 'not_applicable'

  constructor(runId: string, options?: ErrorOptions) {
    super(
      'Lexora Buddy run event log is corrupted',
      runEventFailureScope(runId),
      options,
    )
    this.name = 'RunEventCorruptionError'
  }
}

export class RunEventProjectionError extends RunEventLogFatalError {
  readonly code = 'EVENT_PROJECTION_FAILED'
  readonly commitState = 'committed'
  readonly committed = true

  constructor(events: readonly BuddyRunEvent[], options?: ErrorOptions) {
    super(
      'Lexora Buddy durable run event projection failed',
      runEventFailureScope(events[0]!.runId, events),
      options,
    )
    this.name = 'RunEventProjectionError'
  }
}

export class RunEventStorageError extends RunEventLogFatalError {
  readonly code = 'EVENT_STORAGE_FAILED'
  readonly commitState: 'committed' | 'unknown'
  readonly operation: 'append' | 'compact' | 'delete' | 'repair'
  readonly stage: 'close' | 'directory' | 'rename' | 'sync' | 'truncate' | 'unlink' | 'write'

  constructor(
    scope: RunEventFailureScope,
    operation: RunEventStorageError['operation'],
    stage: RunEventStorageError['stage'],
    commitState: RunEventStorageError['commitState'],
    options?: ErrorOptions,
  ) {
    super('Lexora Buddy run event storage failed', scope, options)
    this.name = 'RunEventStorageError'
    this.commitState = commitState
    this.operation = operation
    this.stage = stage
  }
}

export class RunEventLogClosedError extends Error {
  constructor() {
    super('Lexora Buddy run event log is closed')
    this.name = 'RunEventLogClosedError'
  }
}

export class RunEventLog {
  readonly #database: DatabaseSync
  readonly #eventsDirectory: string
  readonly #nextSequences = new Map<string, number>()
  readonly #onEvent?: (event: BuddyRunEvent) => void
  readonly #onEventDeliveryError?: (error: Error, event: BuddyRunEvent) => void
  readonly #onFatalFailure?: (error: RunEventLogFatalError) => void
  readonly #tails = new Map<string, Promise<void>>()
  #closePromise: Promise<void> | null = null
  #closed = false
  #fatalFailure: RunEventLogFatalError | null = null

  constructor(options: RunEventLogOptions) {
    this.#database = options.database
    this.#eventsDirectory = options.eventsDirectory
    this.#onEvent = options.onEvent
    this.#onEventDeliveryError = options.onEventDeliveryError
    this.#onFatalFailure = options.onFatalFailure
  }

  append(input: AppendBuddyRunEventInput): Promise<BuddyRunEvent> {
    return this.appendBatch([input]).then(events => events[0]!)
  }

  appendBatch(inputs: readonly AppendBuddyRunEventInput[]): Promise<BuddyRunEvent[]> {
    if (this.#closed)
      return Promise.reject(new RunEventLogClosedError())
    if (inputs.length === 0)
      return Promise.resolve([])
    if (this.#fatalFailure)
      return Promise.reject(this.#fatalFailure)
    const runId = inputs[0]!.runId
    if (inputs.some(input => input.runId !== runId))
      return Promise.reject(new Error('Lexora Buddy event batch must belong to one run'))
    return this.#enqueue(runId, async () => {
      if (this.#fatalFailure)
        throw this.#fatalFailure
      let nextSequence = this.#nextSequences.get(runId)
      if (nextSequence === undefined) {
        const existing = await this.#readAndRepair(runId)
        nextSequence = nextEventSequence(existing)
      }
      const events = inputs.map((input, index) => buddyRunEventSchema.parse({
        runId,
        sequence: nextSequence + index,
        type: input.type,
        payload: input.payload ?? null,
        createdAt: input.createdAt ?? new Date().toISOString(),
      }))
      this.#validateNewProjectedFacts(events)
      await this.#appendAndSync(events)
      this.#nextSequences.set(runId, nextSequence + events.length)
      await this.#projectCommitted(events)
      for (const event of events)
        this.#deliver(event)
      return events
    })
  }

  read(runId: string): Promise<BuddyRunEvent[]> {
    return this.#enqueue(runId, () => this.#readAndRepair(runId))
  }

  list(runId: string, options: ListBuddyRunEventsOptions = {}): Promise<BuddyRunEvent[]> {
    return this.#enqueue(runId, async () => {
      const limit = options.limit ?? 500
      const rows = options.afterSequence === undefined
        ? this.#database.prepare(`
            SELECT * FROM run_events
            WHERE run_id = ?
            ORDER BY sequence DESC
            LIMIT ?
          `).all(runId, limit).toReversed()
        : this.#database.prepare(`
            SELECT * FROM run_events
            WHERE run_id = ? AND sequence > ?
            ORDER BY sequence
            LIMIT ?
          `).all(runId, options.afterSequence, limit)
      return (rows as unknown as RunEventRow[]).map(toRunEvent)
    })
  }

  listForConversation(
    conversationId: string,
    options: Pick<ListBuddyRunEventsOptions, 'limit'> = {},
  ): BuddyRunEvent[] {
    this.#assertOpen()
    const limit = options.limit ?? 1_000
    const rows = this.#database.prepare(`
      SELECT * FROM (
        SELECT
          events.run_id,
          events.sequence,
          events.event_type,
          events.payload_json,
          events.created_at
        FROM run_events AS events
        INNER JOIN runs ON runs.id = events.run_id
        WHERE runs.conversation_id = ?
        ORDER BY events.created_at DESC, events.run_id DESC, events.sequence DESC
        LIMIT ?
      )
      ORDER BY created_at, run_id, sequence
    `).all(conversationId, limit)
    return (rows as unknown as RunEventRow[]).map(toRunEvent)
  }

  listForRuns(runIds: readonly string[]): BuddyRunEvent[] {
    this.#assertOpen()
    const ids = [...new Set(runIds)]
    if (ids.length === 0)
      return []
    const rows = this.#database.prepare(`
      SELECT * FROM run_events
      WHERE run_id IN (${ids.map(() => '?').join(', ')})
      ORDER BY created_at, run_id, sequence
    `).all(...ids)
    return (rows as unknown as RunEventRow[]).map(toRunEvent)
  }

  replay(runId: string): Promise<number> {
    return this.#enqueue(runId, async () => {
      const events = await this.#readAndRepair(runId)
      this.#nextSequences.set(runId, nextEventSequence(events))
      return this.#rebuildProjection(runId, events)
    })
  }

  compactTerminalRun(runId: string): Promise<number> {
    if (this.#fatalFailure)
      return Promise.reject(this.#fatalFailure)
    return this.#enqueue(runId, () => {
      if (this.#fatalFailure)
        throw this.#fatalFailure
      return this.#compactTerminalRun(runId)
    })
  }

  async compactTerminalRuns(): Promise<number> {
    this.#assertOpen()
    const rows = this.#database.prepare(`
      SELECT DISTINCT runs.id
      FROM runs
      INNER JOIN run_events ON run_events.run_id = runs.id
      WHERE runs.status IN ('completed', 'failed', 'cancelled')
        AND run_events.event_type IN ('message.delta', 'message.block.delta', 'tool.updated')
      ORDER BY runs.started_at, runs.id
    `).all() as unknown as Array<{ id: string }>
    let removed = 0
    for (const row of rows)
      removed += await this.compactTerminalRun(row.id)
    return removed
  }

  async replayAll(): Promise<number> {
    this.#assertOpen()
    let entries: string[]
    try {
      entries = await readdir(this.#eventsDirectory)
    }
    catch (error) {
      if (isFileNotFound(error))
        return 0
      throw error
    }
    await syncDirectory(this.#eventsDirectory)
    await syncDirectory(dirname(this.#eventsDirectory))
    const staleTemporaryFiles = entries.filter(entry => eventTemporaryFilePattern.test(entry))
    if (staleTemporaryFiles.length > 0) {
      for (const entry of staleTemporaryFiles)
        await removeFileIfExists(join(this.#eventsDirectory, entry))
      await syncDirectory(this.#eventsDirectory)
    }

    let replayed = 0
    for (const entry of entries.sort()) {
      if (!entry.endsWith('.jsonl'))
        continue
      const runId = entry.slice(0, -'.jsonl'.length)
      if (!this.#runExists(runId)) {
        await this.deleteRuns([runId])
        continue
      }
      replayed += await this.replay(runId)
    }
    return replayed
  }

  async deleteRuns(runIds: readonly string[]): Promise<number> {
    this.#assertOpen()
    if (this.#fatalFailure)
      throw this.#fatalFailure
    let deleted = 0
    for (const runId of runIds) {
      await this.#enqueue(runId, async () => {
        if (this.#fatalFailure)
          throw this.#fatalFailure
        try {
          await unlink(this.#eventPath(runId))
        }
        catch (cause) {
          if (isFileNotFound(cause)) {
            this.#nextSequences.delete(runId)
            return
          }
          this.#fail(new RunEventStorageError(
            runEventFailureScope(runId),
            'delete',
            'unlink',
            'unknown',
            { cause },
          ))
        }
        try {
          await syncDirectory(this.#eventsDirectory)
        }
        catch (cause) {
          this.#fail(new RunEventStorageError(
            runEventFailureScope(runId),
            'delete',
            'directory',
            'unknown',
            { cause },
          ))
        }
        deleted += 1
        this.#nextSequences.delete(runId)
      })
    }
    return deleted
  }

  close(): Promise<void> {
    if (this.#closePromise)
      return this.#closePromise
    this.#closed = true
    this.#closePromise = Promise.all(this.#tails.values()).then(() => undefined)
    return this.#closePromise
  }

  #assertOpen(): void {
    if (this.#closed)
      throw new RunEventLogClosedError()
  }

  #eventPath(runId: string): string {
    return join(this.#eventsDirectory, `${runIdSchema.parse(runId)}.jsonl`)
  }

  async #appendAndSync(events: readonly BuddyRunEvent[]): Promise<void> {
    const scope = runEventFailureScope(events[0]!.runId, events)
    const content = `${events.map(event => JSON.stringify(event)).join('\n')}\n`
    const createdDirectory = await mkdir(
      this.#eventsDirectory,
      { mode: 0o700, recursive: true },
    )
    const { created, file } = await this.#openEventFile(events[0]!.runId)
    let failure: RunEventStorageError | null = null
    let stage: RunEventStorageError['stage'] = 'write'
    let synchronized = false
    try {
      await file.writeFile(content, 'utf8')
      stage = 'sync'
      await file.sync()
      synchronized = true
    }
    catch (cause) {
      failure = new RunEventStorageError(scope, 'append', stage, 'unknown', { cause })
    }
    try {
      await file.close()
    }
    catch (cause) {
      failure ??= new RunEventStorageError(
        scope,
        'append',
        'close',
        synchronized && !created ? 'committed' : 'unknown',
        { cause },
      )
    }
    if (failure)
      this.#fail(failure)
    if (created) {
      try {
        await syncDirectory(this.#eventsDirectory)
        if (createdDirectory)
          await syncDirectory(dirname(this.#eventsDirectory))
      }
      catch (cause) {
        this.#fail(new RunEventStorageError(
          scope,
          'append',
          'directory',
          'unknown',
          { cause },
        ))
      }
    }
  }

  async #openEventFile(runId: string): Promise<{ created: boolean, file: FileHandle }> {
    const path = this.#eventPath(runId)
    try {
      return { created: true, file: await open(path, 'ax', 0o600) }
    }
    catch (error) {
      if (!isFileExists(error))
        throw error
      return { created: false, file: await open(path, 'a', 0o600) }
    }
  }

  async #compactTerminalRun(runId: string): Promise<number> {
    if (!this.#isTerminalRun(runId))
      return 0
    const events = await this.#readAndRepair(runId)
    if (!events.some(event => terminalRunStatus(event.type) !== null))
      return 0
    const completedMessageIds = new Set(events.flatMap((event) => {
      if (event.type !== 'message.completed' && event.type !== 'message.interrupted')
        return []
      const messageId = readMessageId(event.payload)
      return messageId ? [messageId] : []
    }))
    const completedBlockKeys = new Set(events.flatMap((event) => {
      if (event.type !== 'message.block.completed')
        return []
      const key = readMessageBlockKey(event.payload)
      return key ? [key] : []
    }))
    const completedToolCallIds = new Set(events.flatMap((event) => {
      if (event.type !== 'tool.completed')
        return []
      const toolCallId = readToolCallId(event.payload)
      return toolCallId ? [toolCallId] : []
    }))
    const latestToolUpdateSequences = new Map<string, number>()
    for (const event of events) {
      if (event.type !== 'tool.updated')
        continue
      const toolCallId = readToolCallId(event.payload)
      if (toolCallId)
        latestToolUpdateSequences.set(toolCallId, event.sequence)
    }
    const removed = events.filter(event => (
      (event.type === 'message.delta'
        && completedMessageIds.has(readMessageId(event.payload) ?? ''))
      || (event.type === 'message.block.delta'
        && completedBlockKeys.has(readMessageBlockKey(event.payload) ?? ''))
      || (event.type === 'tool.updated'
        && (() => {
          const toolCallId = readToolCallId(event.payload) ?? ''
          return completedToolCallIds.has(toolCallId)
            || latestToolUpdateSequences.get(toolCallId) !== event.sequence
        })())
    ))
    if (removed.length === 0)
      return 0
    const removedSequences = new Set(removed.map(event => event.sequence))
    const retained = events.filter(event => !removedSequences.has(event.sequence))
    await this.#replaceEventFile(runId, retained, events)
    try {
      withTransaction(this.#database, () => {
        const remove = this.#database.prepare(`
          DELETE FROM run_events WHERE run_id = ? AND sequence = ?
        `)
        for (const event of removed)
          remove.run(runId, event.sequence)
      })
    }
    catch {
      try {
        this.#rebuildProjection(runId, retained)
      }
      catch (cause) {
        this.#fail(new RunEventProjectionError(events, { cause }))
      }
    }
    this.#nextSequences.set(runId, nextEventSequence(retained))
    return removed.length
  }

  async #replaceEventFile(
    runId: string,
    events: readonly BuddyRunEvent[],
    replacedEvents: readonly BuddyRunEvent[],
  ): Promise<void> {
    await mkdir(this.#eventsDirectory, { mode: 0o700, recursive: true })
    const path = this.#eventPath(runId)
    const temporaryPath = join(
      this.#eventsDirectory,
      `.${runId}.${process.pid}.${randomUUID()}.tmp`,
    )
    const scope = runEventFailureScope(runId, replacedEvents)
    try {
      await writeDurableFile(
        temporaryPath,
        `${events.map(event => JSON.stringify(event)).join('\n')}\n`,
      )
    }
    catch (error) {
      await removeFileIfExists(temporaryPath)
      throw error
    }
    try {
      await rename(temporaryPath, path)
    }
    catch (cause) {
      await removeFileIfExists(temporaryPath).catch(() => {})
      this.#fail(new RunEventStorageError(
        scope,
        'compact',
        'rename',
        'unknown',
        { cause },
      ))
    }
    try {
      await syncDirectory(this.#eventsDirectory)
    }
    catch (cause) {
      this.#fail(new RunEventStorageError(
        scope,
        'compact',
        'directory',
        'unknown',
        { cause },
      ))
    }
  }

  #deliver(event: BuddyRunEvent): void {
    try {
      this.#onEvent?.(event)
    }
    catch (error) {
      try {
        this.#onEventDeliveryError?.(toEventDeliveryError(error), event)
      }
      catch {}
    }
  }

  async #projectCommitted(events: readonly BuddyRunEvent[]): Promise<void> {
    try {
      this.#projectBatch(events)
      return
    }
    catch {}

    try {
      const runId = events[0]!.runId
      const durableEvents = await this.#readAndRepair(runId)
      this.#rebuildProjection(runId, durableEvents)
      this.#nextSequences.set(runId, nextEventSequence(durableEvents))
    }
    catch (cause) {
      const error = new RunEventProjectionError(events, { cause })
      this.#fail(error)
    }
  }

  #fail(error: RunEventLogFatalError): never {
    if (!this.#fatalFailure) {
      this.#fatalFailure = error
      try {
        this.#onFatalFailure?.(error)
      }
      catch {}
    }
    throw this.#fatalFailure
  }

  #projectBatch(events: readonly BuddyRunEvent[]): number {
    return withTransaction(this.#database, () => events.reduce(
      (count, event) => count + this.#project(event),
      0,
    ))
  }

  #rebuildProjection(runId: string, events: readonly BuddyRunEvent[]): number {
    return withTransaction(this.#database, () => {
      this.#database.prepare('DELETE FROM run_events WHERE run_id = ?').run(runId)
      this.#database.prepare(`
        DELETE FROM messages
        WHERE run_id = ? AND role IN ('assistant', 'tool')
      `).run(runId)
      this.#database.prepare('DELETE FROM approvals WHERE run_id = ?').run(runId)
      this.#database.prepare('DELETE FROM artifacts WHERE run_id = ?').run(runId)
      this.#database.prepare('DELETE FROM usage_records WHERE run_id = ?').run(runId)
      return events.reduce(
        (count, event) => count + this.#project(event),
        0,
      )
    })
  }

  #validateNewProjectedFacts(events: readonly BuddyRunEvent[]): void {
    const runId = events[0]!.runId
    if (!this.#runExists(runId))
      throw new Error(`Lexora Buddy run event conflicts with storage: ${runId}`)

    const messageIds = new Set<string>()
    const approvalStates = new Map<string, ApprovalFactState>()
    const artifactIds = new Set<string>()
    const usageRecordIds = new Set<string>()
    const usageSourceKeys = new Set<string>()
    const findMessage = this.#database.prepare('SELECT 1 FROM messages WHERE id = ?')
    const findApproval = this.#database.prepare(`
      SELECT run_id AS runId, status FROM approvals WHERE id = ?
    `)
    const findArtifact = this.#database.prepare('SELECT 1 FROM artifacts WHERE id = ?')
    const findProject = this.#database.prepare('SELECT 1 FROM projects WHERE id = ?')
    const findUsageById = this.#database.prepare('SELECT 1 FROM usage_records WHERE id = ?')
    const findUsageBySource = this.#database.prepare(`
      SELECT 1 FROM usage_records
      WHERE run_id = ? AND source_entry_id = ? AND purpose = ?
    `)
    for (const event of events) {
      const message = parseProductMessage(event)
      if (message && (messageIds.has(message.messageId) || findMessage.get(message.messageId))) {
        throw new Error(
          `Lexora Buddy ${message.conflictKind} message conflicts with storage: ${message.messageId}`,
        )
      }
      if (message)
        messageIds.add(message.messageId)

      const approval = parseApprovalRequest(event)
      if (approval) {
        if (approvalStates.has(approval.id) || findApproval.get(approval.id))
          throw approvalConflict(approval.id)
        approvalStates.set(approval.id, { runId, status: 'pending' })
      }

      const resolution = parseApprovalResolution(event)
      if (resolution) {
        const approvalState = approvalStates.get(resolution.id)
          ?? findApproval.get(resolution.id) as ApprovalFactState | undefined
        if (
          !approvalState
          || approvalState.runId !== runId
          || approvalState.status !== 'pending'
        ) {
          throw approvalConflict(resolution.id)
        }
        approvalStates.set(resolution.id, { runId, status: resolution.status })
      }

      const artifact = parseArtifact(event)
      if (artifact) {
        if (artifactIds.has(artifact.id) || findArtifact.get(artifact.id))
          throw artifactConflict(artifact.id)
        if (artifact.projectId && !findProject.get(artifact.projectId))
          throw artifactConflict(artifact.id)
        artifactIds.add(artifact.id)
      }

      const usage = parseUsage(event)
      if (usage) {
        const sourceKey = JSON.stringify([runId, usage.sourceEntryId, usage.purpose])
        if (
          usageRecordIds.has(usage.usageRecordId)
          || usageSourceKeys.has(sourceKey)
          || findUsageById.get(usage.usageRecordId)
          || findUsageBySource.get(runId, usage.sourceEntryId, usage.purpose)
        ) {
          throw usageConflict(usage.usageRecordId)
        }
        usageRecordIds.add(usage.usageRecordId)
        usageSourceKeys.add(sourceKey)
      }
    }
  }

  #project(event: BuddyRunEvent): number {
    const result = this.#database.prepare(`
      INSERT INTO run_events (run_id, sequence, event_type, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (run_id, sequence) DO NOTHING
    `).run(
      event.runId,
      event.sequence,
      event.type,
      JSON.stringify(event.payload),
      event.createdAt,
    )
    projectRunStatus(this.#database, event)
    projectProductMessage(this.#database, event)
    projectApprovalRequest(this.#database, event)
    projectApprovalResolution(this.#database, event)
    projectArtifact(this.#database, event)
    projectUsage(this.#database, event)
    return Number(result.changes)
  }

  async #readAndRepair(runId: string): Promise<BuddyRunEvent[]> {
    const path = this.#eventPath(runId)
    let content: string
    try {
      content = await readFile(path, 'utf8')
    }
    catch (error) {
      if (isFileNotFound(error))
        return []
      throw error
    }
    let parsed: ReturnType<typeof parseEventLines>
    try {
      parsed = parseEventLines(content, runId)
    }
    catch (cause) {
      this.#fail(new RunEventCorruptionError(runId, { cause }))
    }
    const scope = runEventFailureScope(runId, parsed.events)
    const repairBytes = parsed.repairBytes
    if (repairBytes !== null) {
      await this.#repairEventFile(scope, 'truncate', file => (
        file.truncate(repairBytes)
      ))
    }
    else if (content.length > 0 && !content.endsWith('\n')) {
      const appendPosition = Buffer.byteLength(content, 'utf8')
      await this.#repairEventFile(scope, 'write', file => (
        file.write('\n', appendPosition, 'utf8').then(() => undefined)
      ))
    }
    return parsed.events
  }

  async #repairEventFile(
    scope: RunEventFailureScope,
    mutationStage: Extract<RunEventStorageError['stage'], 'truncate' | 'write'>,
    mutate: (file: FileHandle) => Promise<void>,
  ): Promise<void> {
    const file = await open(this.#eventPath(scope.runId), 'r+')
    let failure: RunEventStorageError | null = null
    let synchronized = false
    try {
      await mutate(file)
    }
    catch (cause) {
      failure = new RunEventStorageError(
        scope,
        'repair',
        mutationStage,
        'unknown',
        { cause },
      )
    }
    if (!failure) {
      try {
        await file.sync()
        synchronized = true
      }
      catch (cause) {
        failure = new RunEventStorageError(
          scope,
          'repair',
          'sync',
          'unknown',
          { cause },
        )
      }
    }
    try {
      await file.close()
    }
    catch (cause) {
      failure ??= new RunEventStorageError(
        scope,
        'repair',
        'close',
        synchronized ? 'committed' : 'unknown',
        { cause },
      )
    }
    if (failure)
      this.#fail(failure)
  }

  #runExists(runId: string): boolean {
    return this.#database.prepare('SELECT 1 FROM runs WHERE id = ?').get(runId) !== undefined
  }

  #isTerminalRun(runId: string): boolean {
    const row = this.#database.prepare('SELECT status FROM runs WHERE id = ?').get(runId) as {
      status: string
    } | undefined
    return row?.status === 'completed' || row?.status === 'failed' || row?.status === 'cancelled'
  }

  #enqueue<T>(runId: string, operation: () => Promise<T>): Promise<T> {
    if (this.#closed)
      return Promise.reject(new RunEventLogClosedError())
    runIdSchema.parse(runId)
    const previous = this.#tails.get(runId) ?? Promise.resolve()
    const result = previous.catch(() => {}).then(operation)
    const tail = result.then(() => undefined, () => undefined)
    this.#tails.set(runId, tail)
    void tail.finally(() => {
      if (this.#tails.get(runId) === tail)
        this.#tails.delete(runId)
    })
    return result
  }
}

function parseEventLines(
  content: string,
  runId: string,
): { events: BuddyRunEvent[], repairBytes: number | null } {
  const hasFinalNewline = content.endsWith('\n')
  const lines = content.split('\n')
  if (lines.at(-1) === '')
    lines.pop()
  const events: BuddyRunEvent[] = []
  for (const [index, line] of lines.entries()) {
    if (!line.trim())
      continue
    let event: BuddyRunEvent
    try {
      event = buddyRunEventSchema.parse(JSON.parse(line))
    }
    catch (error) {
      if (index === lines.length - 1 && !hasFinalNewline) {
        const validPrefix = lines.slice(0, -1).join('\n')
        return {
          events,
          repairBytes: Buffer.byteLength(validPrefix ? `${validPrefix}\n` : '', 'utf8'),
        }
      }
      throw error
    }
    if (event.runId !== runId || event.sequence <= (events.at(-1)?.sequence ?? 0))
      throw new Error(`Lexora Buddy run event sequence is invalid: ${runId}`)
    events.push(event)
  }
  return { events, repairBytes: null }
}

function nextEventSequence(events: readonly BuddyRunEvent[]): number {
  return (events.at(-1)?.sequence ?? 0) + 1
}

function runEventFailureScope(
  runId: string,
  events: readonly BuddyRunEvent[] = [],
): RunEventFailureScope {
  return {
    firstSequence: events[0]?.sequence ?? null,
    lastSequence: events.at(-1)?.sequence ?? null,
    runId,
  }
}

function readMessageId(value: unknown): string | null {
  const payload = readRecord(value)
  return typeof payload?.messageId === 'string' && payload.messageId.length > 0
    ? payload.messageId
    : null
}

function readMessageBlockKey(value: unknown): string | null {
  const payload = readRecord(value)
  const messageId = typeof payload?.messageId === 'string' ? payload.messageId : null
  const contentIndex = typeof payload?.contentIndex === 'number'
    && Number.isSafeInteger(payload.contentIndex)
    && payload.contentIndex >= 0
    ? payload.contentIndex
    : null
  const kind = payload?.kind === 'text' || payload?.kind === 'reasoning'
    ? payload.kind
    : null
  return messageId && contentIndex !== null && kind
    ? `${messageId}:${contentIndex}:${kind}`
    : null
}

function readToolCallId(value: unknown): string | null {
  const payload = readRecord(value)
  return typeof payload?.toolCallId === 'string' && payload.toolCallId
    ? payload.toolCallId
    : null
}

function toRunEvent(row: RunEventRow): BuddyRunEvent {
  return buddyRunEventSchema.parse({
    createdAt: row.created_at,
    payload: JSON.parse(row.payload_json),
    runId: row.run_id,
    sequence: row.sequence,
    type: row.event_type,
  })
}

async function writeDurableFile(path: string, content: string): Promise<void> {
  const file = await open(path, 'wx', 0o600)
  try {
    await file.writeFile(content, 'utf8')
    await file.sync()
  }
  finally {
    await file.close()
  }
}

async function syncDirectory(path: string): Promise<void> {
  const directory = await open(path, 'r')
  try {
    await directory.sync()
  }
  finally {
    await directory.close()
  }
}

async function removeFileIfExists(path: string): Promise<void> {
  try {
    await unlink(path)
  }
  catch (error) {
    if (!isFileNotFound(error))
      throw error
  }
}

function projectRunStatus(database: DatabaseSync, event: BuddyRunEvent): void {
  const status = terminalRunStatus(event.type)
  if (status) {
    database.prepare(`
      UPDATE runs SET status = ?, completed_at = ?, error_code = ? WHERE id = ?
    `).run(status, event.createdAt, readTerminalErrorCode(event.payload), event.runId)
    return
  }

  if (event.type === 'run.started') {
    database.prepare(`
      UPDATE runs
      SET status = 'running', started_at = ?, completed_at = NULL, error_code = NULL
      WHERE id = ?
    `).run(event.createdAt, event.runId)
  }
}

function projectProductMessage(database: DatabaseSync, event: BuddyRunEvent): void {
  const message = parseProductMessage(event)
  if (!message)
    return
  const contentJson = JSON.stringify(message.content)
  const result = database.prepare(`
    INSERT INTO messages (
      id, conversation_id, branch_id, run_id, role, content_json, created_at
    )
    SELECT ?, runs.conversation_id, runs.branch_id, runs.id, ?, ?, ?
    FROM runs
    WHERE runs.id = ?
    ON CONFLICT (id) DO NOTHING
  `).run(message.messageId, message.role, contentJson, event.createdAt, event.runId)
  if (Number(result.changes) === 1)
    return
  throw new Error(
    `Lexora Buddy ${message.conflictKind} message conflicts with storage: ${message.messageId}`,
  )
}

interface ProductMessageProjection {
  conflictKind: 'completed' | 'interrupted' | 'tool result'
  content: Record<string, unknown>
  messageId: string
  role: 'assistant' | 'tool'
}

function parseProductMessage(event: BuddyRunEvent): ProductMessageProjection | null {
  if (event.type === 'message.completed') {
    const message = completedMessagePayloadSchema.parse(event.payload)
    return { ...message, conflictKind: 'completed' }
  }
  if (event.type === 'message.tool_result') {
    const message = toolResultMessagePayloadSchema.parse(event.payload)
    return { ...message, conflictKind: 'tool result' }
  }
  if (event.type === 'message.interrupted') {
    const message = interruptedMessagePayloadSchema.parse(event.payload)
    return { ...message, conflictKind: 'interrupted' }
  }
  return null
}

type ApprovalRequestProjection = z.infer<typeof approvalRequestPayloadSchema>
type ApprovalResolutionProjection = z.infer<typeof approvalResolutionPayloadSchema>
type ArtifactProjection = z.infer<typeof artifactPayloadSchema>
type UsageProjection = z.infer<typeof usageEventPayloadSchema>

interface ApprovalFactState {
  runId: string
  status: 'approved' | 'cancelled' | 'denied' | 'pending'
}

function parseApprovalRequest(event: BuddyRunEvent): ApprovalRequestProjection | null {
  if (event.type !== 'approval.requested')
    return null
  const approval = approvalRequestPayloadSchema.parse(event.payload)
  if (approval.runId !== event.runId)
    throw new Error(`Lexora Buddy approval event is invalid: ${event.runId}`)
  return approval
}

function parseApprovalResolution(event: BuddyRunEvent): ApprovalResolutionProjection | null {
  return event.type === 'approval.resolved'
    ? approvalResolutionPayloadSchema.parse(event.payload)
    : null
}

function parseArtifact(event: BuddyRunEvent): ArtifactProjection | null {
  if (event.type !== 'artifact.changed')
    return null
  const artifact = artifactPayloadSchema.parse(event.payload)
  if (artifact.runId !== event.runId)
    throw new Error(`Lexora Buddy artifact event is invalid: ${event.runId}`)
  return artifact
}

function parseUsage(event: BuddyRunEvent): UsageProjection | null {
  return event.type === 'usage.recorded'
    ? usageEventPayloadSchema.parse(event.payload)
    : null
}

function approvalConflict(id: string): Error {
  return new Error(`Lexora Buddy approval event conflicts with storage: ${id}`)
}

function artifactConflict(id: string): Error {
  return new Error(`Lexora Buddy artifact event conflicts with storage: ${id}`)
}

function usageConflict(id: string): Error {
  return new Error(`Lexora Buddy usage event conflicts with storage: ${id}`)
}

function projectApprovalResolution(database: DatabaseSync, event: BuddyRunEvent): void {
  const resolution = parseApprovalResolution(event)
  if (!resolution)
    return
  const result = database.prepare(`
    UPDATE approvals SET status = ?, resolved_at = ?
    WHERE id = ? AND run_id = ? AND status = 'pending'
  `).run(resolution.status, resolution.resolvedAt, resolution.id, event.runId)
  if (Number(result.changes) === 1)
    return
  throw approvalConflict(resolution.id)
}

function projectApprovalRequest(database: DatabaseSync, event: BuddyRunEvent): void {
  const approval = parseApprovalRequest(event)
  if (!approval)
    return
  const payloadJson = JSON.stringify(approval.payload)
  if (payloadJson === undefined)
    throw new Error(`Lexora Buddy approval event is invalid: ${event.runId}`)
  const result = database.prepare(`
    INSERT INTO approvals (
      id, run_id, tool_call_id, kind, status, summary, payload_json, created_at, resolved_at
    ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, NULL)
    ON CONFLICT (id) DO NOTHING
  `).run(
    approval.id,
    approval.runId,
    approval.toolCallId,
    approval.kind,
    approval.summary,
    payloadJson,
    approval.createdAt,
  )
  if (Number(result.changes) === 1)
    return
  throw approvalConflict(approval.id)
}

function projectArtifact(database: DatabaseSync, event: BuddyRunEvent): void {
  const artifact = parseArtifact(event)
  if (!artifact)
    return
  const result = database.prepare(`
    INSERT INTO artifacts (
      id, run_id, project_id, canonical_path, operation, mime_type, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO NOTHING
  `).run(
    artifact.id,
    artifact.runId,
    artifact.projectId,
    artifact.canonicalPath,
    artifact.operation,
    artifact.mimeType,
    artifact.createdAt,
  )
  if (Number(result.changes) === 1)
    return
  throw artifactConflict(artifact.id)
}

function projectUsage(database: DatabaseSync, event: BuddyRunEvent): void {
  const usage = parseUsage(event)
  if (!usage)
    return
  const result = database.prepare(`
    INSERT INTO usage_records (
      id, run_id, source_entry_id, provider, model, purpose,
      input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
      reasoning_tokens, total_tokens, input_cost, output_cost,
      cache_read_cost, cache_write_cost, total_cost, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT DO NOTHING
  `).run(
    usage.usageRecordId,
    event.runId,
    usage.sourceEntryId,
    usage.provider,
    usage.model,
    usage.purpose,
    usage.inputTokens,
    usage.outputTokens,
    usage.cacheReadTokens,
    usage.cacheWriteTokens,
    usage.reasoningTokens,
    usage.totalTokens,
    usage.inputCost,
    usage.outputCost,
    usage.cacheReadCost,
    usage.cacheWriteCost,
    usage.totalCost,
    event.createdAt,
  )
  if (Number(result.changes) === 1)
    return
  throw usageConflict(usage.usageRecordId)
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readTerminalErrorCode(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    return null
  const errorCode = (payload as Record<string, unknown>).errorCode
  return typeof errorCode === 'string' && errorCode.length > 0 ? errorCode : null
}

function terminalRunStatus(type: string): 'cancelled' | 'completed' | 'failed' | null {
  if (type === 'run.cancelled')
    return 'cancelled'
  if (type === 'run.completed')
    return 'completed'
  if (type === 'run.failed')
    return 'failed'
  return null
}

function toEventDeliveryError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error('Lexora Buddy run event notification failed')
}

function isFileNotFound(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function isFileExists(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'EEXIST'
}
