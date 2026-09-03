<script setup lang="ts">
import type { LocalChangeSetSummary, LocalMessage } from '@buddy-electron/shared/localChatApi'
import type { ChatMessageBranchNavigator } from './chatMessageBranches'
import type { ChatTranscriptTurnOutputs } from './chatTranscriptProjection'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { NButton, NInput } from 'naive-ui'
import { computed, shallowRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import BuddyChatActionToolbar from './BuddyChatActionToolbar.vue'
import BuddyChatAgentIdentity from './BuddyChatAgentIdentity.vue'
import BuddyChatMessageContent from './BuddyChatMessageContent.vue'
import BuddyChatTurnChanges from './BuddyChatTurnChanges.vue'
import BuddyChatTurnOutputs from './BuddyChatTurnOutputs.vue'
import { projectChatMessageActions } from './chatMessageActions'
import {
  getChatMessageDisplayText,
  getChatMessageInterruption,
  getChatMessageText,
} from './chatMessageContent'

const props = defineProps<{
  actionsDisabled: boolean
  activeSearch: boolean
  branchNavigator: ChatMessageBranchNavigator | null
  editing: boolean
  isAgentTurnResult: boolean
  language: BuddyLocale
  message: LocalMessage
  searchMatch: boolean
  streaming?: boolean
  turnChanges?: LocalChangeSetSummary | null
  turnOutputs: ChatTranscriptTurnOutputs | null
}>()

const emit = defineEmits<{
  activateBranch: [branchId: string]
  cancelEdit: []
  edit: [content: string]
  openArtifact: [artifactId: string]
  openChanges: [changeSetId: string]
  regenerate: []
  startEdit: []
}>()

const { t } = useBuddyI18n(() => props.language)
const editingText = shallowRef('')
const actions = computed(() => projectChatMessageActions(
  props.message,
  props.actionsDisabled,
))
const showAssistantIdentity = computed(() => (
  props.message.role === 'assistant' && !props.isAgentTurnResult
))
const showActions = computed(() => (
  !props.streaming
  && (
    actions.value.showCopy
    || actions.value.showEdit
    || actions.value.showRegenerate
    || actions.value.showTime
    || props.branchNavigator !== null
  )
))
const interruptionLabel = computed(() => {
  const interruption = getChatMessageInterruption(props.message)
  if (!interruption)
    return null
  return t(interruption.truncated
    ? 'desktop.chat.messageInterruptedTruncated'
    : 'desktop.chat.messageInterrupted')
})
const roleLabel = computed(() => t(`message.role.${props.message.role}`))
const presentedArtifacts = computed(() => props.turnOutputs?.artifacts ?? [])
const messageText = computed(() => getChatMessageDisplayText(
  props.message,
  presentedArtifacts.value,
))

watch(
  [() => props.editing, () => props.message.id],
  ([editing]) => {
    if (editing)
      editingText.value = getChatMessageText(props.message)
  },
  { immediate: true },
)

function submitEdit() {
  const content = editingText.value.trim()
  if (!content && !props.message.attachments.length)
    return
  emit('edit', content)
}
</script>

<template>
  <article
    class="buddy-chat-message"
    :class="[
      `is-${message.role}`,
      {
        'is-search-active': activeSearch,
        'is-assistant-turn-result': isAgentTurnResult,
        'is-editing': editing,
        'is-search-match': searchMatch,
        'is-streaming': streaming,
      },
    ]"
    :data-message-id="message.id"
  >
    <BuddyChatAgentIdentity
      v-if="showAssistantIdentity"
      :language="language"
    />
    <span
      v-else-if="message.role !== 'user' && message.role !== 'assistant'"
      class="buddy-chat-message__role"
    >
      {{ roleLabel }}
    </span>
    <div v-if="editing" class="buddy-chat-message__editor">
      <NInput
        v-model:value="editingText"
        :autosize="{ minRows: 2, maxRows: 10 }"
        :disabled="actions.disabled"
        type="textarea"
      />
      <div class="buddy-chat-message__editor-actions">
        <NButton size="small" @click="emit('cancelEdit')">
          {{ t('common.cancel') }}
        </NButton>
        <NButton
          :disabled="(!editingText.trim() && !message.attachments.length) || actions.disabled"
          size="small"
          type="primary"
          @click="submitEdit"
        >
          {{ t('desktop.chat.saveEdit') }}
        </NButton>
      </div>
    </div>
    <BuddyChatMessageContent
      v-else
      class="buddy-chat-message__body"
      :final="!streaming"
      :hidden-artifacts="presentedArtifacts"
      :language="language"
      :message="message"
    />
    <BuddyChatTurnOutputs
      v-if="turnOutputs"
      :artifacts="turnOutputs.artifacts"
      class="buddy-chat-message__outputs"
      :language="language"
      @open-artifact="emit('openArtifact', $event)"
    />
    <BuddyChatTurnChanges
      v-if="turnChanges"
      :change-set="turnChanges"
      class="buddy-chat-message__changes"
      :language="language"
      @open-changes="emit('openChanges', $event)"
    />
    <small
      v-if="interruptionLabel"
      class="buddy-chat-message__interruption"
      role="status"
    >
      {{ interruptionLabel }}
    </small>
    <BuddyChatActionToolbar
      v-if="!editing && showActions"
      :actions="actions"
      :branch-navigator="branchNavigator"
      class="buddy-chat-message__actions"
      :copy-text="messageText"
      :created-at="message.createdAt"
      :language="language"
      :role="message.role"
      :target-key="`message-${message.id}`"
      @activate-branch="emit('activateBranch', $event)"
      @regenerate="emit('regenerate')"
      @start-edit="emit('startEdit')"
    />
  </article>
