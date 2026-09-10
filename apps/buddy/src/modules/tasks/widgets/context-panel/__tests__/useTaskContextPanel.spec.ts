import type { LocalArtifact } from '@buddy-shared/artifacts/artifactApi'
import type { LocalChangeSetSummary } from '@buddy-shared/changes/changeApi'
import type { LocalRunOutput } from '@buddy-shared/runs/runApi'
import type { LocalSpace } from '@buddy-shared/spaces/spaceApi'

import { describe, expect, it } from 'vitest'
import { nextTick, shallowRef } from 'vue'
import { useTaskContextPanel } from '../useTaskContextPanel'

describe('useTaskContextPanel', () => {
  it('opens without a conversation and preserves manual tabs and visibility across task changes', async () => {
    const activeConversationId = shallowRef<string | null>(null)
    const panel = useTaskContextPanel({
      spaces: shallowRef([]),
      activeConversationId,
      activeRunId: shallowRef(null),
      changeSets: shallowRef([]),
      runSignalEvents: shallowRef([]),
      runOutputs: shallowRef([]),
    })
    panel.toggle()
    expect(panel.isOpen.value).toBe(true)
    expect(panel.canAddChanges.value).toBe(false)
    panel.openChanges()
    expect(panel.tabs.value).toEqual([])
    panel.addBrowser()
    const first = panel.activeTab.value!
    expect(first).toMatchObject({ kind: 'browser', conversationId: null })
    panel.addBrowser()
    const second = panel.activeTab.value!
    expect(second.id).not.toBe(first.id)

    for (const conversationId of ['conversation-1', 'conversation-2', null]) {
      activeConversationId.value = conversationId
      await nextTick()
      expect(panel.tabs.value).toEqual([first, second])
      expect(panel.activeTab.value).toEqual(second)
      expect(panel.isOpen.value).toBe(true)
      expect(panel.canAddChanges.value).toBe(conversationId !== null)
    }
    panel.toggle()
    activeConversationId.value = 'conversation-1'
    await nextTick()
    expect(panel.isOpen.value).toBe(false)
    panel.toggle()
    expect(panel.activeTab.value).toEqual(second)
  })

  it('retains a file tab in its source space and removes it when the binding changes', async () => {
    const space = fileSpace()
    const spaces = shallowRef<readonly LocalSpace[]>([space])
    const activeSpace = shallowRef<LocalSpace | null>(space)
    const activeConversationId = shallowRef<string | null>(null)
    const panel = useTaskContextPanel({
      spaces,
      activeSpace,
      activeConversationId,
      activeRunId: shallowRef(null),
      changeSets: shallowRef([]),
      runSignalEvents: shallowRef([]),
      runOutputs: shallowRef([]),
    })
    panel.openFiles('space')
    const fileTab = panel.activeTab.value!
    panel.selectFile(fileTab.id, 'README.md')
    expect(panel.activeTab.value).toMatchObject({ kind: 'files', target: { spaceId: space.id, revision: 1, path: 'README.md' } })
    activeSpace.value = null
    activeConversationId.value = 'unbound-conversation'
    await nextTick()
    expect(panel.activeTab.value?.id).toBe(fileTab.id)
    expect(panel.tabs.value).toHaveLength(1)
    panel.addBrowser()
    const browserTab = panel.activeTab.value
    spaces.value = [{ ...space, primaryDirectory: { ...space.primaryDirectory!, revision: 2 } }]
    await nextTick()
    expect(panel.tabs.value).toEqual([browserTab])
    expect(panel.isOpen.value).toBe(true)
    spaces.value = [space]
    await nextTick()
    expect(panel.tabs.value).toEqual([browserTab])
  })

  it('opens conversation resources only after an explicit user action', async () => {
    const activeConversationId = shallowRef<string | null>('conversation-1')
    const runOutputs = shallowRef<ReadonlyArray<LocalRunOutput>>([
      output('run-1', [
        artifact('artifact-1', 'conversation-1', 'first.png'),
        artifact('artifact-2', 'conversation-1', 'second.png'),
      ]),
    ])
    const panel = useTaskContextPanel({
      spaces: shallowRef([]),
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

    expect(panel.isOpen.value).toBe(true)
    expect(panel.artifactCount.value).toBe(1)
    expect(panel.tabs.value).toEqual([])
    expect(panel.activeTab.value).toBeNull()

    panel.openArtifact('artifact-3')
    expect(panel.isOpen.value).toBe(true)
    expect(panel.tabs.value.map(tab => 'label' in tab ? tab.label : 'Browser'))
      .toEqual(['third.png'])

    activeConversationId.value = null
    await nextTick()
    expect(panel.isOpen.value).toBe(true)
    expect(panel.tabs.value).toEqual([])
  })

  it('opens a run change set in the current conversation context', async () => {
    const activeConversationId = shallowRef<string | null>('conversation-1')
    const changeSets = shallowRef<ReadonlyArray<LocalChangeSetSummary>>([
      changeSet('changes-1', 'conversation-1', 2),
      changeSet('changes-2', 'conversation-2', 1),
    ])
    const panel = useTaskContextPanel({
      spaces: shallowRef([]),
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
      id: 'changes:conversation-1',
      kind: 'changes',
    })

    panel.openChanges()
    expect(panel.tabs.value).toHaveLength(1)
    expect(panel.activeTab.value).toMatchObject({ changeSet: null })
    panel.openChanges('changes-1')
    expect(panel.tabs.value).toHaveLength(1)

    activeConversationId.value = 'conversation-2'
    await nextTick()
    expect(panel.isOpen.value).toBe(true)
    expect(panel.tabs.value).toEqual([])
  })
})

function fileSpace(): LocalSpace {
  const now = '2026-09-10T00:00:00.000Z'
  return {
    id: 'space',
    name: 'Files',
    icon: 'folder',
    iconColor: 'default',
    memoryScope: 'space_only',
    activeRunCount: 0,
    additionalDirectories: [],
    revokedAt: null,
    createdAt: now,
    updatedAt: now,
    primaryDirectory: {
      id: 'directory',
      spaceId: 'space',
      root: '/workspace',
      canonicalRoot: '/workspace',
      revision: 1,
      accessGrantedAt: now,
      resourcesTrustedAt: now,
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
    },
  }
}

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
