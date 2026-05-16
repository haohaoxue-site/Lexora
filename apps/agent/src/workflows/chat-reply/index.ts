import type { BaseCheckpointSaver } from '@langchain/langgraph'
import type { AgentChatApiClient } from '../../clients/chat'
import type { AgentChatModelFactory } from '../../integrations/model-providers/chat-model'
import type { AgentModelStreamPart } from '../../integrations/model-providers/stream-text'
import type { AgentRuntimeTryLock } from '../../runtime/lock'
import type { AgentWorkflow } from '../../runtime/typing'
import {
  AGENT_RUN_EVENT_TYPE,
  AGENT_WORKFLOW_KEY,
  AgentChatReplyContextSchema,
} from '@haohaoxue/samepage-contracts'
import { buildAgentChatThreadId } from '@haohaoxue/samepage-shared'
import { createMemoryAgentRuntimeTryLock } from '../../runtime/lock'
import { createAgentRunEvent } from '../../runtime/workflow'
import { emitAgentModelStreamPart } from '../_stream-parts'
import { createChatReplyGraph } from './graph'
import {
  readChatReplyCheckpointState,
  resolveChatReplyGraphInput,
} from './policy'

export interface CreateChatReplyWorkflowInput {
  chatApi: AgentChatApiClient
  chatModelFactory: AgentChatModelFactory
  checkpointer?: BaseCheckpointSaver
  threadRunTryLock?: AgentRuntimeTryLock
}

export function createChatReplyWorkflow(inputs: CreateChatReplyWorkflowInput): AgentWorkflow {
  const threadRunTryLock = inputs.threadRunTryLock ?? createMemoryAgentRuntimeTryLock()
  const graph = createChatReplyGraph({
    chatModelFactory: inputs.chatModelFactory,
    checkpointer: inputs.checkpointer,
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

      const threadId = buildAgentChatThreadId(context.chatSessionId)
      const result = await threadRunTryLock.tryRunExclusive(threadId, async () => {
        const sessionContext = await inputs.chatApi.getSessionContext({
          actorId: options.actorId,
          sessionId: context.chatSessionId,
          triggerUserMessageId: context.triggerUserMessageId,
        })

        if (sessionContext.messages.length === 0) {
          throw new Error('聊天触发消息不存在')
        }

        const checkpointState = await readChatReplyCheckpointState(inputs.checkpointer, threadId)
        const graphInputDecision = resolveChatReplyGraphInput(
          sessionContext,
          checkpointState,
        )

        if (graphInputDecision.shouldResetCheckpoint) {
          await inputs.checkpointer?.deleteThread(threadId)
        }

        return await graph.invoke(graphInputDecision.graphInput, {
          signal: options.signal,
          configurable: {
            thread_id: threadId,
          },
          context: {
            modelTarget: options.modelTarget,
            onStreamPart: async (part: AgentModelStreamPart) => await emitAgentModelStreamPart(part, options),
          },
        })
      })

      if (!result) {
        throw new Error(`聊天会话正在运行: ${context.chatSessionId}`)
      }

      return {
        text: result.responseText,
      }
    },
  }
}
