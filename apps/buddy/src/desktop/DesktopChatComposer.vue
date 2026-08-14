<script setup lang="ts">
import type { JSONContent } from '@tiptap/core'
import type {
  LocalAttachment,
  LocalProvider,
  LocalRuntimeModelOption,
  LocalWorkspaceDraft,
} from '../../electron/shared/localChatApi'
import type {
  BuddyServiceTier,
  BuddyThinkingLevel,
} from '../../shared/modelSelection'
import type {
  DesktopComposerContextOptions,
  DesktopPromptContextOption,
} from './desktopComposerInput'
import type { DesktopContextUsage as DesktopContextUsageValue } from './desktopContextUsage'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import Placeholder from '@tiptap/extension-placeholder'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import {
  Add20Regular,
  ArrowUp20Regular,
  Dismiss16Regular,
  Stop20Filled,
} from '@vicons/fluent'
import { NButton, NIcon } from 'naive-ui'
import { computed, shallowRef, watch } from 'vue'
import { resolveBuddyAttachmentPreviewUrl } from '@/chat/chatAttachmentView'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import {
  createDesktopComposerContentFromText,
  createDesktopComposerSuggestions,
  createDesktopPromptTokenAttrs,
  DESKTOP_PROMPT_TOKEN_NODE_NAME,
  findDesktopComposerTrigger,
  serializeDesktopComposerContent,
  shouldSubmitDesktopComposerKey,
} from './desktopComposerInput'
import DesktopContextUsage from './DesktopContextUsage.vue'
import DesktopModelSelector from './DesktopModelSelector.vue'
import { DesktopPromptToken } from './DesktopPromptToken'

const props = defineProps<{
  attachments: ReadonlyArray<LocalAttachment>
  canSend: boolean
  composerContent: LocalWorkspaceDraft['composerContent']
  contextUsage: DesktopContextUsageValue | null
  draft: string
  isRunning: boolean
  isSelectingFiles: boolean
  isSending: boolean
  language: BuddyLocale
  loadContextOptions: (fileQuery: string | null) => Promise<DesktopComposerContextOptions>
  models: ReadonlyArray<LocalRuntimeModelOption>
  providers: ReadonlyArray<LocalProvider>
  selectedEffort: BuddyThinkingLevel | null
  selectedModel: LocalRuntimeModelOption | null
  selectedModelId: string | null
  selectedServiceTier: BuddyServiceTier | null
}>()

const emit = defineEmits<{
  attach: []
  removeAttachment: [index: number]
  send: [payload: ReturnType<typeof serializeDesktopComposerContent>]
  stop: []
  updateContent: [content: string, value: LocalWorkspaceDraft['composerContent']]
  updateEffort: [value: BuddyThinkingLevel | null]
  updateModel: [value: string]
  updateServiceTier: [value: BuddyServiceTier | null]
}>()

const { t } = useBuddyI18n(() => props.language)
const contentJSON = shallowRef<JSONContent>(resolveComposerContent(props.composerContent, props.draft))
const contextOptions = shallowRef<DesktopComposerContextOptions>({ files: [], skills: [] })
const activeTrigger = shallowRef<ReturnType<typeof findDesktopComposerTrigger>>(null)
const activeSuggestionIndex = shallowRef(0)
const isLoadingContext = shallowRef(false)
let contextRequestId = 0
let isHydrating = false

const serializedContent = computed(() => serializeDesktopComposerContent(contentJSON.value))
const suggestions = computed(() => createDesktopComposerSuggestions(
  activeTrigger.value,
  contextOptions.value,
  key => t(key),
))
const canSubmit = computed(() =>
  props.canSend && (serializedContent.value.content.length > 0 || props.attachments.length > 0),
)

