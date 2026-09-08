import type { DesktopBrowserApi } from '@buddy-electron/shared/desktopApi'
import type { UseTaskContextPanelOptions } from './typing'
import { onScopeDispose, watch } from 'vue'
import { isBrowserArtifact } from './taskContextPanel'
import { useTaskContextPanel } from './useTaskContextPanel'

interface TaskResourcePanelOptions extends UseTaskContextPanelOptions {
  browser: Pick<DesktopBrowserApi, 'ensureSession' | 'close' | 'openArtifact'>
}

export function useTaskResourcePanel(options: TaskResourcePanelOptions) {
  const taskContext = useTaskContextPanel(options)
  let operation = 0
  let disposed = false
  watch(options.activeConversationId, () => {
    operation += 1
  }, { flush: 'sync' })
  onScopeDispose(() => {
    disposed = true
    operation += 1
  })

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
    if (tab.kind !== 'browser')
      return true
    const isCurrent = currentOperation()
    const retainedTabId = taskContext.activeTab.value?.id
    try {
      const state = await options.browser.ensureSession(tab.conversationId)
      if (!isCurrent())
        return false
      await options.browser.close(state.sessionId)
      return true
    }
    catch {
      if (isCurrent()) {
        taskContext.openBrowser()
        if (retainedTabId)
          taskContext.selectTab(retainedTabId)
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
    closeTab,
    openArtifact,
    openBrowser: () => act(taskContext.openBrowser),
    openChanges: (id: string) => act(() => taskContext.openChanges(id)),
    selectTab: (id: string) => act(() => taskContext.selectTab(id)),
    toggle: () => act(taskContext.toggle),
  }
}
