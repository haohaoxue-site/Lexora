import type { Api, Message, Model } from '@earendil-works/pi-ai'
import type {
  AgentSession,
  CreateAgentSessionOptions,
  LoadExtensionsResult,
  ModelRuntime,
  ToolDefinition,
} from '@earendil-works/pi-coding-agent'
import type { BuddyServiceTier } from '../../../shared/modelSelection'
import type { ShellSandboxAssets } from '../approvals/ShellSandbox'
import type { BuddySessionResources } from './BuddySessionResources'
import type { BundledLexoraExtension } from './createBuddyResourceLoader'
import type { BoundedContextDiagnostic } from './loadBoundedContextFiles'
import { chmod, mkdir, realpath } from 'node:fs/promises'

import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import {
  convertToLlm,
  createAgentSession,
  SessionManager,
} from '@earendil-works/pi-coding-agent'
import { createSandboxedFileTools } from '../approvals/FileSandbox'
import { createSandboxedBashTool } from '../approvals/ShellSandbox'
import {
  BuddySessionCreationError,
  isMissingBuddySessionFile,
  toBuddySessionStorageError,
} from './BuddySessionErrors'
import { createEstimatedContextUsage } from './contextUsageBreakdown'
import {
  createBuddyResourceLoader,
  createBuddySettingsManager,
} from './createBuddyResourceLoader'

const sessionIdentityPattern = /^[A-Z0-9][\w-]{0,127}$/i

export interface CreateBuddySessionOptions {
  agentDir: string
  branchId: string
  bundledExtensions: readonly BundledLexoraExtension[]
  canonicalRoot: string
  conversationId: string
  customTools?: readonly ToolDefinition[]
  cwd: string
  getServiceTier?: () => BuddyServiceTier | null
  model?: Model<Api>
  modelRuntime: ModelRuntime
  piSessionFile?: string
  recoveryMessages?: readonly Message[] | (() => Promise<readonly Message[]>)
  resources: BuddySessionResources
  shellSandboxAssets: ShellSandboxAssets
  thinkingLevel?: CreateAgentSessionOptions['thinkingLevel']
}

export interface BuddyAgentSession {
  extensionsResult: LoadExtensionsResult
  piSessionFile: string
  recoveredFromProductHistory: boolean
  resourceDiagnostics: readonly BoundedContextDiagnostic[]
  session: AgentSession
}

export type BuddyContextSnapshot = ReturnType<typeof createEstimatedContextUsage>

export async function createBuddySession(
  options: CreateBuddySessionOptions,
): Promise<BuddyAgentSession> {
  validateSessionIdentity(options.conversationId)
  validateSessionIdentity(options.branchId)

  const [canonicalRoot, cwd] = await Promise.all([
    realpath(options.canonicalRoot),
    realpath(options.cwd),
  ])
  if (!containsPath(canonicalRoot, cwd))
    throw new BuddySessionCreationError()

  const agentDir = resolve(options.agentDir)
  const sessionDir = join(agentDir, 'sessions', options.conversationId, options.branchId)
  let canonicalSessionDir: string
  try {
    await mkdir(sessionDir, { mode: 0o700, recursive: true })
    await chmod(sessionDir, 0o700)
    canonicalSessionDir = await realpath(sessionDir)
  }
  catch (error) {
    throw toBuddySessionStorageError(error) ?? error
  }
  const existingSession = options.piSessionFile
    ? await openExistingSession(options.piSessionFile, canonicalSessionDir, cwd)
    : null
  const recoveryMessages = existingSession
    ? []
    : typeof options.recoveryMessages === 'function'
      ? await options.recoveryMessages()
      : options.recoveryMessages ?? []
  const recoveredFromProductHistory = existingSession === null
    && recoveryMessages.length > 0
  let sessionManager: SessionManager
  try {
    sessionManager = existingSession ?? SessionManager.create(cwd, canonicalSessionDir)
    if (recoveredFromProductHistory) {
      for (const message of recoveryMessages)
        sessionManager.appendMessage(message)
    }
  }
  catch (error) {
    throw toBuddySessionStorageError(error) ?? error
  }

  const result = await createConfiguredBuddySession(options, {
    agentDir,
    canonicalRoot,
    cwd,
    sessionManager,
    sessionStartEvent: {
      type: 'session_start',
      reason: existingSession ? 'resume' : 'startup',
      previousSessionFile: existingSession ? options.piSessionFile : undefined,
    },
  })
  const piSessionFile = sessionManager.getSessionFile()
  if (!piSessionFile || !containsPath(canonicalSessionDir, resolve(piSessionFile))) {
    result.session.dispose()
    throw new BuddySessionCreationError()
  }

  return {
    extensionsResult: result.extensionsResult,
    piSessionFile,
    recoveredFromProductHistory,
    resourceDiagnostics: options.resources.context.diagnostics,
    session: result.session,
  }
}

