import type { BuddyMessageQuote } from '@buddy-shared/conversation/buddyUserContent'
import type { BuddyComposerSource } from '@buddy-shared/conversation/composerResource'
import type { ComposerResourceCard, UseChatComposerOptions } from './typing'
import type { ChatPromptContextOption } from '@/modules/prompt-input'
import { parseBuddyChatCommand } from '@buddy-shared/conversation/buddyChatCommands'
import { computed, onScopeDispose, watch } from 'vue'
import { CHAT_PROMPT_DIRECTIVE_NODE_NAME, getChatComposerResourceIds, serializeChatComposerContent } from '@/modules/prompt-input'
import { insertChatComposerResources, insertResolvedChatComposerResource, removeChatComposerPanelResource, removeChatComposerResource } from '@/modules/prompt-input/ui'
import { resolveComposerResourcePreviewUrl } from '../../model/attachments/chatAttachmentView'
import { resolveChatComposerModelInputIssue } from '../../model/composer/chatComposerModelCapability'
import { addChatQuote, removeChatQuote } from './chatQuoteEditing'
import { useChatComposerEditor } from './useChatComposerEditor'
import { useChatComposerSuggestions } from './useChatComposerSuggestions'

export function useChatComposer(options: UseChatComposerOptions) {
  let editingSession = 0
  watch(options.draftId, () => {
    editingSession += 1
  }, { flush: 'sync' })
  onScopeDispose(() => {
    editingSession += 1
  })

  const resourceById = computed(() => new Map(options.resources.value.map(entry => [entry.resource.resourceId, entry])))
  const query = useChatComposerSuggestions(options, selectSuggestion)
  const { editor, contentJSON, imageLabels, serializedContent } = useChatComposerEditor({
    composerContent: options.composerContent,
    draft: options.draft,
    draftId: options.draftId,
    isSending: options.isSending,
    language: options.language,
    rejectedResourceIds: options.rejectedResourceIds,
    resources: options.resources,
    onUpdateContent: options.onUpdateContent,
    onTrigger: (trigger) => { query.activeTrigger.value = trigger },
    onSuggestionKeydown: query.handleKeydown,
    onPasteFiles: files => attachFiles(files, 'both'),
    onSubmit: submit,
    onLocateResource: options.onLocateResource,
  })
  const resourceIds = computed(() => getChatComposerResourceIds(contentJSON.value))
  const quotes = computed(() => serializedContent.value.userContent?.quotes ?? [])
  const modelInputIssue = computed(() => resolveChatComposerModelInputIssue({
    model: options.selectedModel.value,
    modelSelection: {
      reasoning: options.selectedEffort.value,
      serviceTier: options.selectedServiceTier.value,
    },
    resourceIds: resourceIds.value,
    resources: options.resources.value,
  }))
  const canSubmit = computed(() => options.canSend.value && modelInputIssue.value === null && (
    serializedContent.value.content.length > 0 || resourceIds.value.length > 0 || quotes.value.length > 0
  ) && resourceIds.value.every(id => resourceById.value.get(id)?.resource.state === 'ready'))
  const panelResources = computed(() => (contentJSON.value.attrs?.panelResourceIds as string[] ?? [])
    .flatMap(id => resourceById.value.get(id) ?? []))
  const resourceStripResources = computed<ComposerResourceCard[]>(() => {
    const panelIds = new Set(panelResources.value.map(entry => entry.resource.resourceId))
    return resourceIds.value.flatMap((id) => {
      const entry = resourceById.value.get(id)
      return entry
        ? [{
            ...entry,
            imageLabel: imageLabels.value.get(id),
            isReference: !panelIds.has(id),
            previewUrl: resolveComposerResourcePreviewUrl(entry.resource),
          }]
        : []
    })
  })

  function submit() {
    if (!canSubmit.value || options.isRunning.value)
      return
    options.onSend(serializeChatComposerContent(editor.value?.getJSON() ?? contentJSON.value))
  }

  async function resolveSource(source: BuddyComposerSource): Promise<string | null> {
    const session = editingSession
    const resourceId = await options.selectSource(source)
    return session === editingSession ? resourceId : null
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
    return removeChatComposerResource(current, resourceId)
  }

  function selectSuggestion(option: ChatPromptContextOption | undefined) {
    const currentEditor = editor.value
    const trigger = query.activeTrigger.value
    if (!currentEditor || !currentEditor.isEditable || !trigger || !option)
      return

    const to = currentEditor.state.selection.from
    const from = Math.max(1, to - trigger.query.length - 1)
    query.activeTrigger.value = null
    if (option.kind === 'file') {
      if (option.source)
        void insertResolvedChatComposerResource(currentEditor, { from, to }, () => resolveSource(option.source!))
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
    const resourceId = await resolveSource(option.source)
    if (!resourceId)
      return false
    return insertChatComposerResources(currentEditor, [resourceId], 'panel')
  }

  return {
    activeSuggestionIndex: query.activeSuggestionIndex,
    activeTrigger: query.activeTrigger,
    attachFiles,
    canSubmit,
    closeSuggestions: query.closeSuggestions,
    contextOptions: query.contextOptions,
    editor,
    isLoadingContext: query.isLoadingContext,
    loadContextOptions: query.loadContextOptions,
    modelInputIssue,
    panelResources,
    quotes,
    addQuote: (quote: BuddyMessageQuote) => addChatQuote(editor.value, quote),
    removeQuote: (id: string) => removeChatQuote(editor.value, id),
    removeResource,
    removePanelResource: (id: string) => editor.value && removeChatComposerPanelResource(editor.value, id),
    resourceStripResources,
    selectPanelSource,
    selectSuggestion,
    submit,
    sourceOptions: query.sourceOptions,
    suggestions: query.suggestions,
  }
}
