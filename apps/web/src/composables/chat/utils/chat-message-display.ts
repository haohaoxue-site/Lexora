import type { ChatMemoryOperationProjection } from '@haohaoxue/samepage-contracts/agent'
import type { ChatMessage } from '@/apis/chat'
import type { ChatMarkdownRenderPhase } from '@/components/chat-markdown/typing'
import {
  AGENT_MEMORY_SKILL_KEY,
  AGENT_MEMORY_TOOL,
  AGENT_TRANSLATOR_SKILL_KEY,
} from '@haohaoxue/samepage-contracts/agent'
import {
  CHAT_MESSAGE_PART_TYPE,
  CHAT_MESSAGE_STATUS,
} from '@haohaoxue/samepage-contracts/chat/constants'
import { prettyTokenCount } from '@haohaoxue/samepage-shared/tokens'
import dayjs from '@/utils/dayjs'

type AssistantChatMessage = Extract<ChatMessage, { role: 'assistant' }>
type ChatMessagePart = ChatMessage['parts'][number]

export interface AssistantMessageDisplayModel {
  reasoningText: string
  reasoningElapsedMs: number | null
  messageText: string
  messageTextPartId: string
  usageSummary: string
  usageTooltip: string
  toolCallViews: AssistantToolCallView[]
  toolResultParts: ChatMessagePart[]
  markdownPhase: ChatMarkdownRenderPhase
  isStreaming: boolean
  showPending: boolean
  failureMessage: string
  showCancelled: boolean
}

export interface AssistantToolCallView {
  id: string
  name: string
  kind: NonNullable<ChatMessagePart['metadata']>['toolKind'] | 'function'
  status: NonNullable<ChatMessagePart['metadata']>['status'] | 'running'
  displayTitle: string
  displayDetails: string[]
  argsText: string
  resultText: string
  durationMs: number | null
  order: number
  callPartId: string | null
  resultPartId: string | null
}

export function createAssistantMessageDisplayModel(message: ChatMessage): AssistantMessageDisplayModel {
  return {
    reasoningText: getReasoningText(message),
    reasoningElapsedMs: getReasoningElapsedMs(message),
    messageText: getMessageText(message),
    messageTextPartId: getMessageTextPartId(message),
    usageSummary: getAssistantUsageSummary(message),
    usageTooltip: getAssistantUsageTooltip(message),
    toolCallViews: getAssistantToolCallViews(message),
    toolResultParts: getToolResultParts(message),
    markdownPhase: getMarkdownRenderPhase(message),
    isStreaming: isAssistantStreamingMessage(message),
    showPending: shouldShowAssistantPending(message),
    failureMessage: getAssistantFailureMessage(message),
    showCancelled: shouldShowAssistantCancelled(message),
  }
}

export function getAssistantUsageSummary(message: ChatMessage): string {
  const usage = toAssistantChatMessage(message)?.metadata?.usage
  if (!usage) {
    return ''
  }

  return `消耗 ${prettyTokenCount(usage.totalTokens)} tokens · 入 ${prettyTokenCount(usage.inputTokens)} / 出 ${prettyTokenCount(usage.outputTokens)}`
}

export function getAssistantUsageTooltip(message: ChatMessage): string {
  const usage = toAssistantChatMessage(message)?.metadata?.usage
  if (!usage) {
    return ''
  }

  return [
    typeof usage.firstTokenLatencyMs === 'number' ? `首字时延 ${usage.firstTokenLatencyMs} ms` : null,
    typeof usage.tokensPerSecond === 'number' ? `每秒 ${usage.tokensPerSecond} tokens` : null,
    usage.estimated ? `来源：${formatUsageSource(usage.usageSource)}，含估算` : `来源：${formatUsageSource(usage.usageSource)}`,
  ].filter(Boolean).join(' | ')
}

export function getMessageText(message: ChatMessage) {
  if (message.role === 'user') {
    return message.content
  }

  return message.parts.find(part => part.type === CHAT_MESSAGE_PART_TYPE.TEXT)?.text ?? message.content
}

export function getMessageTextPartId(message: ChatMessage) {
  if (message.role !== 'assistant') {
    return `${message.id}:content`
  }

  return message.parts.find(part => part.type === CHAT_MESSAGE_PART_TYPE.TEXT)?.id ?? `${message.id}:content`
}

export function getReasoningText(message: ChatMessage) {
  if (message.role !== 'assistant') {
    return ''
  }

  return message.parts.find(part => part.type === CHAT_MESSAGE_PART_TYPE.REASONING)?.text ?? ''
}

