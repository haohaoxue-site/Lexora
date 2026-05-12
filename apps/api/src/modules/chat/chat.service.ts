import type {
  AgentChatReplyContext,
  AgentRunCommand,
  AiModelRef,
  ChatModelItem,
  ChatRuntimeConfig,
} from '@haohaoxue/samepage-contracts'
import { randomUUID } from 'node:crypto'
import {
  AGENT_WORKFLOW_KEY,
  AgentChatReplyContextSchema,
  AgentRunCommandSchema,
  AI_MODEL_INTENT_KEY,
} from '@haohaoxue/samepage-contracts'
import {
  Injectable,
  Logger,
} from '@nestjs/common'
import { AgentRunCommandPublisherService } from '../agent/agent-command-publisher.service'
import { AiDefaultModelsService } from '../ai/models/defaults.service'
import { AiModelResolverService } from '../ai/models/resolver.service'
import { ChatSessionsService } from './chat-sessions.service'

interface RequestChatCompletionParams {
  userId: string
  sessionId: string
  content: string
}

interface UpdateChatSessionModelParams {
  userId: string
  sessionId: string
  modelRef: Pick<AiModelRef, 'providerId' | 'modelId'> | null
}

interface ChatReplyCommandContext {
  /** agent 执行命令 */
  command: AgentRunCommand
  /** 聊天会话 ID */
  sessionId: string
  /** assistant 消息顺序 */
  nextAssistantOrder: number
  /** 写入 user 消息后的历史版本 */
  expectedHistoryVersion: number
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name)

  constructor(
    private readonly chatSessionsService: ChatSessionsService,
    private readonly modelResolverService: AiModelResolverService,
    private readonly defaultModelsService: AiDefaultModelsService,
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

  async prepareChatReplyCommand(params: RequestChatCompletionParams): Promise<ChatReplyCommandContext> {
    const normalizedContent = params.content.trim()
    const sessionModelRef = await this.chatSessionsService.getSessionModelRef(params.userId, params.sessionId)
    const target = await this.modelResolverService.resolveModelTarget({
      actorUserId: params.userId,
      intentKey: AI_MODEL_INTENT_KEY.CHAT_ASSISTANT_DEFAULT,
      requestedModelRef: sessionModelRef,
    })
    const session = await this.chatSessionsService.prepareCompletionSession({
      userId: params.userId,
      sessionId: params.sessionId,
      content: normalizedContent,
    })
    const context: AgentChatReplyContext = AgentChatReplyContextSchema.parse({
      chatSessionId: session.sessionId,
      triggerMessageOrder: session.triggerMessageOrder,
      nextAssistantOrder: session.nextAssistantOrder,
      expectedHistoryVersion: session.expectedHistoryVersion,
    })

    this.logger.log(
      `chat reply command prepared: user=${params.userId} session=${session.sessionId} model=${target.modelId} provider=${target.providerKey} triggerOrder=${session.triggerMessageOrder} historyVersion=${session.expectedHistoryVersion}`,
    )

    return {
      sessionId: session.sessionId,
      nextAssistantOrder: session.nextAssistantOrder,
      expectedHistoryVersion: session.expectedHistoryVersion,
      command: AgentRunCommandSchema.parse({
        commandId: randomUUID(),
        runId: randomUUID(),
        workflowKey: AGENT_WORKFLOW_KEY.CHAT_REPLY,
        actorId: params.userId,
        modelTarget: {
          providerId: target.providerId,
          scope: target.scope,
          providerKey: target.providerKey,
          adapterKey: target.adapterKey,
          endpoint: target.endpoint,
          apiKey: target.apiKey,
          authMode: target.authMode,
          modelId: target.modelId,
        },
        context,
        idempotencyKey: `${AGENT_WORKFLOW_KEY.CHAT_REPLY}:${session.sessionId}:${session.nextAssistantOrder}`,
      }),
    }
  }

  async submitChatReplyCommand(params: RequestChatCompletionParams): Promise<ChatReplyCommandContext> {
    const result = await this.prepareChatReplyCommand(params)

    await this.publishChatReplyCommand({
      userId: params.userId,
      sessionId: result.sessionId,
      command: result.command,
    })

    return result
  }

  async publishChatReplyCommand(input: {
    userId: string
    sessionId: string
    command: AgentRunCommand
  }): Promise<void> {
    await this.agentRunCommandPublisher.publishRunCommand(input.command)
    this.logger.log(
      `chat reply command published: user=${input.userId} session=${input.sessionId} run=${input.command.runId}`,
    )
  }
}
