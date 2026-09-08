import type { LocalArtifact } from '@buddy-shared/artifacts/artifactApi'
import type { LocalChangeSetSummary } from '@buddy-shared/changes/changeApi'
import type { LocalRunOutput } from '@buddy-shared/runs/runApi'

import { describe, expect, it } from 'vitest'
import { nextTick, shallowRef } from 'vue'
import { useTaskContextPanel } from '../useTaskContextPanel'

describe('useTaskContextPanel', () => {
  it('opens conversation resources only after an explicit user action', async () => {
    const activeConversationId = shallowRef<string | null>('conversation-1')
    const runOutputs = shallowRef<ReadonlyArray<LocalRunOutput>>([
      output('run-1', [
        artifact('artifact-1', 'conversation-1', 'first.png'),
        artifact('artifact-2', 'conversation-1', 'second.png'),
      ]),
    ])
    const panel = useTaskContextPanel({
      activeConversationId,
      activeRunId: shallowRef(null),
      changeSets: shallowRef([]),
      runSignalEvents: shallowRef([]),
      runOutputs,
    })

    await nextTick()
    expect(panel.artifactCount.value).toBe(2)
    expect(panel.tabs.value).toEqual([])
    expect(panel.activeTab.value).toBeNull()

    panel.toggle()
    expect(panel.isOpen.value).toBe(true)
    expect(panel.tabs.value).toEqual([])
    expect(panel.activeTab.value).toBeNull()

    panel.openArtifact('artifact-2')
    expect(panel.tabs.value.map(tab => 'label' in tab ? tab.label : 'Browser'))
      .toEqual(['second.png'])
    expect(panel.activeTab.value).toMatchObject({ label: 'second.png' })

    runOutputs.value = [
      ...runOutputs.value,
      output('run-1-later', [artifact('artifact-later', 'conversation-1', 'later.png')]),
    ]
    await nextTick()
    expect(panel.artifactCount.value).toBe(3)
    expect(panel.tabs.value.map(tab => 'label' in tab ? tab.label : 'Browser'))
      .toEqual(['second.png'])

    panel.openArtifact('artifact-1')
    expect(panel.tabs.value.map(tab => 'label' in tab ? tab.label : 'Browser')).toEqual([
      'second.png',
      'first.png',
    ])
    expect(panel.activeTab.value).toMatchObject({ label: 'first.png' })

    panel.closeTab('artifact:artifact-1')
    expect(panel.tabs.value.map(tab => 'label' in tab ? tab.label : 'Browser'))
      .toEqual(['second.png'])
    expect(panel.activeTab.value).toMatchObject({ label: 'second.png' })

    activeConversationId.value = 'conversation-2'
    runOutputs.value = [output('run-2', [
      artifact('artifact-3', 'conversation-2', 'third.png'),
    ])]
    await nextTick()

    expect(panel.isOpen.value).toBe(false)
    expect(panel.artifactCount.value).toBe(1)
    expect(panel.tabs.value).toEqual([])
    expect(panel.activeTab.value).toBeNull()

    panel.openArtifact('artifact-3')
    expect(panel.isOpen.value).toBe(true)
    expect(panel.tabs.value.map(tab => 'label' in tab ? tab.label : 'Browser'))
      .toEqual(['third.png'])

    activeConversationId.value = null
    await nextTick()
    expect(panel.isOpen.value).toBe(false)
    expect(panel.tabs.value).toEqual([])
  })

  it('opens a run change set in the current conversation context', async () => {
    const activeConversationId = shallowRef<string | null>('conversation-1')
    const changeSets = shallowRef<ReadonlyArray<LocalChangeSetSummary>>([
      changeSet('changes-1', 'conversation-1', 2),
      changeSet('changes-2', 'conversation-2', 1),
    ])
    const panel = useTaskContextPanel({
      activeConversationId,
      activeRunId: shallowRef(null),
      changeSets,
      runSignalEvents: shallowRef([]),
      runOutputs: shallowRef([]),
    })

    await nextTick()
    expect(panel.artifactCount.value).toBe(0)
    panel.openChanges('changes-2')
    expect(panel.isOpen.value).toBe(false)
    expect(panel.tabs.value).toEqual([])

    panel.openChanges('changes-1')
    expect(panel.isOpen.value).toBe(true)
    expect(panel.activeTab.value).toMatchObject({
      changeSet: { changeSetId: 'changes-1', fileCount: 2 },
      id: 'changes:changes-1',
      kind: 'changes',
    })

    activeConversationId.value = 'conversation-2'
    await nextTick()
    expect(panel.isOpen.value).toBe(false)
    expect(panel.tabs.value).toEqual([])
  })
})

function changeSet(
  changeSetId: string,
  conversationId: string,
  fileCount: number,
): LocalChangeSetSummary {
  return {
    changeSetId,
    conversationId,
    coverage: 'complete',
    fileCount,
    runId: `run-${changeSetId}`,
    status: 'completed',
    updatedAt: '2026-08-27T00:00:00.000Z',
  }
}

function output(runId: string, artifacts: ReadonlyArray<LocalArtifact>): LocalRunOutput {
  return {
    artifacts,
    createdAt: '2026-08-27T00:00:00.000Z',
    runId,
    sourceToolCallId: `tool-${runId}`,
  }
}

function artifact(
  artifactId: string,
  conversationId: string,
  path: string,
  kind: LocalArtifact['kind'] = 'file',
): LocalArtifact {
  const name = path.split('/').at(-1)!
  return {
    artifactId,
    conversationId,
    createdAt: '2026-08-27T00:00:00.000Z',
    kind,
    mimeType: kind === 'directory' ? 'inode/directory' : 'image/png',
    name,
    path: `/workspace/${path}`,
    previewUrl: null,
    runId: `run-${artifactId}`,
    sizeBytes: kind === 'directory' ? 0 : 1,
    sourceArtifactId: null,
    sourceToolCallId: `tool-${artifactId}`,
    updatedAt: '2026-08-27T00:00:00.000Z',
  }
}
