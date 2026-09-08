import type {
  BuddyPromptDirective,
  BuddyUserContentV1,
  BuddyUserMessageResourceSnapshot,
} from '../../../shared/conversation/buddyUserContent'
import type { BuddyComposerDraftScope } from '../../../shared/conversation/composerDraft'
import type { BuddyThinkingLevel } from '../../../shared/conversation/modelSelection'
import type { BuddyAgentRunner } from '../agent/BuddyAgentRunner'
import type { BuddyTurnLauncher } from '../agent/BuddyTurnLauncher'
import type { SkillService } from '../agent/SkillService'
import type {
  AttachmentService,
} from '../attachments/AttachmentService'
import type { ComposerResourceService } from '../attachments/ComposerResourceService'
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
import type { ComposerDraftRepository } from '../storage/composerDraftRepository'
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
import { readBoundedFile } from '../../../platform/filesystem/boundedFile'
import {
  materializeBuddyPromptCommand,
  parseBuddyChatCommand,
} from '../../../shared/conversation/buddyChatCommands'
import {
  buddyUserContentToText,
  buddyUserMessageContentV1Schema,
} from '../../../shared/conversation/buddyUserContent'
import { isBuddyThinkingLevel } from '../../../shared/conversation/modelSelection'
import {
  BuddySkillSelectionError,
  formatBuddySkillPrompt,
} from '../agent/SkillService'
import { resolveGrantedPath } from '../directories/resolveGrantedPath'
import { resolveInteractiveModelSelection } from '../providers/resolveInteractiveModelSelection'
import { BuddyServiceError } from '../rpc/runtimeRequest'
import { toPublicRun } from '../runs/publicRun'
import { requireActiveSpace } from '../spaces/requireActiveSpace'
import { persistPreparedTurn } from './persistPreparedTurn'

const MAX_CONTEXT_FILE_BYTES = 1024 * 1024
const MAX_MODEL_INPUT_BYTES = 4 * 1024 * 1024
const PROMPT_SECTION_SEPARATOR = '\n\n---\n\n'

type ChatContextItem = BuddyTurnContextItem

export interface EditChatUserMessageInput {
  conversationId: string
  draftId: string
  expectedRevision: number
  requestId: string
  userMessageId: string
}

export interface RegenerateChatAssistantInput {
  conversationId: string
  requestId: string
  sourceRunId: string
}

export interface ChatTurnServiceOptions {
  composerResources?: Pick<ComposerResourceService, 'resolveInput'>
  attachments: Pick<
    AttachmentService,
    'prepareMessageAttachments' | 'preparePrompt'
  >
  conversationLifecycle: Pick<ConversationLifecycleService, 'isDeleting'>
  conversations: Pick<ConversationRepository, 'findById'>
    & Pick<ConversationHistoryRepository, 'listBranchMessages'>
  drafts: Pick<ComposerDraftRepository, 'findById'>
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
  input: Array<'text' | 'image'>
  maxTokens: number | null
  reasoning: string | null
}

