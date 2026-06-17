import type { ChatMemoryOperationProjection } from '@haohaoxue/lexora-contracts'
import type { BaseMessage, ToolCall, ToolMessage } from '@langchain/core/messages'
import type { StructuredToolInterface } from '@langchain/core/tools'
import type { AgentMemoryApiClient } from '../../clients/memory'
import type { AgentSkillApiClient } from '../../clients/skills'
import type { AgentChatModel } from '../../integrations/model-providers/chat-model'
import type { WebSearchClient } from '../../integrations/web-search'
import type { RuntimeSkillAdapter } from '../skills/adapters'
import type { LoadedAgentSkill } from '../skills/runtime'
import type { AgentGraphContext } from '../state'
import type { ToolProtocolUnavailableReason } from './execution-events'
import type { StreamingModelCallResult } from './model-call'
import type { AgentModelCallResult } from './types'
import {
  createVisibleSkillToolNameSet,
  emitToolProtocolUnavailableWarning,
  executeRuntimeToolCallsWithEvents,
} from './execution-events'
import { consumeFinalStreamingModelCall } from './final-response'
import {
  addModelCallMetrics,
  createAggregatedModelCallMetrics,
} from './metrics'
import {
  consumeStreamingModelCall,
  streamModelWithoutTools,
} from './model-call'
import { resolveRuntimeVisibleTools } from './visibility'

export interface RuntimeToolLoopInput {
  model: AgentChatModel
  messages: BaseMessage[]
  sessionId: string
  context: AgentGraphContext | undefined
  memoryApi?: AgentMemoryApiClient
  skillApi?: AgentSkillApiClient
  webSearch?: WebSearchClient
  skillAdapters?: readonly RuntimeSkillAdapter[]
  signal?: AbortSignal
}

export class RuntimeToolLoopSession {
  readonly model: AgentChatModel
  readonly messages: BaseMessage[]
  readonly sessionId: string
  readonly context: AgentGraphContext | undefined
  readonly signal: AbortSignal | undefined

  private readonly memoryApi: AgentMemoryApiClient | undefined
  private readonly skillApi: AgentSkillApiClient | undefined
  private readonly webSearch: WebSearchClient | undefined
  private readonly skillAdapters: readonly RuntimeSkillAdapter[] | undefined
  private readonly metrics = createAggregatedModelCallMetrics()
  private readonly memoryOperations: ChatMemoryOperationProjection[] = []
  private loadedSkills: LoadedAgentSkill[] = []
  private tools: StructuredToolInterface[]
  private visibleSkillToolNames: ReadonlySet<string>

  constructor(input: RuntimeToolLoopInput) {
    this.model = input.model
    this.messages = [...input.messages]
    this.sessionId = input.sessionId
    this.context = input.context
    this.signal = input.signal
    this.memoryApi = input.memoryApi
    this.skillApi = input.skillApi
    this.webSearch = input.webSearch
    this.skillAdapters = input.skillAdapters
    this.tools = this.resolveVisibleTools()
    this.visibleSkillToolNames = createVisibleSkillToolNameSet(this.tools)
  }

  get visibleTools(): StructuredToolInterface[] {
    return this.tools
  }

  get currentVisibleSkillToolNames(): ReadonlySet<string> {
    return this.visibleSkillToolNames
  }

  recordModelCall(result: StreamingModelCallResult): void {
    addModelCallMetrics(this.metrics, result)
  }

  appendMessage(message: BaseMessage): void {
    this.messages.push(message)
  }

  appendToolMessages(messages: ToolMessage[]): void {
    this.messages.push(...messages)
  }

  async consumeVisibleNativeToolCall(): Promise<StreamingModelCallResult> {
    if (!this.model.bindTools) {
      throw new Error('Native tool binding is unavailable for this model')
    }

    return consumeStreamingModelCall(
      this.model.bindTools(this.tools, { tool_choice: 'auto' }),
      this.messages,
      this.signal,
      this.context,
    )
  }

  async consumeFinalResponse(): Promise<StreamingModelCallResult> {
    return consumeFinalStreamingModelCall(this.model, this.messages, this.signal, this.context)
  }

  async executeToolCalls(toolCalls: ToolCall[]) {
    const result = await executeRuntimeToolCallsWithEvents({
      memoryApi: this.memoryApi,
      webSearch: this.webSearch,
      skillApi: this.skillApi,
      skillAdapters: this.skillAdapters,
      context: this.context,
      sessionId: this.sessionId,
      toolCalls,
      loadedSkills: this.loadedSkills,
      visibleSkillToolNames: this.visibleSkillToolNames,
    })

    this.loadedSkills = result.loadedSkills
    this.memoryOperations.push(...result.operations)
    return result
  }

  refreshVisibleTools(): void {
    this.tools = this.resolveVisibleTools()
    this.visibleSkillToolNames = createVisibleSkillToolNameSet(this.tools)
  }

  async warnToolProtocolUnavailable(reason: ToolProtocolUnavailableReason): Promise<void> {
    await emitToolProtocolUnavailableWarning({
      context: this.context,
      reason,
      visibleToolCount: this.tools.length,
    })
  }

  async streamWithoutTools(): Promise<AgentModelCallResult> {
    return streamModelWithoutTools({
      model: this.model,
      messages: this.messages,
      context: this.context,
      signal: this.signal,
    })
  }

  createCallResult(result: StreamingModelCallResult): AgentModelCallResult {
    return {
      ...result,
      providerUsage: this.metrics.providerUsage,
      firstTokenLatencyMs: this.metrics.firstTokenLatencyMs,
      elapsedMs: this.metrics.elapsedMs,
      memoryOperations: this.memoryOperations,
    }
  }

  private resolveVisibleTools(): StructuredToolInterface[] {
    return resolveRuntimeVisibleTools({
      context: this.context,
      memoryApi: this.memoryApi,
      webSearch: this.webSearch,
      skillApi: this.skillApi,
      skillAdapters: this.skillAdapters,
      loadedSkills: this.loadedSkills,
    })
  }
}
