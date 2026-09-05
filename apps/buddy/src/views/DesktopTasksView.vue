<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useDesktopApp } from '@/app/desktopAppContext'
import DesktopWorkbenchLayout from '@/layouts/DesktopWorkbenchLayout.vue'
import { desktopRouteLocations } from '@/router'
import DesktopChatWorkspace from '@/workbenches/chat/workspace/DesktopChatWorkspace.vue'
import DesktopChatWorkspaceHeader from '@/workbenches/chat/workspace/DesktopChatWorkspaceHeader.vue'
import { useConversationSearch } from '@/workbenches/chat/workspace/useConversationSearch'
import DesktopTaskSpaceSelector from '@/workbenches/tasks/composer/DesktopTaskSpaceSelector.vue'
import DesktopTaskContextPanel from '@/workbenches/tasks/context/DesktopTaskContextPanel.vue'
import { isBrowserArtifact } from '@/workbenches/tasks/context/taskContextPanel'
import { useTaskContextPanel } from '@/workbenches/tasks/context/useTaskContextPanel'
import DesktopTaskIndex from '@/workbenches/tasks/index/DesktopTaskIndex.vue'

const router = useRouter()
const {
  browser,
  capabilities: { tasks },
  notificationTargetMessageId,
  shell,
  toggleAppSidebar,
} = useDesktopApp()
const { index: taskIndex, session: taskSession } = tasks
const chatSession = tasks.workspace.session
const activeRunId = computed(() => tasks.workspace.execution.activeRun.value?.id ?? null)
const taskContext = useTaskContextPanel({
  activeConversationId: chatSession.activeConversationId,
  activeRunId,
  changeSets: tasks.workspace.transcript.changeSets,
  runSignalEvents: tasks.workspace.transcript.runSignalEvents,
  runOutputs: tasks.workspace.transcript.runOutputs,
})
const conversationSearch = useConversationSearch({
  activeBranchId: chatSession.activeBranchId,
  activeConversationId: chatSession.activeConversationId,
  loadMessages: chatSession.listActiveConversationMessages,
})

async function closeContextTab(tabId: string): Promise<void> {
  const tab = taskContext.tabs.value.find(item => item.id === tabId)
  if (tab?.kind === 'browser') {
    const state = await browser.ensureSession(tab.conversationId)
    await browser.close(state.sessionId)
  }
  taskContext.closeTab(tabId)
}

async function openArtifact(artifactId: string): Promise<void> {
  const artifact = tasks.workspace.transcript.runOutputs.value
    .flatMap(output => output.artifacts)
    .find(item => item.artifactId === artifactId)
  if (!artifact)
    return
  if (!isBrowserArtifact(artifact)) {
    taskContext.openArtifact(artifactId)
    return
  }
  const conversationId = chatSession.activeConversationId.value
  if (!conversationId || artifact.conversationId !== conversationId)
    return
  taskContext.openBrowser()
  try {
    const state = await browser.ensureSession(conversationId)
    if (chatSession.activeConversationId.value !== conversationId)
      return
    await browser.openArtifact(state.sessionId, artifactId)
  }
  catch {
    taskContext.openArtifact(artifactId)
  }
}
</script>

<template>
  <DesktopWorkbenchLayout :language="tasks.language.value" sidebar-resizable>
    <template #sidebar>
      <DesktopTaskIndex
        :active-conversation-id="taskSession.activeTaskId.value"
        :app-sidebar-collapsed="shell.appSidebarCollapsed.value"
        :language="tasks.language.value"
        :pinned-items="shell.taskSidebarPinnedItems.value"
        :spaces="taskIndex.spaces.value"
        :select-space-directory="taskIndex.selectSpaceDirectory"
        :tasks="taskIndex.tasks.value"
        @create-space="taskIndex.createSpace"
        @delete-space="taskIndex.deleteSpace"
        @delete-task="taskIndex.deleteTask"
        @new-task="taskSession.startTask"
        @open-task="taskSession.openTask"
        @rename-task="taskIndex.renameTask"
        @update-pinned-items="shell.setTaskSidebarPinnedItems"
        @toggle-app-sidebar="toggleAppSidebar"
        @update-space="taskIndex.updateSpace"
      />
    </template>

    <DesktopChatWorkspaceHeader
      :active-search-index="conversationSearch.activeIndex.value"
      :artifact-count="taskContext.artifactCount.value"
      :can-open-context="taskSession.activeTaskId.value !== null"
      :can-search-conversation="taskSession.activeTaskId.value !== null"
      :conversation-search-loading="conversationSearch.isLoading.value"
      :conversation-search-open="conversationSearch.isOpen.value"
      :conversation-search-query="conversationSearch.query.value"
      :conversation-search-result-count="conversationSearch.resultCount.value"
      :context-open="taskContext.isOpen.value"
      :language="tasks.language.value"
      :title="taskSession.currentTitle.value"
      @close-conversation-search="conversationSearch.close"
      @next-conversation-search-result="conversationSearch.move(1)"
      @open-conversation-search="conversationSearch.open"
      @previous-conversation-search-result="conversationSearch.move(-1)"
      @toggle-context="taskContext.toggle"
      @update-conversation-search="conversationSearch.setQuery"
    />
    <DesktopChatWorkspace
      :active-search-message-id="notificationTargetMessageId ?? conversationSearch.activeMessageId.value"
      :workspace="tasks.workspace"
      :matching-search-message-ids="conversationSearch.matchingMessageIds.value"
      @open-settings="router.push(desktopRouteLocations.settings($event))"
      @open-artifact="openArtifact"
      @open-changes="taskContext.openChanges"
    >
      <template v-if="taskSession.activeTaskId.value === null" #composerLeadingContext>
        <DesktopTaskSpaceSelector
          :active-space="taskSession.activeSpace.value"
          :language="tasks.language.value"
          :spaces="taskIndex.spaces.value"
          :select-directory="taskIndex.selectSpaceDirectory"
          @create-space="taskIndex.createSpace"
          @select-space="taskSession.startTask"
        />
      </template>
    </DesktopChatWorkspace>

    <template v-if="taskContext.isOpen.value" #context>
      <DesktopTaskContextPanel
        :active-tab="taskContext.activeTab.value"
        :get-change-set="tasks.workspace.context.getChangeSet"
        :language="tasks.language.value"
        :read-artifact-text="tasks.workspace.context.readArtifactText"
        :tabs="taskContext.tabs.value"
        @close-tab="closeContextTab"
        @collapse="taskContext.toggle"
        @open-browser="taskContext.openBrowser"
        @select-tab="taskContext.selectTab"
      />
    </template>
  </DesktopWorkbenchLayout>
</template>
