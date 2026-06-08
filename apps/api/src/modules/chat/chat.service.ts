import type {
  AiModelRef,
  ChatGenerationModelTargetSnapshot,
  ChatModelItem,
  ChatMutationResponse,
  ChatRuntimeConfig,
  ChatSessionOrigin,
  CreateChatSessionMessageRequest,
  EditAndSendChatMessageRequest,
} from '@haohaoxue/samepage-contracts'
import { randomUUID } from 'node:crypto'
import {
  AGENT_RUNTIME_CONTROL_TYPE,
  AI_MODEL_INTENT_KEY,
  ChatGenerationModelTargetSnapshotSchema,
} from '@haohaoxue/samepage-contracts'
import {
  Injectable,
  Logger,
} from '@nestjs/common'
import { AgentCommandPublisherService } from '../agent/agent-command-publisher.service'
import { AgentRuntimeCleanupTasksService } from '../agent/agent-runtime-cleanup-tasks.service'
import { AiDefaultModelsService } from '../ai/models/defaults.service'
import { AiModelResolverService } from '../ai/models/resolver.service'
import { ChatRunDispatcherService } from './chat-run-dispatcher.service'
import { ChatSessionsService } from './chat-sessions.service'

interface ChatMessageMutationParams {
  userId: string
  sessionId: string
  origin: ChatSessionOrigin
}

interface BatchDeleteChatSessionsParams {
  userId: string
  sessionIds: string[]
  origin: ChatSessionOrigin
}

interface SendChatMessageParams extends ChatMessageMutationParams, CreateChatSessionMessageRequest {}

interface EditAndSendChatMessageParams extends ChatMessageMutationParams, EditAndSendChatMessageRequest {
  messageId: string
}

interface RetryChatAssistantMessageParams extends ChatMessageMutationParams {
  messageId: string
}

interface SwitchChatActiveMessageParams extends ChatMessageMutationParams {
  messageId: string
}

interface CancelChatRunParams {
  userId: string
  runId: string
  origin: ChatSessionOrigin
}

interface UpdateChatSessionModelParams {
  userId: string
  sessionId: string
  origin: ChatSessionOrigin
  modelRef: Pick<AiModelRef, 'providerId' | 'modelId'> | null
}

