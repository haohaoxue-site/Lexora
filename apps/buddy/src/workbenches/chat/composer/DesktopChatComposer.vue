<script setup lang="ts">
import type {
  LocalProvider,
  LocalRuntimeModelOption,
} from '@buddy-electron/shared/localChatApi'
import type { BuddyComposerSource } from '@buddy-shared/composerResource'
import type {
  BuddyServiceTier,
  BuddyThinkingLevel,
} from '@buddy-shared/modelSelection'
import type { BuddyPermissionMode } from '@buddy-shared/permissionMode'
import type { JSONContent } from '@tiptap/core'
import type { ComponentPublicInstance } from 'vue'
import type { ComposerResourceView } from './useComposerResources'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type {
  ChatComposerContextOptions,
  ChatComposerSubmitPayload,
  ChatPromptContextOption,
} from '@/workbenches/chat/composer/chatComposerInput'
import type { ChatComposerInteraction } from '@/workbenches/chat/composer/chatComposerInteraction'
import type { ChatContextUsage as ChatContextUsageValue } from '@/workbenches/chat/composer/chatContextUsage'
import { EditorContent } from '@tiptap/vue-3'
import {
  Add20Regular,
  ArrowLeft16Regular,
  ArrowUp20Regular,
  ArrowUpload20Regular,
  ChatMultiple20Regular,
  Stop20Filled,
} from '@vicons/fluent'
import { useEventListener } from '@vueuse/core'
import { NButton, NIcon, NInput, NPopover, NTooltip } from 'naive-ui'
import { computed, nextTick, shallowRef, toRef, useTemplateRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopModelSelector from '@/ui/model-selector/DesktopModelSelector.vue'
import ChatContextUsage from '@/workbenches/chat/composer/ChatContextUsage.vue'
import DesktopChatComposerFrame from '@/workbenches/chat/composer/DesktopChatComposerFrame.vue'
import DesktopChatComposerInteractionHost from '@/workbenches/chat/composer/DesktopChatComposerInteractionHost.vue'
import DesktopPermissionModeSelector from '@/workbenches/chat/composer/DesktopPermissionModeSelector.vue'
import { useChatComposer } from '@/workbenches/chat/composer/useChatComposer'
import ChatComposerSourcePicker from './ChatComposerSourcePicker.vue'
import ComposerResourceStrip from './ComposerResourceStrip.vue'

const props = defineProps<{
  canUpdatePermissionSettings: boolean
  canSend: boolean
  composerContent: JSONContent
  contextUsage: ChatContextUsageValue | null
  draft: string
  draftId: string
  resources: readonly ComposerResourceView[]
  rejectedResourceIds: ReadonlySet<string>
  beginImport: (files: readonly File[]) => readonly string[]
  selectSource: (source: BuddyComposerSource) => Promise<string | null>
  isRunning: boolean
  isSelectingFiles: boolean
  isSending: boolean
  isUpdatingPermissionSettings: boolean
  interaction: ChatComposerInteraction | null
  language: BuddyLocale
  loadContextOptions: (fileQuery: string | null) => Promise<ChatComposerContextOptions>
  models: ReadonlyArray<LocalRuntimeModelOption>
  permissionMode: BuddyPermissionMode
  providers: ReadonlyArray<LocalProvider>
  selectedEffort: BuddyThinkingLevel | null
  selectedModel: LocalRuntimeModelOption | null
  selectedModelId: string | null
  selectedServiceTier: BuddyServiceTier | null
}>()

const emit = defineEmits<{
  attach: []
  retryResource: [resourceId: string]
  dismissInteraction: [id: string]
  send: [payload: ChatComposerSubmitPayload]
  stop: []
  updateContent: [content: string, value: JSONContent]
  updateEffort: [value: BuddyThinkingLevel | null]
  updatePermissionMode: [value: BuddyPermissionMode]
  updateModel: [value: string]
  updateServiceTier: [value: BuddyServiceTier | null]
}>()
defineSlots<{
  leadingContext?: () => unknown
}>()

const { t } = useBuddyI18n(() => props.language)
const {
  activeSuggestionIndex,
  activeTrigger,
  attachFiles,
  canSubmit,
  closeSuggestions,
  editor,
  isLoadingContext,
  loadContextOptions,
  modelInputIssue,
  resourceStripResources,
  removeResource,
  selectPanelSource: selectPanelResource,
  selectSuggestion,
  submit,
  sourceOptions,
  suggestions,
} = useChatComposer({
  canSend: toRef(props, 'canSend'),
  composerContent: toRef(props, 'composerContent'),
  draft: toRef(props, 'draft'),
  draftId: toRef(props, 'draftId'),
  resources: toRef(props, 'resources'),
  selectedModel: toRef(props, 'selectedModel'),
  rejectedResourceIds: props.rejectedResourceIds,
  isRunning: toRef(props, 'isRunning'),
  isSending: toRef(props, 'isSending'),
  language: toRef(props, 'language'),
  loadContextOptions: props.loadContextOptions,
  beginImport: props.beginImport,
  selectSource: props.selectSource,
  onSend: payload => emit('send', payload),
  onUpdateContent: (content, value) => emit('updateContent', content, value),
})

const sourceMenuOpen = shallowRef(false)
const sourceMenuView = shallowRef<'menu' | 'files'>('menu')
const sourcePickerQuery = shallowRef('')
const sourcePopoverThemeOverrides = { padding: '8px 14px' } as const
const sourceTrigger = useTemplateRef<ComponentPublicInstance>('sourceTrigger')
const suggestionOptions = computed(() => suggestions.value.map(({ option }) => option))
const chooserVisible = computed(() => !sourceMenuOpen.value && Boolean(
  activeTrigger.value && (suggestions.value.length || isLoadingContext.value),
))
useEventListener(document, 'keydown', handleDocumentKeydown)

function handleFileDragover(event: DragEvent) {
  if (event.dataTransfer?.types.includes('Files'))
    event.preventDefault()
}

function handleFileDrop(event: DragEvent) {
  const files = [...(event.dataTransfer?.files ?? [])]
  if (!files.length)
    return

  event.preventDefault()
  attachFiles(files, 'panel')
}

function chooseLocalFiles() {
  sourceMenuOpen.value = false
  emit('attach')
}

async function openConversationFilePicker() {
  sourceMenuView.value = 'files'
  sourcePickerQuery.value = ''
  await loadContextOptions('')
}

async function selectConversationFile(option: ChatPromptContextOption) {
  if (await selectPanelResource(option))
    sourceMenuOpen.value = false
}

function handleSourceMenuVisibility(show: boolean) {
  if (show) {
    closeSuggestions()
    sourceMenuView.value = 'menu'
    sourcePickerQuery.value = ''
  }
  sourceMenuOpen.value = show
  if (!show)
    sourceMenuView.value = 'menu'
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !sourceMenuOpen.value)
    return

  event.preventDefault()
  sourceMenuOpen.value = false
  sourceMenuView.value = 'menu'
  sourcePickerQuery.value = ''
  void nextTick(() => {
    const trigger = sourceTrigger.value?.$el as HTMLButtonElement | undefined
    trigger?.focus()
  })
}
</script>