interface PrepareTurnMaterializationInput {
  composer?: { content: BuddyUserContentV1, resourceIds: readonly string[] }
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
    const replay = this.#findReplay(
      input.requestId,
      createStartTurnFingerprint(input),
    )
    if (replay)
      return this.#toTurnStart(replay.request, replay.run)
    const draft = this.#options.drafts.findById(input.draftId)
    if (!draft || draft.revision !== input.expectedRevision)
      throw new BuddyServiceError('DRAFT_CONFLICT')
    const content = buddyUserContentToText(draft.content).trim()
    const directiveItems = draft.content.body.flatMap(paragraph => paragraph.content.flatMap(
      node => node.type === 'prompt_directive' && node.directive === 'slash_command'
        ? [{ kind: 'slashCommand' as const, value: node.value }]
        : [],
    ))
    const promptCommand = validateTurnCommand(content, directiveItems)
    const scope = resolveDraftScope(draft.scope)
    if (scope.conversationId && this.#options.conversationLifecycle.isDeleting(scope.conversationId))
      throw new BuddyServiceError('VALIDATION_FAILED')
    const existingConversation = scope.conversationId
      ? this.#options.conversations.findById(scope.conversationId)
      : null
    if (scope.conversationId && !existingConversation)
      throw new BuddyServiceError('VALIDATION_FAILED')
    const spaceId = scope.spaceId ?? existingConversation?.spaceId ?? null
    const space = spaceId
      ? requireActiveSpace(this.#options.spaces.findById(spaceId))
      : null
    const conversationId = scope.conversationId ?? randomUUID()
    if (
      existingConversation
      && (
        existingConversation.spaceId !== (space?.id ?? null)
        || existingConversation.approvalPolicy !== draft.executionConfig.approvalPolicy
        || existingConversation.executionProfile !== draft.executionConfig.executionProfile
      )
    ) {
      throw new BuddyServiceError('VALIDATION_FAILED')
    }
    const branchId = scope.branchId
      ?? existingConversation?.activeBranchId
      ?? randomUUID()
    if (existingConversation && existingConversation.activeBranchId !== branchId)
      throw new BuddyServiceError('VALIDATION_FAILED')
    if (this.#options.conversationLifecycle.isDeleting(conversationId))
      throw new BuddyServiceError('VALIDATION_FAILED')

    const resourceInputs = await requireValue(this.#options.composerResources ?? null)
      .resolveInput(input.draftId, draft.content, {
        branchId: existingConversation ? branchId : null,
        conversationId: existingConversation?.id ?? null,
        spaceId: space?.id ?? null,
      })
    if (!content && resourceInputs.length === 0)
      throw new BuddyServiceError('VALIDATION_FAILED')
    const attachmentIds = resourceInputs.map(resource => resource.attachmentId)

    const {
      attachmentPrompt,
      prompt,
      selection,
      thinkingLevel,
    } = await this.#prepareTurnMaterialization({
      attachmentIds,
      composer: {
        content: draft.content,
        resourceIds: resourceInputs.map(resource => resource.resourceId),
      },
      content: '',
      contextItems: [],
      contextSuffix: promptCommand && !directiveItems.length
        ? materializeBuddyPromptCommand({ ...promptCommand, arguments: '' })
        : '',
      conversationId,
      draftId: input.draftId,
      space,
      replay: null,
      requestedModel: draft.modelSelection,
    })
    const runId = randomUUID()
    const userMessageId = randomUUID()
    const resourceNames = new Map(resourceInputs.map((resource, index) => [resource.resourceId, attachmentPrompt.records[index]!.name]))
    const messageText = buddyUserContentToText(
      draft.content,
      id => `@${resourceNames.get(id)!}`,
    ).trim()
    const stagedAttachments = await this.#options.attachments.prepareMessageAttachments({
      attachmentIds,
      conversationId,
      draftId: input.draftId,
      messageId: userMessageId,
    })
    const persistedAttachmentIds = stagedAttachments.bindings.map(binding => binding.id)
    const prepared = await persistPreparedTurn(stagedAttachments, () => (
      this.#options.turnRequests.prepare({
        approvalPolicy: draft.executionConfig.approvalPolicy,
        attachmentBindings: stagedAttachments.bindings,
        branchId,
        conversationId,
        createdAt: new Date().toISOString(),
        draft: {
          draftId: input.draftId,
          expectedRevision: input.expectedRevision,
        },
        executionProfile: draft.executionConfig.executionProfile,
        model: selection.modelId,
        modelParameters: toModelParameters(selection),
        spaceId: space?.id ?? null,
        provider: selection.providerId,
        requestFingerprint: createStartTurnFingerprint(input),
        requestId: input.requestId,
        runInput: {
          attachmentIds: persistedAttachmentIds,
          contextItems: [],
          prompt,
          reasoning: thinkingLevel ?? null,
          serviceTier: selection.serviceTier,
        },
        runId,
        title: createConversationTitle(messageText, attachmentPrompt.records),
        userMessageContent: createPersistedUserMessageContent(
          draft.content,
          resourceInputs.map((resource, index) => ({
            attachmentId: persistedAttachmentIds[index]!,
            resourceId: resource.resourceId,
          })),
        ),
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
    const draft = replay ? null : this.#options.drafts.findById(input.draftId)
    if (!replay && (!draft || draft.revision !== input.expectedRevision))
      throw new BuddyServiceError('DRAFT_CONFLICT')
    if (draft && (
      draft.scope.kind !== 'message_edit'
      || draft.scope.conversationId !== conversation.id
      || draft.scope.branchId !== parentBranchId
      || draft.scope.userMessageId !== input.userMessageId
      || draft!.executionConfig.approvalPolicy !== conversation.approvalPolicy
      || draft!.executionConfig.executionProfile !== conversation.executionProfile
    )) {
      throw new BuddyServiceError('VALIDATION_FAILED')
    }
    const forkedFromMessageId = sourceIndex > 0 ? history[sourceIndex - 1]?.id ?? null : null
    const space = this.#resolveConversationSpace(conversation)
    const content = draft ? buddyUserContentToText(draft.content).trim() : ''
    const resourceInputs = draft
      ? await requireValue(this.#options.composerResources ?? null).resolveInput(
          draft.draftId,
          draft.content,
          { branchId: parentBranchId, conversationId: conversation.id, spaceId: space?.id ?? null },
        )
      : []
    if (!replay && !content && resourceInputs.length === 0)
      throw new BuddyServiceError('VALIDATION_FAILED')
    if (draft) {
      const directiveItems = draft.content.body.flatMap(paragraph => paragraph.content.flatMap(
        node => node.type === 'prompt_directive' && node.directive === 'slash_command'
          ? [{ kind: 'slashCommand' as const, value: node.value }]
          : [],
      ))
      validateTurnCommand(content, directiveItems)
    }
    const attachmentIds = resourceInputs.map(resource => resource.attachmentId)
    const {
      prompt,
      replayInput,
      selection,
      thinkingLevel,
    } = await this.#prepareTurnMaterialization({
      attachmentIds,
      composer: draft
        ? { content: draft.content, resourceIds: resourceInputs.map(resource => resource.resourceId) }
        : undefined,
      content: '',
      contextItems: [],
      conversationId: conversation.id,
      draftId: input.draftId,
      space,
      replay,
      requestedModel: draft?.modelSelection ?? null,
    })
    const runId = randomUUID()
    const userMessageId = randomUUID()
    const stagedAttachments = replay
      ? null
      : await this.#options.attachments.prepareMessageAttachments({
          attachmentIds,
          conversationId: conversation.id,
          draftId: input.draftId,
          messageId: userMessageId,
        })
    const persistedAttachmentIds = replayInput?.attachmentIds
      ?? stagedAttachments?.bindings.map(binding => binding.id)
      ?? []
    const persistedResourceSnapshots = resourceInputs.map((resource, index) => ({
      attachmentId: persistedAttachmentIds[index]!,
      resourceId: resource.resourceId,
    }))
    const prepared = await persistPreparedTurn(stagedAttachments, () => (
      replay
        ? this.#options.turnRequests.retryInterrupted({
            createdAt: new Date().toISOString(),
            requestId: input.requestId,
            runId,
          })
        : this.#options.turnRequests.edit({
            approvalPolicy: conversation.approvalPolicy,
            attachmentBindings: stagedAttachments?.bindings ?? [],
            branchId: randomUUID(),
            conversationId: conversation.id,
            createdAt: new Date().toISOString(),
            draft: { draftId: input.draftId, expectedRevision: input.expectedRevision },
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
              contextItems: [],
              prompt,
              reasoning: thinkingLevel ?? null,
              serviceTier: replayInput ? replayInput.serviceTier : selection.serviceTier,
            },
            sourceUserMessageId: input.userMessageId,
            title: null,
            userMessageContent: createPersistedUserMessageContent(
              draft!.content,
              persistedResourceSnapshots,
            ),
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
          approvalPolicy: conversation.approvalPolicy,
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
    const composer = !replayInput && input.composer
      ? {
          ...input.composer,
          resolveDirective: await materializeComposerDirectives(input.composer.content, input.space, this.#options.skills),
        }
      : undefined
    const attachmentPrompt = await this.#options.attachments.preparePrompt(
      replayInput?.attachmentIds ?? input.attachmentIds,
      replayInput ? '' : input.content,
      input.conversationId,
      replayInput ? null : input.draftId,
      composer,
    )
    const context = replayInput
      ? ''
      : [
          composer
            ? ''
            : await materializeContextItems(
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
    if (attachmentPrompt.imageReferences.length > 0 && !selection.input.includes('image'))
      throw new BuddyServiceError('MODEL_INPUT_UNSUPPORTED')
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
      const model = await this.#options.providers.executionModels.resolveAvailable({
        contextWindow: replayRun.contextWindow,
        maxTokens: replayRun.maxTokens,
        modelId: replayRun.model,
        providerId: replayRun.provider,
      })
      return {
        contextWindow: replayRun.contextWindow,
        input: model.input,
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
      draftReceipt: request.draftReceipt,
      run: this.#publicRun(run),
      runId: request.runId,
    }
  }
}

