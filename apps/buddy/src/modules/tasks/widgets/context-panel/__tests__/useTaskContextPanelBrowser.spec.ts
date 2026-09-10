import type { LocalChangeSetSummary } from '@buddy-shared/changes/changeApi'
import type { LocalRunEvent } from '@buddy-shared/runs/runApi'

import { describe, expect, it } from 'vitest'
import { nextTick, shallowRef } from 'vue'
import { useTaskContextPanel } from '../useTaskContextPanel'

describe('useTaskContextPanel browser tab', () => {
  it('restores the visible browser tab when returning to a conversation', async () => {
    const activeConversationId = shallowRef<string | null>('conversation-1')
    const panel = useTaskContextPanel({
      spaces: shallowRef([]),
      activeConversationId,
      activeRunId: shallowRef(null),
      changeSets: shallowRef([]),
      runSignalEvents: shallowRef([]),
      runOutputs: shallowRef([]),
    })

    await nextTick()
    panel.openBrowser()

    activeConversationId.value = 'conversation-2'
    await nextTick()
    expect(panel.isOpen.value).toBe(true)
    panel.openBrowser()

    activeConversationId.value = 'conversation-1'
    await nextTick()
    expect(panel.isOpen.value).toBe(true)
    expect(panel.activeTab.value).toMatchObject({
      conversationId: 'conversation-1',
      id: 'browser:conversation-1',
      kind: 'browser',
    })

    activeConversationId.value = 'conversation-2'
    await nextTick()
    expect(panel.isOpen.value).toBe(true)
    expect(panel.activeTab.value).toMatchObject({
      conversationId: 'conversation-2',
      id: 'browser:conversation-2',
      kind: 'browser',
    })

    panel.closeTab('browser:conversation-2')
    activeConversationId.value = 'conversation-1'
    await nextTick()
    activeConversationId.value = 'conversation-2'
    await nextTick()
    expect(panel.isOpen.value).toBe(true)
    expect(panel.tabs.value).toEqual([])
  })

  it('reveals the browser when the active run starts opening a page', async () => {
    const activeConversationId = shallowRef<string | null>('conversation-1')
    const activeRunId = shallowRef<string | null>(null)
    const runEvents = shallowRef<ReadonlyArray<LocalRunEvent>>([])
    const changeSets = shallowRef<ReadonlyArray<LocalChangeSetSummary>>([
      changeSet('changes-1', 'conversation-1'),
    ])
    const panel = useTaskContextPanel({
      spaces: shallowRef([]),
      activeConversationId,
      activeRunId,
      changeSets,
      runSignalEvents: runEvents,
      runOutputs: shallowRef([]),
    })

    await nextTick()
    panel.openChanges('changes-1')
    expect(panel.activeTab.value?.kind).toBe('changes')

    activeRunId.value = 'run-1'
    runEvents.value = [browserOpenStarted('run-1', 'tool-1')]
    await nextTick()

    expect(panel.isOpen.value).toBe(true)
    expect(panel.activeTab.value).toMatchObject({
      conversationId: 'conversation-1',
      kind: 'browser',
    })
  })

  it('respects a manual collapse for the rest of the run', async () => {
    const activeConversationId = shallowRef<string | null>('conversation-1')
    const activeRunId = shallowRef<string | null>('run-1')
    const runEvents = shallowRef<ReadonlyArray<LocalRunEvent>>([
      browserOpenStarted('run-1', 'tool-1'),
    ])
    const panel = useTaskContextPanel({
      spaces: shallowRef([]),
      activeConversationId,
      activeRunId,
      changeSets: shallowRef([]),
      runSignalEvents: runEvents,
      runOutputs: shallowRef([]),
    })

    await nextTick()
    expect(panel.isOpen.value).toBe(true)

    panel.toggle()
    runEvents.value = [
      ...runEvents.value,
      browserOpenStarted('run-1', 'tool-2'),
    ]
    await nextTick()
    expect(panel.isOpen.value).toBe(false)

    activeRunId.value = 'run-2'
    runEvents.value = [
      ...runEvents.value,
      browserOpenStarted('run-2', 'tool-1'),
    ]
    await nextTick()
    expect(panel.isOpen.value).toBe(true)
  })

  it('still reveals the first browser page after unrelated context was collapsed', async () => {
    const activeConversationId = shallowRef<string | null>('conversation-1')
    const activeRunId = shallowRef<string | null>('run-1')
    const runEvents = shallowRef<ReadonlyArray<LocalRunEvent>>([])
    const panel = useTaskContextPanel({
      spaces: shallowRef([]),
      activeConversationId,
      activeRunId,
      changeSets: shallowRef([changeSet('changes-1', 'conversation-1')]),
      runSignalEvents: runEvents,
      runOutputs: shallowRef([]),
    })

    await nextTick()
    panel.openChanges('changes-1')
    panel.toggle()
    expect(panel.isOpen.value).toBe(false)

    runEvents.value = [browserOpenStarted('run-1', 'tool-1')]
    await nextTick()
    expect(panel.isOpen.value).toBe(true)
    expect(panel.activeTab.value?.kind).toBe('browser')
  })
})

function changeSet(
  changeSetId: string,
  conversationId: string,
): LocalChangeSetSummary {
  return {
    changeSetId,
    conversationId,
    coverage: 'complete',
    fileCount: 1,
    runId: `run-${changeSetId}`,
    status: 'completed',
    updatedAt: '2026-09-02T00:00:00.000Z',
  }
}

function browserOpenStarted(runId: string, toolCallId: string): LocalRunEvent {
  return {
    createdAt: '2026-09-02T00:00:00.000Z',
    payload: {
      presentation: {
        actionKind: null,
        card: 'browser',
        description: null,
        documentRevision: null,
        elementCount: null,
        errorCode: null,
        fieldType: null,
        inputLength: null,
        observationTruncated: null,
        operation: 'open',
        origin: 'https://example.com',
        output: null,
        pageId: null,
        pageStatus: null,
        pathname: '/',
        sessionId: null,
        status: 'running',
        truncated: false,
      },
      toolCallId,
      toolName: 'lexora_browser_open',
    },
    runId,
    sequence: 1,
    type: 'tool.started',
  }
}
