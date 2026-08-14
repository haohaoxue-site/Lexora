<script setup lang="ts">
import type { DesktopComposerSubmitPayload } from './desktopComposerInput'
import type { DesktopSettingsCategory } from './desktopViewState'
import type { DesktopChatController } from './useDesktopChat'
import type { BuddyChatMessageListHandle, ChatMessageScrollMetrics } from '@/chat/chatMessageViewport'
import {
  ArrowClockwise20Regular,
  Settings20Regular,
  Warning20Regular,
} from '@vicons/fluent'
import { NButton, NIcon } from 'naive-ui'
import { computed, nextTick, shallowRef, useTemplateRef, watch } from 'vue'
import { DESKTOP_ASSET_URLS } from '@/assets/desktopAssetUrls'
import BuddyChatMessageList from '@/chat/BuddyChatMessageList.vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopApprovalCard from './DesktopApprovalCard.vue'
import DesktopChatComposer from './DesktopChatComposer.vue'
import { isNearChatTail } from './desktopChatScroll'

const props = defineProps<{
  activeSearchMessageId: string | null
  chat: DesktopChatController
  matchingSearchMessageIds: ReadonlyArray<string>
}>()
const emit = defineEmits<{
  openSettings: [category: DesktopSettingsCategory]
}>()

const chat = props.chat
const { t } = useBuddyI18n(chat.language)
const messageList = useTemplateRef<BuddyChatMessageListHandle>('messageList')
const followsChatTail = shallowRef(true)
const isRestoringHistoryAnchor = shallowRef(false)
const isEmpty = computed(() => chat.activeConversationId.value === null)
const visibleBlocker = computed(() => chat.visibleChatBlocker.value)
const runtimeTransitioning = computed(() => (
  !visibleBlocker.value
  && ['stopped', 'starting', 'restarting', 'stopping'].includes(chat.runtimeState.value.status)
))
let searchRevealGeneration = 0

watch(
  () => [chat.activeConversationId.value, chat.activeBranchId.value],
  () => {
    followsChatTail.value = true
    void scrollToChatTailAfterRender()
  },
)
watch(
  () => props.activeSearchMessageId,
  (messageId) => {
    if (messageId)
      void revealSearchMessage(messageId)
  },
)
watch(
  [
    () => chat.isLoading.value,
    () => chat.timelineItems.value.length,
    () => chat.runEvents.value.length,
  ],
  () => {
    if (followsChatTail.value)
      void scrollToChatTailAfterRender()
  },
)

async function sendMessage(payload: DesktopComposerSubmitPayload) {
  await chat.send(payload)
}

function dismissBlocker() {
  chat.dismissChatBlocker()
}

function handleMessageViewportPosition(
  metrics: ChatMessageScrollMetrics,
  tailScrollSettling: boolean,
) {
  const tailDistance = metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight
  if (tailScrollSettling && tailDistance <= metrics.clientHeight * 2) {
    followsChatTail.value = true
    return
  }
  followsChatTail.value = isNearChatTail(metrics)
  if (!followsChatTail.value)
    messageList.value?.cancelTailScroll()
}

function handleMessageViewportScroll(
  metrics: ChatMessageScrollMetrics,
  tailScrollSettling: boolean,
) {
  handleMessageViewportPosition(metrics, tailScrollSettling)
  if (
    metrics.scrollTop <= 64
    && chat.hasOlderMessages.value
    && !chat.isLoadingOlderMessages.value
    && !isRestoringHistoryAnchor.value
  ) {
    void loadOlderMessagesWithAnchor()
  }
}

async function scrollToChatTailAfterRender() {
  await nextTick()
  await messageList.value?.scrollToTail()
}

async function loadOlderMessagesWithAnchor() {
  const list = messageList.value
  const anchor = list?.captureScrollAnchor()
  if (!list || !anchor)
    return
  const loaded = await chat.loadOlderMessages()
  if (!loaded)
    return
  isRestoringHistoryAnchor.value = true
  followsChatTail.value = false
  try {
    await nextTick()
    await list.restoreScrollAnchor(anchor)
  }
  finally {
    isRestoringHistoryAnchor.value = false
  }
}

async function revealSearchMessage(messageId: string) {
  const generation = ++searchRevealGeneration
  let needsOlderMessages = shouldLoadOlderSearchMessage(messageId, generation)
  while (needsOlderMessages) {
    const loaded = await chat.loadOlderMessages()
    if (!loaded)
      break
    needsOlderMessages = shouldLoadOlderSearchMessage(messageId, generation)
  }
  if (generation !== searchRevealGeneration || props.activeSearchMessageId !== messageId)
    return
  await nextTick()
  await messageList.value?.scrollToMessage(messageId)
}