</template>

<style scoped lang="scss">
.buddy-chat-message.is-assistant-turn-result {
  row-gap: var(--buddy-chat-gap-tight);
}

.buddy-chat-message.is-streaming.is-assistant-turn-result {
  padding-bottom: var(--buddy-chat-gap-block);
}

.buddy-chat-message {
  position: relative;
  display: grid;
  gap: var(--buddy-chat-gap-block);
  padding-bottom: var(--buddy-chat-gap-turn);

  &.is-user {
    justify-items: end;
  }

  &.is-editing {
    justify-items: stretch;
  }

  &.is-assistant {
    align-items: start;
  }

  &.is-tool {
    color: var(--buddy-text-secondary);
    font-size: 0.75rem;
  }
}

.buddy-chat-message__editor {
  display: grid;
  width: 100%;
  gap: 0.65rem;
  border: 1px solid var(--buddy-accent-border);
  border-radius: 0.75rem;
  background: var(--buddy-surface-raised);
  padding: 0.75rem;

  :deep(.n-input) {
    --n-border: 0 !important;
    --n-border-hover: 0 !important;
    --n-border-focus: 0 !important;
    --n-box-shadow-focus: none !important;
    background: transparent;
  }
}

.buddy-chat-message__editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.45rem;
}

.buddy-chat-message__role {
  display: grid;
  width: var(--buddy-chat-avatar-size);
  min-height: var(--buddy-chat-avatar-size);
  place-items: center;
  color: var(--buddy-text-muted);
  font-size: 0.65rem;
  font-weight: 650;
}

.buddy-chat-message.is-search-match :deep(.buddy-chat-message-content__text) {
  border-radius: 0.6rem;
  background: var(--buddy-status-warning-surface);
  box-shadow: inset 2px 0 var(--buddy-status-warning-border);
}

.buddy-chat-message.is-search-active :deep(.buddy-chat-message-content__text) {
  outline: 1px solid var(--buddy-status-warning-border);
  outline-offset: 1px;
}

.buddy-chat-message.is-assistant.is-search-match :deep(.buddy-chat-message-content__text) {
  width: fit-content;
  max-width: 100%;
  justify-self: start;
  padding: 0.35rem 0.55rem;
}

.buddy-chat-message__interruption {
  max-width: min(42rem, 92%);
  color: var(--buddy-text-secondary);
  font-size: 0.75rem;
  line-height: 1.5;
}

.buddy-chat-message__actions {
  position: absolute;
  bottom: var(--buddy-chat-gap-tight);
  left: var(--buddy-chat-inline-gutter);
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease;

  .buddy-chat-message:hover &,
  .buddy-chat-message:focus-within & {
    opacity: 1;
    pointer-events: auto;
  }

  .is-user & {
    right: var(--buddy-chat-inline-gutter);
    left: auto;
    justify-content: flex-end;
  }

}

@media (hover: none) {
  .buddy-chat-message__actions {
    opacity: 1;
    pointer-events: auto;
  }
}
</style>
