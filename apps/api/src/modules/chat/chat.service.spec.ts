import { AI_MODEL_INTENT_KEY } from '@haohaoxue/samepage-contracts'
import { describe, expect, it, vi } from 'vitest'
import { AgentRunCommandPublisherService } from '../agent/agent-command-publisher.service'
import { AiDefaultModelsService } from '../ai/models/defaults.service'
import { AiModelResolverService } from '../ai/models/resolver.service'
import { ChatSessionsService } from './chat-sessions.service'
import { ChatService } from './chat.service'

function createChatServiceFixture() {
  const chatSessionsService = {
    getSessionModelRef: vi.fn().mockResolvedValue({
      providerId: 'session-provider',
      modelId: 'qwen-plus',
    }),
    prepareCompletionSession: vi.fn().mockResolvedValue({
      sessionId: 'session-1',
      messages: [],
      triggerMessageOrder: 0,
      nextAssistantOrder: 1,
      expectedHistoryVersion: 1,
    }),
    updateSessionModel: vi.fn().mockResolvedValue({
      id: 'session-1',
      title: '新对话',
      modelRef: {
        providerId: 'session-provider',
        modelId: 'qwen-plus',
      },
      messages: [],
      createdAt: '2026-05-07T00:00:00.000Z',
      updatedAt: '2026-05-07T00:00:00.000Z',
    }),
  }
  const modelResolverService = {
    resolveModelTarget: vi.fn().mockResolvedValue({
      providerId: 'session-provider',
      scope: 'user',
      providerKey: 'openai-compatible',
      providerName: '个人服务商',
      adapterKey: 'openai-chat-completions',
      endpoint: 'https://example.com/v1',
      apiKey: 'sk-test',
      authMode: 'bearer',
      modelId: 'qwen-plus',
      modelName: 'Qwen Plus',
    }),
  }
  const defaultModelsService = {
    getAvailableModels: vi.fn(),
  }
  const agentRunCommandPublisher = {
    publishRunCommand: vi.fn(),
  }
  const service = new ChatService(
    chatSessionsService as unknown as ChatSessionsService,
    modelResolverService as unknown as AiModelResolverService,
    defaultModelsService as unknown as AiDefaultModelsService,
    agentRunCommandPublisher as unknown as AgentRunCommandPublisherService,
  )

  return {
    agentRunCommandPublisher,
    chatSessionsService,
    modelResolverService,
    service,
  }
}

describe('chatService', () => {
  it('发送聊天消息时使用数据库中的会话模型引用', async () => {
    const {
      chatSessionsService,
      modelResolverService,
      service,
    } = createChatServiceFixture()

    const result = await service.prepareChatReplyCommand({
      userId: 'user-1',
      sessionId: 'session-1',
      content: ' 你好 ',
    })

    expect(chatSessionsService.getSessionModelRef).toHaveBeenCalledWith('user-1', 'session-1')
    expect(modelResolverService.resolveModelTarget).toHaveBeenCalledWith({
      actorUserId: 'user-1',
      intentKey: AI_MODEL_INTENT_KEY.CHAT_ASSISTANT_DEFAULT,
      requestedModelRef: {
        providerId: 'session-provider',
        modelId: 'qwen-plus',
      },
    })
    expect(chatSessionsService.prepareCompletionSession).toHaveBeenCalledWith({
      userId: 'user-1',
      sessionId: 'session-1',
      content: '你好',
    })
    expect(result.command.modelTarget).toMatchObject({
      providerId: 'session-provider',
      modelId: 'qwen-plus',
    })
  })

  it('保存会话模型前先校验模型可用于聊天场景', async () => {
    const {
      chatSessionsService,
      modelResolverService,
      service,
    } = createChatServiceFixture()

    await service.updateSessionModel({
      userId: 'user-1',
      sessionId: 'session-1',
      modelRef: {
        providerId: 'session-provider',
        modelId: 'qwen-plus',
      },
    })

    expect(modelResolverService.resolveModelTarget).toHaveBeenCalledWith({
      actorUserId: 'user-1',
      intentKey: AI_MODEL_INTENT_KEY.CHAT_ASSISTANT_DEFAULT,
      requestedModelRef: {
        providerId: 'session-provider',
        modelId: 'qwen-plus',
      },
    })
    expect(chatSessionsService.updateSessionModel).toHaveBeenCalledWith({
      userId: 'user-1',
      sessionId: 'session-1',
      modelRef: {
        providerId: 'session-provider',
        modelId: 'qwen-plus',
      },
    })
  })
})