<template>
  <DesktopChatComposerFrame
    class="desktop-chat-composer-wrap"
    @dragover="handleFileDragover"
    @drop="handleFileDrop"
  >
    <template #attachments>
      <ComposerResourceStrip
        :resources="resourceStripResources"
        :language="language"
        :disabled="isSending"
        @remove="removeResource"
        @retry="emit('retryResource', $event)"
      />
    </template>

    <template #overlay>
      <DesktopChatComposerInteractionHost
        :chooser-visible="chooserVisible"
        :interaction="interaction"
        :language="language"
        @dismiss="emit('dismissInteraction', $event)"
      >
        <template #chooser>
          <ChatComposerSourcePicker
            :active-index="activeSuggestionIndex"
            :accessible-label="t('desktop.chat.sourcePickerSuggestions')"
            :empty-label="t('desktop.chat.sourcePickerEmpty')"
            :language="language"
            :loading="isLoadingContext"
            :loading-label="t('desktop.chat.loadingContext')"
            :options="suggestionOptions"
            @select="selectSuggestion"
          />
        </template>
      </DesktopChatComposerInteractionHost>
    </template>

    <template #editor>
      <EditorContent v-if="editor" :editor="editor" />
    </template>

    <template #leading>
      <NPopover
        placement="top-start"
        :show="sourceMenuOpen"
        :show-arrow="false"
        :theme-overrides="sourcePopoverThemeOverrides"
        trigger="click"
        @update:show="handleSourceMenuVisibility"
      >
        <template #trigger>
          <NButton
            ref="sourceTrigger"
            class="buddy-icon-button desktop-chat-composer__source-trigger"
            :class="{ 'is-open': sourceMenuOpen }"
            quaternary
            :aria-expanded="sourceMenuOpen"
            aria-haspopup="menu"
            :aria-label="t(sourceMenuOpen ? 'desktop.chat.closeAttachmentMenu' : 'desktop.chat.addAttachment')"
            :disabled="isSelectingFiles || isSending"
          >
            <template #icon>
              <NIcon class="desktop-chat-composer__source-trigger-icon" :component="Add20Regular" />
            </template>
          </NButton>
        </template>

        <div
          v-if="sourceMenuOpen"
          class="desktop-chat-composer__source-menu"
          :class="{ 'is-files': sourceMenuView === 'files' }"
        >
          <template v-if="sourceMenuView === 'menu'">
            <button
              class="desktop-chat-composer__source-action"
              type="button"
              @click="chooseLocalFiles"
            >
              <NIcon class="desktop-chat-composer__source-action-icon" :component="ArrowUpload20Regular" />
              <span>{{ t('desktop.chat.addLocalFile') }}</span>
            </button>
            <button
              class="desktop-chat-composer__source-action"
              type="button"
              @click="openConversationFilePicker"
            >
              <NIcon class="desktop-chat-composer__source-action-icon" :component="ChatMultiple20Regular" />
              <span>{{ t('desktop.chat.selectConversationFile') }}</span>
            </button>
          </template>
          <template v-else>
            <div class="desktop-chat-composer__source-header">
              <button
                class="desktop-chat-composer__source-back"
                type="button"
                @click="sourceMenuView = 'menu'"
              >
                <NIcon :component="ArrowLeft16Regular" />
                <span>{{ t('desktop.chat.sourcePickerBack') }}</span>
              </button>
            </div>
            <NInput
              v-model:value="sourcePickerQuery"
              clearable
              size="small"
              :placeholder="t('desktop.chat.sourcePickerSearch')"
              @update:value="loadContextOptions"
            />
            <ChatComposerSourcePicker
              :accessible-label="t('desktop.chat.sourcePickerTitle')"
              :empty-label="t('desktop.chat.sourcePickerEmpty')"
              :files-only="true"
              :language="language"
              :loading="isLoadingContext"
              :loading-label="t('desktop.chat.loadingContext')"
              :options="sourceOptions"
              @select="selectConversationFile"
            />
          </template>
        </div>
      </NPopover>

      <slot name="leadingContext" />

      <div
        class="desktop-chat-composer__permission-mode"
        data-testid="composer-permission-mode"
      >
        <DesktopPermissionModeSelector
          :can-update="canUpdatePermissionSettings"
          :is-updating="isUpdatingPermissionSettings"
          :language="language"
          :permission-mode="permissionMode"
          @update-permission-mode="emit('updatePermissionMode', $event)"
        />
      </div>
    </template>

    <template #actions>
      <div
        class="desktop-chat-composer__context-usage"
        data-testid="composer-context-usage"
      >
        <ChatContextUsage
          :is-running="isRunning"
          :language="language"
          :usage="contextUsage"
        />
      </div>

      <div
        class="desktop-chat-composer__model-selector"
        data-testid="composer-model-selector"
      >
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
      </div>

      <NButton
        v-if="isRunning"
        class="buddy-icon-button desktop-chat-composer__send-action"
        secondary
        type="error"
        :aria-label="t('desktop.chat.stop')"
        @click="emit('stop')"
      >
        <template #icon>
          <NIcon :component="Stop20Filled" />
        </template>
      </NButton>
      <NTooltip v-else :disabled="modelInputIssue === null">
        <template #trigger>
          <span class="desktop-chat-composer__send-trigger">
            <NButton
              class="buddy-icon-button desktop-chat-composer__send-action"
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
          </span>
        </template>
        {{ t('desktop.chat.modelImageUnsupported') }}
      </NTooltip>
    </template>

    <template #footer>
      <p class="desktop-chat-composer__disclaimer">
        {{ t('desktop.chat.disclaimer') }}
      </p>
    </template>
  </DesktopChatComposerFrame>
