<script setup lang="ts">
import type { JSONContent } from '@tiptap/core'
import type { BuddyChatRuntimeOption } from '@/chat/buddyChatRuntimeControls'
import type {
  BuddyChatConversationListItem,
  BuddyChatProjectListItem,
  BuddyChatWorkspaceTarget,
} from '@/chat/buddyChatWorkspace'
import type { BuddyChatDraftAttachment } from '@/chat/chatAttachmentView'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type {
  BuddyApproval,
  BuddyAppSettings,
  BuddyChatModelSelection,
  BuddyChatPromptContextItem,
  BuddyChatRunEvent,
  BuddyClaudeRuntimeStatus,
  BuddyCodexRuntimeStatus,
  BuddyCodexUserInput,
  BuddyMessage,
  BuddyRuntime,
} from '@/lib/tauriRuntime'
import { computed } from 'vue'
import newConversationArchmageUrl from '@/assets/window/new-conversation-archmage.png'
import BuddyChatApprovalBanner from '@/chat/BuddyChatApprovalBanner.vue'
import BuddyChatComposer from '@/chat/BuddyChatComposer.vue'
import BuddyChatHistoryDrawer from '@/chat/BuddyChatHistoryDrawer.vue'
import BuddyChatMessageList from '@/chat/BuddyChatMessageList.vue'
import BuddyChatWindowFrame from '@/chat/BuddyChatWindowFrame.vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { createApprovalViewRows } from '@/panel/approvalView'

const props = defineProps<{
  appSettings: BuddyAppSettings
  approvals: ReadonlyArray<BuddyApproval>
  claudeRuntimeStatus: BuddyClaudeRuntimeStatus
  codexRuntimeStatus: BuddyCodexRuntimeStatus
  composerDraft: {
    attachments: ReadonlyArray<BuddyChatDraftAttachment>
    contentJSON: JSONContent
    modelSelection: BuddyChatModelSelection | null
  } | null
  composerVersion: number
  currentCwd: string | null
  currentTarget: BuddyChatWorkspaceTarget
  drawerOpen: boolean
  errorMessage: string | null
  globalConversationItems: ReadonlyArray<BuddyChatConversationListItem>
  hasMessages: boolean
  headerTitle: string
  isAddingProject: boolean
  isLoading: boolean
  isResolvingApproval: boolean
  isSending: boolean
  language: BuddyLocale
  messages: ReadonlyArray<BuddyMessage>
  projectItems: ReadonlyArray<BuddyChatProjectListItem>
  runEvents: ReadonlyArray<BuddyChatRunEvent>
  selectedRuntime: BuddyRuntime
  runtimeOptions: ReadonlyArray<BuddyChatRuntimeOption>
  showRuntimeSelector: boolean
}>()

const emit = defineEmits<{
  addProject: []
  approveApproval: [approvalId: string, approvalKind: string]
  composerError: [message: string]
  denyApproval: [approvalId: string]
  draftChange: [payload: {
    attachments: ReadonlyArray<BuddyChatDraftAttachment>
    contentJSON: JSONContent
    modelSelection: BuddyChatModelSelection | null
  }]
  openGlobalDraft: []
  openProjectDraft: [projectRoot: string]
  openConversation: [conversationId: string]
  deleteConversation: [conversationId: string]
  send: [payload: {
    attachments: ReadonlyArray<BuddyChatDraftAttachment>
    runtime: BuddyRuntime
    content: string
    contextItems: ReadonlyArray<BuddyChatPromptContextItem>
    inputs: ReadonlyArray<BuddyCodexUserInput>
    modelSelection: BuddyChatModelSelection | null
  }]
  stop: []
  updateRuntime: [runtime: BuddyRuntime]
  updateDrawerOpen: [value: boolean]
}>()

const { t } = useBuddyI18n(() => props.language)
const approvalRows = computed(() => createApprovalViewRows(props.approvals))

function send(payload: {
  attachments: ReadonlyArray<BuddyChatDraftAttachment>
  content: string
  contextItems: ReadonlyArray<BuddyChatPromptContextItem>
  inputs: ReadonlyArray<BuddyCodexUserInput>
  modelSelection: BuddyChatModelSelection | null
}) {
  emit('send', {
    ...payload,
    runtime: props.selectedRuntime,
  })
}

function closeDrawer() {
  emit('updateDrawerOpen', false)
}
</script>

