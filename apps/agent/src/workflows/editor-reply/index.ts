import type { AgentEditorApiClient } from '../../clients/editor'
import type { AgentChatModelFactory } from '../../integrations/model-providers/chat-model'
import type { AgentModelStreamPart } from '../../integrations/model-providers/stream-text'
import type { AgentWorkflow, AgentWorkflowKey } from '../../runtime/typing'
import {
  AGENT_RUN_EVENT_TYPE,
  AGENT_WORKFLOW_KEY,
  AgentEditorAiRunContextSchema,
} from '@haohaoxue/samepage-contracts'
import { createAgentRunEvent } from '../../runtime/workflow'
import { emitAgentModelStreamPart } from '../_stream-parts'
import { createEditorReplyGraph } from './graph'

export interface CreateEditorReplyWorkflowInput {
  workflowKey: AgentWorkflowKey
  editorApi: AgentEditorApiClient
  chatModelFactory: AgentChatModelFactory
}

export interface CreateEditorGenerateWorkflowInput {
  editorApi: AgentEditorApiClient
  chatModelFactory: AgentChatModelFactory
}

export interface CreateEditorRewriteWorkflowInput {
  editorApi: AgentEditorApiClient
  chatModelFactory: AgentChatModelFactory
}

export function createEditorGenerateWorkflow(input: CreateEditorGenerateWorkflowInput): AgentWorkflow {
  return createEditorReplyWorkflow({
    workflowKey: AGENT_WORKFLOW_KEY.EDITOR_GENERATE,
    editorApi: input.editorApi,
    chatModelFactory: input.chatModelFactory,
  })
}

export function createEditorRewriteWorkflow(input: CreateEditorRewriteWorkflowInput): AgentWorkflow {
  return createEditorReplyWorkflow({
    workflowKey: AGENT_WORKFLOW_KEY.EDITOR_REWRITE,
    editorApi: input.editorApi,
    chatModelFactory: input.chatModelFactory,
  })
}

function createEditorReplyWorkflow(input: CreateEditorReplyWorkflowInput): AgentWorkflow {
  const graph = createEditorReplyGraph({
    chatModelFactory: input.chatModelFactory,
    name: input.workflowKey,
  })

  return {
    workflowKey: input.workflowKey,

    async execute(options) {
      const context = AgentEditorAiRunContextSchema.parse(options.context)

      await options.emit(createAgentRunEvent({
        type: AGENT_RUN_EVENT_TYPE.PROGRESS,
        runId: options.runId,
        workflowKey: options.workflowKey,
        payload: {
          step: `${input.workflowKey}.prepare`,
        },
      }))

      const editorContext = await input.editorApi.getEditorAiContext({
        actorId: options.actorId,
        sessionId: context.aiSessionId,
        aiRunId: context.aiRunId,
      })

      if (editorContext.workflowKey !== input.workflowKey) {
        throw new Error(`编辑器 AI 上下文 workflowKey 不匹配: ${editorContext.workflowKey}`)
      }

      const result = await graph.invoke({
        editorContext,
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