</template>

<style scoped lang="scss">
.desktop-chat-composer__context-usage,
.desktop-chat-composer__permission-mode,
.desktop-chat-composer__model-selector {
  display: contents;
}

.desktop-chat-composer__send-trigger {
  display: inline-flex;
}

.desktop-chat-composer__source-trigger,
.desktop-chat-composer__send-action {
  --n-height: var(--buddy-composer-control-height);

  width: var(--buddy-composer-control-height);
  min-width: var(--buddy-composer-control-height);
  height: var(--buddy-composer-control-height);
}

.desktop-chat-composer__source-trigger.is-open {
  background: var(--buddy-accent-surface-subtle);
  color: var(--buddy-text-strong);
}

.desktop-chat-composer__source-trigger-icon {
  transform-origin: center;
  transition: transform 150ms var(--buddy-motion-state-easing);
}

.desktop-chat-composer__source-trigger.is-open .desktop-chat-composer__source-trigger-icon {
  transform: rotate(45deg);
}

.desktop-chat-composer__source-menu {
  display: grid;
  width: fit-content;
  min-width: min(9.5rem, calc(100vw - 2rem));
  max-width: min(13rem, calc(100vw - 2rem));
  gap: 0.125rem;
  interpolate-size: allow-keywords;
  overflow: hidden;
  transition: width 160ms var(--buddy-motion-state-easing);

  &.is-files {
    width: min(22rem, calc(100vw - 2rem));
    min-width: min(22rem, calc(100vw - 2rem));
    max-width: min(22rem, calc(100vw - 2rem));
    gap: 0.35rem;
  }
}

