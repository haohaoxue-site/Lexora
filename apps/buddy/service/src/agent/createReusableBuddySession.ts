import type { Api, Context, Model } from '@earendil-works/pi-ai'
import type {
  AgentSession,
  SessionEntry,
} from '@earendil-works/pi-coding-agent'
import type {
  BuddyAgentSessionLike,
  BuddySessionTurnContext,
} from './BuddyAgentRunner'
import type { BuddySessionShutdownReason } from './createBuddySession'
import type { BuddyRunContext } from './extensions/toolPolicyExtension'
import {
  findCutPoint,
  sessionEntryToContextMessages,
} from '@earendil-works/pi-coding-agent'
import { BUDDY_DEFAULT_THINKING_LEVEL } from '../../../shared/modelSelection'
import { toBuddySessionStorageError } from './BuddySessionErrors'
import { createContextUsageBreakdown } from './contextUsageBreakdown'

export interface BuddyRunContextStore {
  current: BuddyRunContext | null
}

export interface CreateReusableBuddySessionOptions {
  assertModelAccess: (
    provider: string,
    model: string,
    contextWindow: number | null,
    maxTokens: number | null,
  ) => Promise<Model<Api>>
  runContext: BuddyRunContextStore
  session: AgentSession
  shutdown: (reason: BuddySessionShutdownReason) => Promise<void>
}

export function createReusableBuddySession(
  options: CreateReusableBuddySessionOptions,
): BuddyAgentSessionLike {
  const { session } = options
  const streamFunction = session.agent.streamFunction
  let latestContext: Context | null = null
  session.agent.streamFunction = (model, context, streamOptions) => {
    latestContext = context
    return streamFunction(model, context, streamOptions)
  }
  return {
    abort: () => session.abort(),
    abortCompaction: () => session.abortCompaction(),
    canCompact: () => canPreparePiCompaction(
      session.sessionManager.getBranch(),
      session.settingsManager.getCompactionSettings(),
    ),
    async activateTurn(input) {
      input.signal.throwIfAborted()
      options.runContext.current = {
        flushProjectedEvents: input.flushProjectedEvents,
        onToolExecutionAuthorized: input.onToolExecutionAuthorized,
        runId: input.runId,
        serviceTier: input.serviceTier ?? null,
        signal: input.signal,
      }
      try {
        await withPiSessionStorageBoundary(
          session,
          () => applyModelSelection(session, options.assertModelAccess, input),
        )
      }
      catch (error) {
        options.runContext.current = null
        throw error
      }
      return () => {
        if (options.runContext.current?.runId === input.runId)
          options.runContext.current = null
      }
    },
    shutdown: options.shutdown,
    compact: instructions => withPiSessionStorageBoundary(
      session,
      () => session.compact(instructions),
    ),
    getContextUsageBreakdown: totalTokens => latestContext
      ? createContextUsageBreakdown(latestContext, totalTokens)
      : null,
    prompt: (text, promptOptions) => withPiSessionStorageBoundary(
      session,
      () => session.prompt(text, promptOptions),
    ),
    subscribe: listener => session.subscribe(listener),
    waitForIdle: () => session.waitForIdle(),
  }
}

async function withPiSessionStorageBoundary<TResult>(
  session: AgentSession,
  operation: () => Promise<TResult>,
): Promise<TResult> {
  try {
    return await operation()
  }
  catch (error) {
    const sessionFile = session.sessionManager.getSessionFile()
    const storageError = sessionFile
      ? toBuddySessionStorageError(error, sessionFile)
      : null
    throw storageError ?? error
  }
}

async function applyModelSelection(
  session: AgentSession,
  assertModelAccess: CreateReusableBuddySessionOptions['assertModelAccess'],
  input: BuddySessionTurnContext,
): Promise<void> {
  const model = await assertModelAccess(
    input.provider,
    input.model,
    input.contextWindow,
    input.maxTokens,
  )
  if (session.model !== model)
    await session.setModel(model)
  session.setThinkingLevel(input.thinkingLevel ?? BUDDY_DEFAULT_THINKING_LEVEL)
}

export function canPreparePiCompaction(
  pathEntries: SessionEntry[],
  settings: { keepRecentTokens: number },
): boolean {
  if (pathEntries.at(-1)?.type === 'compaction')
    return false
  const previousCompactionIndex = pathEntries.findLastIndex(entry => entry.type === 'compaction')
  let boundaryStart = 0
  if (previousCompactionIndex >= 0) {
    const previousCompaction = pathEntries[previousCompactionIndex]!
    if (previousCompaction.type !== 'compaction')
      return false
    const firstKeptEntryIndex = pathEntries.findIndex(
      entry => entry.id === previousCompaction.firstKeptEntryId,
    )
    boundaryStart = firstKeptEntryIndex >= 0
      ? firstKeptEntryIndex
      : previousCompactionIndex + 1
  }
  const cutPoint = findCutPoint(
    pathEntries,
    boundaryStart,
    pathEntries.length,
    settings.keepRecentTokens,
  )
  if (!pathEntries[cutPoint.firstKeptEntryIndex]?.id)
    return false
  const historyEnd = cutPoint.isSplitTurn
    ? cutPoint.turnStartIndex
    : cutPoint.firstKeptEntryIndex
  return hasContextMessages(pathEntries, boundaryStart, historyEnd)
    || (cutPoint.isSplitTurn && hasContextMessages(
      pathEntries,
      cutPoint.turnStartIndex,
      cutPoint.firstKeptEntryIndex,
    ))
}

function hasContextMessages(entries: SessionEntry[], start: number, end: number): boolean {
  for (let index = start; index < end; index += 1) {
    const entry = entries[index]
    if (entry?.type !== 'compaction' && sessionEntryToContextMessages(entry).length > 0)
      return true
  }
  return false
}
