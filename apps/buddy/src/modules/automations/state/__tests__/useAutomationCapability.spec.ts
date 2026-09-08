import type { LocalRunEvent } from '@buddy-shared/runs/runApi'

import { describe, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'
import { useAutomationCapability } from '../useAutomationCapability'

describe('useAutomationCapability', () => {
  it('publishes localized failure feedback only for automation runs', async () => {
    vi.useFakeTimers()
    const errors: string[] = []
    let receiveRunEvent: (event: LocalRunEvent) => void = () => {}
    const capability = useAutomationCapability({
      api: {
        automations: {
          onChanged: () => () => {},
        },
        chat: {
          onRunEvent: (listener: typeof receiveRunEvent) => {
            receiveRunEvent = listener
            return () => {}
          },
        },
        runs: {
          get: async (runId: string) => ({ purpose: runId === 'automation-run' ? 'automation' : 'chat' }),
        },
      } as never,
      language: shallowRef('en-US'),
      onRunFailure: error => errors.push(error),
    })

    for (const runId of ['automation-run', 'chat-run']) {
      receiveRunEvent({
        createdAt: '2026-09-08T00:00:00.000Z',
        payload: {},
        runId,
        sequence: 1,
        type: 'run.failed',
      })
    }
    await Promise.resolve()

    expect(errors).toEqual(['Automation failed. Check run history for details.'])
    capability.dispose()
  })

  it('ignores failure feedback resolved after capability disposal', async () => {
    vi.useFakeTimers()
    const errors: string[] = []
    let receiveRunEvent: (event: LocalRunEvent) => void = () => {}
    let resolveRun!: (run: { purpose: string }) => void
    const pendingRun = new Promise<{ purpose: string }>((resolve) => {
      resolveRun = resolve
    })
    const capability = useAutomationCapability({
      api: {
        automations: {
          onChanged: () => () => {},
        },
        chat: {
          onRunEvent: (listener: typeof receiveRunEvent) => {
            receiveRunEvent = listener
            return () => {}
          },
        },
        runs: {
          get: () => pendingRun,
        },
      } as never,
      language: shallowRef('en-US'),
      onRunFailure: error => errors.push(error),
    })

    receiveRunEvent({
      createdAt: '2026-09-08T00:00:00.000Z',
      payload: {},
      runId: 'automation-run',
      sequence: 1,
      type: 'run.failed',
    })
    capability.dispose()
    resolveRun({ purpose: 'automation' })
    await pendingRun

    expect(errors).toEqual([])
  })

  it('owns independent cursor pagination for definitions and occurrences', async () => {
    const list = vi.fn(async ({ cursor }: { cursor?: string }) => cursor
      ? { items: [{ id: 'automation-2' }], nextCursor: null }
      : { items: [{ id: 'automation-1' }], nextCursor: 'definitions-next' })
    const listOccurrences = vi.fn(async ({ cursor }: { cursor?: string }) => cursor
      ? { items: [{ id: 'occurrence-2' }], nextCursor: null }
      : { items: [{ id: 'occurrence-1' }], nextCursor: 'occurrences-next' })
    const capability = useAutomationCapability({
      api: {
        automations: {
          list,
          listOccurrences,
          onChanged: vi.fn(() => vi.fn()),
        },
        chat: {
          cancel: vi.fn(),
          onRunEvent: vi.fn(() => vi.fn()),
        },
      } as never,
      language: shallowRef('zh-CN'),
    })

    await capability.initialize()
    await capability.loadMoreAutomations()
    await capability.loadMoreOccurrences()

    expect(capability.automations.value).toMatchObject({
      items: [{ id: 'automation-1' }, { id: 'automation-2' }],
      nextCursor: null,
    })
    expect(capability.occurrences.value).toMatchObject({
      items: [{ id: 'occurrence-1' }, { id: 'occurrence-2' }],
      nextCursor: null,
    })
    expect(list).toHaveBeenLastCalledWith({ cursor: 'definitions-next', limit: 100 })
    expect(listOccurrences).toHaveBeenLastCalledWith({ cursor: 'occurrences-next', limit: 100 })
    capability.dispose()
  })
})
