import type {
  LocalChangeSetSummary,
  LocalRunEvent,
  LocalRunOutput,
} from '@buddy-electron/shared/localChatApi'
import type { Ref } from 'vue'
import type { TaskContextTab } from './taskContextPanel'
import { computed, readonly, shallowRef, watch } from 'vue'
import {
  artifactTabId,
  browserTabId,
  changeTabId,
  spaceTaskArtifactTabs,
  spaceTaskBrowserTab,
  spaceTaskChangeTabs,
} from './taskContextPanel'

interface UseTaskContextPanelOptions {
  activeConversationId: Readonly<Ref<string | null>>
  activeRunId: Readonly<Ref<string | null>>
  changeSets: Readonly<Ref<ReadonlyArray<LocalChangeSetSummary>>>
  runEvents: Readonly<Ref<ReadonlyArray<LocalRunEvent>>>
  runOutputs: Readonly<Ref<ReadonlyArray<LocalRunOutput>>>
}

export function useTaskContextPanel(options: UseTaskContextPanelOptions) {
  const isOpen = shallowRef(false)
  const activeTabId = shallowRef<string | null>(null)
  const openTabIds = shallowRef<ReadonlyArray<string>>([])
  const handledBrowserOpenKeys = new Set<string>()
  const suppressedBrowserRunIds = new Set<string>()
  const visibleBrowserConversationIds = new Set<string>()
  const availableTabs = computed(() => {
    const browserTab = spaceTaskBrowserTab(options.activeConversationId.value)
    return [
      ...(browserTab ? [browserTab] : []),
      ...spaceTaskArtifactTabs(options.runOutputs.value),
      ...spaceTaskChangeTabs(options.changeSets.value),
    ].filter(tab => contextTabConversationId(tab) === options.activeConversationId.value)
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
      if (conversationChanged && currentConversationId) {
        const currentBrowserTabId = browserTabId(currentConversationId)
        if (isOpen.value && activeTabId.value === currentBrowserTabId)
          visibleBrowserConversationIds.add(currentConversationId)
        else
          visibleBrowserConversationIds.delete(currentConversationId)
      }
      currentConversationId = conversationId
      if (!conversationId) {
        resetPanel()
        return
      }
      if (conversationChanged) {
        const nextBrowserTabId = browserTabId(conversationId)
        const canRestoreBrowser = visibleBrowserConversationIds.has(conversationId)
          && nextAvailableTabs.some(tab => tab.id === nextBrowserTabId)
        if (!canRestoreBrowser) {
          visibleBrowserConversationIds.delete(conversationId)
          resetPanel()
          return
        }
        openTabIds.value = [nextBrowserTabId]
        activeTabId.value = nextBrowserTabId
        isOpen.value = true
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
    [options.activeConversationId, options.activeRunId, options.runEvents],
    ([conversationId, activeRunId, runEvents]) => {
      if (!conversationId || !activeRunId)
        return
      for (const event of runEvents) {
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

  function resetPanel() {
    isOpen.value = false
    activeTabId.value = null
    openTabIds.value = []
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

  function openChanges(changeSetId: string) {
    const tabId = changeTabId(changeSetId)
    if (!availableTabsById.value.has(tabId))
      return
    if (!openTabIds.value.includes(tabId))
      openTabIds.value = [...openTabIds.value, tabId]
    suppressBrowserForActiveRun()
    activeTabId.value = tabId
    isOpen.value = true
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
    artifactCount: readonly(artifactCount),
    closeTab,
    isOpen: readonly(isOpen),
    openArtifact,
    openBrowser,
    openChanges,
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
    return tab.changeSet.conversationId
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
