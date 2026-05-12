import type { AgentChatApiClient } from '../../clients/chat'
import type { AgentChatModelFactory } from '../../integrations/model-providers/chat-model'
import type { AgentModelStreamPart } from '../../integrations/model-providers/stream-text'
import type { AgentWorkflow } from '../../runtime/typing'
import {
  AGENT_RUN_EVENT_TYPE,
  AGENT_WORKFLOW_KEY,
  AgentChatReplyContextSchema,
} from '@haohaoxue/samepage-contracts'
import { createAgentRunEvent } from '../../runtime/workflow'
import { emitAgentModelStreamPart } from '../_stream-parts'
import { createChatReplyGraph } from './graph'

export interface CreateChatReplyWorkflowInput {
  chatApi: AgentChatApiClient
  chatModelFactory: AgentChatModelFactory
}

export function createChatReplyWorkflow(inputs: CreateChatReplyWorkflowInput): AgentWorkflow {
  const graph = createChatReplyGraph({
    chatModelFactory: inputs.chatModelFactory,
  })

  return {
    workflowKey: AGENT_WORKFLOW_KEY.CHAT_REPLY,

    async execute(options) {
      const context = AgentChatReplyContextSchema.parse(options.context)

      await options.emit(createAgentRunEvent({
        type: AGENT_RUN_EVENT_TYPE.PROGRESS,
        runId: options.runId,
        workflowKey: options.workflowKey,
        payload: {
          step: 'chat.reply.prepare',
        },
      }))

      const sessionContext = await inputs.chatApi.getSessionContext({
        actorId: options.actorId,
        sessionId: context.chatSessionId,
        triggerMessageOrder: context.triggerMessageOrder,
      })
      const triggerMessage = sessionContext.messages.find(message => message.order === context.triggerMessageOrder)

      if (!triggerMessage) {
        throw new Error('聊天触发消息不存在')
      }

      const result = await graph.invoke({
        messages: sessionContext.messages,
      }, {
        signal: options.signal,
        context: {
          modelTarget: options.modelTarget,
          onStreamPart: async (part: AgentModelStreamPart) => await emitAgentModelStreamPart(part, options),
        },
      })

      return {
        text: result.responseText,
      }
    },
  }
}
