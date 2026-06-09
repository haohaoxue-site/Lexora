import type {
  ChatMessage,
  ChatSessionUsageSummary,
  ChatTokenUsageAggregate,
} from '@/apis/chat'
import {
  estimateChatTextTokens,
  formatChatTokenCount,
} from '@/composables/chat/utils/chat-token-estimate'

type AssistantMessage = Extract<ChatMessage, { role: 'assistant' }>
type AssistantUsage = NonNullable<NonNullable<AssistantMessage['metadata']>['usage']>
type ContextBudget = NonNullable<AssistantUsage['contextBudget']>

export interface ChatUsageDetailRow {
  label: string
  value: string
  tone?: 'default' | 'warning' | 'muted'
}

export interface ChatConversationBudgetView {
  usedPercent: number
  fillPercent: number
  usedText: string
  sourceText: string
  rows: ChatUsageDetailRow[]
}

export interface ChatConversationUsageView {
  summaryRows: ChatUsageDetailRow[]
  latestRows: ChatUsageDetailRow[]
  budget: ChatConversationBudgetView | null
  notes: string[]
}

export interface ChatMessageUsageView {
  title: string
  summary: string
  rows: ChatUsageDetailRow[]
  notes: string[]
  estimated: boolean
}

export function createChatConversationUsageView(
  usage: ChatSessionUsageSummary | undefined,
  messages: ChatMessage[],
): ChatConversationUsageView | null {
  const latestUsage = getLatestAssistantUsage(messages)
  if (!usage && messages.length === 0) {
    return null
  }

  const usageSummary = usage ?? {
    activePath: createEmptyUsageAggregate(),
    session: createEmptyUsageAggregate(),
  }
  const budget = latestUsage?.contextBudget ? createBudgetView(latestUsage.contextBudget) : null
  const siblingUsage = subtractUsage(usageSummary.session, usageSummary.activePath)

  return {
    summaryRows: [
      createAggregateRow('当前路径', usageSummary.activePath),
      createAggregateRow('会话总计', usageSummary.session),
      createAggregateRow('分支外消耗', siblingUsage, siblingUsage.totalTokens > 0 ? 'warning' : 'muted'),
    ],
    latestRows: latestUsage ? createAssistantUsageRows(latestUsage) : [],
    budget,
    notes: [
      '当前路径只统计正在阅读的分支。',
      '会话总计包含 sibling 分支的历史生成消耗。',
    ],
  }
}

export function createChatMessageUsageView(message: ChatMessage): ChatMessageUsageView | null {
  if (message.role === 'assistant') {
    const usage = message.metadata?.usage
    const fallbackOutputTokens = estimateChatTextTokens(message.content)

    return {
      title: '本轮回复消耗',
      summary: usage
        ? `${formatChatTokenCount(usage.totalTokens)} tokens`
        : fallbackOutputTokens > 0 ? `约 ${formatChatTokenCount(fallbackOutputTokens)} tokens` : '未记录',
      rows: usage
        ? createAssistantUsageRows(usage)
        : [
            { label: '输入', value: '未记录', tone: 'muted' },
            {
              label: '输出',
              value: fallbackOutputTokens > 0 ? `约 ${formatChatTokenCount(fallbackOutputTokens)} tokens` : '未记录',
              tone: fallbackOutputTokens > 0 ? 'warning' : 'muted',
            },
            {
              label: '总计',
              value: fallbackOutputTokens > 0 ? `至少约 ${formatChatTokenCount(fallbackOutputTokens)} tokens` : '未记录',
              tone: fallbackOutputTokens > 0 ? 'warning' : 'muted',
            },
            { label: '来源', value: '历史记录缺少统计', tone: 'muted' },
          ],
      notes: usage
        ? usage.estimated ? ['部分字段来自本地估算。'] : []
        : ['这条历史消息生成时尚未记录用量，输入与上下文消耗无法回填。'],
      estimated: usage?.estimated ?? true,
    }
  }

  const textTokens = estimateChatTextTokens(message.content)
  const attachmentCount = message.metadata.attachments.length
  const snapshotCount = message.metadata.contextSnapshotMetas.length

  return {
    title: '用户输入估算',
    summary: `约 ${formatChatTokenCount(textTokens)} tokens`,
    rows: [
      { label: '消息正文', value: `约 ${formatChatTokenCount(textTokens)} tokens` },
      { label: '附件', value: `${attachmentCount} 个`, tone: attachmentCount > 0 ? 'warning' : 'muted' },
      { label: '上下文快照', value: `${snapshotCount} 个`, tone: snapshotCount > 0 ? 'warning' : 'muted' },
    ],
    notes: ['仅估算当前用户消息正文，不含系统提示、历史消息和文档全文。'],
    estimated: true,
  }
}

function getLatestAssistantUsage(messages: ChatMessage[]): AssistantUsage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role === 'assistant' && message.metadata?.usage) {
      return message.metadata.usage
    }
  }

  return null
}