export function getToolResultParts(message: ChatMessage): ChatMessagePart[] {
  if (message.role !== 'assistant') {
    return []
  }

  return message.parts.filter(part =>
    part.type === CHAT_MESSAGE_PART_TYPE.TOOL_RESULT
    && !part.metadata?.toolCallId,
  )
}

export function getAssistantToolCallViews(message: ChatMessage): AssistantToolCallView[] {
  if (message.role !== 'assistant') {
    return []
  }

  const memoryOperations = message.metadata?.memoryOperations ?? []
  let memoryOperationIndex = 0
  const viewsById = new Map<string, AssistantToolCallView>()
  for (const part of [...message.parts].sort((first, second) => first.order - second.order)) {
    const toolCallId = part.metadata?.toolCallId
    if (!toolCallId) {
      continue
    }

    const current = viewsById.get(toolCallId) ?? createEmptyToolCallView(toolCallId, part)

    if (part.type === CHAT_MESSAGE_PART_TYPE.TOOL_CALL) {
      viewsById.set(toolCallId, {
        ...current,
        name: part.metadata?.toolName ?? current.name,
        kind: part.metadata?.toolKind ?? current.kind,
        status: part.metadata?.status ?? current.status,
        argsText: part.text,
        order: Math.min(current.order, part.order),
        callPartId: part.id,
      })
      continue
    }

    if (part.type === CHAT_MESSAGE_PART_TYPE.TOOL_RESULT) {
      viewsById.set(toolCallId, {
        ...current,
        name: part.metadata?.toolName ?? current.name,
        kind: part.metadata?.toolKind ?? current.kind,
        status: part.metadata?.status ?? current.status,
        resultText: part.text,
        durationMs: typeof part.metadata?.elapsedMs === 'number' ? part.metadata.elapsedMs : current.durationMs,
        order: Math.min(current.order, part.order),
        resultPartId: part.id,
      })
    }
  }

  return [...viewsById.values()]
    .sort((first, second) => first.order - second.order)
    .map((view) => {
      const memoryOperation = isMemoryToolName(view.name)
        ? memoryOperations[memoryOperationIndex++]
        : undefined

      return createPublicToolCallView(view, memoryOperation)
    })
    .filter((view): view is AssistantToolCallView => view !== null)
}

function createEmptyToolCallView(toolCallId: string, part: ChatMessagePart): AssistantToolCallView {
  return {
    id: toolCallId,
    name: part.metadata?.toolName ?? 'tool',
    kind: part.metadata?.toolKind ?? 'function',
    status: part.metadata?.status ?? 'running',
    displayTitle: '执行工具',
    displayDetails: [],
    argsText: '',
    resultText: '',
    durationMs: null,
    order: part.order,
    callPartId: null,
    resultPartId: null,
  }
}

function createPublicToolCallView(
  view: AssistantToolCallView,
  memoryOperation?: ChatMemoryOperationProjection,
): AssistantToolCallView | null {
  if (view.name === 'read_skill_resource') {
    return null
  }

  if (view.name === 'activate_skill') {
    return {
      ...view,
      displayTitle: getSkillActivationTitle(view),
      displayDetails: [],
    }
  }

  if (isMemoryToolName(view.name)) {
    return {
      ...view,
      status: getMemoryOperationToolStatus(memoryOperation, view.status),
      displayTitle: memoryOperation?.title ?? getMemoryToolTitle(view.name),
      displayDetails: [
        memoryOperation?.detail,
        memoryOperation?.status === 'pending_confirmation' ? memoryOperation.reason : null,
        memoryOperation?.status === 'failed' ? memoryOperation.reason : null,
      ].filter(isNonEmptyString),
    }
  }

  return {
    ...view,
    displayTitle: getDisplayName(view.name),
    displayDetails: [],
  }
}

function getSkillActivationTitle(view: AssistantToolCallView): string {
  const skillKey = getStringArgument(view.argsText, 'skillKey')
  if (skillKey === AGENT_MEMORY_SKILL_KEY) {
    return '已启用记忆能力'
  }

  if (skillKey === AGENT_TRANSLATOR_SKILL_KEY) {
    return '已启用翻译能力'
  }

  return '已启用技能'
}

function getMemoryOperationToolStatus(
  operation: ChatMemoryOperationProjection | undefined,
  fallback: AssistantToolCallView['status'],
): AssistantToolCallView['status'] {
  if (!operation) {
    return fallback
  }

  if (operation.status === 'pending_confirmation') {
    return 'pending_confirmation'
  }

  if (operation.status === 'failed') {
    return 'error'
  }

  return 'success'
}

