import type { ChatAgentToolNode, ChatAgentTurn, ChatAgentTurnNode } from '../chatAgentTurn'
import { describe, expect, it } from 'vitest'
import { describeChatCompaction } from '../chatCompactionDisplay'
import { describeChatCurrentActivity } from '../chatCurrentActivity'

const thought: ChatAgentTurnNode = { id: 'reasoning', kind: 'reasoning', contentIndex: 0, status: 'running', text: '**Reviewing the implementation**\n\nDetails' }
const compaction = { id: 'compaction', kind: 'compaction', status: 'running', tokensBefore: null, estimatedTokensAfter: null } as const
function tool(id: string, status: ChatAgentToolNode['status']): ChatAgentToolNode {
  return { id, kind: 'tool', status, toolCallId: id, toolName: 'bash', description: null, isError: false, presentation: { card: 'terminal', command: 'pnpm test > output.log 2>&1; result=$?; tail -12 output.log', cwd: '.', description: null, output: null, exitCode: null, signal: null, truncated: false } }
}
function turn(nodes: ChatAgentTurnNode[], phase: NonNullable<ChatAgentTurn['progress']>['phase'] = 'model_requesting'): ChatAgentTurn {
  return { nodes, branchId: 'branch', runId: 'run', completedAt: null, finalMessageId: null, processMessageIds: [], progress: { phase, toolName: null }, reasoningLevel: null, startedAt: '2026-09-10T00:00:00Z', status: 'running', triggeringMessageId: 'question', usage: null }
}

describe('current execution status', () => {
  it('separates preparing and approval counts from tools actually running', () => {
    const running = [tool('one', 'running'), tool('two', 'running')]
    const preparing = tool('three', 'preparing')
    const approval = tool('four', 'awaiting_approval')
    const current = describeChatCurrentActivity(turn([...running, preparing, approval, thought]), 'zh-CN')!
    expect(current.label).toBe('等待批准')
    expect(current.detail).toBe('2 项运行中 · 1 项待批准 · 1 项准备中')
    expect(current.tools.map(node => node.id)).toEqual(['four', 'one', 'two', 'three'])
    const parallel = describeChatCurrentActivity(turn([...running, preparing]), 'zh-CN')!
    expect(parallel).toMatchObject({ label: '正在执行 2 项调用', target: '', detail: '1 项准备中', reasoning: null })
    expect(describeChatCurrentActivity(turn([preparing]), 'zh-CN')).toMatchObject({ label: '正在准备 1 项调用', target: '运行命令' })
  })

  it('keeps long commands in their original tool instead of the current status', () => {
    const node = tool('one', 'running')
    const current = describeChatCurrentActivity(turn([node]), 'zh-CN')!
    expect(current).toMatchObject({ label: '正在运行命令', target: '', detail: '' })
    expect(current.tools[0]).toBe(node)
    expect(describeChatCurrentActivity(turn([node]), 'en-US')?.label).toBe('Running: Run command')
  })

  it('moves between reasoning, compaction and model progress using the current event state', () => {
    expect(describeChatCurrentActivity(turn([tool('done', 'completed'), thought]), 'zh-CN')).toMatchObject({ label: '正在思考', target: 'Reviewing the implementation', reasoning: thought, tools: [] })
    expect(describeChatCurrentActivity(turn([thought, compaction]), 'zh-CN')).toMatchObject({ label: '正在整理上下文', reasoning: null })
    const nodes = [{ ...thought, status: 'completed' } as ChatAgentTurnNode, { ...compaction, status: 'completed' } as ChatAgentTurnNode]
    expect(describeChatCurrentActivity(turn(nodes), 'zh-CN')?.label).toBe('等待模型响应')
    expect(describeChatCurrentActivity(turn(nodes, 'model_streaming'), 'zh-CN')?.label).toBe('生成回复中')
    expect(describeChatCurrentActivity({ ...turn([thought]), status: 'cancelled' }, 'zh-CN')).toBeNull()
  })
})

describe('compaction display', () => {
  it('only shows token results after success and keeps interrupted and failed states distinct', () => {
    expect(describeChatCompaction(compaction, 'zh-CN')).toMatchObject({ active: true, label: '正在整理上下文', detail: '', warning: false })
    const completed = { ...compaction, status: 'completed', tokensBefore: 2000, estimatedTokensAfter: 0 } as const
    expect(describeChatCompaction(completed, 'zh-CN')).toEqual({ active: false, label: '上下文已整理', detail: '2,000 → 0 tokens', warning: false })
    expect(describeChatCompaction({ ...completed, status: 'failed' }, 'zh-CN')).toMatchObject({ label: '上下文整理失败', detail: '', warning: true })
    expect(describeChatCompaction({ ...completed, status: 'interrupted' }, 'zh-CN')).toMatchObject({ label: '上下文整理已中断', warning: false })
  })
})
