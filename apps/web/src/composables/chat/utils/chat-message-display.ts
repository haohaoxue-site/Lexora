import type { ChatMemoryOperationProjection } from '@haohaoxue/lexora-contracts/agent'
import type { ChatMessage } from '@/apis/chat'
import type { ChatMarkdownRenderPhase } from '@/components/chat-markdown'
import {
  AGENT_MEMORY_OPERATION_DISPLAY_CODE,
  AGENT_MEMORY_OPERATION_REASON_CODE,
  AGENT_MEMORY_TOOL,
  AGENT_WEB_SEARCH_TOOL,
} from '@haohaoxue/lexora-contracts/agent'
import {
  CHAT_MESSAGE_PART_TYPE,
  CHAT_MESSAGE_STATUS,
} from '@haohaoxue/lexora-contracts/chat/constants'
import { prettyTokenCount } from '@haohaoxue/lexora-shared/tokens'
import { translate } from '@/i18n'
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

  return translate('chat.messageDisplay.usageSummary', {
    input: prettyTokenCount(usage.inputTokens),
    output: prettyTokenCount(usage.outputTokens),
    total: prettyTokenCount(usage.totalTokens),
  })
}

export function getAssistantUsageTooltip(message: ChatMessage): string {
  const usage = toAssistantChatMessage(message)?.metadata?.usage
  if (!usage) {
    return ''
  }

  return [
    typeof usage.firstTokenLatencyMs === 'number'
      ? translate('chat.messageDisplay.firstTokenLatency', { value: usage.firstTokenLatencyMs })
      : null,
    typeof usage.tokensPerSecond === 'number'
      ? translate('chat.messageDisplay.tokensPerSecond', { value: usage.tokensPerSecond })
      : null,
    usage.estimated
      ? translate('chat.messageDisplay.sourceWithEstimate', { source: formatUsageSource(usage.usageSource) })
      : translate('chat.messageDisplay.source', { source: formatUsageSource(usage.usageSource) }),
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
    displayTitle: translate('chat.messageDisplay.executeTool'),
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
  if (view.name === 'activate_skill' || view.name === 'read_skill_resource') {
    return null
  }

  if (isMemoryToolName(view.name)) {
    return {
      ...view,
      status: getMemoryOperationToolStatus(memoryOperation, view.status),
      displayTitle: getMemoryOperationTitle(memoryOperation, view.name),
      displayDetails: [
        memoryOperation?.detail,
        getMemoryOperationReason(memoryOperation),
      ].filter(isNonEmptyString),
    }
  }

  if (isWebSearchToolName(view.name)) {
    return {
      ...view,
      displayTitle: getWebSearchTitle(view),
      displayDetails: getWebSearchDetails(view),
    }
  }

  return {
    ...view,
    displayTitle: getDisplayName(view.name),
    displayDetails: [],
  }
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
    return translate('chat.messageDisplay.memoryRemembered')
  }

  if (name === AGENT_MEMORY_TOOL.UPDATE) {
    return translate('chat.messageDisplay.memoryUpdated')
  }

  if (name === AGENT_MEMORY_TOOL.FORGET) {
    return translate('chat.messageDisplay.memoryForgotten')
  }

  if (name === AGENT_MEMORY_TOOL.IGNORE) {
    return translate('chat.messageDisplay.memoryIgnored')
  }

  if (name === AGENT_MEMORY_TOOL.ASK_USER) {
    return translate('chat.messageDisplay.memoryPending')
  }

  return translate('chat.messageDisplay.memoryActivity')
}

function getMemoryOperationTitle(
  operation: ChatMemoryOperationProjection | undefined,
  fallbackToolName: string,
): string {
  if (!operation?.displayCode) {
    return operation?.title ?? getMemoryToolTitle(fallbackToolName)
  }

  if (operation.displayCode === AGENT_MEMORY_OPERATION_DISPLAY_CODE.REMEMBERED) {
    return translate('chat.messageDisplay.memoryRemembered')
  }

  if (operation.displayCode === AGENT_MEMORY_OPERATION_DISPLAY_CODE.UPDATED) {
    return translate('chat.messageDisplay.memoryUpdated')
  }

  if (operation.displayCode === AGENT_MEMORY_OPERATION_DISPLAY_CODE.FORGOTTEN) {
    return translate('chat.messageDisplay.memoryForgotten')
  }

  if (operation.displayCode === AGENT_MEMORY_OPERATION_DISPLAY_CODE.IGNORED) {
    return translate('chat.messageDisplay.memoryIgnored')
  }

  if (operation.displayCode === AGENT_MEMORY_OPERATION_DISPLAY_CODE.PENDING) {
    return translate('chat.messageDisplay.memoryPending')
  }

  if (operation.displayCode === AGENT_MEMORY_OPERATION_DISPLAY_CODE.EXISTS) {
    return translate('chat.messageDisplay.memoryExists')
  }

  if (operation.displayCode === AGENT_MEMORY_OPERATION_DISPLAY_CODE.FAILED) {
    return translate('chat.messageDisplay.memoryFailed')
  }

  return getMemoryToolTitle(fallbackToolName)
}

