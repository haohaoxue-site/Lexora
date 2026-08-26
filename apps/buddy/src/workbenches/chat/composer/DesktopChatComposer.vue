<script setup lang="ts">
import type {
  LocalAttachment,
  LocalProvider,
  LocalRuntimeModelOption,
  LocalWorkspaceDraft,
} from '@buddy-electron/shared/localChatApi'
import type { BuddyExecutionProfile } from '@buddy-shared/executionProfile'
import type {
  BuddyServiceTier,
  BuddyThinkingLevel,
} from '@buddy-shared/modelSelection'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type {
  ChatComposerContextOptions,
  ChatComposerSubmitPayload,
} from '@/workbenches/chat/composer/chatComposerInput'
import type { ChatContextUsage as ChatContextUsageValue } from '@/workbenches/chat/composer/chatContextUsage'
import { EditorContent } from '@tiptap/vue-3'
import {
  Add20Regular,
  ArrowUp20Regular,
  Dismiss16Regular,
  Stop20Filled,
} from '@vicons/fluent'
import { NButton, NIcon } from 'naive-ui'
import { toRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopModelSelector from '@/ui/model-selector/DesktopModelSelector.vue'
import ChatContextUsage from '@/workbenches/chat/composer/ChatContextUsage.vue'
import DesktopChatComposerFrame from '@/workbenches/chat/composer/DesktopChatComposerFrame.vue'
import DesktopExecutionProfileSelector from '@/workbenches/chat/composer/DesktopExecutionProfileSelector.vue'
import { useChatComposer } from '@/workbenches/chat/composer/useChatComposer'
import { resolveBuddyAttachmentPreviewUrl } from '@/workbenches/chat/transcript/chatAttachmentView'

const props = defineProps<{
  attachments: ReadonlyArray<LocalAttachment>
  canUpdateExecutionProfile: boolean
  canSend: boolean
  composerContent: LocalWorkspaceDraft['composerContent']
  contextUsage: ChatContextUsageValue | null
  draft: string
  executionProfile: BuddyExecutionProfile
  isRunning: boolean
  isSelectingFiles: boolean
  isSending: boolean
  isUpdatingExecutionProfile: boolean
  language: BuddyLocale
  loadContextOptions: (fileQuery: string | null) => Promise<ChatComposerContextOptions>
  models: ReadonlyArray<LocalRuntimeModelOption>
  providers: ReadonlyArray<LocalProvider>
  selectedEffort: BuddyThinkingLevel | null
  selectedModel: LocalRuntimeModelOption | null
  selectedModelId: string | null
  selectedServiceTier: BuddyServiceTier | null
}>()

const emit = defineEmits<{
  attach: []
  attachFiles: [files: ReadonlyArray<File>]
  removeAttachment: [index: number]
  send: [payload: ChatComposerSubmitPayload]
  stop: []
  updateContent: [content: string, value: LocalWorkspaceDraft['composerContent']]
  updateEffort: [value: BuddyThinkingLevel | null]
  updateExecutionProfile: [value: BuddyExecutionProfile]
  updateModel: [value: string]
  updateServiceTier: [value: BuddyServiceTier | null]
}>()
defineSlots<{
  leadingContext?: () => unknown
}>()

const { t } = useBuddyI18n(() => props.language)
const {
  activeSuggestionIndex,
  canSubmit,
  editor,
  isLoadingContext,
  selectSuggestion,
  submit,
  suggestionKind,
  suggestions,
} = useChatComposer({
  attachments: toRef(props, 'attachments'),
  canSend: toRef(props, 'canSend'),
  composerContent: toRef(props, 'composerContent'),
  draft: toRef(props, 'draft'),
  isRunning: toRef(props, 'isRunning'),
  isSending: toRef(props, 'isSending'),
  language: toRef(props, 'language'),
  loadContextOptions: props.loadContextOptions,
  onAttachFiles: files => emit('attachFiles', files),
  onSend: payload => emit('send', payload),
  onUpdateContent: (content, value) => emit('updateContent', content, value),
})

function handleFileDragover(event: DragEvent) {
  if (event.dataTransfer?.types.includes('Files'))
    event.preventDefault()
}

function handleFileDrop(event: DragEvent) {
  const files = [...(event.dataTransfer?.files ?? [])]
  if (!files.length)
    return

  event.preventDefault()
  emit('attachFiles', files)
}
</script>

<template>
  <DesktopChatComposerFrame
    class="desktop-chat-composer-wrap"
    @dragover="handleFileDragover"
    @drop="handleFileDrop"
  >
    <template #attachments>
      <div v-if="attachments.length" class="desktop-chat-composer__attachments">
        <div v-for="(attachment, index) in attachments" :key="attachment.attachmentId">
          <img
            v-if="attachment.kind === 'image' && resolveBuddyAttachmentPreviewUrl(attachment)"
            :src="resolveBuddyAttachmentPreviewUrl(attachment) ?? undefined"
            :alt="attachment.name"
            height="29"
            width="29"
          >
          <span v-else class="desktop-chat-composer__file-kind">
            {{ attachment.kind === 'text' ? 'TXT' : 'FILE' }}
          </span>
          <span>{{ attachment.name }}</span>
          <NButton
            class="buddy-icon-button"
            quaternary
            size="tiny"
            :aria-label="t('desktop.chat.removeAttachment')"
            @click="emit('removeAttachment', index)"
          >
            <template #icon>
              <NIcon :component="Dismiss16Regular" />
            </template>
          </NButton>
        </div>
      </div>
    </template>

    <template #editor>
      <EditorContent v-if="editor" :editor="editor" />
      <div
        v-if="suggestions.length || isLoadingContext"
        class="desktop-chat-composer__suggestions"
      >
        <span v-if="isLoadingContext && !suggestions.length" class="desktop-chat-composer__suggestion-empty">
          {{ t('desktop.chat.loadingContext') }}
        </span>
        <button
          v-for="(suggestion, index) in suggestions"
          :key="`${suggestion.option.kind}:${suggestion.option.value}:${suggestion.option.path ?? ''}`"
          class="desktop-chat-composer__suggestion"
          :class="{ 'is-active': index === activeSuggestionIndex }"
          type="button"
          @mousedown.prevent="selectSuggestion(suggestion.option)"
        >
          <span class="desktop-chat-composer__suggestion-kind">
            {{ suggestionKind(suggestion.option) }}
          </span>
          <span>
            <strong>{{ suggestion.option.label }}</strong>
            <small v-if="suggestion.option.description">{{ suggestion.option.description }}</small>
          </span>
        </button>
      </div>
    </template>

    <template #leading>
      <NButton
        class="buddy-icon-button"
        quaternary
        :aria-label="t('desktop.chat.addAttachment')"
        :disabled="isSelectingFiles || isSending"
        @click="emit('attach')"
      >
        <template #icon>
          <NIcon :component="Add20Regular" />
        </template>
      </NButton>

      <slot name="leadingContext" />

      <DesktopExecutionProfileSelector
        :can-update="canUpdateExecutionProfile"
        :execution-profile="executionProfile"
        :is-updating="isUpdatingExecutionProfile"
        :language="language"
        @update-execution-profile="emit('updateExecutionProfile', $event)"
      />
    </template>

    <template #actions>
      <ChatContextUsage
        :is-running="isRunning"
        :language="language"
        :usage="contextUsage"
      />

      <DesktopModelSelector
        :disabled="isSending"
        :language="language"
        :models="models"
        :providers="providers"
        :selected-effort="selectedEffort"
        :selected-model="selectedModel"
        :selected-model-id="selectedModelId"
        :selected-service-tier="selectedServiceTier"
        @update-effort="emit('updateEffort', $event)"
        @update-model="emit('updateModel', $event)"
        @update-service-tier="emit('updateServiceTier', $event)"
      />

      <NButton
        v-if="isRunning"
        class="buddy-icon-button"
        secondary
        type="error"
        :aria-label="t('desktop.chat.stop')"
        @click="emit('stop')"
      >
        <template #icon>
          <NIcon :component="Stop20Filled" />
        </template>
      </NButton>
      <NButton
        v-else
        class="buddy-icon-button"
        type="primary"
        :aria-label="t('desktop.chat.send')"
        :disabled="!canSubmit"
        :loading="isSending"
        @click="submit"
      >
        <template #icon>
          <NIcon :component="ArrowUp20Regular" />
        </template>
      </NButton>
    </template>

    <template #footer>
      <p class="desktop-chat-composer__disclaimer">
        {{ t('desktop.chat.disclaimer') }}
      </p>
    </template>
  </DesktopChatComposerFrame>
</template>

<style scoped lang="scss">
.desktop-chat-composer__suggestions {
  position: absolute;
  right: 0;
  bottom: calc(100% + 0.65rem);
  left: 0;
  z-index: 20;
  display: grid;
  max-height: 15rem;
  overflow-y: auto;
  border: 1px solid var(--buddy-border-subtle);
  border-radius: 0.75rem;
  background: var(--buddy-surface-raised);
  box-shadow: var(--buddy-shadow-raised);
  padding: 0.35rem;
}

.desktop-chat-composer__suggestion {
  display: grid;
  grid-template-columns: 1.7rem minmax(0, 1fr);
  align-items: center;
  gap: 0.55rem;
  border: 0;
  border-radius: 0.5rem;
  background: transparent;
  color: var(--buddy-text-strong);
  cursor: pointer;
  padding: 0.5rem;
  text-align: left;

  &.is-active,
  &:hover {
    background: var(--buddy-state-hover);
  }

  > span:last-child {
    display: grid;
    min-width: 0;
  }

  strong {
    overflow: hidden;
    font-size: 0.8rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    overflow: hidden;
    color: var(--buddy-text-secondary);
    font-size: 0.7rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.desktop-chat-composer__suggestion-kind {
  display: grid;
  width: 1.55rem;
  height: 1.55rem;
  place-items: center;
  border-radius: var(--buddy-radius-micro);
  background: var(--buddy-accent-surface);
  color: var(--buddy-accent-on-surface);
  font-weight: 750;
}

.desktop-chat-composer__suggestion-empty {
  color: var(--buddy-text-muted);
  font-size: 0.75rem;
  padding: 0.7rem;
}

.desktop-chat-composer__attachments {
  display: flex;
  gap: 0.45rem;
  margin-bottom: 0.5rem;
  overflow-x: auto;

  > div {
    display: grid;
    max-width: 15rem;
    flex: none;
    grid-template-columns: 1.8rem minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.4rem;
    border: 1px solid var(--buddy-border-subtle);
    border-radius: 0.65rem;
    background: var(--buddy-surface-raised);
    color: var(--buddy-text-secondary);
    font-size: 0.75rem;
    padding: 0.3rem;
  }

  img,
  .desktop-chat-composer__file-kind {
    width: 1.8rem;
    height: 1.8rem;
    border-radius: 0.45rem;
    object-fit: cover;
  }

  > div > span:nth-child(2) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.desktop-chat-composer__file-kind {
  display: grid;
  place-items: center;
  background: var(--buddy-accent-surface);
  color: var(--buddy-accent-on-surface);
  font-size: 0.55rem;
  font-weight: 700;
}

.desktop-chat-composer__disclaimer {
  margin: 0.45rem 0 0;
  color: var(--buddy-text-muted);
  font-size: 0.68rem;
  text-align: center;
}
</style>
