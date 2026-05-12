import type {
  AgentRunModelTarget,
  AiModelRef,
  ChatModelItem,
  ChatMutationResponse,
  ChatRuntimeConfig,
} from '@haohaoxue/samepage-contracts'
import { randomUUID } from 'node:crypto'
import {
  AGENT_RUN_CONTROL_TYPE,
  AgentRunModelTargetSchema,
  AI_MODEL_INTENT_KEY,
} from '@haohaoxue/samepage-contracts'
import {
  Injectable,
  Logger,
} from '@nestjs/common'
import { AgentRunCommandPublisherService } from '../agent/agent-command-publisher.service'
import { AiDefaultModelsService } from '../ai/models/defaults.service'
import { AiModelResolverService } from '../ai/models/resolver.service'
import { ChatRunDispatcherService } from './chat-run-dispatcher.service'
import { ChatSessionsService } from './chat-sessions.service'

interface ChatMessageMutationParams {
  userId: string
  sessionId: string
}

interface SendChatMessageParams extends ChatMessageMutationParams {
  content: string
}

interface EditAndSendChatMessageParams extends SendChatMessageParams {
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
}

interface UpdateChatSessionModelParams {
  userId: string
  sessionId: string
  modelRef: Pick<AiModelRef, 'providerId' | 'modelId'> | null
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name)

  constructor(
    private readonly chatSessionsService: ChatSessionsService,
    private readonly modelResolverService: AiModelResolverService,
    private readonly defaultModelsService: AiDefaultModelsService,
    private readonly chatRunDispatcher: ChatRunDispatcherService,
    private readonly agentRunCommandPublisher: AgentRunCommandPublisherService,
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
          capabilities: [],
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
    const runId = randomUUID()
    const modelTarget = await this.resolveChatModelTarget(params)
    const result = await this.chatSessionsService.sendMessage({
      ...params,
      runId,
      modelTarget,
    })

    this.dispatchRun(runId, params.sessionId)
    return result
  }

  async editAndSendMessage(params: EditAndSendChatMessageParams): Promise<ChatMutationResponse> {
    const runId = randomUUID()
    const modelTarget = await this.resolveChatModelTarget(params)
    const result = await this.chatSessionsService.editAndSendMessage({
      ...params,
      runId,
      modelTarget,
    })

    this.dispatchRun(runId, params.sessionId)
    return result
  }

  async retryAssistantMessage(params: RetryChatAssistantMessageParams): Promise<ChatMutationResponse> {
    const runId = randomUUID()
    const modelTarget = await this.resolveChatModelTarget(params)
    const result = await this.chatSessionsService.retryAssistantMessage({
      ...params,
      runId,
      modelTarget,
    })

    this.dispatchRun(runId, params.sessionId)
    return result
  }

  async switchActiveMessage(params: SwitchChatActiveMessageParams): Promise<ChatMutationResponse> {
    return this.chatSessionsService.switchActiveMessage(params)
  }

  async cancelRun(params: CancelChatRunParams): Promise<ChatMutationResponse> {
    const result = await this.chatSessionsService.cancelRun(params)

    await this.agentRunCommandPublisher.publishRunControl({
      controlId: randomUUID(),
      type: AGENT_RUN_CONTROL_TYPE.CANCEL_RUN,
      runId: params.runId,
      reason: 'user_cancelled',
    }).catch(error => this.logger.warn(
      error instanceof Error ? error.message : `publish chat run cancel failed: run=${params.runId}`,
    ))

    return result
  }

  private async resolveChatModelTarget(params: ChatMessageMutationParams): Promise<AgentRunModelTarget> {
    const sessionModelRef = await this.chatSessionsService.getSessionModelRef(params.userId, params.sessionId)
    const target = await this.modelResolverService.resolveModelTarget({
      actorUserId: params.userId,
      intentKey: AI_MODEL_INTENT_KEY.CHAT_ASSISTANT_DEFAULT,
      requestedModelRef: sessionModelRef,
    })

    return AgentRunModelTargetSchema.parse({
      providerId: target.providerId,
      scope: target.scope,
      providerKey: target.providerKey,
      adapterKey: target.adapterKey,
      endpoint: target.endpoint,
      apiKey: target.apiKey,
      authMode: target.authMode,
      modelId: target.modelId,
    })
  }

  private dispatchRun(runId: string, sessionId: string): void {
    void this.chatRunDispatcher.dispatchRun(runId).catch(error => this.logger.error(
      error instanceof Error ? error.message : `dispatch chat run failed: session=${sessionId} run=${runId}`,
      error instanceof Error ? error.stack : undefined,
    ))
  }
}
