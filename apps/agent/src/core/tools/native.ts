import type { RuntimeToolLoopSession } from './session'
import type { AgentModelCallResult } from './types'
import { AIMessage } from '@langchain/core/messages'
import { shouldContinueWithFinalResponse } from './execution-events'

export async function runNativeToolProtocol(session: RuntimeToolLoopSession): Promise<AgentModelCallResult> {
  let lastResult = await session.consumeVisibleNativeToolCall()
  session.recordModelCall(lastResult)

  for (let round = 0; round < 3 && lastResult.toolCalls.length > 0; round += 1) {
    session.appendMessage(new AIMessage({
      content: lastResult.text,
      tool_calls: lastResult.toolCalls,
    }))

    const toolResult = await session.executeToolCalls(lastResult.toolCalls)
    session.appendToolMessages(toolResult.toolMessages)

    const shouldForceFinalResponse = shouldContinueWithFinalResponse({
      toolCalls: lastResult.toolCalls,
      toolMessages: toolResult.toolMessages,
    })

    session.refreshVisibleTools()

    lastResult = shouldForceFinalResponse || round === 2 || session.visibleTools.length === 0
      ? await session.consumeFinalResponse()
      : await session.consumeVisibleNativeToolCall()
    session.recordModelCall(lastResult)
  }

  return session.createCallResult(lastResult)
}