interface ResolvedChatModelTarget {
  modelTargetSnapshot: ChatGenerationModelTargetSnapshot
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name)

  constructor(
    private readonly chatSessionsService: ChatSessionsService,
    private readonly modelResolverService: AiModelResolverService,
    private readonly defaultModelsService: AiDefaultModelsService,
    private readonly chatRunDispatcher: ChatRunDispatcherService,
    private readonly agentCommandPublisher: AgentCommandPublisherService,
    private readonly agentRuntimeCleanupTasks: AgentRuntimeCleanupTasksService,
  ) {}

  async getRuntimeConfig(userId: string): Promise<ChatRuntimeConfig> {
    try {
      const target = await this.modelResolverService.resolveModelTarget({
        actorUserId: userId,
        intentKey: AI_MODEL_INTENT_KEY.CHAT_ASSISTANT_DEFAULT,
      })

      return {
        enabled: true,
        ready: true,
        defaultModel: {
          providerId: target.providerId,
          scope: target.scope,
          providerKey: target.providerKey,
          providerName: target.providerName,
          modelId: target.modelId,
          modelName: target.modelName,
          modelType: 'chat',
          capabilities: target.capabilities,
          selectable: true,
          unavailableReason: null,
        },
        notReadyReason: null,
      }
    }
    catch (error) {
      return {
        enabled: false,
        ready: false,
        defaultModel: null,
        notReadyReason: error instanceof Error && error.message ? error.message : '请先配置默认模型',
      }
    }
  }

  async getModels(userId: string): Promise<ChatModelItem[]> {
    this.logger.log(`chat model list requested: user=${userId}`)
    return this.defaultModelsService.getAvailableModels(userId, AI_MODEL_INTENT_KEY.CHAT_ASSISTANT_DEFAULT)
  }

  async updateSessionModel(params: UpdateChatSessionModelParams) {
    if (params.modelRef) {
      await this.modelResolverService.resolveModelTarget({
        actorUserId: params.userId,
        intentKey: AI_MODEL_INTENT_KEY.CHAT_ASSISTANT_DEFAULT,
        requestedModelRef: params.modelRef,
      })
    }

    return this.chatSessionsService.updateSessionModel(params)
  }

  async sendMessage(params: SendChatMessageParams): Promise<ChatMutationResponse> {
    const generationId = randomUUID()
    const modelTarget = await this.resolveChatModelTarget(params)
    const result = await this.chatSessionsService.sendMessage({
      ...params,
      generationId,
      runId: generationId,
      ...modelTarget,
    })

    this.dispatchRun(generationId, params.sessionId)
    return result
  }

  async editAndSendMessage(params: EditAndSendChatMessageParams): Promise<ChatMutationResponse> {
    const generationId = randomUUID()
    const modelTarget = await this.resolveChatModelTarget(params)
    const result = await this.chatSessionsService.editAndSendMessage({
      ...params,
      generationId,
      runId: generationId,
      ...modelTarget,
    })

    this.dispatchRun(generationId, params.sessionId)
    return result
  }

  async retryAssistantMessage(params: RetryChatAssistantMessageParams): Promise<ChatMutationResponse> {
    const generationId = randomUUID()
    const modelTarget = await this.resolveChatModelTarget(params)
    const result = await this.chatSessionsService.retryAssistantMessage({
      ...params,
      generationId,
      runId: generationId,
      ...modelTarget,
    })

    this.dispatchRun(generationId, params.sessionId)
    return result
  }

  async switchActiveMessage(params: SwitchChatActiveMessageParams): Promise<ChatMutationResponse> {
    return this.chatSessionsService.switchActiveMessage(params)
  }

  async deleteSession(params: ChatMessageMutationParams): Promise<void> {
    const result = await this.chatSessionsService.deleteSession(params.userId, params.sessionId, params.origin)

    await this.cleanupDeletedChatSessions({
      activeRunIds: result.activeRunIds,
      sessionIds: [params.sessionId],
    })
  }

  async batchDeleteSessions(params: BatchDeleteChatSessionsParams): Promise<{ deletedSessionIds: string[] }> {
    const result = await this.chatSessionsService.batchDeleteSessions(params.userId, params.sessionIds, params.origin)

    await this.cleanupDeletedChatSessions({
      activeRunIds: result.activeRunIds,
      sessionIds: result.deletedSessionIds,
    })

    return {
      deletedSessionIds: result.deletedSessionIds,
    }
  }

  async cancelRun(params: CancelChatRunParams): Promise<ChatMutationResponse> {
    const result = await this.chatSessionsService.cancelRun(params)

    await this.agentCommandPublisher.publishRuntimeControl({
      controlId: randomUUID(),
      type: AGENT_RUNTIME_CONTROL_TYPE.CANCEL_RUN,
      runId: params.runId,
      reason: 'user_cancelled',
    }).catch(error => this.logger.warn(
      error instanceof Error ? error.message : `publish chat run cancel failed: run=${params.runId}`,
    ))

    return result
  }

  private async resolveChatModelTarget(params: ChatMessageMutationParams): Promise<ResolvedChatModelTarget> {
    const sessionModelRef = await this.chatSessionsService.getSessionModelSelection(params.userId, params.sessionId, params.origin)
    const target = await this.modelResolverService.resolveModelTarget({
      actorUserId: params.userId,
      intentKey: AI_MODEL_INTENT_KEY.CHAT_ASSISTANT_DEFAULT,
      requestedModelRef: sessionModelRef,
    })

    const modelTargetSnapshot = ChatGenerationModelTargetSnapshotSchema.parse({
      providerId: target.providerId,
      scope: target.scope,
      providerKey: target.providerKey,
      adapterKey: target.adapterKey,
      endpoint: target.endpoint,
      authMode: target.authMode,
      modelId: target.modelId,
      capabilities: target.capabilities,
      contextWindow: target.contextWindow,
      maxOutputTokens: target.maxOutputTokens,
    })

    return {
      modelTargetSnapshot,
    }
  }

  private async cleanupDeletedChatSessions(input: {
    activeRunIds: string[]
    sessionIds: string[]
  }): Promise<void> {
    await Promise.all(input.activeRunIds.map(runId => this.agentCommandPublisher.publishRuntimeControl({
      controlId: randomUUID(),
      type: AGENT_RUNTIME_CONTROL_TYPE.CANCEL_RUN,
      runId,
      reason: 'chat_session_deleted',
    }).catch(error => this.logger.warn(
      error instanceof Error ? error.message : `publish deleted chat run cancel failed: run=${runId}`,
    ))))

    await Promise.all(input.sessionIds.map(sessionId =>
      this.agentRuntimeCleanupTasks.enqueueChatSessionCheckpointCleanup({ sessionId }),
    ))
  }

  private dispatchRun(runId: string, sessionId: string): void {
    void this.chatRunDispatcher.dispatchRun(runId).catch(error => this.logger.error(
      error instanceof Error ? error.message : `dispatch chat run failed: session=${sessionId} run=${runId}`,
      error instanceof Error ? error.stack : undefined,
    ))
  }
}
