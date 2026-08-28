import type { LocalChangeSetSummary, LocalRunOutput } from '@buddy-electron/shared/localChatApi'
import type { Ref } from 'vue'
import { computed, readonly, shallowRef, watch } from 'vue'
import {
  artifactTabId,
  changeTabId,
  projectTaskArtifactTabs,
  projectTaskChangeTabs,
} from './taskContextPanel'

interface UseTaskContextPanelOptions {
  activeConversationId: Readonly<Ref<string | null>>
  changeSets: Readonly<Ref<ReadonlyArray<LocalChangeSetSummary>>>
  runOutputs: Readonly<Ref<ReadonlyArray<LocalRunOutput>>>
}

export function useTaskContextPanel(options: UseTaskContextPanelOptions) {
  const isOpen = shallowRef(false)
  const activeTabId = shallowRef<string | null>(null)
  const openTabIds = shallowRef<ReadonlyArray<string>>([])
  const availableTabs = computed(() => [
    ...projectTaskArtifactTabs(options.runOutputs.value),
    ...projectTaskChangeTabs(options.changeSets.value),
  ].filter(tab => (
    tab.kind === 'artifact'
      ? tab.artifact.conversationId
      : tab.changeSet.conversationId
  ) === options.activeConversationId.value))
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
      currentConversationId = conversationId
      if (!conversationId || conversationChanged) {
        isOpen.value = false
        activeTabId.value = null
        openTabIds.value = []
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

  function toggle() {
    if (!options.activeConversationId.value)
      return
    if (isOpen.value) {
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
    activeTabId.value = tabId
    isOpen.value = true
  }

  function openChanges(changeSetId: string) {
    const tabId = changeTabId(changeSetId)
    if (!availableTabsById.value.has(tabId))
      return
    if (!openTabIds.value.includes(tabId))
      openTabIds.value = [...openTabIds.value, tabId]
    activeTabId.value = tabId
    isOpen.value = true
  }

  function selectTab(tabId: string) {
    if (openTabIds.value.includes(tabId))
      activeTabId.value = tabId
  }

  function closeTab(tabId: string) {
    const index = openTabIds.value.indexOf(tabId)
    if (index < 0)
      return
    const nextIds = openTabIds.value.filter(id => id !== tabId)
    openTabIds.value = nextIds
    if (activeTabId.value !== tabId)
      return
    activeTabId.value = nextIds[Math.min(index, nextIds.length - 1)] ?? null
  }

  return {
    activeTab: readonly(activeTab),
    artifactCount: readonly(artifactCount),
    closeTab,
    isOpen: readonly(isOpen),
    openArtifact,
    openChanges,
    selectTab,
    tabs: readonly(tabs),
    toggle,
  }
}

export type TaskContextPanel = ReturnType<typeof useTaskContextPanel>