<template>
  <BuddyChatWindowFrame
    :language="language"
    :title="headerTitle"
    @avatar-click="emit('updateDrawerOpen', !drawerOpen)"
  >
    <section class="buddy-chat">
      <span
        aria-hidden="true"
        class="buddy-chat__background-ornament is-top-left"
      />
      <span
        aria-hidden="true"
        class="buddy-chat__background-ornament is-top-right"
      />
      <span
        aria-hidden="true"
        class="buddy-chat__background-ornament is-bottom-left"
      />
      <span
        aria-hidden="true"
        class="buddy-chat__background-ornament is-bottom-right"
      />

      <BuddyChatHistoryDrawer
        :show="drawerOpen"
        :global-conversation-items="globalConversationItems"
        :is-adding-project="isAddingProject"
        :language="language"
        :project-items="projectItems"
        :target="currentTarget"
        @update:show="emit('updateDrawerOpen', $event)"
        @add-project="emit('addProject')"
        @delete-conversation="emit('deleteConversation', $event)"
        @open-global-draft="emit('openGlobalDraft')"
        @open-project-draft="emit('openProjectDraft', $event)"
        @open-conversation="emit('openConversation', $event)"
      />

      <Transition name="buddy-chat-drawer-overlay">
        <button
          v-if="drawerOpen"
          class="buddy-chat__drawer-overlay"
          type="button"
          :aria-label="t('chat.closeHistoryDrawer')"
          @click="closeDrawer"
        />
      </Transition>

      <main class="buddy-chat__conversation">
        <div class="buddy-chat__messages">
          <BuddyChatMessageList
            v-if="hasMessages || runEvents.length > 0"
            :language="language"
            :messages="messages"
            :run-events="runEvents"
          />

          <div
            v-else
            class="buddy-chat__empty"
          >
            <img
              alt=""
              class="buddy-chat__empty-illustration"
              draggable="false"
              :src="newConversationArchmageUrl"
            >
            <p class="buddy-chat__empty-title">
              {{ t('chat.startNewConversation') }}
            </p>
          </div>
        </div>

        <p
          v-if="errorMessage"
          class="buddy-chat__error"
        >
          {{ errorMessage }}
        </p>

        <BuddyChatApprovalBanner
          :is-resolving-approval="isResolvingApproval"
          :language="language"
          :rows="approvalRows"
          @approve-approval="(approvalId, approvalKind) => emit('approveApproval', approvalId, approvalKind)"
          @deny-approval="emit('denyApproval', $event)"
        />

        <BuddyChatComposer
          :cwd="currentCwd"
          :disabled="isLoading"
          :draft="composerDraft"
          :draft-version="composerVersion"
          :is-sending="isSending"
          :language="language"
          :runtime-options="runtimeOptions"
          :selected-runtime="selectedRuntime"
          :show-runtime-selector="showRuntimeSelector"
          @draft-change="emit('draftChange', $event)"
          @error="emit('composerError', $event)"
          @send="send"
          @stop="emit('stop')"
          @update-runtime="emit('updateRuntime', $event)"
        />
      </main>
    </section>
  </BuddyChatWindowFrame>
</template>

<style scoped lang="scss">
.buddy-chat {
  --buddy-chat-body-art-width: clamp(760px, 112vw, 1180px);
  --buddy-history-drawer-width: min(276px, 72vw);

  position: relative;
  isolation: isolate;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-width: 0;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background:
    radial-gradient(ellipse at 16% 8%, rgb(137 192 210 / 16%) 0 96px, transparent 252px),
    radial-gradient(ellipse at 82% 86%, rgb(205 230 229 / 32%) 0 170px, transparent 410px),
    linear-gradient(180deg, rgb(255 253 247 / 95%) 0%, rgb(245 250 247 / 88%) 52%, rgb(250 247 238 / 92%) 100%);
}

.buddy-chat::before,
.buddy-chat::after {
  position: absolute;
  inset: 0;
  content: "";
  pointer-events: none;
}

.buddy-chat::before {
  z-index: 0;
  background: url('../assets/window/chat-body.webp') center / 100% 100% no-repeat;
  opacity: 0.26;
}

.buddy-chat::after {
  z-index: 2;
  background:
    radial-gradient(ellipse at 50% 46%, rgb(255 253 247 / 76%) 0 34%, rgb(255 253 247 / 34%) 56%, rgb(255 253 247 / 0%) 78%),
    linear-gradient(90deg, rgb(255 253 247 / 30%) 0%, rgb(255 253 247 / 18%) 24%, rgb(255 253 247 / 0%) 58%),
    linear-gradient(180deg, rgb(255 255 255 / 26%) 0%, rgb(255 255 255 / 0%) 30%, rgb(255 255 255 / 20%) 100%);
}

.buddy-chat__background-ornament {
  position: absolute;
  z-index: 1;
  background-image: url('../assets/window/chat-body.webp');
  background-repeat: no-repeat;
  background-size: var(--buddy-chat-body-art-width) auto;
  filter: saturate(0.95) contrast(1.02);
  pointer-events: none;
}