async function materializeComposerDirectives(
  content: BuddyUserContentV1,
  space: SpaceRecord | null,
  skills: Pick<SkillService, 'materializeForSpace'>,
): Promise<(directive: BuddyPromptDirective) => string> {
  const directives = content.body.flatMap(paragraph => paragraph.content.filter(node => node.type === 'prompt_directive'))
  const names = [...new Set(directives.flatMap(node => node.directive === 'skill' ? [node.value] : []))]
  const selected = new Map<string, string>()
  if (names.length) {
    try {
      for (const skill of await skills.materializeForSpace(space?.id ?? null, names))
        selected.set(skill.name, formatBuddySkillPrompt(skill))
    }
    catch (error) {
      if (error instanceof BuddySkillSelectionError)
        throw new BuddyServiceError('VALIDATION_FAILED')
      throw error
    }
  }
  return (directive) => {
    if (directive.directive === 'skill') {
      const value = selected.get(directive.value)
      if (value === undefined)
        throw new BuddyServiceError('VALIDATION_FAILED')
      return value
    }
    const command = parseBuddyChatCommand(directive.value)
    if (!command || command.kind !== 'prompt' || directive.commandMode !== 'prompt' || command.arguments)
      throw new BuddyServiceError('VALIDATION_FAILED')
    return materializeBuddyPromptCommand(command)
  }
}

