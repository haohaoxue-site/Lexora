import type { BuddyThinkingLevel } from '../../../shared/modelSelection'
import type { BuddyAgentRunner } from '../agent/BuddyAgentRunner'
import type { BuddyTurnLauncher } from '../agent/BuddyTurnLauncher'
import type { SkillService } from '../agent/SkillService'
import type {
  AttachmentService,
} from '../attachments/AttachmentService'
import type {
  BuddyStartTurnInput,
  BuddyTurnContextItem,
  BuddyTurnStart,
} from '../BuddyRuntime'
import type { ConversationLifecycleService } from '../conversations/ConversationLifecycleService'
import type {
  InteractiveModelSelection,
  RuntimeModelProvider,
} from '../providers/resolveInteractiveModelSelection'
import type { AttachmentRecord } from '../storage/attachmentRepository'
import type { ConversationHistoryRepository } from '../storage/conversationHistoryRepository'
import type { ConversationRecord } from '../storage/conversationRecord'
import type { ConversationRepository } from '../storage/conversationRepository'
import type {
  RunInputRecord,
  RunInputRepository,
} from '../storage/runInputRepository'
import type { RunRecord } from '../storage/runRecord'
import type { RunRepository } from '../storage/runRepository'
import type { SpaceRecord, SpaceRepository } from '../storage/spaceRepository'
import type {
  TurnRequestRecord,
  TurnRequestRepository,
} from '../storage/turnRequestRepository'
import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import { basename, isAbsolute, join } from 'node:path'
import {
  materializeBuddyPromptCommand,
  parseBuddyChatCommand,
} from '../../../shared/buddyChatCommands'
import { isBuddyThinkingLevel } from '../../../shared/modelSelection'
import {
  BuddySkillSelectionError,
  formatBuddySkillPrompt,
} from '../agent/SkillService'
import { resolveGrantedPath } from '../directories/resolveGrantedPath'
import { resolveInteractiveModelSelection } from '../providers/resolveInteractiveModelSelection'
import { readBoundedFile } from '../resources/BoundedFileReader'
import { BuddyServiceError } from '../rpc/runtimeRequest'
import { toPublicRun } from '../runs/publicRun'
import { requireActiveSpace } from '../spaces/requireActiveSpace'
import { persistPreparedTurn } from './persistPreparedTurn'

const MAX_CONTEXT_FILE_BYTES = 1024 * 1024
const MAX_MODEL_INPUT_BYTES = 4 * 1024 * 1024
const PROMPT_SECTION_SEPARATOR = '\n\n---\n\n'

type ChatContextItem = BuddyTurnContextItem

export interface EditChatUserMessageInput {
  attachmentIds: string[]
  content: string
  contextItems: ChatContextItem[]
  conversationId: string
  draftId: string
  modelSelection: InteractiveModelSelection | null
  requestId: string
  userMessageId: string
}

export interface RegenerateChatAssistantInput {
  conversationId: string
  requestId: string
  sourceRunId: string
}

export interface ChatTurnServiceOptions {
  attachments: Pick<
    AttachmentService,
    'materializePrompt' | 'prepareMessageAttachments'
  >
  conversationLifecycle: Pick<ConversationLifecycleService, 'isDeleting'>
  conversations: Pick<ConversationRepository, 'findById'>
    & Pick<ConversationHistoryRepository, 'listBranchMessages'>
  spaces: Pick<SpaceRepository, 'findById'>
  providers: RuntimeModelProvider
  runInputs: Pick<RunInputRepository, 'findByRunId'>
  runner: Pick<BuddyAgentRunner, 'cancel'>
  runs: Pick<RunRepository, 'findById'>
  skills: Pick<SkillService, 'materializeForSpace'>
  turnLauncher: Pick<BuddyTurnLauncher, 'launch'>
  turnRequests: TurnRequestRepository
}

interface TurnReplay {
  request: TurnRequestRecord
  run: RunRecord
}

interface TurnModelSelection extends Omit<InteractiveModelSelection, 'reasoning'> {
  contextWindow: number | null
  maxTokens: number | null
  reasoning: string | null
}

interface PrepareTurnMaterializationInput {
  attachmentIds: readonly string[]
  content: string
  contextItems: readonly ChatContextItem[]
  contextSuffix?: string
  conversationId: string
  draftId: string
  space: SpaceRecord | null
  replay: TurnReplay | null
  requestedModel: InteractiveModelSelection | null
}

export class ChatTurnService {
  readonly #options: ChatTurnServiceOptions

