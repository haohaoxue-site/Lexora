import type { ToolDefinition } from '@earendil-works/pi-coding-agent'
import type { ProcessSystemTarget, SystemHostPort } from '../systemCapability'
import { describe, expect, it } from 'vitest'
import { createSystemCapability } from '../systemExtension'

describe('system session capability', () => {
  it('shares preparation with its own executor but never with another session', async () => {
    const target: ProcessSystemTarget = {
      allowedActions: ['terminate-process'],
      displayName: 'disposable-fixture',
      executable: '/workspace/disposable-fixture',
      instanceId: '42',
      interruption: 'application',
      kind: 'process',
      pid: 12345,
      startedAt: '2026-01-01T00:00:00Z',
    }
    let running = true
    const host: SystemHostPort = {
      resolveTargets: async () => running ? [target] : [],
      readTarget: async () => running ? target : null,
      execute: async () => { running = false },
    }
    const first = createSystemCapability(host)
    const second = createSystemCapability(host)
    const signal = new AbortController().signal
    const input = { action: 'terminate-process', reason: 'Stop the disposable fixture', target: { kind: 'process', pid: 12345 } }
    const event = { type: 'tool_call' as const, toolName: 'lexora_system_action', toolCallId: 'same-call-id', input }
    expect(await first.classify(event, signal)).toMatchObject({ forceAsk: true, approval: { systemAction: { target: { pid: 12345 } } } })
    const tools: ToolDefinition[] = []
    for (const capability of [first, second]) {
      capability.extension.factory({ registerTool: (tool: ToolDefinition) => tools.push(tool), on: () => {} } as never)
    }
    const unprepared = await tools[1]!.execute(event.toolCallId, input, signal, undefined, {} as never)
    expect(unprepared.details).toMatchObject({ code: 'SYSTEM_ACTION_NOT_PREPARED' })
    expect(running).toBe(true)
    const completed = await tools[0]!.execute(event.toolCallId, input, signal, undefined, {} as never)
    expect(completed.details).toMatchObject({ receipt: { status: 'completed', verified: true } })
    expect(running).toBe(false)
    const repeated = await tools[0]!.execute(event.toolCallId, input, signal, undefined, {} as never)
    expect(repeated.details).toMatchObject({ code: 'SYSTEM_ACTION_NOT_PREPARED' })
  })
})
