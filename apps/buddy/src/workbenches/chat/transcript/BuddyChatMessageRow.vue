<script setup lang="ts">
import type { LocalMessage } from '@buddy-electron/shared/localChatApi'
import type { ChatMessageBranchNavigator } from './chatMessageBranches'
import type { ChatTranscriptTurnOutputs } from './chatTranscriptProjection'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { useTimeoutFn } from '@vueuse/core'
import { NButton, NInput, NTooltip, useMessage } from 'naive-ui'
import { computed, shallowRef, watch } from 'vue'
import { useDesktopApp } from '@/app/desktopAppContext'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopIcon from '@/ui/DesktopIcon.vue'
import BuddyChatAgentIdentity from './BuddyChatAgentIdentity.vue'
import BuddyChatMessageContent from './BuddyChatMessageContent.vue'
import BuddyChatTurnOutputs from './BuddyChatTurnOutputs.vue'
import { renderChatMarkdown } from './chatMarkdown'
import { projectChatMessageActions } from './chatMessageActions'
import {
  getChatMessageInterruption,
  getChatMessageText,
} from './chatMessageContent'
import { formatChatMessageTimeLabel } from './chatMessageTime'

const props = defineProps<{
  actionsDisabled: boolean
  activeSearch: boolean
  branchNavigator: ChatMessageBranchNavigator | null
  editing: boolean
  isAgentTurnResult: boolean
  language: BuddyLocale
  message: LocalMessage
  searchMatch: boolean
  turnOutputs: ChatTranscriptTurnOutputs | null
}>()

const emit = defineEmits<{
  activateBranch: [branchId: string]
  cancelEdit: []
  edit: [content: string]
  openArtifact: [artifactId: string]
  regenerate: []
  startEdit: []
}>()

const { t } = useBuddyI18n(() => props.language)
const { clipboard } = useDesktopApp()
const notification = useMessage()
const editingText = shallowRef('')
const copied = shallowRef(false)
const copyReset = useTimeoutFn(() => copied.value = false, 1_400, { immediate: false })
const actions = computed(() => projectChatMessageActions(
  props.message,
  props.actionsDisabled,
))
const showAssistantIdentity = computed(() => (
  props.message.role === 'assistant' && !props.isAgentTurnResult
))
const showActions = computed(() => (
  actions.value.showCopy
  || actions.value.showEdit
  || actions.value.showRegenerate
  || actions.value.showTime
  || props.branchNavigator !== null
))
const html = computed(() => renderChatMarkdown(getChatMessageText(props.message)))
const interruptionLabel = computed(() => {
  const interruption = getChatMessageInterruption(props.message)
  if (!interruption)
    return null
  return t(interruption.truncated
    ? 'desktop.chat.messageInterruptedTruncated'
    : 'desktop.chat.messageInterrupted')
})
const roleLabel = computed(() => t(`message.role.${props.message.role}`))
const timeLabel = computed(() => formatChatMessageTimeLabel(props.message.createdAt))

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