  constructor(options: ChatTurnServiceOptions) {
    this.#options = options
  }

  async start(input: BuddyStartTurnInput): Promise<BuddyTurnStart> {
    const promptCommand = validateTurnCommand(input.content, input.contextItems)
    const replay = this.#findReplay(
      input.requestId,
      createStartTurnFingerprint(input),
    )
    if (replay && !isInterruptedRun(replay.run))
      return this.#toTurnStart(replay.request, replay.run)
    if (input.conversationId && this.#options.conversationLifecycle.isDeleting(input.conversationId))
      throw new BuddyServiceError('VALIDATION_FAILED')

    const space = input.spaceId
      ? requireActiveSpace(this.#options.spaces.findById(input.spaceId))
      : null
    const conversationId = replay?.request.conversationId
      ?? input.conversationId
      ?? randomUUID()
    const existingConversation = this.#options.conversations.findById(conversationId)
    if (
      existingConversation
      && (
        existingConversation.spaceId !== (space?.id ?? null)
        || existingConversation.executionProfile !== input.executionProfile
      )
    ) {
      throw new BuddyServiceError('VALIDATION_FAILED')
    }
    const branchId = replay?.request.branchId
      ?? input.branchId
      ?? existingConversation?.activeBranchId
      ?? randomUUID()
    if (existingConversation && existingConversation.activeBranchId !== branchId)
      throw new BuddyServiceError('VALIDATION_FAILED')
    if (this.#options.conversationLifecycle.isDeleting(conversationId))
      throw new BuddyServiceError('VALIDATION_FAILED')

    const {
      attachmentPrompt,
      prompt,
      replayInput,
      selection,
      thinkingLevel,
    } = await this.#prepareTurnMaterialization({
      attachmentIds: input.attachmentIds,
      content: promptCommand ? '' : input.content,
      contextItems: input.contextItems,
      contextSuffix: promptCommand ? materializeBuddyPromptCommand(promptCommand) : '',
      conversationId,
      draftId: input.draftId,
      space,
      replay,
      requestedModel: input.modelSelection,
    })
    const runId = randomUUID()
    const userMessageId = randomUUID()
    const stagedAttachments = replay
      ? null
      : await this.#options.attachments.prepareMessageAttachments({
          attachmentIds: input.attachmentIds,
          conversationId,
          draftId: input.draftId,
          messageId: userMessageId,
        })
    const persistedAttachmentIds = replayInput?.attachmentIds
      ?? stagedAttachments?.bindings.map(binding => binding.id)
      ?? []
    const prepared = await persistPreparedTurn(stagedAttachments, () => (
      replay
        ? this.#options.turnRequests.retryInterrupted({
            createdAt: new Date().toISOString(),
            requestId: input.requestId,
            runId,
          })
        : this.#options.turnRequests.prepare({
            attachmentBindings: stagedAttachments?.bindings ?? [],
            branchId,
            conversationId,
            createdAt: new Date().toISOString(),
            executionProfile: input.executionProfile,
            model: selection.modelId,
            modelParameters: toModelParameters(selection),
            spaceId: space?.id ?? null,
            provider: selection.providerId,
            requestFingerprint: createStartTurnFingerprint(input),
            requestId: input.requestId,
            runInput: {
              attachmentIds: persistedAttachmentIds,
              contextItems: input.contextItems,
              prompt,
              reasoning: thinkingLevel ?? null,
              serviceTier: replayInput ? replayInput.serviceTier : selection.serviceTier,
            },
            runId,
            title: createConversationTitle(input.content, attachmentPrompt.records),
            userMessageContent: {
              attachmentIds: persistedAttachmentIds,
              contextItems: input.contextItems,
              text: input.content,
            },
            userMessageId,
          })
    ))
    return this.#launchPreparedTurn(prepared)
  }

  async editUserMessage(input: EditChatUserMessageInput) {
    const replay = this.#findReplay(
      input.requestId,
      createEditUserMessageFingerprint(input),
      input.conversationId,
    )
    if (replay && !isInterruptedRun(replay.run))
      return this.#toTurnStart(replay.request, replay.run)

    const conversation = this.#requireActiveConversation(input.conversationId)
    const parentBranchId = requireValue(conversation.activeBranchId)
    const history = this.#options.conversations.listBranchMessages(
      conversation.id,
      parentBranchId,
    )
    const sourceIndex = history.findIndex(message => message.id === input.userMessageId)
    const sourceMessage = sourceIndex >= 0 ? history[sourceIndex] : null
    if (sourceMessage?.role !== 'user')
      throw new BuddyServiceError('VALIDATION_FAILED')
    const forkedFromMessageId = sourceIndex > 0 ? history[sourceIndex - 1]?.id ?? null : null
    const space = this.#resolveConversationSpace(conversation)
    const {
      prompt,
      replayInput,
      selection,
      thinkingLevel,
    } = await this.#prepareTurnMaterialization({
      attachmentIds: input.attachmentIds,
      content: input.content,
      contextItems: input.contextItems,
      conversationId: conversation.id,
      draftId: input.draftId,
      space,
      replay,
      requestedModel: input.modelSelection,
    })
    const runId = randomUUID()
    const userMessageId = randomUUID()
    const stagedAttachments = replay
      ? null
      : await this.#options.attachments.prepareMessageAttachments({
          attachmentIds: input.attachmentIds,
          conversationId: conversation.id,
          draftId: input.draftId,
          messageId: userMessageId,
        })
    const persistedAttachmentIds = replayInput?.attachmentIds
      ?? stagedAttachments?.bindings.map(binding => binding.id)
      ?? []
    const prepared = await persistPreparedTurn(stagedAttachments, () => (
      replay
        ? this.#options.turnRequests.retryInterrupted({
            createdAt: new Date().toISOString(),
            requestId: input.requestId,
            runId,
          })
        : this.#options.turnRequests.edit({
            attachmentBindings: stagedAttachments?.bindings ?? [],
            branchId: randomUUID(),
            conversationId: conversation.id,
            createdAt: new Date().toISOString(),
            executionProfile: conversation.executionProfile,
            forkedFromMessageId,
            model: selection.modelId,
            modelParameters: toModelParameters(selection),
            parentBranchId,
            spaceId: space?.id ?? null,
            provider: selection.providerId,
            requestFingerprint: createEditUserMessageFingerprint(input),
            requestId: input.requestId,
            runId,
            runInput: {
              attachmentIds: persistedAttachmentIds,
              contextItems: input.contextItems,
              prompt,
              reasoning: thinkingLevel ?? null,
              serviceTier: replayInput ? replayInput.serviceTier : selection.serviceTier,
            },
            sourceUserMessageId: input.userMessageId,
            title: null,
            userMessageContent: {
              attachmentIds: persistedAttachmentIds,
              contextItems: input.contextItems,
              text: input.content,
            },
            userMessageId,
          })
    ))
    return this.#launchPreparedTurn(prepared)
  }

  async regenerateAssistant(input: RegenerateChatAssistantInput) {
    const replay = this.#findReplay(
      input.requestId,
      createRegenerationFingerprint(input),
      input.conversationId,
    )
    if (replay && !isInterruptedRun(replay.run))
      return this.#toTurnStart(replay.request, replay.run)

    const conversation = this.#requireActiveConversation(input.conversationId)
    const parentBranchId = requireValue(conversation.activeBranchId)
    let sourceRun: RunRecord | null = null
    if (!replay) {
      sourceRun = this.#options.runs.findById(input.sourceRunId)
      const history = this.#options.conversations.listBranchMessages(
        conversation.id,
        parentBranchId,
      )
      const triggerIndex = history.findIndex(
        message => message.id === sourceRun?.triggeringMessageId,
      )
      const assistantIndex = history.findIndex(
        message => message.role === 'assistant' && message.runId === sourceRun?.id,
      )
      const visibleOnActiveBranch = sourceRun?.branchId === parentBranchId
        || (triggerIndex >= 0 && assistantIndex > triggerIndex)
      if (
        !sourceRun
        || sourceRun.conversationId !== conversation.id
        || triggerIndex < 0
        || !visibleOnActiveBranch
      ) {
        throw new BuddyServiceError('VALIDATION_FAILED')
      }
    }

    const storedInput = this.#requireRunInput(requireValue(replay?.run ?? sourceRun).id)
    assertPromptSize(storedInput.prompt)
    const runId = randomUUID()
    const prepared = replay
      ? this.#options.turnRequests.retryInterrupted({
          createdAt: new Date().toISOString(),
          requestId: input.requestId,
          runId,
        })
      : this.#options.turnRequests.regenerate({
          branchId: randomUUID(),
          conversationId: conversation.id,
          createdAt: new Date().toISOString(),
          executionProfile: conversation.executionProfile,
          forkedFromMessageId: requireValue(sourceRun).triggeringMessageId,
          parentBranchId,
          requestFingerprint: createRegenerationFingerprint(input),
          requestId: input.requestId,
          runId,
          sourceRunId: requireValue(sourceRun).id,
        })
    return this.#launchPreparedTurn(prepared)
  }

  async cancel(runId: string) {
    await this.#options.runner.cancel(runId)
    return this.#publicRun(this.#requireRun(runId))
  }

  #findReplay(
    requestId: string,
    requestFingerprint: string,
    conversationId?: string,
  ): TurnReplay | null {
    const request = this.#options.turnRequests.findByRequestId(requestId)
    if (!request)
      return null
    if (
      request.requestFingerprint !== requestFingerprint
      || (conversationId !== undefined && request.conversationId !== conversationId)
    ) {
      throw new BuddyServiceError('VALIDATION_FAILED')
    }
    return { request, run: this.#requireRun(request.runId) }
  }

  async #launchPreparedTurn(prepared: TurnRequestRecord) {
    if (!prepared.created)
      return this.#toTurnStart(prepared, this.#requireRun(prepared.runId))
    const turn = await this.#options.turnLauncher.launch(prepared.runId)
    void turn.completion
    return this.#toTurnStart(prepared, this.#requireRun(turn.runId))
  }

  #publicRun(run: RunRecord) {
    return toPublicRun(run, this.#options.runInputs.findByRunId(run.id)?.reasoning ?? null)
  }

  #requireActiveConversation(conversationId: string): ConversationRecord {
    const conversation = requireValue(this.#options.conversations.findById(conversationId))
    if (this.#options.conversationLifecycle.isDeleting(conversation.id))
      throw new BuddyServiceError('VALIDATION_FAILED')
    return conversation
  }

  #requireRun(runId: string): RunRecord {
    return requireValue(this.#options.runs.findById(runId))
  }

  #requireRunInput(runId: string): RunInputRecord {
    return requireValue(this.#options.runInputs.findByRunId(runId))
  }

  async #prepareTurnMaterialization(input: PrepareTurnMaterializationInput) {
    const replayInput = input.replay ? this.#requireRunInput(input.replay.run.id) : null
    const attachmentPrompt = await this.#options.attachments.materializePrompt(
      replayInput?.attachmentIds ?? input.attachmentIds,
      replayInput ? '' : input.content,
      input.conversationId,
      replayInput ? null : input.draftId,
    )
    const context = replayInput
      ? ''
      : [
          await materializeContextItems(
            input.contextItems,
            input.space,
            this.#options.skills,
          ),
          input.contextSuffix ?? '',
        ].filter(Boolean).join(PROMPT_SECTION_SEPARATOR)
    const prompt = replayInput?.prompt
      ?? [attachmentPrompt.prompt, context].filter(Boolean).join(PROMPT_SECTION_SEPARATOR)
    assertPromptSize(prompt)
    const selection = await this.#resolveSelection(
      input.replay?.run ?? null,
      replayInput,
      input.requestedModel,
    )
    const thinkingLevel = normalizeThinkingLevel(
      replayInput ? replayInput.reasoning : selection.reasoning,
    )
    return {
      attachmentPrompt,
      prompt,
      replayInput,
      selection,
      thinkingLevel,
    }
  }

  #resolveConversationSpace(conversation: ConversationRecord): SpaceRecord | null {
    return conversation.spaceId
      ? requireActiveSpace(this.#options.spaces.findById(conversation.spaceId))
      : null
  }

  async #resolveSelection(
    replayRun: RunRecord | null,
    replayInput: RunInputRecord | null,
    requested: InteractiveModelSelection | null,
  ): Promise<TurnModelSelection> {
    if (replayRun) {
      return {
        contextWindow: replayRun.contextWindow,
        maxTokens: replayRun.maxTokens,
        modelId: replayRun.model,
        providerId: replayRun.provider,
        reasoning: replayInput?.reasoning ?? null,
        serviceTier: replayInput?.serviceTier ?? null,
      }
    }
    return resolveInteractiveModelSelection(this.#options.providers, requested)
  }

  #toTurnStart(request: TurnRequestRecord, run: RunRecord): BuddyTurnStart {
    return {
      branchId: request.branchId,
      conversationId: request.conversationId,
      run: this.#publicRun(run),
      runId: request.runId,
    }
  }
}