function shouldLoadOlderSearchMessage(messageId: string, generation: number) {
  return generation === searchRevealGeneration
    && chat.hasOlderMessages.value
    && !chat.timelineItems.value.some(
      item => item.kind === 'message' && item.id === messageId,
    )
}
</script>

<template>
  <section class="desktop-chat-page">
    <main class="desktop-chat-page__content">
      <section v-if="isEmpty" class="desktop-chat-page__welcome">
        <img :src="DESKTOP_ASSET_URLS.appIcon" alt="" draggable="false" height="48" width="48">
        <h1>{{ t('desktop.chat.globalHero') }}</h1>
        <p v-if="chat.activeProject.value">
          {{ t('desktop.chat.projectContext', { project: chat.activeProject.value.name }) }}
        </p>
      </section>

      <div v-else-if="chat.isLoading.value" class="desktop-chat-page__loading">
        {{ t('desktop.chat.loading') }}
      </div>

      <BuddyChatMessageList
        v-else
        ref="messageList"
        :active-branch-id="chat.activeBranchId.value!"
        :active-search-message-id="activeSearchMessageId"
        :actions-disabled="!chat.canMutateBranch.value"
        :branches="chat.branches.value"
        class="desktop-chat-page__messages"
        :has-older-messages="chat.hasOlderMessages.value"
        :is-loading-older-messages="chat.isLoadingOlderMessages.value"
        :language="chat.language.value"
        :matching-search-message-ids="matchingSearchMessageIds"
        :timeline-items="chat.timelineItems.value"
        :run-events="chat.runEvents.value"
        :runs="chat.runs.value"
        @activate-branch="chat.activateBranch"
        @edit-user-message="chat.editUserMessage"
        @regenerate-assistant="chat.regenerateAssistant"
        @scroll="handleMessageViewportScroll"
        @scroll-position="handleMessageViewportPosition"
      />
    </main>

    <footer class="desktop-chat-page__composer-dock">
      <div class="desktop-chat-page__composer-stack">
        <article
          v-if="visibleBlocker"
          class="desktop-chat-page__alert"
          :class="`is-${visibleBlocker.kind}`"
          role="alert"
        >
          <NIcon :component="Warning20Regular" />
          <div>
            <strong>{{ t(`desktop.chat.blocker.${visibleBlocker.kind}.title`) }}</strong>
            <p>{{ visibleBlocker.kind === 'runtime' && chat.runtimeError.value ? chat.runtimeError.value : t(`desktop.chat.blocker.${visibleBlocker.kind}.description`) }}</p>
          </div>
          <div class="desktop-chat-page__alert-actions">
            <NButton
              v-if="visibleBlocker.kind === 'runtime' && chat.canRestartRuntime.value"
              size="small"
              type="error"
              ghost
              @click="chat.restartRuntime"
            >
              <template #icon>
                <NIcon :component="ArrowClockwise20Regular" />
              </template>
              {{ t('desktop.chat.runtimeRestart') }}
            </NButton>
            <NButton
              size="small"
              :type="visibleBlocker.kind === 'runtime' ? 'default' : 'primary'"
              @click="emit('openSettings', visibleBlocker.kind === 'runtime' ? 'data' : 'models')"
            >
              <template #icon>
                <NIcon :component="Settings20Regular" />
              </template>
              {{ t(`desktop.chat.blocker.${visibleBlocker.kind}.action`) }}
            </NButton>
            <NButton v-if="visibleBlocker.dismissible" text size="small" @click="dismissBlocker">
              {{ t('desktop.chat.blocker.ignore') }}
            </NButton>
          </div>
        </article>

        <article v-else-if="chat.errorMessage.value" class="desktop-chat-page__alert is-runtime" role="alert">
          <NIcon :component="Warning20Regular" />
          <div><p>{{ chat.errorMessage.value }}</p></div>
        </article>

        <div v-if="runtimeTransitioning" class="desktop-chat-page__starting" role="status">
          <i />{{ t('desktop.chat.runtimeStarting') }}
        </div>

        <div v-if="chat.approvalViews.value.length" class="desktop-chat-page__approvals">
          <DesktopApprovalCard
            v-for="approval in chat.approvalViews.value"
            :key="approval.id"
            :approval="approval"
            :language="chat.language.value"
            :resolving="chat.resolvingApprovalIds.value.has(approval.id)"
            @approve="chat.resolveApproval(approval.id, 'approve')"
            @deny="chat.resolveApproval(approval.id, 'deny')"
          />
        </div>

        <DesktopChatComposer
          :attachments="chat.attachments.value"
          :can-send="chat.canSend.value"
          :composer-content="chat.composerContent.value"
          :context-usage="chat.contextUsage.value"
          :draft="chat.draft.value"
          :is-running="Boolean(chat.activeRun.value)"
          :is-selecting-files="chat.isSelectingFiles.value"
          :is-sending="chat.isSending.value"
          :language="chat.language.value"
          :load-context-options="chat.listContextOptions"
          :models="chat.models.value"
          :providers="chat.providers.value"
          :selected-effort="chat.selectedEffort.value"
          :selected-model="chat.selectedModel.value"
          :selected-model-id="chat.selectedModelId.value"
          :selected-service-tier="chat.selectedServiceTier.value"
          @attach="chat.selectAttachments"
          @remove-attachment="chat.removeAttachment"
          @send="sendMessage"
          @stop="chat.cancelActiveRun"
          @update-content="chat.updateComposerContent"
          @update-effort="chat.selectedEffort.value = $event"
          @update-model="chat.selectModel"
          @update-service-tier="chat.selectedServiceTier.value = $event"
        />
      </div>
    </footer>
  </section>