function getMemoryOperationReason(operation: ChatMemoryOperationProjection | undefined): string | null {
  if (
    !operation
    || (operation.status !== 'pending_confirmation' && operation.status !== 'failed')
  ) {
    return null
  }

  if (!operation.reasonCode) {
    return operation.reason
  }

  if (operation.reasonCode === AGENT_MEMORY_OPERATION_REASON_CODE.SENSITIVE_CONTENT) {
    return translate('chat.messageDisplay.memoryReasonSensitiveContent')
  }

  if (operation.reasonCode === AGENT_MEMORY_OPERATION_REASON_CODE.WRITING_DISABLED) {
    return translate('chat.messageDisplay.memoryReasonWritingDisabled')
  }

  if (operation.reasonCode === AGENT_MEMORY_OPERATION_REASON_CODE.BROAD_FORGET) {
    return translate('chat.messageDisplay.memoryReasonBroadForget')
  }

  if (operation.reasonCode === AGENT_MEMORY_OPERATION_REASON_CODE.DUPLICATE) {
    return translate('chat.messageDisplay.memoryReasonDuplicate')
  }

  if (operation.reasonCode === AGENT_MEMORY_OPERATION_REASON_CODE.FAILED) {
    return translate('chat.messageDisplay.memoryReasonFailed')
  }

  return operation.reason
}

function isMemoryToolName(name: string): boolean {
  return (Object.values(AGENT_MEMORY_TOOL) as string[]).includes(name)
}

function isWebSearchToolName(name: string): boolean {
  return (Object.values(AGENT_WEB_SEARCH_TOOL) as string[]).includes(name)
}

function getWebSearchTitle(view: AssistantToolCallView): string {
  if (view.status === 'success') {
    return translate('chat.messageDisplay.webSearchCompleted')
  }

  if (view.status === 'error') {
    return translate('chat.messageDisplay.webSearchFailed')
  }

  return translate('chat.messageDisplay.webSearchRunning')
}

function getWebSearchDetails(view: AssistantToolCallView): string[] {
  const args = parseJsonObject(view.argsText)
  const result = parseJsonObject(view.resultText)
  const query = getStringValue(result, 'query') ?? getStringValue(args, 'query')
  const results = Array.isArray(result?.results) ? result.results : []
  const sources = results
    .map(item => isRecord(item) ? getStringValue(item, 'source') : null)
    .filter(isNonEmptyString)

  return [
    query,
    results.length > 0
      ? translate('chat.messageDisplay.webSearchResultSummary', {
          count: results.length,
          sources: sources.slice(0, 5).join(', '),
        })
      : view.status === 'success'
        ? translate('chat.messageDisplay.webSearchNoResults')
        : null,
  ].filter(isNonEmptyString)
}

function getStringValue(value: Record<string, unknown> | null, key: string): string | null {
  if (!value) {
    return null
  }

  const item = value[key]
  return typeof item === 'string' ? item : null
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  if (!text.trim()) {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(text)
    return isRecord(parsed) ? parsed : null
  }
  catch {
    return null
  }
}

function getDisplayName(name: string): string {
  if (name === 'activate_skill') {
    return translate('chat.messageDisplay.activateSkill')
  }

  if (name === 'read_skill_resource') {
    return translate('chat.messageDisplay.readSkillResource')
  }

  if (name === AGENT_MEMORY_TOOL.REMEMBER) {
    return translate('chat.messageDisplay.rememberMemory')
  }

  if (name === AGENT_MEMORY_TOOL.UPDATE) {
    return translate('chat.messageDisplay.updateMemory')
  }

  if (name === AGENT_MEMORY_TOOL.FORGET) {
    return translate('chat.messageDisplay.forgetMemory')
  }

  if (name === AGENT_MEMORY_TOOL.IGNORE) {
    return translate('chat.messageDisplay.ignoreMemory')
  }

  if (name === AGENT_MEMORY_TOOL.ASK_USER) {
    return translate('chat.messageDisplay.askMemory')
  }

  if (name === AGENT_WEB_SEARCH_TOOL.SEARCH) {
    return translate('chat.messageDisplay.webSearchRunning')
  }

  return name
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

  return assistantMessage.metadata?.failureMessage ?? translate('chat.messageDisplay.failureMessage')
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
    return translate('chat.messageDisplay.provider')
  }

  if (source === 'mixed') {
    return translate('chat.messageDisplay.mixed')
  }

  return translate('chat.messageDisplay.estimated')
}
