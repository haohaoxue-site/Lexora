import type { LocalRunEvent } from '@buddy-shared/runs/runApi'

export type ChatContextUsageSegmentKind = 'mcp' | 'messages' | 'skills' | 'systemPrompt' | 'tools'

export type ChatContextUsageStatus = 'pending' | 'ready'

export interface ChatContextUsageSegment {
  kind: ChatContextUsageSegmentKind
  tokens: number
}

export interface ChatContextUsage {
  contextWindow: number
  modelName: string
  modelId: string
  percent: number | null
  providerId: string
  recordedAt: string | null
  segments: ReadonlyArray<ChatContextUsageSegment>
  status: ChatContextUsageStatus
  totalTokens: number | null
}

export interface ChatRunEventBucket {
  readonly events: ReadonlyArray<LocalRunEvent>
  readonly revision: number
  readonly update: {
    readonly events: ReadonlyArray<LocalRunEvent>
    readonly kind: 'append'
    readonly previousRevision: number
  } | null
}

export type ChatRunEventBuckets = ReadonlyMap<string, ChatRunEventBucket>

export type ChatApprovalDecision = 'approve' | 'approveForTurn' | 'deny'
