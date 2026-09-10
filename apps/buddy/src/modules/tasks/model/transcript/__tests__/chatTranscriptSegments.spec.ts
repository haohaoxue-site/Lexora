import type { LocalConversationTimelineItem } from '@buddy-shared/conversation/conversationApi'
import type { LocalRun, LocalRunEvent } from '@buddy-shared/runs/runApi'
import type { ChatRunStreamingMessage } from '../chatRunStreamingMessages'
import { describe, expect, it } from 'vitest'
import { projectChatAgentTurn } from '../chatAgentTurn'
import { projectChatRunStreamingMessages } from '../chatRunStreamingMessages'
import { createChatTranscriptProjector, projectChatTranscript } from '../chatTranscriptProjection'

const time = (seconds: number) => new Date(Date.UTC(2026, 8, 10, 10, 0, seconds)).toISOString()
const run: LocalRun = {
  id: 'run',
  branchId: 'branch',
  conversationId: 'conversation',
  triggeringMessageId: 'initial',
  status: 'running',
  startedAt: time(0),
  completedAt: null,
  approvalPolicy: 'policy',
  executionProfile: 'workspace_write',
  modelId: 'model',
  providerId: 'provider',
  purpose: 'chat',
  reasoningLevel: null,
  errorCode: null,
}
function message(id: string, role: 'user' | 'assistant', seconds: number): LocalConversationTimelineItem {
  return { kind: 'message', id, role, branchId: run.branchId, conversationId: run.conversationId, runId: role === 'assistant' ? run.id : null, attachments: [], content: { text: id }, createdAt: time(seconds) }
}
const eventInputs: Array<[number, string, LocalRunEvent['payload']]> = [
  [1, 'message.completed', { role: 'assistant', messageId: 'before', phase: 'commentary', content: { text: 'before steering' } }],
  [30, 'message.completed', { role: 'assistant', messageId: 'between', phase: 'commentary', content: { text: 'after steering' } }],
  [31, 'message.completed', { role: 'assistant', messageId: 'hello', phase: 'final_answer', content: { text: 'hello' } }],
  [40, 'message.completed', { role: 'assistant', messageId: 'continuation', phase: 'commentary', content: { text: 'continue work' } }],
]
const events: LocalRunEvent[] = eventInputs.map(([seconds, type, payload], index) => ({ runId: run.id, sequence: index + 1, createdAt: time(seconds), type, payload }))
const timelineItems = [message('initial', 'user', 0), message('steer-a', 'user', 10), message('steer-b', 'user', 20), message('hello', 'assistant', 31)]
function input(activeRun = run, eventList = events, items = timelineItems) {
  return { runs: [activeRun], runProjections: [{ turn: projectChatAgentTurn(activeRun, eventList), recoveryNotices: [], streamingMessages: [] as ReadonlyArray<ChatRunStreamingMessage> }], outputs: [], timelineItems: items }
}
function order(projection: ReturnType<typeof projectChatTranscript>) {
  return projection.rows.flatMap(row => row.kind === 'message'
    ? [row.message.id]
    : row.kind === 'agent-turn' ? row.turn.nodes.flatMap(node => node.kind === 'text' ? [node.messageId] : []) : [])
}

