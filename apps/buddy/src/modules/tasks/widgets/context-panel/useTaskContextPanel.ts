import type { LocalRunEvent } from '@buddy-shared/runs/runApi'

import type { TaskContextTab } from './taskContextPanel'
import type { UseTaskContextPanelOptions } from './typing'
import { computed, readonly, shallowRef, watch } from 'vue'
import { resolveChatToolFileTarget } from '../../model/transcript/chatToolFileTarget'
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
  const resourceTabs = shallowRef<ReadonlyArray<TaskContextTab>>([])
  const handledBrowserOpenKeys = new Set<string>()
  const suppressedBrowserRunIds = new Set<string>()
  const selectedConversationTabs = new Map<string, string>()
  const availableArtifacts = computed(() => spaceTaskArtifactTabs(options.runOutputs.value)
    .filter(tab => tab.artifact.conversationId === options.activeConversationId.value))
  const fileSpaces = computed(() => options.spaces.value.filter(space => space.revokedAt === null
    && space.primaryDirectory && space.primaryDirectory.revokedAt === null))
  const tabs = computed(() => resourceTabs.value.filter(tab => isAvailable(tab) && isInCurrentContext(tab)))
  const activeTab = computed(() => tabs.value.find(tab => tab.id === activeTabId.value) ?? null)
  const artifactCount = computed(() => new Set([
    ...availableArtifacts.value.map(tab => tab.id),
    ...tabs.value.filter(tab => tab.kind === 'artifact').map(tab => tab.id),
  ]).size)
  const canAddChanges = computed(() => Boolean(options.activeConversationId.value)
    && !tabs.value.some(tab => tab.kind === 'changes'))

  watch(options.spaces, () => {
    resourceTabs.value = resourceTabs.value.filter(isAvailable)
  })
  watch(tabs, (nextTabs) => {
    if (nextTabs.some(tab => tab.id === activeTabId.value))
      return
    const conversationId = options.activeConversationId.value
    const previousId = conversationId ? selectedConversationTabs.get(conversationId) : null
    activeTabId.value = nextTabs.find(tab => tab.id === previousId)?.id ?? nextTabs.at(-1)?.id ?? null
  }, { immediate: true })
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
    return resourceTabs.value.some(tab => tab.id === id)
  }

  function toggle() {
    if (isOpen.value)
      suppressBrowserForActiveRun()
    isOpen.value = !isOpen.value
  }

  function openTab(tab: TaskContextTab) {
    const index = resourceTabs.value.findIndex(item => item.id === tab.id)
    resourceTabs.value = index < 0
      ? [...resourceTabs.value, tab]
      : resourceTabs.value.map(item => item.id === tab.id ? tab : item)
    selectTab(tab.id)
    isOpen.value = true
  }

  function openArtifact(artifactId: string) {
    const tabId = artifactTabId(artifactId)
    const tab = availableArtifacts.value.find(tab => tab.id === tabId)
      ?? tabs.value.find(tab => tab.id === tabId)
    if (tab)
      openTab(tab)
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
    const tab = spaceTaskBrowserTab(options.activeConversationId.value)
    if (tab)
      openTab(tab)
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
    openTab({
      id: changeTabId(conversationId),
      kind: 'changes',
      conversationId,
      changeSet: changeSet ?? null,
    })
  }

  function addBrowser() {
    const browserKey = crypto.randomUUID()
    openTab({ id: browserTabId(null, browserKey), kind: 'browser', conversationId: null, browserKey })
  }

  function openFiles(spaceId: string) {
    const space = fileSpaces.value.find(space => space.id === spaceId)
    const directory = space?.primaryDirectory
    if (!space || !directory)
      return
    openTab({
      id: `files:${crypto.randomUUID()}`,
      kind: 'files',
      rootName: directory.root.split(/[\\/]/).filter(Boolean).at(-1) ?? directory.root,
      target: { spaceId: space.id, directoryId: directory.id, revision: directory.revision, path: '' },
    })
  }

  function selectFile(tabId: string, path: string) {
    resourceTabs.value = resourceTabs.value.map(tab => tab.id === tabId && tab.kind === 'files'
      ? { ...tab, target: { ...tab.target, path } }
      : tab)
  }

  function canPreviewFile(path: string) {
    return Boolean(resolveChatToolFileTarget(options.activeSpace?.value ?? null, path))
  }

  function previewFile(path: string) {
    const space = options.activeSpace?.value ?? null
    const target = resolveChatToolFileTarget(space, path)
    if (!target || !space?.primaryDirectory)
      return
    openTab({
      id: `files:${target.spaceId}:${target.directoryId}:preview`,
      kind: 'files',
      rootName: space.primaryDirectory.root.split(/[\\/]/).filter(Boolean).at(-1) ?? space.primaryDirectory.root,
      target,
    })
  }

  function isAvailable(tab: TaskContextTab): boolean {
    if (tab.kind !== 'files')
      return true
    const directory = fileSpaces.value.find(space => space.id === tab.target.spaceId)?.primaryDirectory
    return Boolean(directory && tab.target.directoryId === directory.id && tab.target.revision === directory.revision)
  }

  function isInCurrentContext(tab: TaskContextTab): boolean {
    const conversationId = contextTabConversationId(tab)
    return conversationId === null || conversationId === options.activeConversationId.value
  }

  function restoreTab(tab: TaskContextTab) {
    if (!isAvailable(tab) || hasTab(tab.id))
      return
    resourceTabs.value = [...resourceTabs.value, tab]
    if (!activeTabId.value && isInCurrentContext(tab))
      selectTab(tab.id)
  }

  function selectTab(tabId: string) {
    const tab = tabs.value.find(tab => tab.id === tabId)
    if (!tab)
      return
    if (tab.kind !== 'browser' || tab.browserKey)
      suppressBrowserForActiveRun()
    const conversationId = contextTabConversationId(tab)
    if (conversationId)
      selectedConversationTabs.set(conversationId, tabId)
    activeTabId.value = tabId
  }

  function closeTab(tabId: string) {
    const index = tabs.value.findIndex(tab => tab.id === tabId)
    if (index < 0)
      return
    if (tabId === browserTabId(options.activeConversationId.value))
      suppressBrowserForActiveRun()
    resourceTabs.value = resourceTabs.value.filter(tab => tab.id !== tabId)
    if (activeTabId.value !== tabId)
      return
    activeTabId.value = tabs.value[Math.min(index, tabs.value.length - 1)]?.id ?? null
  }

  function suppressBrowserForActiveRun() {
    const conversationId = options.activeConversationId.value
    const activeRunId = options.activeRunId.value
    if (
      conversationId
      && activeRunId
      && hasTab(browserTabId(conversationId))
    ) {
      suppressedBrowserRunIds.add(activeRunId)
    }
  }

  return {
    activeTab: readonly(activeTab),
    addBrowser,
    artifactCount: readonly(artifactCount),
    closeTab,
    canPreviewFile,
    fileSpaces: readonly(fileSpaces),
    canAddChanges: readonly(canAddChanges),
    isOpen: readonly(isOpen),
    hasTab,
    openArtifact,
    openBrowser,
    openChanges,
    openFiles,
    previewFile,
    selectFile,
    restoreTab,
    selectTab,
    tabs: readonly(tabs),
    toggle,
  }
}

export type TaskContextPanel = ReturnType<typeof useTaskContextPanel>

function contextTabConversationId(tab: TaskContextTab): string | null {
  if (tab.kind === 'artifact')
    return tab.artifact.conversationId
  if (tab.kind === 'files')
    return null
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
