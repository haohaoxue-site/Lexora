import type { ChatMemoryOperationProjection } from '@haohaoxue/lexora-contracts'
import type { BaseMessage, ToolCall } from '@langchain/core/messages'
import type { AgentMemoryApiClient } from '../../clients/memory'
import type { AgentSkillApiClient } from '../../clients/skills'
import type { AgentChatModel } from '../../integrations/model-providers/chat-model'
import type { AgentModelStreamPart } from '../../integrations/model-providers/stream-text'
import type { RuntimeSkillAdapter } from '../skills/adapters'
import type { LoadedAgentSkill } from '../skills/runtime'
import type { AgentGraphContext } from '../state'
import type { AgentModelCallResult } from './types'
import { AGENT_MEMORY_TOOL_VALUES } from '@haohaoxue/lexora-contracts'
import { AIMessage } from '@langchain/core/messages'
import { consumeChatModelTextStream } from '../../integrations/model-providers/stream-text'
import { AGENT_SKILL_TOOL_NAME } from '../skills/runtime'
import { executeRuntimeToolCalls } from './dispatch'
import {
  addModelCallMetrics,
  createAggregatedModelCallMetrics,
} from './metrics'
import { resolveRuntimeVisibleTools } from './visibility'

export async function callModelWithRuntimeTools(input: {
  model: AgentChatModel
  messages: BaseMessage[]
  sessionId: string
  context: AgentGraphContext | undefined
  memoryApi?: AgentMemoryApiClient
  skillApi?: AgentSkillApiClient
  skillAdapters?: readonly RuntimeSkillAdapter[]
  signal?: AbortSignal
}): Promise<AgentModelCallResult> {
  if (!input.model.bindTools) {
    return streamModelWithoutTools(input)
  }

  const messages = [...input.messages]
  const metrics = createAggregatedModelCallMetrics()
  const memoryOperations: ChatMemoryOperationProjection[] = []
  let loadedSkills: LoadedAgentSkill[] = []
  let tools = resolveRuntimeVisibleTools({
    context: input.context,
    memoryApi: input.memoryApi,
    skillApi: input.skillApi,
    skillAdapters: input.skillAdapters,
    loadedSkills,
  })

  if (tools.length === 0) {
    return streamModelWithoutTools({
      ...input,
      messages,
    })
  }

  let lastResult = await consumeStreamingModelCall(
    input.model.bindTools(tools, { tool_choice: 'auto' }),
    messages,
    input.signal,
    input.context,
  )
  addModelCallMetrics(metrics, lastResult)

  for (let round = 0; round < 3 && lastResult.toolCalls.length > 0; round += 1) {
    messages.push(new AIMessage({
      content: lastResult.text,
      tool_calls: lastResult.toolCalls,
    }))

    const toolExecutionStartedAt = new Map<string, number>()
    for (const toolCall of lastResult.toolCalls) {
      const toolCallId = getToolCallId(toolCall)
      toolExecutionStartedAt.set(toolCallId, Date.now())
      await input.context?.onStreamPart?.({
        type: 'tool.execution.started',
        toolCallId,
        toolName: toolCall.name,
        toolKind: getToolCallKind(toolCall.name),
        args: toolCall.args,
        argsText: stringifyToolPayload(toolCall.args),
        raw: toolCall,
      })
    }

    const toolResult = await executeRuntimeToolCallsWithEvents({
      memoryApi: input.memoryApi,
      skillApi: input.skillApi,
      skillAdapters: input.skillAdapters,
      context: input.context,
      sessionId: input.sessionId,
      toolCalls: lastResult.toolCalls,
      loadedSkills,
      startedAtByToolCallId: toolExecutionStartedAt,
    })
    await emitToolExecutionResults({
      context: input.context,
      toolCalls: lastResult.toolCalls,
      toolMessages: toolResult.toolMessages,
      startedAtByToolCallId: toolExecutionStartedAt,
    })
    loadedSkills = toolResult.loadedSkills
    memoryOperations.push(...toolResult.operations)
    messages.push(...toolResult.toolMessages)

    tools = resolveRuntimeVisibleTools({
      context: input.context,
      memoryApi: input.memoryApi,
      skillApi: input.skillApi,
      skillAdapters: input.skillAdapters,
      loadedSkills,
    })

    lastResult = round === 2 || tools.length === 0
      ? await consumeStreamingModelCall(input.model, messages, input.signal, input.context)
      : await consumeStreamingModelCall(
          input.model.bindTools(tools, { tool_choice: 'auto' }),
          messages,
          input.signal,
          input.context,
        )
    addModelCallMetrics(metrics, lastResult)
  }

  return {
    ...lastResult,
    providerUsage: metrics.providerUsage,
    firstTokenLatencyMs: metrics.firstTokenLatencyMs,
    elapsedMs: metrics.elapsedMs,
    memoryOperations,
  }
}