function createAssistantUsageRows(usage: AssistantUsage): ChatUsageDetailRow[] {
  return [
    { label: '输入', value: `${formatChatTokenCount(usage.inputTokens)} tokens` },
    { label: '输出', value: `${formatChatTokenCount(usage.outputTokens)} tokens` },
    usage.reasoningTokens > 0
      ? { label: '推理', value: `${formatChatTokenCount(usage.reasoningTokens)} tokens` }
      : null,
    { label: '总计', value: `${formatChatTokenCount(usage.totalTokens)} tokens` },
    typeof usage.firstTokenLatencyMs === 'number'
      ? { label: '首字时延', value: `${formatExactCount(usage.firstTokenLatencyMs)} ms` }
      : null,
    typeof usage.tokensPerSecond === 'number'
      ? { label: '生成速度', value: `${usage.tokensPerSecond.toFixed(1)} tokens/s` }
      : null,
    {
      label: '来源',
      value: formatUsageSource(usage.usageSource),
      tone: usage.estimated ? 'warning' : 'default',
    },
  ].filter(Boolean) as ChatUsageDetailRow[]
}

function createBudgetView(budget: ContextBudget): ChatConversationBudgetView {
  const inputLimit = Math.max(0, budget.contextWindow - budget.reservedOutputTokens)
  const usedInputTokens = budget.systemPromptTokens
    + budget.contextSnapshotTokens
    + budget.historyDigestTokens
    + budget.recentMessageTokens
    + budget.safetyBufferTokens

  return {
    usedPercent: Math.min(100, Math.max(0, budget.budgetUsedRatio * 100)),
    fillPercent: resolveBudgetFillPercent(budget.budgetUsedRatio),
    usedText: `${formatChatTokenCount(usedInputTokens)} / ${formatChatTokenCount(inputLimit)} tokens`,
    sourceText: formatBudgetSource(budget.estimationSource),
    rows: [
      { label: '上下文窗口', value: `${formatChatTokenCount(budget.contextWindow)} tokens` },
      { label: '预留输出', value: `${formatChatTokenCount(budget.reservedOutputTokens)} tokens` },
      { label: '系统提示', value: `${formatChatTokenCount(budget.systemPromptTokens)} tokens` },
      { label: '上下文快照', value: `${formatChatTokenCount(budget.contextSnapshotTokens)} tokens` },
      { label: '历史摘要', value: `${formatChatTokenCount(budget.historyDigestTokens)} tokens` },
      { label: '最近消息', value: `${formatChatTokenCount(budget.recentMessageTokens)} tokens` },
      { label: '安全缓冲', value: `${formatChatTokenCount(budget.safetyBufferTokens)} tokens` },
      { label: '可用输入', value: `${formatChatTokenCount(budget.availableInputTokens)} tokens` },
      { label: '消息预算', value: `${formatChatTokenCount(budget.recentMessageBudgetTokens)} tokens` },
      budget.overflowTokens > 0
        ? {
            label: '溢出',
            value: `${formatChatTokenCount(budget.overflowTokens)} tokens`,
            tone: 'warning',
          }
        : null,
    ].filter(Boolean) as ChatUsageDetailRow[],
  }
}

function formatUsageSource(source: AssistantUsage['usageSource']) {
  switch (source) {
    case 'provider':
      return '服务商返回'
    case 'mixed':
      return '服务商 + 估算'
    case 'estimated':
      return '本地估算'
  }
}

function formatBudgetSource(source: ContextBudget['estimationSource']) {
  switch (source) {
    case 'provider-tokenizer':
      return '服务商 tokenizer'
    case 'tiktoken-compatible':
      return '兼容 tokenizer'
    case 'heuristic':
      return '启发式估算'
  }
}

function formatExactCount(value: number) {
  return new Intl.NumberFormat('en-US').format(Math.max(0, Math.round(value)))
}

function createAggregateRow(
  label: string,
  usage: ChatTokenUsageAggregate,
  tone?: ChatUsageDetailRow['tone'],
): ChatUsageDetailRow {
  return {
    label,
    value: `${formatChatTokenCount(usage.totalTokens)} tokens / ${formatExactCount(usage.generationCount)} 次`,
    tone,
  }
}

function createEmptyUsageAggregate(): ChatTokenUsageAggregate {
  return {
    generationCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
  }
}

function subtractUsage(
  current: ChatTokenUsageAggregate,
  baseline: ChatTokenUsageAggregate,
): ChatTokenUsageAggregate {
  return {
    generationCount: Math.max(0, current.generationCount - baseline.generationCount),
    inputTokens: Math.max(0, current.inputTokens - baseline.inputTokens),
    outputTokens: Math.max(0, current.outputTokens - baseline.outputTokens),
    reasoningTokens: Math.max(0, current.reasoningTokens - baseline.reasoningTokens),
    totalTokens: Math.max(0, current.totalTokens - baseline.totalTokens),
  }
}

function resolveBudgetFillPercent(ratio: number) {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return 0
  }

  return Math.min(100, Math.max(3.5, ratio * 100))
}
