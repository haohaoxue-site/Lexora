import type { MessageRecord } from '../../storage/conversationHistoryRepository'
import type { RunRecord } from '../../storage/runRecord'
import { describe, expect, it } from 'vitest'
import { projectConversationTree } from '../projectConversationTree'

describe('conversation tree projection', () => {
  it('shares retried questions, places followups at the selected answer and retains failed attempts in one slot', () => {
    const branches = [
      { id: 'main', parentBranchId: null, forkedFromMessageId: null },
      { id: 'alternative', parentBranchId: 'main', forkedFromMessageId: 'q1' },
      { id: 'followup', parentBranchId: 'main', forkedFromMessageId: 'a1' },
    ].map(branch => ({ ...branch, conversationId: 'conversation', createdAt: '0' }))
    const messages = [message('q1', 'main', 'user', null, '1'), message('a1', 'main', 'assistant', 'r1', '3'), message('a2', 'alternative', 'assistant', 'r2', '5'), message('q2', 'followup', 'user', null, '6'), message('partial', 'followup', 'assistant', 'failed', '8'), message('a3', 'followup', 'assistant', 'retried', '10')]
    const input = { conversationId: 'conversation', activeBranchId: 'followup', branches, messages, runs: [run('r1', 'main', 'q1', '2'), run('r2', 'alternative', 'q1', '4'), run('failed', 'followup', 'q2', '7', 'failed'), run('retried', 'followup', 'q2', '9')], toolCounts: new Map([['retried', 2]]) }
    const tree = projectConversationTree(input)
    expect(tree.nodes).toHaveLength(5)
    const nodes = new Map(tree.nodes.map(node => [node.id, node]))
    expect(nodes.get('answer:main:q1')).toMatchObject({ parentId: 'question:q1', active: true })
    expect(nodes.get('answer:alternative:q1')).toMatchObject({ parentId: 'question:q1', active: false })
    expect(nodes.get('question:q2')).toMatchObject({ parentId: 'answer:main:q1', active: true })
    expect(nodes.get('answer:followup:q2')).toMatchObject({
      parentId: 'question:q2',
      runId: 'retried',
      text: 'a3',
      toolCount: 2,
      active: true,
      attempts: [{ runId: 'failed', status: 'failed' }, { runId: 'retried', status: 'completed' }],
    })
    expect(tree.headId).toBe('answer:followup:q2')
    expect(projectConversationTree({ ...input, activeBranchId: 'alternative' }).nodes.filter(node => node.active).map(node => node.id))
      .toEqual(['question:q1', 'answer:alternative:q1'])
  })
})

function message(id: string, branchId: string, role: MessageRecord['role'], runId: string | null, createdAt: string): MessageRecord {
  return { id, branchId, role, runId, createdAt, conversationId: 'conversation', content: { text: id } }
}

function run(id: string, branchId: string, triggeringMessageId: string, startedAt: string, status: RunRecord['status'] = 'completed'): RunRecord {
  return { id, branchId, triggeringMessageId, startedAt, status, conversationId: 'conversation', purpose: 'chat', provider: 'test', model: 'test', contextWindow: null, maxTokens: null, approvalPolicy: 'policy', executionProfile: 'workspace_write', executionContext: null, completedAt: startedAt, errorCode: null, piSessionFile: null }
}