async function executeRuntimeToolCallsWithEvents(input: {
  memoryApi?: AgentMemoryApiClient
  skillApi?: AgentSkillApiClient
  skillAdapters?: readonly RuntimeSkillAdapter[]
  context: AgentGraphContext | undefined
  sessionId: string
  toolCalls: BaseToolCall[]
  loadedSkills: LoadedAgentSkill[]
  startedAtByToolCallId: Map<string, number>
}): Promise<{
  toolMessages: Awaited<ReturnType<typeof executeRuntimeToolCalls>>['toolMessages']
  operations: ChatMemoryOperationProjection[]
  loadedSkills: LoadedAgentSkill[]
}> {
  try {
    return await executeRuntimeToolCalls({
      memoryApi: input.memoryApi,
      skillApi: input.skillApi,
      skillAdapters: input.skillAdapters,
      context: input.context ?? {},
      sessionId: input.sessionId,
      toolCalls: input.toolCalls,
      loadedSkills: input.loadedSkills,
    })
  }
  catch (error) {
    await emitToolExecutionFailures({
      context: input.context,
      toolCalls: input.toolCalls,
      startedAtByToolCallId: input.startedAtByToolCallId,
      error,
    })
    throw error
  }
}

async function emitToolExecutionResults(input: {
  context: AgentGraphContext | undefined
  toolCalls: BaseToolCall[]
  toolMessages: Array<{
    tool_call_id: string
    content: unknown
    status?: 'success' | 'error'
  }>
  startedAtByToolCallId: Map<string, number>
}): Promise<void> {
  const messagesByToolCallId = new Map(input.toolMessages.map(message => [message.tool_call_id, message]))

  for (const toolCall of input.toolCalls) {
    const toolCallId = getToolCallId(toolCall)
    const startedAt = input.startedAtByToolCallId.get(toolCallId) ?? Date.now()
    const durationMs = Math.max(0, Math.trunc(Date.now() - startedAt))
    const toolKind = getToolCallKind(toolCall.name)
    const toolMessage = messagesByToolCallId.get(toolCallId)
    const outputText = toolMessage ? stringifyToolPayload(toolMessage.content) : undefined
    const status = toolMessage?.status === 'error' ? 'error' : 'success'

    await input.context?.onStreamPart?.({
      type: 'tool.execution.completed',
      toolCallId,
      toolName: toolCall.name,
      toolKind,
      status,
      output: toolMessage?.content,
      outputText,
      durationMs,
      raw: toolMessage,
    } satisfies AgentModelStreamPart)
  }
}

async function emitToolExecutionFailures(input: {
  context: AgentGraphContext | undefined
  toolCalls: BaseToolCall[]
  startedAtByToolCallId: Map<string, number>
  error: unknown
}): Promise<void> {
  for (const toolCall of input.toolCalls) {
    const toolCallId = getToolCallId(toolCall)
    const startedAt = input.startedAtByToolCallId.get(toolCallId) ?? Date.now()
    await input.context?.onStreamPart?.({
      type: 'tool.execution.failed',
      toolCallId,
      toolName: toolCall.name,
      toolKind: getToolCallKind(toolCall.name),
      message: formatToolExecutionError(input.error),
      durationMs: Math.max(0, Math.trunc(Date.now() - startedAt)),
      raw: input.error,
    } satisfies AgentModelStreamPart)
  }
}

type BaseToolCall = ToolCall

function getToolCallId(toolCall: BaseToolCall): string {
  return toolCall.id ?? `${toolCall.name}:missing-id`
}

function getToolCallKind(toolName: string): 'function' | 'skill' | 'memory' | 'mcp' {
  if ((AGENT_MEMORY_TOOL_VALUES as readonly string[]).includes(toolName)) {
    return 'memory'
  }

  if ((Object.values(AGENT_SKILL_TOOL_NAME) as string[]).includes(toolName)) {
    return 'skill'
  }

  return toolName.startsWith('mcp_') ? 'mcp' : 'function'
}

function stringifyToolPayload(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  try {
    return JSON.stringify(value, null, 2)
  }
  catch {
    return String(value)
  }
}

function formatToolExecutionError(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message.trim()
    : 'Tool execution failed.'
}

async function streamModelWithoutTools(input: {
  model: AgentChatModel
  messages: BaseMessage[]
  context: AgentGraphContext | undefined
  signal?: AbortSignal
}): Promise<AgentModelCallResult> {
  const stream = await input.model.stream(input.messages, {
    signal: input.signal,
  })

  return consumeChatModelTextStream(stream, {
    onStreamPart: input.context?.onStreamPart,
  }).then(result => ({
    ...result,
    memoryOperations: [],
  }))
}

async function consumeStreamingModelCall(
  model: AgentChatModel,
  messages: BaseMessage[],
  signal: AbortSignal | undefined,
  context: AgentGraphContext | undefined,
) {
  const stream = await model.stream(messages, { signal })
  return consumeChatModelTextStream(stream, {
    onStreamPart: context?.onStreamPart,
  })
}
