import type { LocalRuntimeModelOption } from '@buddy-electron/shared/localChatApi'
import type { BuddyComposerSource } from '@buddy-shared/composerResource'
import type { JSONContent } from '@tiptap/core'
import type { Ref } from 'vue'
import type { ComposerResourceView } from './useComposerResources'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type {
  ChatComposerContextOptions,
  ChatComposerSubmitPayload,
  ChatComposerTrigger,
  ChatPromptContextOption,
} from '@/workbenches/chat/composer/chatComposerInput'
import { parseBuddyChatCommand } from '@buddy-shared/buddyChatCommands'
import Placeholder from '@tiptap/extension-placeholder'
import StarterKit from '@tiptap/starter-kit'
import { useEditor } from '@tiptap/vue-3'
import { computed, shallowRef, watch } from 'vue'
import {
  materialFileIconNameFromPath,
  materialFileIconUrls,
} from '@/assets/file-icons/materialFileIcons'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import {
  createChatComposerContentFromText,
  createChatComposerSourceOptions,
  createChatComposerSuggestions,
  findChatComposerTrigger,
  serializeChatComposerContent,
  shouldSubmitChatComposerKey,
} from '@/workbenches/chat/composer/chatComposerInput'
import { CHAT_PROMPT_DIRECTIVE_NODE_NAME } from './chatComposerDocument'
import { resolveChatComposerModelInputIssue } from './chatComposerModelCapability'
import {
  ChatComposerDocument,
  ChatComposerPromptDirective,
  ChatComposerResourceClipboard,
  ChatComposerResourceReference,
  insertChatComposerResources,
  insertResolvedChatComposerResource,
  moveChatComposerResourceSelection,
  removeChatComposerPanelResource,
  removeChatComposerResource,
  setChatComposerPanelResources,
} from './chatComposerResourceEditing'
import { getChatComposerResourceIds } from './chatComposerResourceReferences'

interface UseChatComposerOptions {
  canSend: Readonly<Ref<boolean>>
  composerContent: Readonly<Ref<JSONContent>>
  draft: Readonly<Ref<string>>
  draftId: Readonly<Ref<string>>
  resources: Readonly<Ref<readonly ComposerResourceView[]>>
  rejectedResourceIds: ReadonlySet<string>
  isRunning: Readonly<Ref<boolean>>
  isSending: Readonly<Ref<boolean>>
  language: Readonly<Ref<BuddyLocale>>
  selectedModel: Readonly<Ref<LocalRuntimeModelOption | null>>
  loadContextOptions: (fileQuery: string | null) => Promise<ChatComposerContextOptions>
  beginImport: (files: readonly File[]) => readonly string[]
  selectSource: (source: BuddyComposerSource) => Promise<string | null>
  onSend: (payload: ChatComposerSubmitPayload) => void
  onUpdateContent: (content: string, value: JSONContent) => void
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
  let isComposing = false
  let isHydrating = false
  const selectSource = options.selectSource

  const serializedContent = computed(() => serializeChatComposerContent(contentJSON.value))
  const suggestions = computed(() => createChatComposerSuggestions(
    activeTrigger.value,
    contextOptions.value,
    key => t(key),
  ))
  const resourceById = computed(() => new Map(options.resources.value.map(entry => [entry.resource.resourceId, entry])))
  const resourceIds = computed(() => getChatComposerResourceIds(contentJSON.value))
  const modelInputIssue = computed(() => resolveChatComposerModelInputIssue({
    model: options.selectedModel.value,
    resourceIds: resourceIds.value,
    resources: options.resources.value,
  }))
  const canSubmit = computed(() => options.canSend.value && modelInputIssue.value === null && (
    serializedContent.value.content.length > 0 || resourceIds.value.length > 0
  ) && resourceIds.value.every(id => resourceById.value.get(id)?.resource.state === 'ready'))
  const panelResources = computed(() => (contentJSON.value.attrs?.panelResourceIds as string[] ?? [])
    .flatMap(id => resourceById.value.get(id) ?? []))
  const resourceStripResources = computed(() => {
    const panelIds = new Set(panelResources.value.map(entry => entry.resource.resourceId))
    const failedReferenced = resourceIds.value.flatMap((id) => {
      const entry = resourceById.value.get(id)
      return entry?.resource.state === 'failed' && !panelIds.has(id) ? [entry] : []
    })
    return [...panelResources.value, ...failedReferenced]
  })
  const sourceOptions = computed(() => createChatComposerSourceOptions(contextOptions.value.files))