.buddy-chat__background-ornament.is-top-left {
  top: 0;
  left: 0;
  width: clamp(170px, 30vw, 300px);
  height: clamp(170px, 32vh, 300px);
  background-position: left top;
  mask-image: radial-gradient(ellipse at top left, #000 0 38%, rgb(0 0 0 / 72%) 52%, transparent 76%);
  opacity: 0.58;
  -webkit-mask-image: radial-gradient(ellipse at top left, #000 0 38%, rgb(0 0 0 / 72%) 52%, transparent 76%);
}

.buddy-chat__background-ornament.is-top-right {
  top: 0;
  right: 0;
  width: clamp(140px, 24vw, 260px);
  height: clamp(140px, 26vh, 250px);
  background-position: right top;
  mask-image: radial-gradient(ellipse at top right, #000 0 34%, rgb(0 0 0 / 64%) 50%, transparent 76%);
  opacity: 0.26;
  -webkit-mask-image: radial-gradient(ellipse at top right, #000 0 34%, rgb(0 0 0 / 64%) 50%, transparent 76%);
}

.buddy-chat__background-ornament.is-bottom-left {
  bottom: 0;
  left: 0;
  width: clamp(180px, 28vw, 310px);
  height: clamp(170px, 30vh, 300px);
  background-position: left bottom;
  mask-image: radial-gradient(ellipse at bottom left, #000 0 32%, rgb(0 0 0 / 58%) 48%, transparent 74%);
  opacity: 0.22;
  -webkit-mask-image: radial-gradient(ellipse at bottom left, #000 0 32%, rgb(0 0 0 / 58%) 48%, transparent 74%);
}

.buddy-chat__background-ornament.is-bottom-right {
  right: 0;
  bottom: 0;
  width: clamp(220px, 36vw, 390px);
  height: clamp(210px, 38vh, 390px);
  background-position: right bottom;
  mask-image: radial-gradient(ellipse at bottom right, #000 0 40%, rgb(0 0 0 / 72%) 54%, transparent 78%);
  opacity: 0.58;
  -webkit-mask-image: radial-gradient(ellipse at bottom right, #000 0 40%, rgb(0 0 0 / 72%) 54%, transparent 78%);
}

.buddy-chat__drawer-overlay {
  position: absolute;
  z-index: 4;
  inset: 0 0 0 var(--buddy-history-drawer-width);
  border: 0;
  appearance: none;
  background-color: rgb(0 0 0 / 40%);
  cursor: pointer;
  padding: 0;
}

.buddy-chat__drawer-overlay:focus-visible {
  outline: 1px solid rgb(255 234 186 / 64%);
  outline-offset: -4px;
}

.buddy-chat-drawer-overlay-enter-active,
.buddy-chat-drawer-overlay-leave-active {
  transition: opacity 0.16s ease;
}

.buddy-chat-drawer-overlay-enter-from,
.buddy-chat-drawer-overlay-leave-to {
  opacity: 0;
}

.buddy-chat__conversation {
  position: relative;
  z-index: 3;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto auto;
  gap: 7px;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  padding: 10px 7px 8px 12px;
}

.buddy-chat__messages {
  min-height: 0;
  overflow: hidden;
  padding: 3px 0 3px 8px;
}

.buddy-chat__empty {
  display: grid;
  gap: 12px;
  padding-top: 20px;
  align-content: flex-start;
  place-items: center;
  min-height: 100%;
}

.buddy-chat__empty-illustration {
  width: clamp(210px, 38vw, 310px);
  max-width: min(76%, 310px);
  max-height: min(36vh, 310px);
  object-fit: contain;
  filter: drop-shadow(0 16px 28px rgb(35 47 61 / 14%));
  opacity: 0.98;
  pointer-events: none;
  user-select: none;
}

.buddy-chat__empty-title {
  margin: 0;
  color: rgb(56 54 50 / 82%);
  font-size: 18px;
  font-weight: 600;
  line-height: 1.4;
  text-align: center;
  text-shadow: 0 1px 0 rgb(255 255 255 / 72%);
}

.buddy-chat__error {
  margin: 0;
  border: 1px solid color-mix(in srgb, var(--buddy-accent-danger) 28%, var(--buddy-border-light));
  border-radius: 8px;
  background: color-mix(in srgb, var(--buddy-accent-danger) 8%, var(--buddy-bg-surface));
  color: var(--buddy-accent-danger);
  font-size: 13px;
  line-height: 1.6;
  padding: 10px 12px;
}

@media (max-width: 620px) {
  .buddy-chat__conversation {
    padding: 8px 7px;
  }
}
</style>
