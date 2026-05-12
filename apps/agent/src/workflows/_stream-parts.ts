import type { AgentModelStreamPart } from '../integrations/model-providers/stream-text'
import type { AgentWorkflowExecuteOptions } from '../runtime/typing'
import { AGENT_RUN_EVENT_TYPE } from '@haohaoxue/samepage-contracts'
import { createAgentRunEvent } from '../runtime/workflow'

export async function emitAgentModelStreamPart(
  part: AgentModelStreamPart,
  options: AgentWorkflowExecuteOptions,
): Promise<void> {
  if (part.type === 'reasoning.delta') {
    await options.emit(createAgentRunEvent({
      type: AGENT_RUN_EVENT_TYPE.REASONING_DELTA,
      runId: options.runId,
      workflowKey: options.workflowKey,
      payload: {
        text: part.text,
      },
    }))
    return
  }

  if (part.type === 'text.delta') {
    await options.emit(createAgentRunEvent({
      type: AGENT_RUN_EVENT_TYPE.TEXT_DELTA,
      runId: options.runId,
      workflowKey: options.workflowKey,
      payload: {
        text: part.text,
      },
    }))
  }
}
