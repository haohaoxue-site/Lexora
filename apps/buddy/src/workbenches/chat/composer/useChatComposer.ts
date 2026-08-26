import type { LocalAttachment, LocalWorkspaceDraft } from '@buddy-electron/shared/localChatApi'
import type { JSONContent } from '@tiptap/core'
import type { Ref } from 'vue'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type {
  ChatComposerContextOptions,
  ChatComposerSubmitPayload,
  ChatPromptContextOption,
} from '@/workbenches/chat/composer/chatComposerInput'
import Placeholder from '@tiptap/extension-placeholder'
import StarterKit from '@tiptap/starter-kit'
import { useEditor } from '@tiptap/vue-3'
import { computed, shallowRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import {
  CHAT_PROMPT_TOKEN_NODE_NAME,
  createChatComposerContentFromText,
  createChatComposerSuggestions,
  createChatPromptTokenAttrs,
  findChatComposerTrigger,
  serializeChatComposerContent,
  shouldSubmitChatComposerKey,
} from '@/workbenches/chat/composer/chatComposerInput'
import { ChatPromptToken } from '@/workbenches/chat/composer/chatPromptToken'

interface UseChatComposerOptions {
  attachments: Readonly<Ref<ReadonlyArray<LocalAttachment>>>
  canSend: Readonly<Ref<boolean>>
  composerContent: Readonly<Ref<LocalWorkspaceDraft['composerContent']>>
  draft: Readonly<Ref<string>>
  isRunning: Readonly<Ref<boolean>>
  isSending: Readonly<Ref<boolean>>
  language: Readonly<Ref<BuddyLocale>>
  loadContextOptions: (fileQuery: string | null) => Promise<ChatComposerContextOptions>
  onAttachFiles: (files: ReadonlyArray<File>) => void
  onSend: (payload: ChatComposerSubmitPayload) => void
  onUpdateContent: (content: string, value: LocalWorkspaceDraft['composerContent']) => void
}

export function useChatComposer(options: UseChatComposerOptions) {
  const { t } = useBuddyI18n(options.language)
  const contentJSON = shallowRef<JSONContent>(resolveComposerContent(
    options.composerContent.value,
    options.draft.value,
  ))
  const contextOptions = shallowRef<ChatComposerContextOptions>({ files: [], skills: [] })
  const activeTrigger = shallowRef<ReturnType<typeof findChatComposerTrigger>>(null)
  const activeSuggestionIndex = shallowRef(0)
  const isLoadingContext = shallowRef(false)
  let contextRequestId = 0
  let isHydrating = false

  const serializedContent = computed(() => serializeChatComposerContent(contentJSON.value))
  const suggestions = computed(() => createChatComposerSuggestions(
    activeTrigger.value,
    contextOptions.value,
    key => t(key),
  ))
  const canSubmit = computed(() => options.canSend.value && (
    serializedContent.value.content.length > 0 || options.attachments.value.length > 0
  ))

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
      ChatPromptToken,
    ],
    editorProps: {
      attributes: {
        'aria-label': t('desktop.chat.messageInput'),
        'class': 'desktop-chat-composer__prosemirror',
      },
      handleKeyDown: (_view, event) => handleEditorKeydown(event),
      handlePaste: (_view, event) => handleEditorPaste(event),
    },
    onSelectionUpdate: refreshActiveTrigger,
    onUpdate: ({ editor }) => {
      const nextContent = normalizeComposerContent(editor.getJSON())
      contentJSON.value = nextContent as JSONContent
      refreshActiveTrigger()
      if (!isHydrating)
        options.onUpdateContent(serializedContent.value.content, nextContent)
    },
  })

  watch(options.isSending, locked => editor.value?.setEditable(!locked, false))

  watch(
    [options.draft, options.composerContent],
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
    if (!canSubmit.value || options.isRunning.value)
      return
    options.onSend(serializeChatComposerContent(editor.value?.getJSON() ?? contentJSON.value))
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
      if (event.key === 'Tab' || shouldSubmitChatComposerKey(event)) {
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
    if (!shouldSubmitChatComposerKey(event))
      return false

    event.preventDefault()
    submit()
    return true
  }

  function handleEditorPaste(event: ClipboardEvent) {
    const files = [...(event.clipboardData?.files ?? [])]
    if (!files.length)
      return false

    event.preventDefault()
    options.onAttachFiles(files)
    return true
  }

  function refreshActiveTrigger() {
    const currentEditor = editor.value
    if (!currentEditor || options.isSending.value) {
      activeTrigger.value = null
      return
    }

    const { from } = currentEditor.state.selection
    activeTrigger.value = findChatComposerTrigger(
      currentEditor.state.doc.textBetween(0, from, '\n', '\n'),
    )
  }

  async function refreshContextOptions(trigger: ReturnType<typeof findChatComposerTrigger>) {
    if (!trigger || trigger.kind === 'slash')
      return

    const requestId = ++contextRequestId
    isLoadingContext.value = true
    try {
      const context = await options.loadContextOptions(
        trigger.kind === 'mention' ? trigger.query : null,
      )
      if (requestId === contextRequestId)
        contextOptions.value = context
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

  function selectSuggestion(option: ChatPromptContextOption | undefined) {
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
        type: CHAT_PROMPT_TOKEN_NODE_NAME,
        attrs: createChatPromptTokenAttrs(option),
      })
      .insertContent(' ')
      .run()
    activeTrigger.value = null
  }

  function suggestionKind(option: ChatPromptContextOption) {
    return option.kind === 'skill' ? '$' : option.kind === 'slashCommand' ? '/' : '@'
  }

  return {
    activeSuggestionIndex,
    canSubmit,
    editor,
    isLoadingContext,
    selectSuggestion,
    submit,
    suggestionKind,
    suggestions,
  }
}

function resolveComposerContent(
  value: LocalWorkspaceDraft['composerContent'],
  fallback: string,
): JSONContent {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JSONContent
    : createChatComposerContentFromText(fallback)
}

function normalizeComposerContent(value: JSONContent): LocalWorkspaceDraft['composerContent'] {
  return JSON.parse(JSON.stringify(value))
}
