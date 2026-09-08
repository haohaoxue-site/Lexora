import type { LocalArtifact } from '@buddy-shared/artifacts/artifactApi'
import type { LocalChangeSetSummary } from '@buddy-shared/changes/changeApi'
import type { LocalConversationTimelineItem, LocalMessage } from '@buddy-shared/conversation/conversationApi'
import type { LocalRun, LocalRunEvent, LocalRunOutput } from '@buddy-shared/runs/runApi'

import type { ChatAgentTurn } from './chatAgentTurn'
import type { ChatRecoveryNotice } from './chatRunRecovery'
import type { ChatRunTranscriptProjection } from './chatRunTranscriptProjector'

export interface ChatTranscriptMessageRow {
  isAgentTurnResult: boolean
  key: string
  kind: 'message'
  message: LocalMessage
  streaming?: true
  turnChanges?: LocalChangeSetSummary
  turnOutputs: ChatTranscriptTurnOutputs | null
}

export interface ChatTranscriptTurnOutputs {
  artifacts: ReadonlyArray<LocalArtifact>
  runId: string
}

export interface ChatTranscriptCompactionRow {
  compaction: Extract<LocalConversationTimelineItem, { kind: 'compaction' }>
  key: string
  kind: 'compaction'
}

export interface ChatTranscriptAgentTurnRow {
  key: string
  kind: 'agent-turn'
  ownsResultActions?: true
  turn: ChatAgentTurn
}

export interface ChatTranscriptActivityRow {
  key: string
  kind: 'activity'
  turn: ChatAgentTurn
}

export interface ChatTranscriptRecoveryNoticeRow {
  key: string
  kind: 'recovery-notice'
  notice: ChatRecoveryNotice
}

export type ChatTranscriptRow
  = | ChatTranscriptActivityRow
    | ChatTranscriptAgentTurnRow
    | ChatTranscriptCompactionRow
    | ChatTranscriptMessageRow
    | ChatTranscriptRecoveryNoticeRow

export interface ChatTranscriptProjection {
  rows: ReadonlyArray<ChatTranscriptRow>
  update: ChatTranscriptProjectionUpdate
}

export interface ChatTranscriptRowPatch {
  deleteCount: 0 | 1
  index: number
  rows: ReadonlyArray<ChatTranscriptRow>
}

export type ChatTranscriptProjectionUpdate
  = | { kind: 'replace' }
    | {
      kind: 'patch'
      patches: ReadonlyArray<ChatTranscriptRowPatch>
      previousRows: ReadonlyArray<ChatTranscriptRow>
    }

export interface ChatTranscriptProjectionInput {
  agentTurns?: ReadonlyArray<ChatAgentTurn>
  changeSets?: ReadonlyArray<LocalChangeSetSummary>
  outputs: ReadonlyArray<LocalRunOutput>
  runEvents?: ReadonlyArray<LocalRunEvent>
  runProjections?: ReadonlyArray<ChatRunTranscriptProjection>
  runs: ReadonlyArray<LocalRun>
  timelineItems: ReadonlyArray<LocalConversationTimelineItem>
}