async function copyMessage() {
  const text = getChatMessageText(props.message)
  if (!text)
    return
  try {
    await clipboard.writeText(text)
    copied.value = true
    copyReset.stop()
    copyReset.start()
  }
  catch {
    notification.error(t('desktop.chat.copyFailed'))
  }
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
      :html="html"
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
    <small
      v-if="interruptionLabel"
      class="buddy-chat-message__interruption"
      role="status"
    >
      {{ interruptionLabel }}
    </small>
    <div v-if="!editing && showActions" class="buddy-chat-message__actions">
      <time
        v-if="actions.showTime && message.role === 'user'"
        class="buddy-chat-message__time"
        :datetime="message.createdAt"
      >
        {{ timeLabel }}
      </time>
      <NTooltip v-if="actions.showCopy" placement="bottom">
        <template #trigger>
          <NButton
            class="buddy-icon-button buddy-chat-message__copy-button"
            :class="{ 'is-copied': copied }"
            quaternary
            size="tiny"
            :aria-label="t(copied ? 'desktop.chat.copied' : 'desktop.chat.copy')"
            @click="copyMessage"
          >
            <template #icon>
              <DesktopIcon :name="copied ? 'messageCopied' : 'messageCopy'" />
            </template>
          </NButton>
        </template>
        {{ t(copied ? 'desktop.chat.copied' : 'desktop.chat.copy') }}
      </NTooltip>
      <NTooltip v-if="actions.showEdit" placement="bottom">
        <template #trigger>
          <NButton
            :data-testid="`edit-message-${message.id}`"
            :disabled="actions.disabled"
            class="buddy-icon-button"
            quaternary
            size="tiny"
            :aria-label="t('desktop.chat.editMessage')"
            @click="emit('startEdit')"
          >
            <template #icon>
              <DesktopIcon name="messageEdit" />
            </template>
          </NButton>
        </template>
        {{ t('desktop.chat.editMessage') }}
      </NTooltip>
      <NTooltip v-if="actions.showRegenerate" placement="bottom">
        <template #trigger>
          <NButton
            :data-testid="`regenerate-message-${message.id}`"
            :disabled="actions.disabled"
            class="buddy-icon-button"
            quaternary
            size="tiny"
            :aria-label="t('desktop.chat.regenerate')"
            @click="emit('regenerate')"
          >
            <template #icon>
              <DesktopIcon name="messageRetry" />
            </template>
          </NButton>
        </template>
        {{ t('desktop.chat.regenerate') }}
      </NTooltip>
      <div v-if="branchNavigator" class="buddy-chat-message__branch">
        <NTooltip placement="bottom">
          <template #trigger>
            <NButton
              :disabled="actions.disabled || !branchNavigator.previousBranchId"
              class="buddy-icon-button buddy-chat-message__branch-button"
              quaternary
              size="tiny"
              :aria-label="t('desktop.chat.previousBranch')"
              @click="emit('activateBranch', branchNavigator.previousBranchId!)"
            >
              <template #icon>
                <DesktopIcon name="messageBranchPrevious" />
              </template>
            </NButton>
          </template>
          {{ t('desktop.chat.previousBranch') }}
        </NTooltip>
        <span>{{ branchNavigator.index }} / {{ branchNavigator.count }}</span>
        <NTooltip placement="bottom">
          <template #trigger>
            <NButton
              :disabled="actions.disabled || !branchNavigator.nextBranchId"
              class="buddy-icon-button buddy-chat-message__branch-button"
              quaternary
              size="tiny"
              :aria-label="t('desktop.chat.nextBranch')"
              @click="emit('activateBranch', branchNavigator.nextBranchId!)"
            >
              <template #icon>
                <DesktopIcon name="messageBranchNext" />
              </template>
            </NButton>
          </template>
          {{ t('desktop.chat.nextBranch') }}
        </NTooltip>
      </div>
      <time
        v-if="actions.showTime && message.role === 'assistant'"
        class="buddy-chat-message__time"
        :datetime="message.createdAt"
      >
        {{ timeLabel }}
      </time>
    </div>
  </article>
</template>

<style scoped lang="scss">
.buddy-chat-message.is-assistant-turn-result {
  row-gap: var(--buddy-chat-gap-tight);
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
  display: flex;
  min-height: 1.5rem;
  align-items: center;
  gap: 0.15rem;
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

  :deep(.n-button) {
    color: var(--buddy-text-secondary);
    font-size: 0.68rem;
  }
}

.buddy-chat-message__branch {
  display: inline-flex;
  align-items: center;
  gap: 0.05rem;
  margin-left: 0.1rem;
  color: var(--buddy-text-secondary);
  font-size: 0.7rem;
  font-variant-numeric: tabular-nums;

  > span {
    min-width: 2.25rem;
    text-align: center;
  }
}

.buddy-chat-message__time {
  color: var(--buddy-text-muted);
  font-size: 0.68rem;
  font-variant-numeric: tabular-nums;
  font-weight: 400;
  line-height: 1.35rem;
  padding-inline: 0.2rem;
  white-space: nowrap;
}

.buddy-chat-message__copy-button {
  transition:
    background-color 160ms ease,
    color 160ms ease;

  &.is-copied {
    background: var(--buddy-accent-surface);
    color: var(--buddy-accent-text);
  }
}

.buddy-chat-message__branch-button {
  width: 1.35rem;
  min-width: 1.35rem;
  height: 1.35rem;
  border-radius: var(--buddy-icon-button-radius);
  padding: 0;

  :deep(.n-button__icon) {
    font-size: 1rem;
  }
}

@media (hover: none) {
  .buddy-chat-message__actions {
    opacity: 1;
    pointer-events: auto;
  }
}
</style>