  const editor = useEditor({
    editable: !options.isSending.value,
    content: contentJSON.value,
    extensions: [
      StarterKit.configure({
        document: false,
        bold: false,
        italic: false,
        underline: false,
        blockquote: false,
        bulletList: false,
        code: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        link: false,
        listItem: false,
        orderedList: false,
        strike: false,
      }),
      Placeholder.configure({ placeholder: () => t('chat.composerPlaceholder') }),
      ChatComposerPromptDirective,
      ChatComposerDocument,
      ChatComposerResourceReference.configure({
        resourcePresentation: (id) => {
          const name = resourceById.value.get(id)?.resource.name ?? 'file'
          const iconName = materialFileIconNameFromPath(name)
          return {
            iconName,
            iconUrl: materialFileIconUrls[iconName],
            label: name,
            text: `@${name}`,
          }
        },
      }),
      ChatComposerResourceClipboard.configure({
        draftId: () => options.draftId.value,
        rejectedIds: () => options.rejectedResourceIds,
      }),
    ],
    editorProps: {
      attributes: {
        'aria-label': t('desktop.chat.messageInput'),
        'class': 'desktop-chat-composer__prosemirror',
        'spellcheck': 'false',
      },
      handleKeyDown: (_view, event) => handleEditorKeydown(event),
      handlePaste: (_view, event) => handleEditorPaste(event),
      handleDOMEvents: {
        compositionend: () => {
          isComposing = false
          queueMicrotask(refreshActiveTrigger)
          return false
        },
        compositionstart: () => {
          isComposing = true
          activeTrigger.value = null
          return false
        },
      },
    },
    onBlur: () => { activeTrigger.value = null },
    onFocus: refreshActiveTrigger,
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
  watch(() => [...options.rejectedResourceIds], () => {
    const current = editor.value
    if (current)
      current.view.dispatch(current.state.tr)
  }, { flush: 'sync' })

  watch(
    [options.draft, options.composerContent],
    ([draft, composerContent]) => {
      if (
        draft === serializedContent.value.content
        && JSON.stringify(composerContent) === JSON.stringify(contentJSON.value)
      ) {
        return
      }

      const nextContent = resolveComposerContent(composerContent, draft)
      const current = editor.value
      if (current) {
        const document = current.schema.nodeFromJSON(nextContent)
        const bodyChanged = !current.state.doc.content.eq(document.content)
        const panelResourceIds: string[] = current.state.doc.attrs.panelResourceIds
        const nextPanelResourceIds: string[] = document.attrs.panelResourceIds
        const panelChanged = panelResourceIds.length !== nextPanelResourceIds.length
          || panelResourceIds.some((id, index) => id !== nextPanelResourceIds[index])
        if (!bodyChanged && !panelChanged)
          return
      }

      isHydrating = true
      contentJSON.value = nextContent
      if (current) {
        const document = current.schema.nodeFromJSON(nextContent)
        const bodyChanged = !current.state.doc.content.eq(document.content)
        if (!bodyChanged) {
          setChatComposerPanelResources(current, document.attrs.panelResourceIds)
        }
        else {
          current.view.dispatch(current.state.tr
            .replaceWith(0, current.state.doc.content.size, document.content)
            .setDocAttribute('panelResourceIds', document.attrs.panelResourceIds)
            .setMeta('addToHistory', false))
        }
      }
      activeTrigger.value = null
      isHydrating = false
    },
  )

  watch(activeTrigger, (trigger) => {
    activeSuggestionIndex.value = 0
    if (!trigger || trigger.kind === 'slash') {
      contextRequestId += 1
      isLoadingContext.value = false
      return
    }
    void refreshContextOptions(trigger)
  })

  function submit() {
    if (!canSubmit.value || options.isRunning.value)
      return
    options.onSend(serializeChatComposerContent(editor.value?.getJSON() ?? contentJSON.value))
  }

  function handleEditorKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && activeTrigger.value) {
      event.preventDefault()
      activeTrigger.value = null
      return true
    }

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
    }