const editor = useEditor({
  content: contentJSON.value,
  extensions: [
    StarterKit.configure({
      blockquote: false,
      bulletList: false,
      code: false,
      codeBlock: false,
      heading: false,
      horizontalRule: false,
      listItem: false,
      orderedList: false,
      strike: false,
    }),
    Placeholder.configure({ placeholder: () => t('chat.composerPlaceholder') }),
    DesktopPromptToken,
  ],
  editorProps: {
    attributes: {
      'aria-label': t('desktop.chat.messageInput'),
      'class': 'desktop-chat-composer__prosemirror',
    },
    handleKeyDown: (_view, event) => handleEditorKeydown(event),
  },
  onSelectionUpdate: refreshActiveTrigger,
  onUpdate: ({ editor }) => {
    const nextContent = normalizeComposerContent(editor.getJSON())
    contentJSON.value = nextContent as JSONContent
    refreshActiveTrigger()
    if (!isHydrating)
      emit('updateContent', serializedContent.value.content, nextContent)
  },
})

watch(
  () => props.isSending,
  locked => editor.value?.setEditable(!locked, false),
)

watch(
  [() => props.draft, () => props.composerContent],
  ([draft, composerContent]) => {
    if (
      draft === serializedContent.value.content
      && JSON.stringify(composerContent) === JSON.stringify(contentJSON.value)
    ) {
      return
    }

    isHydrating = true
    contentJSON.value = resolveComposerContent(composerContent, draft)
    editor.value?.commands.setContent(contentJSON.value, { emitUpdate: false })
    activeTrigger.value = null
    isHydrating = false
  },
)

watch(activeTrigger, (trigger) => {
  activeSuggestionIndex.value = 0
  void refreshContextOptions(trigger)
})

function submit() {
  if (!canSubmit.value || props.isRunning)
    return

  emit('send', serializeDesktopComposerContent(editor.value?.getJSON() ?? contentJSON.value))
}

function handleEditorKeydown(event: KeyboardEvent) {
  if (suggestions.value.length) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const delta = event.key === 'ArrowDown' ? 1 : -1
      activeSuggestionIndex.value = (
        activeSuggestionIndex.value + delta + suggestions.value.length
      ) % suggestions.value.length
      return true
    }
    if (event.key === 'Tab' || shouldSubmitDesktopComposerKey(event)) {
      event.preventDefault()
      selectSuggestion(suggestions.value[activeSuggestionIndex.value]?.option)
      return true
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      activeTrigger.value = null
      return true
    }
  }

  if (event.key === 'Enter' && event.shiftKey && !event.isComposing) {
    event.preventDefault()
    editor.value?.chain().focus().setHardBreak().run()
    return true
  }
  if (!shouldSubmitDesktopComposerKey(event))
    return false

  event.preventDefault()
  submit()
  return true
}

function refreshActiveTrigger() {
  const currentEditor = editor.value
  if (!currentEditor || props.isSending) {
    activeTrigger.value = null
    return
  }

  const { from } = currentEditor.state.selection
  activeTrigger.value = findDesktopComposerTrigger(
    currentEditor.state.doc.textBetween(0, from, '\n', '\n'),
  )
}

async function refreshContextOptions(trigger: ReturnType<typeof findDesktopComposerTrigger>) {
  if (!trigger || trigger.kind === 'slash')
    return

  const requestId = ++contextRequestId
  isLoadingContext.value = true
  try {
    const options = await props.loadContextOptions(trigger.kind === 'mention' ? trigger.query : null)
    if (requestId === contextRequestId)
      contextOptions.value = options
  }
  catch {
    if (requestId === contextRequestId)
      contextOptions.value = { files: [], skills: [] }
  }
  finally {
    if (requestId === contextRequestId)
      isLoadingContext.value = false
  }
}

function selectSuggestion(option: DesktopPromptContextOption | undefined) {
  const currentEditor = editor.value
  const trigger = activeTrigger.value
  if (!currentEditor || !trigger || !option)
    return

  const to = currentEditor.state.selection.from
  const from = Math.max(1, to - trigger.query.length - 1)
  currentEditor
    .chain()
    .focus()
    .deleteRange({ from, to })
    .insertContent({
      type: DESKTOP_PROMPT_TOKEN_NODE_NAME,
      attrs: createDesktopPromptTokenAttrs(option),
    })
    .insertContent(' ')
    .run()
  activeTrigger.value = null
}

function suggestionKind(option: DesktopPromptContextOption) {
  return option.kind === 'skill' ? '$' : option.kind === 'slashCommand' ? '/' : '@'
}