export async function createBuddyContextSnapshot(
  options: CreateBuddySessionOptions,
): Promise<BuddyContextSnapshot> {
  validateSessionIdentity(options.conversationId)
  validateSessionIdentity(options.branchId)

  const [canonicalRoot, cwd] = await Promise.all([
    realpath(options.canonicalRoot),
    realpath(options.cwd),
  ])
  if (!containsPath(canonicalRoot, cwd))
    throw new BuddySessionCreationError()

  const agentDir = resolve(options.agentDir)
  const persistedSessionDir = join(agentDir, 'sessions', options.conversationId, options.branchId)
  const persistedSession = options.piSessionFile
    ? await openExistingSession(options.piSessionFile, persistedSessionDir, cwd)
    : null
  const recoveryMessages = persistedSession
    ? convertToLlm(persistedSession.buildSessionContext().messages)
    : typeof options.recoveryMessages === 'function'
      ? await options.recoveryMessages()
      : options.recoveryMessages ?? []
  const sessionManager = SessionManager.inMemory(cwd)
  for (const message of recoveryMessages)
    sessionManager.appendMessage(message)

  const result = await createConfiguredBuddySession(options, {
    agentDir,
    canonicalRoot,
    cwd,
    sessionManager,
    sessionStartEvent: {
      type: 'session_start',
      reason: persistedSession ? 'resume' : 'startup',
      previousSessionFile: persistedSession ? options.piSessionFile : undefined,
    },
  })
  try {
    const tools = result.session.getActiveToolNames().flatMap((name) => {
      const tool = result.session.getToolDefinition(name)
      return tool
        ? [{ description: tool.description, name: tool.name, parameters: tool.parameters }]
        : []
    })
    return createEstimatedContextUsage({
      messages: convertToLlm(result.session.messages),
      systemPrompt: result.session.systemPrompt,
      tools,
    })
  }
  finally {
    result.session.dispose()
  }
}

interface ConfiguredBuddySessionRuntime {
  agentDir: string
  canonicalRoot: string
  cwd: string
  sessionManager: SessionManager
  sessionStartEvent: NonNullable<CreateAgentSessionOptions['sessionStartEvent']>
}

async function createConfiguredBuddySession(
  options: CreateBuddySessionOptions,
  runtime: ConfiguredBuddySessionRuntime,
) {
  const context = options.resources.context
  const settingsManager = createBuddySettingsManager()
  const resourceLoader = await createBuddyResourceLoader({
    approvedSkillPaths: [...options.resources.approvedSkillPaths],
    agentDir: runtime.agentDir,
    boundedContextFiles: context.agentsFiles,
    bundledExtensions: [...options.bundledExtensions],
    cwd: runtime.cwd,
    projectInstructions: options.resources.projectInstructions,
    settingsManager,
  })
  const customTools = [
    createSandboxedBashTool(runtime.canonicalRoot, options.shellSandboxAssets),
    ...createSandboxedFileTools(runtime.canonicalRoot),
    ...(options.customTools ?? []),
  ]
  const result = await createAgentSession({
    agentDir: runtime.agentDir,
    customTools,
    cwd: runtime.cwd,
    model: options.model,
    modelRuntime: options.modelRuntime,
    resourceLoader,
    sessionManager: runtime.sessionManager,
    sessionStartEvent: runtime.sessionStartEvent,
    settingsManager,
    thinkingLevel: options.thinkingLevel,
    tools: customTools.map(tool => tool.name),
  })
  const previousPayloadTransform = result.session.agent.onPayload
  result.session.agent.onPayload = async (payload, model) => {
    const previousPayload = await previousPayloadTransform?.(payload, model)
    return applyBuddyOpenAiRequestOptions(
      previousPayload ?? payload,
      model,
      options.getServiceTier?.() ?? null,
    ) ?? previousPayload
  }
  return result
}

async function openExistingSession(
  sessionFile: string,
  sessionDir: string,
  cwd: string,
): Promise<SessionManager | null> {
  if (!isAbsolute(sessionFile) || !sessionFile.endsWith('.jsonl'))
    throw new BuddySessionCreationError()
  const resolvedSessionFile = resolve(sessionFile)
  if (!containsPath(sessionDir, resolvedSessionFile))
    throw new BuddySessionCreationError()
  try {
    const canonicalSessionFile = await realpath(sessionFile)
    if (!containsPath(sessionDir, canonicalSessionFile))
      throw new BuddySessionCreationError()
    const manager = SessionManager.open(canonicalSessionFile, sessionDir, cwd)
    manager.buildSessionContext()
    return manager
  }
  catch (error) {
    if (error instanceof BuddySessionCreationError)
      throw error
    if (isMissingBuddySessionFile(error))
      return null
    const storageError = toBuddySessionStorageError(error)
    if (storageError)
      throw storageError
    return null
  }
}

function validateSessionIdentity(value: string): void {
  if (!sessionIdentityPattern.test(value))
    throw new BuddySessionCreationError()
}

function applyBuddyOpenAiRequestOptions(
  payload: unknown,
  model: Model<Api>,
  serviceTier: BuddyServiceTier | null,
): unknown | undefined {
  if (!isRecord(payload))
    return undefined

  const supportsServiceTier = model.api === 'openai-responses'
    || model.api === 'openai-codex-responses'
  const requestsDetailedSummary = model.api === 'openai-codex-responses'
    && isRecord(payload.reasoning)
  if (!requestsDetailedSummary && (!serviceTier || !supportsServiceTier))
    return undefined

  const nextPayload = { ...payload }
  if (requestsDetailedSummary) {
    nextPayload.reasoning = {
      ...(payload.reasoning as Record<string, unknown>),
      summary: 'detailed',
    }
  }
  if (serviceTier && supportsServiceTier)
    nextPayload.service_tier = serviceTier
  return nextPayload
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function containsPath(root: string, path: string): boolean {
  const child = relative(root, path)
  return child === '' || (child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child))
}
