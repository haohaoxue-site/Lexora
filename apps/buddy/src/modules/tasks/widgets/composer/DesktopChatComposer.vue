<script setup lang="ts">
import type { BuddyServiceTier, BuddyThinkingLevel } from '@buddy-shared/conversation/modelSelection'
import type { BuddyPermissionMode } from '@buddy-shared/permissions/permissionMode'
import type { JSONContent } from '@tiptap/core'
import type { DesktopChatComposerProps } from './typing'
import type { ChatComposerSubmitPayload, ChatPromptContextOption } from '@/modules/prompt-input'
import { EditorContent } from '@tiptap/vue-3'
import {
  ArrowUp20Regular,
  Stop20Filled,
} from '@vicons/fluent'
import { NButton, NTooltip } from 'naive-ui'
import { computed, shallowRef, toRef, useTemplateRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { DesktopModelSelector } from '@/modules/models/ui'
import { DesktopChatComposerFrame, DesktopPermissionModeSelector } from '@/modules/prompt-input/ui'
import ChatContextUsage from '@/modules/tasks/widgets/composer/ChatContextUsage.vue'
import DesktopChatComposerInteractionHost from '@/modules/tasks/widgets/composer/DesktopChatComposerInteractionHost.vue'
import { useChatComposer } from '@/modules/tasks/widgets/composer/useChatComposer'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'
import ChatComposerSourceMenu from './ChatComposerSourceMenu.vue'
import ChatComposerSourcePicker from './ChatComposerSourcePicker.vue'
import ComposerResourceStrip from './ComposerResourceStrip.vue'

const props = defineProps<DesktopChatComposerProps>()

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
const resourceStrip = useTemplateRef('resourceStrip')
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
  selectedEffort: toRef(props, 'selectedEffort'),
  selectedServiceTier: toRef(props, 'selectedServiceTier'),
  rejectedResourceIds: () => props.rejectedResourceIds,
  isRunning: toRef(props, 'isRunning'),
  isSending: toRef(props, 'isSending'),
  language: toRef(props, 'language'),
  loadContextOptions: query => props.loadContextOptions(query),
  beginImport: files => props.beginImport(files),
  selectSource: source => props.selectSource(source),
  onSend: payload => emit('send', payload),
  onUpdateContent: (content, value) => emit('updateContent', content, value),
  onLocateResource: resourceId => resourceStrip.value?.highlightResource(resourceId),
})

defineExpose({ focus: () => editor.value?.commands.focus() })

const sourceMenuOpen = shallowRef(false)
const suggestionOptions = computed(() => suggestions.value.map(({ option }) => option))
const chooserVisible = computed(() => !sourceMenuOpen.value && Boolean(
  activeTrigger.value && (activeTrigger.value.kind === 'mention' || suggestions.value.length || isLoadingContext.value),
))
const suggestionEmptyLabel = computed(() => activeTrigger.value?.kind === 'mention'
  ? t(activeTrigger.value.query ? 'desktop.chat.sourcePickerNoMatches' : 'desktop.chat.sourcePickerNoReferences')
  : t('desktop.chat.sourcePickerEmpty'))
const modelInputIssueMessage = computed(() => {
  if (modelInputIssue.value === 'reasoning_unsupported')
    return t('desktop.chat.modelReasoningUnsupported', { value: props.selectedEffort ?? '' })
  if (modelInputIssue.value === 'service_tier_unsupported')
    return t('desktop.chat.modelServiceTierUnsupported', { value: props.selectedServiceTier ?? '' })
  return modelInputIssue.value === 'image_unsupported' ? t('desktop.chat.modelImageUnsupported') : ''
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
  attachFiles(files, 'panel')
}

async function selectConversationFile(option: ChatPromptContextOption) {
  if (await selectPanelResource(option))
    sourceMenuOpen.value = false
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
        ref="resourceStrip"
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
            :empty-label="suggestionEmptyLabel"
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
      <ChatComposerSourceMenu
        v-model:show="sourceMenuOpen"
        :disabled="isSelectingFiles || isSending"
        :language="language"
        :loading="isLoadingContext"
        :options="sourceOptions"
        @attach="emit('attach')"
        @query="loadContextOptions"
        @select="selectConversationFile"
        @update:show="show => show && closeSuggestions()"
      />

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
          <DesktopIcon :component="Stop20Filled" />
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
                <DesktopIcon :component="ArrowUp20Regular" />
              </template>
            </NButton>
          </span>
        </template>
        {{ modelInputIssueMessage }}
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

.desktop-chat-composer__send-action {
  --n-height: var(--buddy-composer-control-height);

  width: var(--buddy-composer-control-height);
  min-width: var(--buddy-composer-control-height);
  height: var(--buddy-composer-control-height);
}

.desktop-chat-composer__disclaimer {
  margin: 0.45rem 0 0;
  color: var(--buddy-text-muted);
  font-size: 0.68rem;
  text-align: center;
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
