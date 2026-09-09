import type { LocalRunEvent } from '@buddy-shared/runs/runApi'

import type { TaskContextTab } from './taskContextPanel'
import type { UseTaskContextPanelOptions } from './typing'
import { computed, readonly, shallowRef, watch } from 'vue'
import {
  artifactTabId,
  browserTabId,
  changeTabId,
  spaceTaskArtifactTabs,
  spaceTaskBrowserTab,
} from './taskContextPanel'

export function useTaskContextPanel(options: UseTaskContextPanelOptions) {
  const isOpen = shallowRef(false)
  const activeTabId = shallowRef<string | null>(null)
  const openTabIds = shallowRef<ReadonlyArray<string>>([])
  const resourceTabs = shallowRef<ReadonlyArray<TaskContextTab>>([])
  const handledBrowserOpenKeys = new Set<string>()
  const suppressedBrowserRunIds = new Set<string>()
  const panels = new Map<string, { tabs: ReadonlyArray<TaskContextTab>, ids: ReadonlyArray<string>, activeId: string | null, open: boolean }>()
  const availableTabs = computed(() => {
    const browserTab = spaceTaskBrowserTab(options.activeConversationId.value)
    const candidates = [
      ...resourceTabs.value.filter(isAvailable),
      ...spaceTaskArtifactTabs(options.runOutputs.value),
      ...(browserTab ? [browserTab] : []),
    ].filter(tab => contextTabConversationId(tab) === options.activeConversationId.value)
    return [...new Map(candidates.map(tab => [tab.id, tab])).values()]
  })
  const availableTabsById = computed(() => new Map(
    availableTabs.value.map(tab => [tab.id, tab]),
  ))
  const tabs = computed(() => openTabIds.value.flatMap(
    tabId => availableTabsById.value.get(tabId) ?? [],
  ))
  const activeTab = computed(() => (
    tabs.value.find(tab => tab.id === activeTabId.value) ?? null
  ))
  const artifactCount = computed(() => availableTabs.value.filter(
    tab => tab.kind === 'artifact',
  ).length)

  let currentConversationId: string | null = null
  watch(
    [options.activeConversationId, availableTabs],
    ([conversationId, nextAvailableTabs]) => {
      const conversationChanged = conversationId !== currentConversationId
      if (conversationChanged && currentConversationId)
        panels.set(currentConversationId, { tabs: resourceTabs.value, ids: openTabIds.value, activeId: activeTabId.value, open: isOpen.value })
      currentConversationId = conversationId
      if (!conversationId) {
        resetPanel()
        return
      }
      if (conversationChanged) {
        const previous = panels.get(conversationId)
        if (!previous?.ids.length) {
          resetPanel()
          return
        }
        resourceTabs.value = previous.tabs.filter(isAvailable)
        openTabIds.value = previous.ids
        activeTabId.value = previous.activeId
        isOpen.value = previous.open
        return
      }
      const availableIds = nextAvailableTabs.map(tab => tab.id)
      const retainedIds = openTabIds.value.filter(tabId => availableIds.includes(tabId))
      openTabIds.value = retainedIds
      if (activeTabId.value && openTabIds.value.includes(activeTabId.value))
        return
      activeTabId.value = openTabIds.value.at(-1) ?? null
    },
    { immediate: true },
  )
  watch(
    [options.activeConversationId, options.activeRunId, options.runSignalEvents],
    ([conversationId, activeRunId, runSignalEvents]) => {
      if (!conversationId || !activeRunId)
        return
      for (const event of runSignalEvents) {
        const toolCallId = browserOpenToolCallId(event, activeRunId)
        const eventKey = toolCallId ? `${activeRunId}:${toolCallId}` : null
        if (!eventKey || handledBrowserOpenKeys.has(eventKey))
          continue
        handledBrowserOpenKeys.add(eventKey)
        if (!suppressedBrowserRunIds.has(activeRunId))
          revealBrowser()
      }
    },
    { immediate: true },
  )

  function hasTab(id: string) {
    return openTabIds.value.includes(id) || [...panels.entries()].some(([conversationId, panel]) => conversationId !== currentConversationId && panel.ids.includes(id))
  }

  function resetPanel() {
    isOpen.value = false
    activeTabId.value = null
    openTabIds.value = []
    if (resourceTabs.value.length)
      resourceTabs.value = []
  }

  function toggle() {
    if (!options.activeConversationId.value)
      return
    if (isOpen.value) {
      suppressBrowserForActiveRun()
      isOpen.value = false
      return
    }
    isOpen.value = true
  }

  function openArtifact(artifactId: string) {
    const tabId = artifactTabId(artifactId)
    if (!availableTabsById.value.has(tabId))
      return
    const artifactTab = availableTabsById.value.get(tabId)!
    resourceTabs.value = [...resourceTabs.value.filter(tab => tab.id !== tabId), artifactTab]
    if (!openTabIds.value.includes(tabId))
      openTabIds.value = [...openTabIds.value, tabId]
    suppressBrowserForActiveRun()
    activeTabId.value = tabId
    isOpen.value = true
  }

  function openBrowser() {
    const activeRunId = options.activeRunId.value
    if (activeRunId)
      suppressedBrowserRunIds.delete(activeRunId)
    activateBrowser()
  }

  function revealBrowser() {
    activateBrowser()
  }

  function activateBrowser() {
    const conversationId = options.activeConversationId.value
    if (!conversationId)
      return
    const tabId = browserTabId(conversationId)
    if (!availableTabsById.value.has(tabId))
      return
    if (!openTabIds.value.includes(tabId))
      openTabIds.value = [...openTabIds.value, tabId]
    activeTabId.value = tabId
    isOpen.value = true
  }

  function openChanges(changeSetId?: string) {
    const conversationId = options.activeConversationId.value
    if (!conversationId)
      return
    const changeSet = changeSetId
      ? options.changeSets.value.find(set => set.changeSetId === changeSetId && set.conversationId === conversationId)
      : null
    if (changeSetId && !changeSet)
      return
    const tabId = changeTabId(conversationId)
    resourceTabs.value = [...resourceTabs.value.filter(tab => tab.id !== tabId), {
      id: tabId,
      kind: 'changes',
      conversationId,
      changeSet: changeSet ?? null,
    }]
    if (!openTabIds.value.includes(tabId))
      openTabIds.value = [...openTabIds.value, tabId]
    suppressBrowserForActiveRun()
    activeTabId.value = tabId
    isOpen.value = true
  }

  function addBrowser() {
    const conversationId = options.activeConversationId.value
    if (!conversationId)
      return
    const browserKey = crypto.randomUUID()
    const id = `browser:${conversationId}:${browserKey}`
    resourceTabs.value = [...resourceTabs.value, { id, kind: 'browser', conversationId, browserKey }]
    openTabIds.value = [...openTabIds.value, id]
    activeTabId.value = id
    isOpen.value = true
  }

  function openFiles() {
    const space = options.activeSpace?.value
    const directory = space?.primaryDirectory
    const conversationId = options.activeConversationId.value
    if (!space || !directory || !conversationId)
      return
    const id = `files:${crypto.randomUUID()}`
    resourceTabs.value = [...resourceTabs.value, {
      id,
      kind: 'files',
      conversationId,
      rootName: directory.root.split(/[\\/]/).filter(Boolean).at(-1) ?? directory.root,
      target: { spaceId: space.id, directoryId: directory.id, revision: directory.revision, path: '' },
    }]
    openTabIds.value = [...openTabIds.value, id]
    suppressBrowserForActiveRun()
    activeTabId.value = id
    isOpen.value = true
  }

  function selectFile(tabId: string, path: string) {
    resourceTabs.value = resourceTabs.value.map(tab => tab.id === tabId && tab.kind === 'files'
      ? { ...tab, target: { ...tab.target, path } }
      : tab)
  }

  function isAvailable(tab: TaskContextTab): boolean {
    if (tab.kind !== 'files')
      return true
    const space = options.activeSpace?.value
    const directory = space?.primaryDirectory
    return tab.target.spaceId === space?.id && tab.target.directoryId === directory?.id
      && tab.target.revision === directory.revision
  }

  function restoreTab(tab: TaskContextTab) {
    if (contextTabConversationId(tab) !== options.activeConversationId.value || !isAvailable(tab))
      return
    resourceTabs.value = [...resourceTabs.value.filter(item => item.id !== tab.id), tab]
    if (!openTabIds.value.includes(tab.id))
      openTabIds.value = [...openTabIds.value, tab.id]
    if (!activeTabId.value)
      activeTabId.value = tab.id
  }

  function selectTab(tabId: string) {
    if (!openTabIds.value.includes(tabId))
      return
    if (!tabId.startsWith('browser:'))
      suppressBrowserForActiveRun()
    activeTabId.value = tabId
  }

  function closeTab(tabId: string) {
    const index = openTabIds.value.indexOf(tabId)
    if (index < 0)
      return
    if (tabId.startsWith('browser:'))
      suppressBrowserForActiveRun()
    const nextIds = openTabIds.value.filter(id => id !== tabId)
    openTabIds.value = nextIds
    resourceTabs.value = resourceTabs.value.filter(tab => tab.id !== tabId)
    if (activeTabId.value !== tabId)
      return
    activeTabId.value = nextIds[Math.min(index, nextIds.length - 1)] ?? null
  }

  function suppressBrowserForActiveRun() {
    const conversationId = options.activeConversationId.value
    const activeRunId = options.activeRunId.value
    if (
      conversationId
      && activeRunId
      && openTabIds.value.includes(browserTabId(conversationId))
    ) {
      suppressedBrowserRunIds.add(activeRunId)
    }
  }

  return {
    activeTab: readonly(activeTab),
    addBrowser,
    artifactCount: readonly(artifactCount),
    closeTab,
    isOpen: readonly(isOpen),
    hasTab,
    openArtifact,
    openBrowser,
    openChanges,
    openFiles,
    selectFile,
    restoreTab,
    selectTab,
    tabs: readonly(tabs),
    toggle,
  }
}

export type TaskContextPanel = ReturnType<typeof useTaskContextPanel>

function contextTabConversationId(tab: TaskContextTab): string {
  if (tab.kind === 'artifact')
    return tab.artifact.conversationId
  if (tab.kind === 'changes')
    return tab.conversationId
  return tab.conversationId
}

function browserOpenToolCallId(event: LocalRunEvent, activeRunId: string): string | null {
  if (event.runId !== activeRunId || event.type !== 'tool.started')
    return null
  const presentation = event.payload.presentation
  if (
    !presentation
    || typeof presentation !== 'object'
    || !('card' in presentation)
    || presentation.card !== 'browser'
    || !('operation' in presentation)
    || presentation.operation !== 'open'
  ) {
    return null
  }
  return typeof event.payload.toolCallId === 'string'
    ? event.payload.toolCallId
    : null
}
