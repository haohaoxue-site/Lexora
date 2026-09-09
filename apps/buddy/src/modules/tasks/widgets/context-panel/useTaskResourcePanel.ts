import type { DesktopBrowserApi, DesktopBrowserState } from '@buddy-electron/shared/desktopApi'
import type { UseTaskContextPanelOptions } from './typing'
import { computed, onScopeDispose, readonly, shallowRef, watch } from 'vue'
import { browserTabId, isBrowserArtifact } from './taskContextPanel'
import { useTaskContextPanel } from './useTaskContextPanel'

interface TaskResourcePanelOptions extends UseTaskContextPanelOptions {
  browser: Pick<DesktopBrowserApi, 'ensureSession' | 'close' | 'openArtifact' | 'onStateChanged'>
}

export function useTaskResourcePanel(options: TaskResourcePanelOptions) {
  const taskContext = useTaskContextPanel(options)
  const browserStates = shallowRef<Readonly<Record<string, DesktopBrowserState>>>({})
  const activeBrowserState = computed(() => {
    const tab = taskContext.activeTab.value
    return tab?.kind === 'browser' ? browserStates.value[tab.id] ?? null : null
  })
  function updateBrowserState(state: DesktopBrowserState) {
    const tab = taskContext.activeTab.value
    if (tab?.kind === 'browser' && tab.conversationId === state.conversationId)
      browserStates.value = { ...browserStates.value, [tab.id]: state }
  }
  const stopBrowserState = options.browser.onStateChanged((state) => {
    const entry = Object.entries(browserStates.value).find(([, previous]) => previous.sessionId === state.sessionId)
    if (entry)
      browserStates.value = { ...browserStates.value, [entry[0]]: state }
  })
  let operation = 0
  let disposed = false
  watch(options.activeConversationId, () => {
    operation += 1
  }, { flush: 'sync' })
  onScopeDispose(() => {
    stopBrowserState()
    disposed = true
    operation += 1
    for (const [id, state] of Object.entries(browserStates.value)) {
      if (id !== browserTabId(state.conversationId))
        void options.browser.close(state.sessionId).catch(() => {})
    }
  })

  function retainBrowserSession(state: DesktopBrowserState, key?: string) {
    const id = key ? `${browserTabId(state.conversationId)}:${key}` : browserTabId(state.conversationId)
    if (disposed || !taskContext.hasTab(id)) {
      if (key)
        void options.browser.close(state.sessionId).catch(() => {})
      return
    }
    if (!browserStates.value[id] || browserStates.value[id].sessionId !== state.sessionId)
      browserStates.value = { ...browserStates.value, [id]: state }
  }

  function act(action: () => void) {
    operation += 1
    action()
  }

  function currentOperation() {
    const version = operation
    const activeTabId = taskContext.activeTab.value?.id
    const open = taskContext.isOpen.value
    return () => !disposed && version === operation
      && taskContext.activeTab.value?.id === activeTabId && taskContext.isOpen.value === open
  }

  async function closeTab(tabId: string): Promise<boolean> {
    const tab = taskContext.tabs.value.find(item => item.id === tabId)
    if (!tab)
      return false
    act(() => taskContext.closeTab(tabId))
    if (tab.kind !== 'browser' || (tab.browserKey && !browserStates.value[tab.id]))
      return true
    const isCurrent = currentOperation()
    try {
      const state = browserStates.value[tab.id] ?? await options.browser.ensureSession(tab.conversationId, tab.browserKey)
      if (!isCurrent() && !tab.browserKey)
        return false
      await options.browser.close(state.sessionId)
      if (browserStates.value[tab.id]?.sessionId === state.sessionId)
        browserStates.value = Object.fromEntries(Object.entries(browserStates.value).filter(([id]) => id !== tab.id))
      return true
    }
    catch {
      if (isCurrent()) {
        taskContext.restoreTab(tab)
      }
      return false
    }
  }

  async function openArtifact(artifactId: string): Promise<void> {
    const artifact = options.runOutputs.value.flatMap(output => output.artifacts)
      .find(item => item.artifactId === artifactId)
    const conversationId = options.activeConversationId.value
    if (!artifact || !conversationId || artifact.conversationId !== conversationId)
      return
    if (!isBrowserArtifact(artifact)) {
      act(() => taskContext.openArtifact(artifactId))
      return
    }
    act(taskContext.openBrowser)
    const isCurrent = currentOperation()
    try {
      const state = await options.browser.ensureSession(conversationId)
      if (isCurrent())
        await options.browser.openArtifact(state.sessionId, artifactId)
    }
    catch {
      if (isCurrent())
        taskContext.openArtifact(artifactId)
    }
  }

  return {
    ...taskContext,
    activeBrowserState,
    browserStates: readonly(browserStates),
    updateBrowserState,
    retainBrowserSession,
    addBrowser: () => act(taskContext.addBrowser),
    openFiles: () => act(taskContext.openFiles),
    closeTab,
    openArtifact,
    openBrowser: () => act(taskContext.openBrowser),
    openChanges: (id?: string) => act(() => taskContext.openChanges(id)),
    selectTab: (id: string) => act(() => taskContext.selectTab(id)),
    toggle: () => act(taskContext.toggle),
  }
}

export type TaskResourcePanel = ReturnType<typeof useTaskResourcePanel>
