<script setup lang="ts">
import type { LocalMessage } from '@buddy-electron/shared/localChatApi'
import type { DesktopSettingsCategory } from '@/router'
import type { ChatComposerSubmitPayload } from '@/workbenches/chat/composer/chatComposerInput'
import type { BuddyChatMessageListHandle } from '@/workbenches/chat/transcript/chatMessageViewport'
import type { TaskChatWorkspace } from '@/workbenches/tasks/state/useTaskCapability'
import {
  ArrowClockwise20Regular,
  Settings20Regular,
  Warning20Regular,
} from '@vicons/fluent'
import { NButton, NIcon } from 'naive-ui'
import { computed, shallowRef, useTemplateRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopChatComposer from '@/workbenches/chat/composer/DesktopChatComposer.vue'
import BuddyChatMessageList from '@/workbenches/chat/transcript/BuddyChatMessageList.vue'
import { projectChatTranscript } from '@/workbenches/chat/transcript/chatTranscriptProjection'
import DesktopApprovalCard from '@/workbenches/chat/workspace/DesktopApprovalCard.vue'
import DesktopChatWelcome from '@/workbenches/chat/workspace/DesktopChatWelcome.vue'
import { selectDesktopChatWelcomeVariant } from '@/workbenches/chat/workspace/desktopChatWelcomeVariants'
import { useChatViewport } from '@/workbenches/chat/workspace/useChatViewport'
import { useConversationOutline } from '@/workbenches/chat/workspace/useConversationOutline'

const props = defineProps<{
  activeSearchMessageId: string | null
  matchingSearchMessageIds: ReadonlyArray<string>
  workspace: TaskChatWorkspace
}>()
const emit = defineEmits<{
  openArtifact: [artifactId: string]
  openChanges: [changeSetId: string]
  openSettings: [category: DesktopSettingsCategory]
}>()
defineSlots<{
  composerLeadingContext?: () => unknown
}>()

const workspace = props.workspace
const { composer, execution, session, status, transcript } = workspace
const { t } = useBuddyI18n(workspace.language)
const messageList = useTemplateRef<BuddyChatMessageListHandle>('messageList')
const activeSearchMessageId = computed(() => props.activeSearchMessageId)
const isEmpty = computed(() => session.activeConversationId.value === null)
const welcomeVariant = shallowRef(selectDesktopChatWelcomeVariant(workspace.welcomePreference.value))
const visibleBlocker = computed(() => status.visibleChatBlocker.value)
const runtimeTransitioning = computed(() => (
  !visibleBlocker.value
  && ['stopped', 'starting', 'restarting', 'stopping'].includes(status.runtimeState.value.status)
))
const currentOutlineMessages = computed<ReadonlyArray<LocalMessage>>(() => {
  const messages: LocalMessage[] = []
  const projection = projectChatTranscript({
    changeSets: transcript.changeSets.value,
    outputs: transcript.runOutputs.value,
    runEvents: transcript.runEvents.value,
    runs: transcript.runs.value,
    timelineItems: transcript.timelineItems.value,
  })
  for (const row of projection.rows) {
    if (row.kind === 'message')
      messages.push(row.message)
  }
  return messages
})
const conversationOutline = useConversationOutline({
  activeBranchId: session.activeBranchId,
  activeConversationId: session.activeConversationId,
  currentMessages: currentOutlineMessages,
  loadMessages: session.listActiveConversationMessages,
})
const viewport = useChatViewport({
  activeBranchId: session.activeBranchId,
  activeConversationId: session.activeConversationId,
  activeSearchMessageId,
  hasOlderMessages: transcript.hasOlderMessages,
  isLoading: status.isLoading,
  isLoadingOlderMessages: transcript.isLoadingOlderMessages,
  list: messageList,
  loadOlderMessages: transcript.loadOlderMessages,
  timelineItems: transcript.timelineItems,
})

watch(
  () => [
    session.activeConversationId.value,
    session.activeSpace.value?.id ?? null,
    workspace.welcomePreference.value,
  ] as const,
  (
    [conversationId, spaceId, welcomePreference],
    [previousConversationId, previousSpaceId, previousWelcomePreference],
  ) => {
    if (
      conversationId === null
      && (
        previousConversationId !== null
        || spaceId !== previousSpaceId
        || welcomePreference !== previousWelcomePreference
      )
    ) {
      welcomeVariant.value = selectDesktopChatWelcomeVariant(welcomePreference)
    }
  },
)

async function sendMessage(payload: ChatComposerSubmitPayload) {
  await execution.send(payload)
}

function dismissBlocker() {
  status.dismissChatBlocker()
}
</script>

<template>
  <section class="desktop-chat-page" :class="{ 'is-empty': isEmpty }">
    <main class="desktop-chat-page__content">
      <DesktopChatWelcome
        v-if="isEmpty"
        :language="workspace.language.value"
        :variant="welcomeVariant"
      />

      <div v-else-if="status.isLoading.value" class="desktop-chat-page__loading">
        {{ t('desktop.chat.loading') }}
      </div>

      <BuddyChatMessageList
        v-else
        ref="messageList"
        :active-branch-id="session.activeBranchId.value!"
        :active-search-message-id="activeSearchMessageId"
        :actions-disabled="!execution.canMutateBranch.value"
        :branches="transcript.branches.value"
        :change-sets="transcript.changeSets.value"
        class="desktop-chat-page__messages"
        :has-older-messages="transcript.hasOlderMessages.value"
        :is-loading-older-messages="transcript.isLoadingOlderMessages.value"
        :language="workspace.language.value"
        :matching-search-message-ids="matchingSearchMessageIds"
        :outline-items="conversationOutline.items.value"
        :outline-loading="conversationOutline.isLoading.value"
        :timeline-items="transcript.timelineItems.value"
        :run-events="transcript.runEvents.value"
        :run-outputs="transcript.runOutputs.value"
        :runs="transcript.runs.value"
        :show-return-to-latest="viewport.showReturnToLatest.value"
        @activate-branch="transcript.activateBranch"
        @content-resize="viewport.handleContentResize"
        @edit-user-message="execution.editUserMessage"
        @open-artifact="emit('openArtifact', $event)"
        @open-changes="emit('openChanges', $event)"
        @prepare-outline="conversationOutline.prepare"
        @reader-layout-intent="viewport.handleReaderLayoutIntent"
        @regenerate-assistant="execution.regenerateAssistant"
        @return-to-latest="viewport.returnToLatest"
        @select-outline-message="viewport.revealOutlineMessage"
        @scroll="viewport.handleScroll"
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
            <p>{{ visibleBlocker.kind === 'runtime' && status.runtimeError.value ? status.runtimeError.value : t(`desktop.chat.blocker.${visibleBlocker.kind}.description`) }}</p>
          </div>
          <div class="desktop-chat-page__alert-actions">
            <NButton
              v-if="visibleBlocker.kind === 'runtime' && status.canRestartRuntime.value"
              size="small"
              type="error"
              ghost
              @click="status.restartRuntime"
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

        <article v-else-if="status.errorMessage.value" class="desktop-chat-page__alert is-runtime" role="alert">
          <NIcon :component="Warning20Regular" />
          <div><p>{{ status.errorMessage.value }}</p></div>
        </article>

        <div v-if="runtimeTransitioning" class="desktop-chat-page__starting" role="status">
          <i />{{ t('desktop.chat.runtimeStarting') }}
        </div>

        <div v-if="execution.approvalViews.value.length" class="desktop-chat-page__approvals">
          <DesktopApprovalCard
            v-for="approval in execution.approvalViews.value"
            :key="approval.id"
            :approval="approval"
            :language="workspace.language.value"
            :resolving-action="execution.resolvingApprovalActions.value.get(approval.id) ?? null"
            @approve="execution.resolveApproval(approval.id, 'approve')"
            @approve-turn="execution.resolveApproval(approval.id, 'approveForTurn')"
            @deny="execution.resolveApproval(approval.id, 'deny')"
          />
        </div>

        <DesktopChatComposer
          :attachments="composer.attachments.value"
          :can-update-execution-profile="composer.canUpdateExecutionProfile.value"
          :can-send="execution.canSend.value"
          :composer-content="composer.composerContent.value"
          :context-usage="composer.contextUsage.value"
          :draft="composer.draft.value"
          :execution-profile="composer.executionProfile.value"
          :is-running="Boolean(execution.activeRun.value)"
          :is-selecting-files="composer.isSelectingFiles.value"
          :is-sending="execution.isSending.value"
          :is-updating-execution-profile="composer.isUpdatingExecutionProfile.value"
          :language="workspace.language.value"
          :load-context-options="composer.listContextOptions"
          :models="composer.models.value"
          :providers="composer.providers.value"
          :selected-effort="composer.selectedEffort.value"
          :selected-model="composer.selectedModel.value"
          :selected-model-id="composer.selectedModelId.value"
          :selected-service-tier="composer.selectedServiceTier.value"
          @attach="composer.selectAttachments"
          @attach-files="composer.importAttachments"
          @remove-attachment="composer.removeAttachment"
          @send="sendMessage"
          @stop="execution.cancelActiveRun"
          @update-content="composer.updateComposerContent"
          @update-effort="composer.setSelectedEffort"
          @update-execution-profile="composer.setExecutionProfile"
          @update-model="composer.selectModel"
          @update-service-tier="composer.setSelectedServiceTier"
        >
          <template #leadingContext>
            <slot name="composerLeadingContext" />
          </template>
        </DesktopChatComposer>
      </div>
    </footer>
  </section>
</template>

<style scoped lang="scss">
.desktop-chat-page {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  background: var(--buddy-surface-base);
  container: desktop-chat-page / inline-size;
}

.desktop-chat-page__content {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
}

.desktop-chat-page.is-empty {
  display: grid;
  grid-template-rows: auto auto;
  align-content: center;
  padding-block: 1.5rem;

  .desktop-chat-page__content {
    flex: none;
    overflow: visible;
  }

  .desktop-chat-page__composer-dock {
    padding-top: 3rem;
    padding-bottom: 0;
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
  position: relative;
  z-index: 2;
  flex: none;
  background: var(--buddy-surface-base);
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
  border: 1px solid var(--buddy-status-warning-border);
  border-radius: 0.65rem;
  background: var(--buddy-status-warning-surface);
  color: var(--buddy-text-primary);
  padding: 0.65rem 0.75rem;

  > .n-icon {
    color: var(--buddy-status-warning-text);
    font-size: 1.1rem;
  }

  &.is-runtime {
    border-color: var(--buddy-status-danger-border);
    background: var(--buddy-status-danger-surface);

    > .n-icon {
      color: var(--buddy-status-danger-text);
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
    background: var(--buddy-status-warning-solid);
    animation: desktop-runtime-pulse 1.2s ease-in-out infinite;
  }
}

@keyframes desktop-runtime-pulse {
  50% { opacity: 0.35; }
}

@container desktop-chat-page (max-width: 34rem) {
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
