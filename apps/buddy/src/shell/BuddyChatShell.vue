<script setup lang="ts">
import type { BuddyRuntime } from '@/lib/tauriRuntime'
import { dateEnUS, dateZhCN, enUS, NConfigProvider, zhCN } from 'naive-ui'
import { computed, onMounted, onUnmounted, shallowRef, watch } from 'vue'
import BuddyChatPanel from '@/chat/BuddyChatPanel.vue'
import { createBuddyChatRuntimeOptions, resolveSelectableBuddyChatRuntime } from '@/chat/buddyChatRuntimeControls'
import { isBuddyChatRuntimeSelectorVisible, resolveChatTargetRuntime } from '@/chat/buddyChatWorkspace'
import { useBuddyWorkspaceChat } from '@/chat/useBuddyWorkspaceChat'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import {
  createBrowserClaudeRuntimeStatus,
  createBrowserRuntimeStatus,
  loadBuddyClaudeRuntimeStatus,
  loadBuddyRuntimeStatus,
} from '@/lib/tauriRuntime'
import { resolveBuddyAiAnimationIntentFromRunEvents } from '@/pet/buddyAnimation'
import {
  createBuddyNativePetHostActionPlaybackKey,
  resolveBuddyNativePetHostActionFromRunEvents,
} from '@/pet/buddyHostAction'
import { createBuddyPetAnimationPlaybackKey, createBuddyPetStateView } from '@/pet/petStateView'
import { useBuddyAppSettings } from '@/shell/useBuddyAppSettings'
import { useBuddyContextMenuGuard } from '@/shell/useBuddyContextMenuGuard'
import { useBuddyNativePetAnimationSync } from '@/shell/useBuddyNativePetAnimationSync'
import { useBuddyNativePetHostActionSync } from '@/shell/useBuddyNativePetHostActionSync'

const {
  appSettings,
  errorMessage: appSettingsErrorMessage,
} = useBuddyAppSettings()

const { locale } = useBuddyI18n(() => appSettings.value.language)
const naiveLocale = computed(() => locale.value === 'zh-CN' ? zhCN : enUS)
const naiveDateLocale = computed(() => locale.value === 'zh-CN' ? dateZhCN : dateEnUS)

const {
  approvals: chatApprovals,
  approveApproval: approveChatApproval,
  authorizeProjectFromFolderPicker,
  runtimeStatus: chatCodexRuntimeStatus,
  closeDrawer,
  composerDraft,
  composerVersion,
  currentCwd,
  currentTarget,
  denyApproval: denyChatApproval,
  deleteConversation,
  errorMessage: chatErrorMessage,
  globalConversationItems,
  hasMessages: hasChatMessages,
  headerTitle,
  isAuthorizingProject,
  isDrawerOpen,
  isLoading: isChatLoading,
  isResolvingApproval: isResolvingChatApproval,
  isSending: isChatSending,
  messages: chatMessages,
  openDrawer,
  openConversation,
  openGlobalDraft,
  openProjectDraft,
  projectItems,
  runEvents: chatRunEvents,
  runs: chatRuns,
  sendMessage,
  setErrorMessage: setChatErrorMessage,
  stopMessage,
  updateDraft,
} = useBuddyWorkspaceChat({
  language: () => locale.value,
})

const selectedChatRuntime = shallowRef<BuddyRuntime>('codex')
const runtimeStatus = shallowRef(createBrowserRuntimeStatus())
const claudeRuntimeStatus = shallowRef(createBrowserClaudeRuntimeStatus())
const animationNowUnixMs = shallowRef(Date.now())
let animationClockTimer: number | null = null

onMounted(() => {
  void refreshRuntimeStatus()
  animationClockTimer = window.setInterval(() => {
    animationNowUnixMs.value = Date.now()
  }, 500)
})

onUnmounted(() => {
  if (animationClockTimer === null)
    return

  window.clearInterval(animationClockTimer)
  animationClockTimer = null
})

const latestRun = computed(() => chatRuns.value[0] ?? null)
const visibleChatErrorMessage = computed(() =>
  chatErrorMessage.value ?? appSettingsErrorMessage.value,
)
const runtimeOptions = computed(() =>
  createBuddyChatRuntimeOptions({
    appSettings: appSettings.value,
    claudeStatus: claudeRuntimeStatus.value,
    codexStatus: chatCodexRuntimeStatus.value,
  }),
)
const showRuntimeSelector = computed(() =>
  isBuddyChatRuntimeSelectorVisible(currentTarget.value),
)
const activeChatRuntime = computed(() =>
  showRuntimeSelector.value
    ? selectedChatRuntime.value
    : resolveChatTargetRuntime({
        fallbackRuntime: selectedChatRuntime.value,
        runs: chatRuns.value,
        target: currentTarget.value,
      }),
)
const pendingApprovalIds = computed(() => chatApprovals.value.map(approval => approval.id))
const nativePetHostAction = computed(() => {
  if (runtimeStatus.value.shell !== 'tauri')
    return null

  return resolveBuddyNativePetHostActionFromRunEvents(chatRunEvents.value)
})

