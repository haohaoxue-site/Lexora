import type { ChatMemoryOperationProjection } from '@haohaoxue/lexora-contracts'
import type { AgentToolCallKind } from '@haohaoxue/lexora-contracts/agent'
import type { ToolMessage } from '@langchain/core/messages'
import type { StructuredToolInterface } from '@langchain/core/tools'
import type { AgentMemoryApiClient } from '../../clients/memory'
import type { AgentSkillApiClient } from '../../clients/skills'
import type { AgentModelStreamPart } from '../../integrations/model-providers/stream-text'
import type { WebSearchClient } from '../../integrations/web-search'
import type { RuntimeSkillAdapter } from '../skills/adapters'
import type { LoadedAgentSkill } from '../skills/runtime'
import type { AgentGraphContext } from '../state'
import type { AgentToolProtocol } from './protocol'
import type { BaseToolCall } from './utils'
import { AGENT_MEMORY_TOOL_VALUES } from '@haohaoxue/lexora-contracts'
import { AGENT_WEB_SEARCH_TOOL_VALUES } from '@haohaoxue/lexora-contracts/agent'
import { AGENT_SKILL_TOOL_NAME } from '../skills/runtime'
import { executeRuntimeToolCalls } from './dispatch'
import {
  formatToolExecutionError,
  getToolCallId,
  stringifyToolPayload,
} from './utils'

export type ToolProtocolUnavailableReason = Extract<AgentToolProtocol, { kind: 'none' }>['reason']

export interface RuntimeToolExecutionResult {
  toolMessages: ToolMessage[]
  operations: ChatMemoryOperationProjection[]
  loadedSkills: LoadedAgentSkill[]
}

export async function emitToolProtocolUnavailableWarning(input: {
  context: AgentGraphContext | undefined
  reason: ToolProtocolUnavailableReason
  visibleToolCount: number
}): Promise<void> {
  if (input.reason === 'no-visible-tools') {
    return
  }

  await input.context?.onRuntimeWarning?.({
    code: 'agent_tool_protocol_unavailable',
    message: 'Runtime tools are visible but disabled because no safe model tool protocol is available.',
    details: {
      reason: input.reason,
      visibleToolCount: input.visibleToolCount,
      providerId: input.context?.modelTarget?.providerId,
      adapterKey: input.context?.modelTarget?.adapterKey,
      modelId: input.context?.modelTarget?.modelId,
      capabilities: input.context?.modelTarget?.capabilities ?? [],
    },
  })
}

export async function executeRuntimeToolCallsWithEvents(input: {
  memoryApi?: AgentMemoryApiClient
  skillApi?: AgentSkillApiClient
  webSearch?: WebSearchClient
  skillAdapters?: readonly RuntimeSkillAdapter[]
  context: AgentGraphContext | undefined
  sessionId: string
  toolCalls: BaseToolCall[]
  loadedSkills: LoadedAgentSkill[]
  visibleSkillToolNames: ReadonlySet<string>
}): Promise<RuntimeToolExecutionResult> {
  const startedAtByToolCallId = await emitToolExecutionStarts({
    context: input.context,
    toolCalls: input.toolCalls,
    visibleSkillToolNames: input.visibleSkillToolNames,
  })

  try {
    const result = await executeRuntimeToolCalls({
      memoryApi: input.memoryApi,
      webSearch: input.webSearch,
      skillApi: input.skillApi,
      skillAdapters: input.skillAdapters,
      context: input.context ?? {},
      sessionId: input.sessionId,
      toolCalls: input.toolCalls,
      loadedSkills: input.loadedSkills,
    })

    await emitToolExecutionResults({
      context: input.context,
      toolCalls: input.toolCalls,
      toolMessages: result.toolMessages,
      startedAtByToolCallId,
      visibleSkillToolNames: input.visibleSkillToolNames,
    })

    return result
  }
  catch (error) {
    await emitToolExecutionFailures({
      context: input.context,
      toolCalls: input.toolCalls,
      startedAtByToolCallId,
      visibleSkillToolNames: input.visibleSkillToolNames,
      error,
    })
    throw error
  }
}

export function createVisibleSkillToolNameSet(tools: StructuredToolInterface[]): ReadonlySet<string> {
  return new Set(tools.map(tool => tool.name))
}

export function shouldContinueWithFinalResponse(input: {
  toolCalls: BaseToolCall[]
  toolMessages: Array<{ status?: 'success' | 'error' }>
}): boolean {
  return input.toolMessages.some(message => message.status === 'error')
    || input.toolCalls.some(toolCall => (AGENT_WEB_SEARCH_TOOL_VALUES as readonly string[]).includes(toolCall.name))
}

async function emitToolExecutionStarts(input: {
  context: AgentGraphContext | undefined
  toolCalls: BaseToolCall[]
  visibleSkillToolNames: ReadonlySet<string>
}): Promise<Map<string, number>> {
  const toolExecutionStartedAt = new Map<string, number>()
  for (const toolCall of input.toolCalls) {
    const toolCallId = getToolCallId(toolCall)
    toolExecutionStartedAt.set(toolCallId, Date.now())
    await input.context?.onStreamPart?.({
      type: 'tool.execution.started',
      toolCallId,
      toolName: toolCall.name,
      toolKind: getToolCallKind(toolCall.name, input.visibleSkillToolNames),
      args: toolCall.args,
      argsText: stringifyToolPayload(toolCall.args),
      raw: toolCall,
    })
  }

  return toolExecutionStartedAt
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
  visibleSkillToolNames: ReadonlySet<string>
}): Promise<void> {
  const messagesByToolCallId = new Map(input.toolMessages.map(message => [message.tool_call_id, message]))

  for (const toolCall of input.toolCalls) {
    const toolCallId = getToolCallId(toolCall)
    const startedAt = input.startedAtByToolCallId.get(toolCallId) ?? Date.now()
    const durationMs = Math.max(0, Math.trunc(Date.now() - startedAt))
    const toolKind = getToolCallKind(toolCall.name, input.visibleSkillToolNames)
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
  visibleSkillToolNames: ReadonlySet<string>
  error: unknown
}): Promise<void> {
  for (const toolCall of input.toolCalls) {
    const toolCallId = getToolCallId(toolCall)
    const startedAt = input.startedAtByToolCallId.get(toolCallId) ?? Date.now()
    await input.context?.onStreamPart?.({
      type: 'tool.execution.failed',
      toolCallId,
      toolName: toolCall.name,
      toolKind: getToolCallKind(toolCall.name, input.visibleSkillToolNames),
      message: formatToolExecutionError(input.error),
      durationMs: Math.max(0, Math.trunc(Date.now() - startedAt)),
      raw: input.error,
    } satisfies AgentModelStreamPart)
  }
}

function getToolCallKind(toolName: string, visibleSkillToolNames: ReadonlySet<string>): AgentToolCallKind {
  if (visibleSkillToolNames.has(toolName) || isKnownRuntimeSkillToolName(toolName)) {
    return 'skill'
  }

  return toolName.startsWith('mcp_') ? 'mcp' : 'function'
}

function isKnownRuntimeSkillToolName(toolName: string): boolean {
  return getKnownRuntimeSkillToolNames().includes(toolName)
}

function getKnownRuntimeSkillToolNames(): readonly string[] {
  return [
    ...Object.values(AGENT_SKILL_TOOL_NAME),
    ...AGENT_MEMORY_TOOL_VALUES,
    ...AGENT_WEB_SEARCH_TOOL_VALUES,
  ]
}