function resolveComposerContent(
  value: LocalWorkspaceDraft['composerContent'],
  fallback: string,
): JSONContent {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JSONContent
    : createDesktopComposerContentFromText(fallback)
}

function normalizeComposerContent(value: JSONContent): LocalWorkspaceDraft['composerContent'] {
  return JSON.parse(JSON.stringify(value))
}
</script>

<template>
  <div class="desktop-chat-composer-wrap">
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

    <div class="desktop-chat-composer">
      <div class="desktop-chat-composer__editor-wrap">
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
      </div>

      <div class="desktop-chat-composer__toolbar">
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

        <div class="desktop-chat-composer__actions">
          <DesktopContextUsage
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
        </div>
      </div>
    </div>
    <p>{{ t('desktop.chat.disclaimer') }}</p>
  </div>
</template>

<style scoped lang="scss">
.desktop-chat-composer-wrap {
  width: 100%;
  margin: 0 auto;
}

.desktop-chat-composer {
  position: relative;
  border: 1px solid var(--buddy-border-base);
  border-radius: 0.75rem;
  background: var(--buddy-bg-surface);
  padding: 0.65rem;
  transition: border-color 120ms ease;

  &:focus-within {
    border-color: color-mix(in srgb, var(--buddy-accent-primary) 58%, var(--buddy-border-base));
  }
}

.desktop-chat-composer__editor-wrap {
  position: relative;
}

:deep(.desktop-chat-composer__prosemirror) {
  min-height: 3.25rem;
  max-height: 12rem;
  overflow-y: auto;
  border: 0;
  outline: 0;
  color: var(--buddy-text-primary);
  font-size: 0.9rem;
  line-height: 1.58;
  padding: 0.1rem 0.2rem 0.6rem;
  white-space: pre-wrap;
  word-break: break-word;

  p {
    margin: 0;
  }

  p.is-editor-empty:first-child::before {
    content: attr(data-placeholder);
    float: left;
    height: 0;
    color: var(--buddy-text-placeholder);
    pointer-events: none;
  }
}

:deep(.desktop-prompt-token-node) {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  border: 1px solid color-mix(in srgb, var(--buddy-accent-primary) 30%, var(--buddy-border-light));
  border-radius: 0.38rem;
  background: color-mix(in srgb, var(--buddy-accent-primary) 10%, var(--buddy-bg-surface));
  color: var(--buddy-accent-primary);
  font-size: 0.78rem;
  font-weight: 650;
  line-height: 1.45;
  padding: 0.05rem 0.35rem;
}

.desktop-chat-composer__suggestions {
  position: absolute;
  right: 0;
  bottom: calc(100% + 0.65rem);
  left: 0;
  z-index: 20;
  display: grid;
  max-height: 15rem;
  overflow-y: auto;
  border: 1px solid var(--buddy-border-light);
  border-radius: 0.75rem;
  background: var(--buddy-bg-surface-raised);
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
  color: var(--buddy-text-primary);
  cursor: pointer;
  padding: 0.5rem;
  text-align: left;

  &.is-active,
  &:hover {
    background: var(--buddy-fill-base);
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
  background: color-mix(in srgb, var(--buddy-accent-primary) 12%, transparent);
  color: var(--buddy-accent-primary);
  font-weight: 750;
}

.desktop-chat-composer__suggestion-empty {
  color: var(--buddy-text-placeholder);
  font-size: 0.75rem;
  padding: 0.7rem;
}

.desktop-chat-composer__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.55rem;
}

.desktop-chat-composer__actions {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 0.35rem;
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
    border: 1px solid var(--buddy-border-light);
    border-radius: 0.65rem;
    background: var(--buddy-bg-surface-raised);
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
  background: var(--buddy-fill-base);
  color: var(--buddy-accent-primary);
  font-size: 0.55rem;
  font-weight: 700;
}

.desktop-chat-composer-wrap > p {
  margin: 0.45rem 0 0;
  color: var(--buddy-text-placeholder);
  font-size: 0.68rem;
  text-align: center;
}

@media (max-width: 760px) {
  .desktop-chat-composer-wrap {
    width: 100%;
  }
}
</style>