function createStartTurnFingerprint(input: BuddyStartTurnInput): string {
  return fingerprint({ ...input, requestId: undefined })
}

function resolveDraftScope(scope: BuddyComposerDraftScope): {
  branchId: string | null
  conversationId: string | null
  spaceId: string | null
} {
  switch (scope.kind) {
    case 'global': return { branchId: null, conversationId: null, spaceId: null }
    case 'space': return { branchId: null, conversationId: null, spaceId: scope.spaceId }
    case 'conversation_branch': return {
      branchId: scope.branchId,
      conversationId: scope.conversationId,
      spaceId: null,
    }
    case 'message_edit': return {
      branchId: scope.branchId,
      conversationId: scope.conversationId,
      spaceId: null,
    }
  }
}

function createEditUserMessageFingerprint(input: EditChatUserMessageInput): string {
  return fingerprint({
    ...input,
    operation: 'edit-user-message',
    requestId: undefined,
  })
}

function createPersistedUserMessageContent(
  userContent: BuddyUserContentV1,
  resourceSnapshots: readonly BuddyUserMessageResourceSnapshot[],
) {
  return buddyUserMessageContentV1Schema.parse({
    resourceSnapshots: [...resourceSnapshots],
    userContent,
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
      kind: 'workspace' as const,
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