.desktop-chat-composer__source-action,
.desktop-chat-composer__source-back {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border: 0;
  border-radius: var(--buddy-menu-item-radius);
  background: transparent;
  color: var(--buddy-text-primary);
  cursor: pointer;
  font: inherit;
  text-align: left;
  white-space: nowrap;

  &:hover,
  &:focus-visible {
    background: var(--buddy-state-hover);
  }

  &:focus-visible {
    outline: 2px solid var(--buddy-focus-ring);
    outline-offset: -2px;
  }
}

.desktop-chat-composer__source-action {
  display: grid;
  width: 100%;
  grid-template-columns: 1.1rem minmax(0, 1fr);
  padding: 0.36rem 0.35rem;
  column-gap: 0.5rem;
  font-size: 0.8rem;
  font-weight: 580;
  line-height: 1.35;
}

.desktop-chat-composer__source-action-icon {
  flex: none;
  color: var(--buddy-text-secondary);
  font-size: 1.05rem;
}

.desktop-chat-composer__source-header {
  display: flex;
  align-items: center;
}

.desktop-chat-composer__source-back {
  padding: 0.25rem 0.35rem;
  color: var(--buddy-text-secondary);
  font-size: 0.75rem;
}

.desktop-chat-composer__disclaimer {
  margin: 0.45rem 0 0;
  color: var(--buddy-text-muted);
  font-size: 0.68rem;
  text-align: center;
}

@media (prefers-reduced-motion: reduce) {
  .desktop-chat-composer__source-trigger-icon,
  .desktop-chat-composer__source-menu {
    transition-duration: 0ms;
  }
}

@container desktop-chat-composer (max-width: 26rem) {
  .desktop-chat-composer__context-usage {
    display: none;
  }
}

@container desktop-chat-composer (max-width: 24rem) {
  .desktop-chat-composer__model-selector {
    display: none;
  }
}

@container desktop-chat-composer (max-width: 20rem) {
  .desktop-chat-composer__permission-mode :deep(.desktop-permission-mode-selector__trigger) {
    width: var(--buddy-composer-control-height);
    min-width: var(--buddy-composer-control-height);
    padding: 0;
  }

  .desktop-chat-composer__permission-mode :deep(.desktop-permission-mode-selector__trigger-label) {
    display: none;
  }

  .desktop-chat-composer__permission-mode :deep(.n-button__icon) {
    margin: 0;
  }
}
</style>