    if (
      (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
      && !event.altKey
      && !event.ctrlKey
      && !event.metaKey
      && !event.shiftKey
      && moveChatComposerResourceSelection(
        editor.value!,
        event.key === 'ArrowLeft' ? -1 : 1,
      )
    ) {
      event.preventDefault()
      return true
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
    attachFiles(files, 'both')
    return true
  }

  function attachFiles(files: readonly File[], placement: 'panel' | 'both') {
    const current = editor.value
    if (!current || !current.isEditable)
      return
    insertChatComposerResources(current, options.beginImport(files), placement)
  }

  function removeResource(resourceId: string) {
    const current = editor.value
    if (!current)
      return false
    return resourceById.value.get(resourceId)?.resource.state === 'failed'
      ? removeChatComposerResource(current, resourceId)
      : removeChatComposerPanelResource(current, resourceId)
  }

  function refreshActiveTrigger() {
    const currentEditor = editor.value
    if (
      !currentEditor
      || options.isSending.value
      || isComposing
      || !currentEditor.isFocused
      || !currentEditor.state.selection.empty
    ) {
      activeTrigger.value = null
      return
    }

    const { from } = currentEditor.state.selection
    activeTrigger.value = findChatComposerTrigger(
      currentEditor.state.doc.textBetween(0, from, '\n', '\n'),
    )
  }

  async function refreshContextOptions(trigger: ChatComposerTrigger) {
    await loadContextOptions(trigger.kind === 'mention' ? trigger.query : null)
  }

  async function loadContextOptions(fileQuery: string | null): Promise<void> {
    const requestId = ++contextRequestId
    isLoadingContext.value = true
    try {
      const context = await options.loadContextOptions(fileQuery)
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
    if (!currentEditor || !currentEditor.isEditable || !trigger || !option)
      return

    const to = currentEditor.state.selection.from
    const from = Math.max(1, to - trigger.query.length - 1)
    activeTrigger.value = null
    if (option.kind === 'file') {
      if (option.source)
        void insertResolvedChatComposerResource(currentEditor, { from, to }, () => selectSource(option.source!))
      return
    }
    const command = option.kind === 'slashCommand' ? parseBuddyChatCommand(option.value) : null
    if (option.kind === 'slashCommand' && !command)
      return
    currentEditor
      .chain()
      .focus()
      .deleteRange({ from, to })
      .insertContent({
        type: CHAT_PROMPT_DIRECTIVE_NODE_NAME,
        attrs: command
          ? { directive: 'slash_command', commandMode: command.kind, value: option.value }
          : { directive: 'skill', value: option.value },
      })
      .insertContent(' ')
      .run()
  }

  async function selectPanelSource(option: ChatPromptContextOption): Promise<boolean> {
    const currentEditor = editor.value
    if (!currentEditor || !currentEditor.isEditable || option.kind !== 'file' || !option.source)
      return false
    const resourceId = await selectSource(option.source)
    if (!resourceId)
      return false
    return insertChatComposerResources(currentEditor, [resourceId], 'panel')
  }

  function suggestionKind(option: ChatPromptContextOption) {
    return option.kind === 'skill' ? '$' : option.kind === 'slashCommand' ? '/' : '@'
  }

  return {
    activeSuggestionIndex,
    activeTrigger,
    attachFiles,
    canSubmit,
    closeSuggestions: () => { activeTrigger.value = null },
    contextOptions,
    editor,
    isLoadingContext,
    loadContextOptions,
    modelInputIssue,
    panelResources,
    removeResource,
    removePanelResource: (id: string) => editor.value && removeChatComposerPanelResource(editor.value, id),
    resourceStripResources,
    selectPanelSource,
    selectSuggestion,
    submit,
    sourceOptions,
    suggestionKind,
    suggestions,
  }
}

function resolveComposerContent(
  value: JSONContent,
  fallback: string,
): JSONContent {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JSONContent
    : createChatComposerContentFromText(fallback)
}

function normalizeComposerContent(value: JSONContent): JSONContent {
  return JSON.parse(JSON.stringify(value)) as JSONContent
}