</template>

<style scoped lang="scss">
.desktop-chat-page {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  background: var(--buddy-bg-surface);
}

.desktop-chat-page__content {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
}

.desktop-chat-page__welcome {
  display: grid;
  max-width: 34rem;
  flex: 1;
  align-content: center;
  justify-items: center;
  gap: 0.65rem;
  margin: 0 auto;
  padding: 2rem 1.25rem 4rem;
  text-align: center;

  img {
    width: 3rem;
    height: 3rem;
    border-radius: 0.85rem;
  }

  h1,
  p {
    margin: 0;
  }

  h1 {
    font-size: clamp(1.55rem, 3vw, 2rem);
    font-weight: 650;
    letter-spacing: -0.04em;
  }

  p {
    color: var(--buddy-text-secondary);
    font-size: 0.78rem;
  }
}

.desktop-chat-page__loading {
  display: grid;
  flex: 1;
  place-items: center;
  color: var(--buddy-text-secondary);
  font-size: 0.75rem;
}

.desktop-chat-page__messages {
  min-height: 0;
  flex: 1;
}

.desktop-chat-page__composer-dock {
  flex: none;
  background: var(--buddy-bg-surface);
  padding: 0 var(--buddy-chat-inline-gutter) 1rem;
}

.desktop-chat-page__composer-stack {
  display: grid;
  width: min(100%, var(--buddy-chat-reading-width));
  gap: 0.55rem;
  margin: 0 auto;
}

.desktop-chat-page__alert {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.7rem;
  border: 1px solid color-mix(in srgb, var(--buddy-accent-warning) 34%, var(--buddy-border-light));
  border-radius: 0.65rem;
  background: color-mix(in srgb, var(--buddy-accent-warning) 8%, var(--buddy-bg-surface));
  color: var(--buddy-text-regular);
  padding: 0.65rem 0.75rem;

  > .n-icon {
    color: var(--buddy-accent-warning);
    font-size: 1.1rem;
  }

  &.is-runtime {
    border-color: color-mix(in srgb, var(--buddy-accent-danger) 35%, var(--buddy-border-light));
    background: color-mix(in srgb, var(--buddy-accent-danger) 7%, var(--buddy-bg-surface));

    > .n-icon {
      color: var(--buddy-accent-danger);
    }
  }

  strong,
  p {
    margin: 0;
  }

  strong {
    font-size: 0.75rem;
  }

  p {
    margin-top: 0.12rem;
    color: var(--buddy-text-secondary);
    font-size: 0.68rem;
    line-height: 1.45;
  }
}

.desktop-chat-page__alert-actions,
.desktop-chat-page__approvals {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.desktop-chat-page__approvals {
  flex-direction: column;
  align-items: stretch;
}

.desktop-chat-page__starting {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  color: var(--buddy-text-secondary);
  font-size: 0.68rem;
  padding: 0 0.25rem;

  i {
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 50%;
    background: var(--buddy-accent-warning);
    animation: desktop-runtime-pulse 1.2s ease-in-out infinite;
  }
}

@keyframes desktop-runtime-pulse {
  50% { opacity: 0.35; }
}

@media (max-width: 760px) {
  .desktop-chat-page__alert {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .desktop-chat-page__alert-actions {
    grid-column: 2;
    justify-content: flex-start;
  }
}

@media (prefers-reduced-motion: reduce) {
  .desktop-chat-page__starting i {
    animation: none;
  }
}
</style>
