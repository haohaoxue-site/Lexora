import type { Api, Context, Model, UserMessage } from '@earendil-works/pi-ai'
import type {
  AgentSession,
  SessionEntry,
} from '@earendil-works/pi-coding-agent'
import type {
  BuddyInputReferenceStore,
  BuddyInputReferenceV1,
} from './BuddyInputReference'
import type { BuddyRunContextStore } from './BuddyRunContext'
import type { BuddySessionShutdownReason } from './createBuddySession'
import type {
  BuddyAgentSessionLike,
  BuddySessionTurnContext,
} from './PiTurnExecutor'
import { createAssistantMessageEventStream } from '@earendil-works/pi-ai'
import {
  findCutPoint,
  sessionEntryToContextMessages,
} from '@earendil-works/pi-coding-agent'
import { BUDDY_DEFAULT_THINKING_LEVEL } from '../../../shared/conversation/modelSelection'
import { readBuddyInputReference } from './BuddyInputReference'
import { toBuddySessionStorageError } from './BuddySessionErrors'
import { buildBuddyRequestContext } from './buildBuddyRequestContext'
import { createContextUsageBreakdown } from './contextUsageBreakdown'

export interface CreateReusableBuddySessionOptions {
  assertModelAccess: (
    provider: string,
    model: string,
    contextWindow: number | null,
    maxTokens: number | null,
  ) => Promise<Model<Api>>
  inputReferences: BuddyInputReferenceStore
  materializeInput: (input: BuddyInputReferenceV1) => Promise<UserMessage['content']>
  runContext: BuddyRunContextStore
  session: AgentSession
  shutdown: (reason: BuddySessionShutdownReason) => Promise<void>
}

export function createReusableBuddySession(
  options: CreateReusableBuddySessionOptions,
): BuddyAgentSessionLike {
  const { session } = options
  const convertToLlm = session.agent.convertToLlm
  const streamFunction = session.agent.streamFunction
  let latestContext: Context | null = null
  let inputMaterializationFailed = false
  session.agent.convertToLlm = async (messages) => {
    inputMaterializationFailed = false
    const materialized = []
    for (const message of messages) {
      try {
        const input = readBuddyInputReference(message)
        if (!input) {
          materialized.push(message)
          continue
        }
        const content = await options.materializeInput(input)
        if (
          !Array.isArray(content)
          || content.some(block => block.type === 'image' && !block.data)
        ) {
          throw new Error('Empty image input')
        }
        materialized.push({ content, role: 'user' as const, timestamp: message.timestamp })
      }
      catch {
        inputMaterializationFailed = true
      }
    }
    return convertToLlm(materialized)
  }
  session.agent.streamFunction = (model, context, streamOptions) => {
    if (inputMaterializationFailed)
      return createInputMaterializationFailure(model)
    latestContext = buildBuddyRequestContext(context, session.getAllTools())
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
        onToolExecutionDenied: input.onToolExecutionDenied,
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
    prompt: (text, promptOptions) => {
      const { inputReference, ...piPromptOptions } = promptOptions ?? {}
      options.inputReferences.pending = inputReference ?? null
      return withPiSessionStorageBoundary(
        session,
        () => session.prompt(text, piPromptOptions),
      ).finally(() => {
        if (options.inputReferences.pending === inputReference)
          options.inputReferences.pending = null
      })
    },
    subscribe: listener => session.subscribe(listener),
    waitForIdle: () => session.waitForIdle(),
  }
}

function createInputMaterializationFailure(model: Model<Api>) {
  const stream = createAssistantMessageEventStream()
  queueMicrotask(() => {
    stream.push({
      error: {
        api: model.api,
        content: [],
        errorMessage: 'RESOURCE_MATERIALIZATION_FAILED',
        model: model.id,
        provider: model.provider,
        role: 'assistant',
        stopReason: 'error',
        timestamp: Date.now(),
        usage: {
          cacheRead: 0,
          cacheWrite: 0,
          cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0 },
          input: 0,
          output: 0,
          totalTokens: 0,
        },
      },
      reason: 'error',
      type: 'error',
    })
  })
  return stream
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