describe('interleaved conversation segments', () => {
  it('keeps later activity below an intermediate answer and withholds run result controls while running', () => {
    const projection = projectChatTranscript(input())
    expect(order(projection)).toEqual(['initial', 'before', 'steer-a', 'steer-b', 'between', 'hello', 'continuation'])
    const hello = projection.rows.find(row => row.kind === 'message' && row.message.id === 'hello')
    expect(hello).toMatchObject({ isIntermediate: true, showIdentity: false, turnOutputs: null })
    expect(hello).not.toHaveProperty('resultRunId')
    expect(hello).not.toHaveProperty('turnUsage')
    const segments = projection.rows.filter(row => row.kind === 'agent-turn')
    expect(segments).toHaveLength(3)
    expect(segments[0]).toHaveProperty('showOutcome', false)
    expect(segments[0].showIdentity).not.toBe(false)
    expect(segments[1]).toHaveProperty('showIdentity', false)
    expect(segments[2]).toHaveProperty('showIdentity', false)
  })

  it('keeps the same message and tool order after completion and history replay', () => {
    const active = projectChatTranscript(input())
    const completed: LocalRun = { ...run, status: 'completed', completedAt: time(60) }
    const terminalEvents = [...events, { runId: run.id, sequence: 5, createdAt: time(60), type: 'message.completed', payload: { role: 'assistant', messageId: 'final', phase: 'final_answer', content: { text: 'final' } } }]
    const result = projectChatTranscript(input(completed, terminalEvents, [...timelineItems, message('final', 'assistant', 60)]))
    expect(order(result)).toEqual([...order(active), 'final'])
    expect(result.rows.filter(row => row.kind === 'message' && row.resultRunId).map(row => row.key)).toEqual(['message:final'])
    expect(result.rows.find(row => row.kind === 'message' && row.message.id === 'hello')).toMatchObject({ isIntermediate: true, showIdentity: false })
    expect(result.rows.find(row => row.kind === 'message' && row.message.id === 'final')).toMatchObject({ showIdentity: false, resultRunId: run.id })
    expect(result.rows.find(row => row.kind === 'message' && row.message.id === 'final')).not.toHaveProperty('isIntermediate')
    expect(result.rows.filter(row => row.kind === 'agent-turn').map(row => row.key)).toEqual(active.rows.filter(row => row.kind === 'agent-turn').map(row => row.key))
  })

  it('keeps a reply that began before steering in place when it is saved and replayed', () => {
    const start: LocalRunEvent = { runId: run.id, sequence: 1, createdAt: time(2), type: 'message.started', payload: { role: 'assistant', messageId: 'reply' } }
    const delta: LocalRunEvent = { runId: run.id, sequence: 2, createdAt: time(3), type: 'message.delta', payload: { messageId: 'reply', delta: 'already visible', phase: 'final_answer' } }
    const items = [message('initial', 'user', 0), message('steer-a', 'user', 10)]
    const liveEvents = [start, delta]
    const live = input(run, liveEvents, items)
    live.runProjections[0]!.streamingMessages = projectChatRunStreamingMessages(run, liveEvents)
    const visible = projectChatTranscript(live)
    expect(order(visible)).toEqual(['initial', 'reply', 'steer-a'])
    expect(visible.rows.find(row => row.kind === 'message' && row.message.id === 'reply')).toMatchObject({ isIntermediate: true, showIdentity: false })

    const end: LocalRunEvent = { runId: run.id, sequence: 3, createdAt: time(20), type: 'message.completed', payload: { messageId: 'reply', role: 'assistant', phase: 'final_answer', content: { text: 'already visible and complete' } } }
    const persisted = projectChatTranscript(input(run, [...liveEvents, end], [...items, message('reply', 'assistant', 20)]))
    expect(order(persisted)).toEqual(order(visible))
    const compactedReplay = projectChatTranscript(input(run, [start, end], [...items, message('reply', 'assistant', 20)]))
    expect(order(compactedReplay)).toEqual(order(visible))
  })

  it('starts a new identity for a follow-up run while retaining one identity across steering', () => {
    const followup: LocalRun = { ...run, id: 'followup-run', triggeringMessageId: 'followup', startedAt: time(60) }
    const completed: LocalRun = { ...run, status: 'completed', completedAt: time(50) }
    const first = input(completed)
    const projection = projectChatTranscript({
      ...first,
      runs: [completed, followup],
      timelineItems: [...timelineItems, message('followup', 'user', 60)],
      runProjections: [...first.runProjections, { turn: projectChatAgentTurn(followup, []), recoveryNotices: [], streamingMessages: [] }],
    })
    const identities = projection.rows.flatMap(row => row.kind === 'agent-turn' && row.showIdentity !== false
      ? [row.turn.runId]
      : row.kind === 'message' && row.message.role === 'assistant' && row.showIdentity !== false ? [row.message.runId] : [])
    expect(identities).toEqual([run.id, followup.id])
  })

  it.each(['failed', 'cancelled'] as const)('keeps a single terminal outcome after steering when the run is %s', (status) => {
    const projection = projectChatTranscript(input({ ...run, status, completedAt: time(60) }))
    const segments = projection.rows.filter(row => row.kind === 'agent-turn')
    expect(segments.filter(row => row.showIdentity !== false)).toHaveLength(1)
    expect(segments.filter(row => row.ownsResultActions)).toEqual([segments.at(-1)])
    expect(segments.filter(row => row.showOutcome !== false)).toEqual([segments.at(-1)])
    expect(projection.rows.find(row => row.kind === 'message' && row.message.id === 'hello')).toMatchObject({ isIntermediate: true, showIdentity: false })
  })

  it.each(['failed', 'cancelled'] as const)('does not promote the intermediate answer when the next model request is %s before emitting text', (status) => {
    const resumed: LocalRunEvent = { runId: run.id, sequence: 4, createdAt: time(40), type: 'message.started', payload: { messageId: 'continuation', role: 'assistant' } }
    const projection = projectChatTranscript(input({ ...run, status, completedAt: time(60) }, [...events.slice(0, 3), resumed]))
    expect(projection.rows.find(row => row.kind === 'message' && row.message.id === 'hello')).toMatchObject({ isIntermediate: true, showIdentity: false })
    expect(projection.rows.filter(row => row.kind === 'agent-turn' && row.ownsResultActions)).toHaveLength(1)
    expect(projection.rows.at(-1)).toMatchObject({ kind: 'agent-turn', ownsResultActions: true, showIdentity: false })
  })

  it('rebuilds segment boundaries during incremental updates without rewriting unchanged message rows', () => {
    const projector = createChatTranscriptProjector()
    const first = input(run, events.slice(0, 3))
    const before = projector.project(first)
    const next = { ...input(), runs: first.runs, outputs: first.outputs }
    const updated = projector.project(next)
    expect(updated.rows).toEqual(projectChatTranscript(next).rows)
    expect(updated.rows[0]).toBe(before.rows[0])
    expect(order(updated).at(-1)).toBe('continuation')
  })
})