function getMemoryToolTitle(name: string): string {
  if (name === AGENT_MEMORY_TOOL.REMEMBER) {
    return '已记住'
  }

  if (name === AGENT_MEMORY_TOOL.UPDATE) {
    return '已更新记忆'
  }

  if (name === AGENT_MEMORY_TOOL.FORGET) {
    return '已忘记记忆'
  }

  if (name === AGENT_MEMORY_TOOL.IGNORE) {
    return '未更新记忆'
  }

  if (name === AGENT_MEMORY_TOOL.ASK_USER) {
    return '待确认记忆'
  }

  return '记忆活动'
}

function isMemoryToolName(name: string): boolean {
  return (Object.values(AGENT_MEMORY_TOOL) as string[]).includes(name)
}

function getStringArgument(text: string, key: string): string | null {
  if (!text.trim()) {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object') {
      return null
    }

    const value = (parsed as Record<string, unknown>)[key]
    return typeof value === 'string' ? value : null
  }
  catch {
    return null
  }
}

function getDisplayName(name: string): string {
  if (name === 'activate_skill') {
    return '启用技能'
  }

  if (name === 'read_skill_resource') {
    return '读取技能资源'
  }

  if (name === AGENT_MEMORY_TOOL.REMEMBER) {
    return '新增记忆'
  }

  if (name === AGENT_MEMORY_TOOL.UPDATE) {
    return '更新记忆'
  }

  if (name === AGENT_MEMORY_TOOL.FORGET) {
    return '忘记记忆'
  }

  if (name === AGENT_MEMORY_TOOL.IGNORE) {
    return '忽略记忆'
  }

  if (name === AGENT_MEMORY_TOOL.ASK_USER) {
    return '询问记忆'
  }

  return name
}

function isNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function getReasoningElapsedMs(message: ChatMessage) {
  const assistantMessage = toAssistantChatMessage(message)
  if (!assistantMessage) {
    return null
  }

  const messageElapsedMs = assistantMessage.metadata?.reasoningElapsedMs
  if (typeof messageElapsedMs === 'number') {
    return messageElapsedMs
  }

  const reasoningPart = assistantMessage.parts.find(part => part.type === CHAT_MESSAGE_PART_TYPE.REASONING)
  const partElapsedMs = reasoningPart?.metadata?.elapsedMs
  if (typeof partElapsedMs === 'number') {
    return partElapsedMs
  }

  if (!reasoningPart) {
    return null
  }

  const startedAt = dayjs(reasoningPart.createdAt)
  const updatedAt = dayjs(reasoningPart.updatedAt)
  if (!startedAt.isValid() || !updatedAt.isValid()) {
    return null
  }

  const elapsedMs = updatedAt.diff(startedAt)
  return elapsedMs > 0 ? elapsedMs : null
}

export function getAssistantFailureMessage(message: ChatMessage) {
  const assistantMessage = toAssistantChatMessage(message)
  if (!assistantMessage || assistantMessage.status !== CHAT_MESSAGE_STATUS.FAILED) {
    return ''
  }

  return assistantMessage.metadata?.failureMessage ?? '生成失败，请稍后重试。'
}

export function isAssistantStreamingMessage(message: ChatMessage) {
  return message.role === 'assistant' && message.status === CHAT_MESSAGE_STATUS.STREAMING
}

export function getMarkdownRenderPhase(message: ChatMessage): ChatMarkdownRenderPhase {
  if (
    message.role === 'assistant'
    && (
      message.status === CHAT_MESSAGE_STATUS.PENDING
      || message.status === CHAT_MESSAGE_STATUS.STREAMING
    )
  ) {
    return 'streaming'
  }

  return 'final'
}

export function shouldShowAssistantPending(message: ChatMessage) {
  return (
    message.role === 'assistant'
    && (isAssistantStreamingMessage(message) || message.status === CHAT_MESSAGE_STATUS.PENDING)
    && !getReasoningText(message)
    && !getMessageText(message)
  )
}

export function shouldShowAssistantCancelled(message: ChatMessage) {
  return message.role === 'assistant' && message.status === CHAT_MESSAGE_STATUS.CANCELLED
}

function toAssistantChatMessage(message: ChatMessage): AssistantChatMessage | null {
  return message.role === 'assistant' ? message as AssistantChatMessage : null
}

function formatUsageSource(source: string): string {
  if (source === 'provider') {
    return '服务商'
  }

  if (source === 'mixed') {
    return '服务商 + 本地估算'
  }

  return '本地估算'
}