function createStartTurnFingerprint(input: BuddyStartTurnInput): string {
  return fingerprint({ ...input, requestId: undefined })
}

function createEditUserMessageFingerprint(input: EditChatUserMessageInput): string {
  return fingerprint({
    ...input,
    operation: 'edit-user-message',
    requestId: undefined,
  })
}

function createRegenerationFingerprint(input: RegenerateChatAssistantInput): string {
  return fingerprint({
    conversationId: input.conversationId,
    operation: 'regenerate-assistant',
    sourceRunId: input.sourceRunId,
  })
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(stableSerialize(value)).digest('hex')
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map(stableSerialize).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

async function materializeContextItems(
  items: readonly ChatContextItem[],
  space: SpaceRecord | null,
  skills: Pick<SkillService, 'materializeForSpace'>,
): Promise<string> {
  let selectedSkills: Awaited<ReturnType<SkillService['materializeForSpace']>>
  try {
    selectedSkills = await skills.materializeForSpace(
      space?.id ?? null,
      items.filter(item => item.kind === 'skill').map(item => item.value),
    )
  }
  catch (error) {
    if (error instanceof BuddySkillSelectionError)
      throw new BuddyServiceError('VALIDATION_FAILED')
    throw error
  }
  const skillsByName = new Map(selectedSkills.map(skill => [skill.name, skill]))
  const sections: string[] = []
  for (const item of items) {
    if (item.kind === 'skill') {
      const skill = skillsByName.get(item.value)
      if (!skill)
        throw new BuddyServiceError('VALIDATION_FAILED')
      sections.push(formatBuddySkillPrompt(skill))
      continue
    }
    if (item.kind === 'slashCommand')
      continue
    if (!space)
      throw new BuddyServiceError('DIRECTORY_NOT_AUTHORIZED')
    const primaryDirectory = space.primaryDirectory
    const directories = [
      ...(primaryDirectory ? [primaryDirectory] : []),
      ...space.additionalDirectories,
    ]
    const requestedPath = isAbsolute(item.value)
      ? item.value
      : primaryDirectory ? join(primaryDirectory.canonicalRoot, item.value) : null
    if (!requestedPath)
      throw new BuddyServiceError('DIRECTORY_NOT_AUTHORIZED')
    const resolution = await resolveGrantedPath(directories.map(directory => ({
      canonicalRoot: directory.canonicalRoot,
      grantId: directory.id,
      root: directory.root,
    })), requestedPath, 'existing')
    const directory = directories.find(item => item.id === resolution.grantId)
    if (!directory)
      throw new BuddyServiceError('DIRECTORY_NOT_AUTHORIZED')
    const content = await readBoundedFile(directory.canonicalRoot, resolution.canonicalPath)
    if (content.byteLength > MAX_CONTEXT_FILE_BYTES)
      throw new BuddyServiceError('VALIDATION_FAILED')
    sections.push(`上下文文件：${item.value}\n\n${content.toString('utf8')}`)
  }
  return sections.join(PROMPT_SECTION_SEPARATOR)
}

function validateTurnCommand(content: string, items: readonly ChatContextItem[]) {
  const command = parseBuddyChatCommand(content)
  const commandItems = items.filter(item => item.kind === 'slashCommand')
  if (command?.kind === 'action')
    throw new BuddyServiceError('VALIDATION_FAILED')
  if (commandItems.length === 0)
    return command?.kind === 'prompt' ? command : null
  if (
    commandItems.length !== 1
    || !command
    || command.kind !== 'prompt'
    || commandItems[0]!.value !== `/${command.name}`
  ) {
    throw new BuddyServiceError('VALIDATION_FAILED')
  }
  return command
}

function normalizeThinkingLevel(value: string | null | undefined): BuddyThinkingLevel | undefined {
  if (!value)
    return undefined
  if (!isBuddyThinkingLevel(value))
    throw new BuddyServiceError('VALIDATION_FAILED')
  return value
}

function assertPromptSize(prompt: string): void {
  if (Buffer.byteLength(prompt) > MAX_MODEL_INPUT_BYTES)
    throw new BuddyServiceError('VALIDATION_FAILED')
}

function toModelParameters(selection: TurnModelSelection) {
  return selection.contextWindow !== null && selection.maxTokens !== null
    ? { contextWindow: selection.contextWindow, maxTokens: selection.maxTokens }
    : undefined
}

function isInterruptedRun(run: RunRecord): boolean {
  return run.status === 'failed' && run.errorCode === 'RUNTIME_RESTARTED'
}

function createConversationTitle(
  content: string,
  attachments: readonly AttachmentRecord[],
): string {
  return content.trim().replaceAll(/\s+/g, ' ').slice(0, 80)
    || attachments.map(attachment => basename(attachment.name)).join(', ').slice(0, 80)
    || 'New conversation'
}

function requireValue<T>(value: T | null): T {
  if (value === null)
    throw new BuddyServiceError('VALIDATION_FAILED')
  return value
}
