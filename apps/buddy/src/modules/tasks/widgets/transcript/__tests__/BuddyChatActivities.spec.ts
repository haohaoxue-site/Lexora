// @vitest-environment jsdom
import type { ChatAgentToolNode, ChatAgentTurn, ChatAgentTurnNode } from '../../../model/transcript/chatAgentTurn'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, shallowRef } from 'vue'
import BuddyChatAgentTurn from '../BuddyChatAgentTurn.vue'
import BuddyChatRunActivity from '../BuddyChatRunActivity.vue'
import { chatToolActionsKey } from '../chatToolActionsContext'

vi.mock('../BuddyChatActionToolbar.vue', () => ({ default: { render: () => null } }))
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
  vi.useRealTimers()
})

describe('activity disclosure', () => {
  it('keeps a single tool and its open output stable while model progress runs independently', async () => {
    vi.useFakeTimers()
    const node: ChatAgentToolNode = { ...readTool('output', 'running'), toolName: 'lexora_output_present', presentation: { card: 'generic', argumentNames: ['paths'], description: null, output: 'Presented output', truncated: false } }
    const { root, turn } = mountTurn([node])
    expect(root.querySelector('.buddy-chat-run-activity')).toBeNull()
    const header = root.querySelector<HTMLButtonElement>('.buddy-chat-tool__header')!
    expect(header.textContent).toContain('展示产物')
    expect(header.textContent).not.toContain('paths')
    header.click()
    await nextTick()
    const details = root.querySelector('.buddy-chat-tool-details')
    expect(details?.textContent).toContain('Presented output')
    for (const [phase, label] of [['model_requesting', '等待模型响应'], ['model_streaming', '生成回复中']] as const) {
      turn.value = { ...turn.value, nodes: [{ ...node, status: 'completed' }], progress: { phase, toolName: null } }
      await nextTick()
      await vi.advanceTimersByTimeAsync(700)
      expect(root.querySelector('.buddy-chat-tool__header')).toBe(header)
      expect(header.textContent?.trim()).toBe('展示产物')
      expect(header.getAttribute('aria-expanded')).toBe('true')
      expect(root.querySelector('.buddy-chat-tool-details')).toBe(details)
      expect(root.querySelector('.buddy-chat-run-activity__label')?.textContent).toContain(label)
    }
    turn.value = { ...turn.value, finalMessageId: 'answer' }
    await nextTick()
    expect(root.querySelector('.buddy-chat-tool__header')).toBe(header)
    turn.value = { ...turn.value, status: 'completed', completedAt: '2026-09-09T00:00:10Z', progress: null }
    await nextTick()
    expect(root.querySelector('.buddy-chat-run-activity')).toBeNull()
    expect(root.querySelector('.buddy-chat-tool-details')).toBe(details)
  })

  it('finishes a mixed group without borrowing progress and avoids duplicate loaders during another call', async () => {
    const first = readTool('one', 'running')
    const second = readTool('two', 'completed')
    const { root, turn } = mountTurn([{ id: 'thought', contentIndex: 0, kind: 'reasoning', status: 'completed', text: 'Checking output' }, first, second])
    expect(root.querySelector('.buddy-chat-run-activity')).toBeNull()
    const header = root.querySelector<HTMLButtonElement>('.buddy-chat-activity-group__header')!
    header.click()
    await nextTick()
    turn.value = { ...turn.value, nodes: [turn.value.nodes[0]!, { ...first, status: 'completed' }, second], progress: { phase: 'model_requesting', toolName: null } }
    await nextTick()
    expect(header.textContent?.trim()).toBe('读取 1 个文件')
    expect(root.querySelector('.buddy-chat-activity-group.is-active')).toBeNull()
    expect(root.querySelector('.buddy-chat-run-activity__label')?.textContent).toContain('等待模型响应')
    expect(header.getAttribute('aria-expanded')).toBe('true')
    turn.value = { ...turn.value, nodes: [...turn.value.nodes, readTool('three', 'awaiting_approval')], progress: { phase: 'awaiting_approval', toolName: 'read' } }
    await nextTick()
    expect(root.querySelector('.buddy-chat-run-activity')).toBeNull()
    expect(root.querySelector('.buddy-chat-tool.is-awaiting_approval')?.textContent).toContain('等待批准')
  })

  it('mounts expensive details only on request, keeps manual state through completion and group collapse', async () => {
    const node = readTool('one', 'running')
    const { root, turn } = mountTurn([{ id: 'thought', contentIndex: 0, kind: 'reasoning', status: 'completed', text: '**A thought**' }, node])
    const group = () => root.querySelector<HTMLButtonElement>('.buddy-chat-activity-group__header')!
    expect(root.querySelector('.buddy-chat-tool')).toBeNull()
    expect(root.querySelector('.buddy-chat-reasoning-entry__body')).toBeNull()
    group().click()
    await nextTick()
    expect(root.querySelector('.buddy-chat-tool-details')).toBeNull()
    root.querySelector<HTMLButtonElement>('.buddy-chat-tool__header')!.click()
    await nextTick()
    const toolElement = root.querySelector('.buddy-chat-tool')
    const details = root.querySelector('.buddy-chat-tool-details')
    expect(details?.textContent).toContain('x'.repeat(100))
    turn.value = { ...turn.value, completedAt: '2026-09-09T00:00:10Z', status: 'completed', nodes: [turn.value.nodes[0]!, { ...node, status: 'completed' }] }
    await nextTick()
    expect(root.querySelector('.buddy-chat-tool')).toBe(toolElement)
    expect(root.querySelector('.buddy-chat-tool-details')).toBe(details)
    expect(group().getAttribute('aria-expanded')).toBe('true')
    group().click()
    await nextTick()
    await vi.waitFor(() => expect(root.querySelector('.buddy-chat-tool-details')).toBeNull())
    group().click()
    await nextTick()
    expect(root.querySelector('.buddy-chat-tool__header')?.getAttribute('aria-expanded')).toBe('true')
    expect(root.querySelector('.buddy-chat-tool-details')).not.toBeNull()
  })

  it('opens pure thinking directly, shows its content once and retains it when tools arrive', async () => {
    const title = 'Investigating image upload naming'
    const thought: ChatAgentTurnNode = { id: 'thought', contentIndex: 0, kind: 'reasoning', status: 'completed', text: `**${title}**` }
    const { root, turn } = mountTurn([thought])
    expect(root.querySelector('.buddy-chat-reasoning-entry__body')).toBeNull()
    root.querySelector<HTMLButtonElement>('.buddy-chat-activity-group__header')!.click()
    await nextTick()
    const body = root.querySelector('.buddy-chat-reasoning-entry__body')
    expect(root.querySelectorAll('button[aria-expanded]')).toHaveLength(1)
    expect(root.textContent?.split(title)).toHaveLength(2)
    expect(body?.textContent?.trim()).toBe(title)
    turn.value = { ...turn.value, nodes: [thought, readTool('one', 'running')] }
    await nextTick()
    expect(root.querySelector('.buddy-chat-reasoning-entry__body')).toBe(body)
    expect(root.textContent?.split(title)).toHaveLength(2)
    expect(root.querySelector('.buddy-chat-tool-details')).toBeNull()
  })

  it('shows a single finished tool directly and retains its open output when a group forms', async () => {
    const node = readTool('one', 'completed')
    const { root, turn } = mountTurn([node], 'completed')
    expect(root.querySelectorAll('button[aria-expanded]')).toHaveLength(1)
    root.querySelector<HTMLButtonElement>('.buddy-chat-tool__header')!.click()
    await nextTick()
    const tool = root.querySelector('.buddy-chat-tool')
    const details = root.querySelector('.buddy-chat-tool-details')
    expect(details).not.toBeNull()
    turn.value = { ...turn.value, nodes: [node, readTool('two', 'completed')] }
    await nextTick()
    expect(root.querySelector('.buddy-chat-activity-group__header')?.getAttribute('aria-expanded')).toBe('true')
    expect(root.querySelector('.buddy-chat-tool')).toBe(tool)
    expect(root.querySelector('.buddy-chat-tool-details')).toBe(details)
    expect(root.querySelectorAll('.buddy-chat-tool-details')).toHaveLength(1)
  })

  it('compacts consecutive reads while retaining each call, keyboard labels and open output', async () => {
    const nodes = [readTool('one', 'completed'), readTool('two', 'completed'), readTool('three', 'awaiting_approval')]
    const { root, turn } = mountTurn(nodes)
    root.querySelector<HTMLButtonElement>('.buddy-chat-activity-group__header')!.click()
    await nextTick()
    const first = root.querySelector('[data-tool-call-id="one"]')!
    const second = root.querySelector('[data-tool-call-id="two"]')!
    expect(root.querySelectorAll('.is-compact-continuation')).toHaveLength(1)
    expect(second.querySelector('button')?.getAttribute('aria-label')).toContain('读取文件 · src/Row.vue')
    second.querySelector('button')!.click()
    await nextTick()
    const output = root.querySelector('[data-tool-detail-id="two"]')
    expect(output).not.toBeNull()
    expect(root.querySelectorAll('.is-compact-continuation')).toHaveLength(1)
    expect(second.compareDocumentPosition(output!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    turn.value = { ...turn.value, nodes: [...nodes, readTool('four', 'completed')] }
    await nextTick()
    expect(root.querySelector('[data-tool-call-id="one"]')).toBe(first)
    expect(root.querySelector('[data-tool-call-id="two"]')).toBe(second)
    expect(root.querySelector('[data-tool-detail-id="two"]')).toBe(output)
    expect(root.querySelector('[data-tool-call-id="three"]')?.classList.contains('is-awaiting_approval')).toBe(true)
  })

  it('cycles issues from a collapsed group and focuses denied tools even when no details are available', async () => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { value: () => {}, configurable: true })
    cleanups.push(() => {
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
    })
    const { root } = mountTurn([readTool('failed', 'failed'), readTool('ok', 'completed'), readTool('denied', 'denied')])
    const issue = root.querySelector<HTMLButtonElement>('.buddy-chat-activity-group__issues')!
    expect(issue.textContent).toContain('2 项异常')
    expect(root.querySelector('.buddy-chat-tool-details')).toBeNull()
    issue.click()
    await nextTick()
    await nextTick()
    expect(root.querySelector('.buddy-chat-activity-group__header')?.getAttribute('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(root.querySelector('[data-tool-call-id="failed"] button'))
    const details = root.querySelector('[data-tool-detail-id="failed"]')
    expect(details?.textContent).toContain('x'.repeat(100))
    expect(details?.querySelector('.buddy-chat-tool-read__numbers')).toBeNull()
    issue.click()
    await nextTick()
    await nextTick()
    expect(document.activeElement).toBe(root.querySelector('[data-tool-call-id="denied"]'))
    expect(root.querySelector('[data-tool-detail-id="denied"]')).toBeNull()
    expect(root.querySelector('.is-highlighted')?.getAttribute('data-tool-call-id')).toBe('denied')
    issue.click()
    await nextTick()
    await nextTick()
    expect(document.activeElement).toBe(root.querySelector('[data-tool-call-id="failed"] button'))
    expect(root.querySelector('[data-tool-detail-id="failed"]')).toBe(details)
    expect(root.querySelector('button button')).toBeNull()
  })

  it('keeps hundreds of historical headers and an open read stable through streaming and completion', async () => {
    const history = Array.from({ length: 500 }, (_, index) => readTool(`history-${index}`, 'completed'))
    const current = readTool('stream', 'running')
    const { root, turn } = mountTurn([...history, current])
    root.querySelector<HTMLButtonElement>('.buddy-chat-activity-group__header')!.click()
    await nextTick()
    expect(root.querySelector('.buddy-chat-tool-details')).toBeNull()
    const headers = [...root.querySelectorAll<HTMLButtonElement>('.buddy-chat-tool__header')]
    headers[250]!.click()
    await nextTick()
    const details = root.querySelector('[data-tool-detail-id="history-250"]')
    expect(details?.querySelectorAll('pre')).toHaveLength(2)
    for (let index = 0; index < 10; index++) {
      turn.value = { ...turn.value, nodes: [...history, { ...current, presentation: { ...current.presentation, output: `delta-${index}` } }] }
      await nextTick()
      expect([...root.querySelectorAll('.buddy-chat-tool__header')]).toEqual(headers)
      expect(root.querySelectorAll('.buddy-chat-tool-details')).toHaveLength(1)
      expect(root.querySelector('[data-tool-detail-id="history-250"]')).toBe(details)
    }
    turn.value = { ...turn.value, nodes: [...history, { ...current, status: 'completed' }] }
    await nextTick()
    expect([...root.querySelectorAll('.buddy-chat-tool__header')]).toEqual(headers)
    expect(root.querySelector('[data-tool-detail-id="history-250"]')).toBe(details)
    expect(root.querySelectorAll('.is-compact-continuation')).toHaveLength(500)
  })

  it('collapses a long group from its footer and returns keyboard focus to its header', async () => {
    const { root } = mountTurn(Array.from({ length: 12 }, (_, index) => readTool(String(index), 'completed')))
    const header = root.querySelector<HTMLButtonElement>('.buddy-chat-activity-group__header')!
    header.scrollIntoView = () => {}
    header.click()
    await nextTick()
    root.querySelector<HTMLButtonElement>('.buddy-chat-activity-group__collapse')!.click()
    await nextTick()
    expect(header.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(header)
    await vi.waitFor(() => expect(root.querySelector('.buddy-chat-tool')).toBeNull())
  })

  it('keeps details usable when a disclosure is reopened before its leave transition finishes', async () => {
    const { root } = mountTurn([readTool('one', 'completed'), readTool('two', 'completed')])
    const header = root.querySelector<HTMLButtonElement>('.buddy-chat-activity-group__header')!
    header.click()
    await nextTick()
    root.querySelector<HTMLButtonElement>('.buddy-chat-tool__header')!.click()
    await nextTick()
    header.click()
    await nextTick()
    header.click()
    await nextTick()
    await vi.waitFor(() => {
      expect(root.querySelectorAll('.buddy-chat-tool')).toHaveLength(2)
      expect(root.querySelectorAll('.buddy-chat-tool-details')).toHaveLength(1)
      expect(root.querySelector('.buddy-chat-activity-group__content')?.hasAttribute('inert')).toBe(false)
    })
    expect(root.querySelector('.buddy-chat-tool__header')?.getAttribute('aria-expanded')).toBe('true')
  })
})

function mountTurn(nodes: ChatAgentTurnNode[], status: ChatAgentTurn['status'] = 'running') {
  const turn = shallowRef<ChatAgentTurn>({ branchId: 'branch', runId: 'run', completedAt: null, finalMessageId: null, nodes, processMessageIds: [], progress: null, reasoningLevel: null, startedAt: '2026-09-09T00:00:00Z', status, triggeringMessageId: 'question', usage: null })
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp({
    setup: () => () => [
      h(BuddyChatAgentTurn, { language: 'zh-CN', turn: turn.value }),
      ...turn.value.status === 'running' ? [h(BuddyChatRunActivity, { language: 'zh-CN', turn: turn.value })] : [],
    ],
  })
  app.provide(chatToolActionsKey, { canPreviewFile: () => false, previewFile: () => {}, writeClipboardText: async () => {} })
  app.mount(root)
  cleanups.push(() => {
    app.unmount()
    root.remove()
  })
  return { root, turn }
}

function readTool(id: string, status: ChatAgentToolNode['status']): ChatAgentToolNode & { presentation: Extract<ChatAgentToolNode['presentation'], { card: 'read' }> } {
  return { id: `tool:${id}`, toolCallId: id, toolName: 'read', kind: 'tool', status, isError: false, description: null, presentation: { card: 'read', path: 'src/Row.vue', lineStart: 1, language: 'vue', description: null, output: 'x'.repeat(64 * 1024), truncated: false } }
}