const nativePetState = computed(() => {
  if (runtimeStatus.value.shell !== 'tauri')
    return null

  return createBuddyPetStateView({
    aiIntent: resolveBuddyAiAnimationIntentFromRunEvents(
      chatRunEvents.value,
      animationNowUnixMs.value,
    ),
    chatErrorMessage: chatErrorMessage.value,
    desktopReady: runtimeStatus.value.desktopReady,
    isSending: isChatSending.value,
    latestRunStatus: latestRun.value?.status ?? null,
    nowUnixMs: animationNowUnixMs.value,
    pendingApprovalCount: chatApprovals.value.length,
    runtimeErrorMessage: appSettingsErrorMessage.value,
  })
})

const nativePetAnimationPlaybackKey = computed(() => {
  if (!nativePetState.value)
    return null

  return createBuddyPetAnimationPlaybackKey({
    animation: nativePetState.value.animation,
    latestRun: latestRun.value,
    pendingApprovalIds: pendingApprovalIds.value,
    runEvents: chatRunEvents.value,
  })
})

const nativePetHostActionPlaybackKey = computed(() =>
  createBuddyNativePetHostActionPlaybackKey(nativePetHostAction.value),
)

useBuddyNativePetHostActionSync({
  action: () => nativePetHostAction.value?.action,
  playbackKey: () => nativePetHostActionPlaybackKey.value,
})

useBuddyNativePetAnimationSync({
  animation: () => nativePetState.value?.animation.name,
  playbackKey: () => nativePetAnimationPlaybackKey.value,
})

useBuddyContextMenuGuard(() => appSettings.value.allowNativeContextMenu)

watch(
  () => [runtimeOptions.value, showRuntimeSelector.value] as const,
  ([options, canSelectRuntime]) => {
    if (!canSelectRuntime)
      return

    selectedChatRuntime.value = resolveSelectableBuddyChatRuntime(
      selectedChatRuntime.value,
      options,
    )
  },
  { immediate: true },
)

async function refreshRuntimeStatus() {
  const [nextRuntimeStatus, nextClaudeRuntimeStatus] = await Promise.all([
    loadBuddyRuntimeStatus(),
    loadBuddyClaudeRuntimeStatus(),
  ])

  runtimeStatus.value = nextRuntimeStatus
  claudeRuntimeStatus.value = nextClaudeRuntimeStatus
}

function updateSelectedChatRuntime(runtime: BuddyRuntime) {
  const option = runtimeOptions.value.find(option => option.runtime === runtime)
  if (!option?.isSelectable)
    return

  selectedChatRuntime.value = runtime
}

function updateDrawerOpen(nextOpen: boolean) {
  if (nextOpen)
    openDrawer()
  else
    closeDrawer()
}
</script>

<template>
  <NConfigProvider
    :date-locale="naiveDateLocale"
    :locale="naiveLocale"
  >
    <main class="buddy-shell is-chat min-h-screen bg-body text-main">
      <section class="buddy-shell__stage">
        <div class="buddy-shell__panel">
          <BuddyChatPanel
            :app-settings="appSettings"
            :approvals="chatApprovals"
            :claude-runtime-status="claudeRuntimeStatus"
            :codex-runtime-status="chatCodexRuntimeStatus"
            :composer-draft="composerDraft"
            :composer-version="composerVersion"
            :current-cwd="currentCwd"
            :current-target="currentTarget"
            :drawer-open="isDrawerOpen"
            :error-message="visibleChatErrorMessage"
            :global-conversation-items="globalConversationItems"
            :has-messages="hasChatMessages"
            :header-title="headerTitle"
            :is-adding-project="isAuthorizingProject"
            :is-loading="isChatLoading"
            :is-resolving-approval="isResolvingChatApproval"
            :is-sending="isChatSending"
            :language="locale"
            :messages="chatMessages"
            :project-items="projectItems"
            :run-events="chatRunEvents"
            :runtime-options="runtimeOptions"
            :selected-runtime="activeChatRuntime"
            :show-runtime-selector="showRuntimeSelector"
            @add-project="authorizeProjectFromFolderPicker"
            @approve-approval="approveChatApproval"
            @composer-error="setChatErrorMessage"
            @deny-approval="denyChatApproval"
            @delete-conversation="deleteConversation"
            @draft-change="updateDraft"
            @open-global-draft="openGlobalDraft"
            @open-project-draft="openProjectDraft"
            @open-conversation="openConversation"
            @send="sendMessage"
            @stop="stopMessage"
            @update-runtime="updateSelectedChatRuntime"
            @update-drawer-open="updateDrawerOpen"
          />
        </div>
      </section>
    </main>
  </NConfigProvider>
</template>

<style scoped lang="scss">
.buddy-shell {
  min-width: 0;
  height: 100vh;
  overflow: hidden;
  background: transparent;
}

.buddy-shell__stage {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  height: 100vh;
  min-height: 0;
}

.buddy-shell__panel {
  min-width: 0;
  min-height: 0;
}
</style>
