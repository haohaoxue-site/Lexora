<script setup lang="ts">
import type { JSONContent } from '@tiptap/core'
import type { BuddyComposerContextOptions, BuddyComposerTrigger } from '@/chat/buddyChatInput'
import type { BuddyChatRuntimeDisabledReason, BuddyChatRuntimeOption } from '@/chat/buddyChatRuntimeControls'
import type { BuddyChatDraftAttachment } from '@/chat/chatAttachmentView'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type {
  BuddyChatModelSelection,
  BuddyPromptContextOption,
  BuddyRuntime,
  BuddyRuntimeModelOption,
} from '@/lib/tauriRuntime'
import Placeholder from '@tiptap/extension-placeholder'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import {
  Add20Regular,
  Checkmark16Regular,
  ChevronDown16Regular,
  ChevronRight16Regular,
  Dismiss16Regular,
  Flash20Filled,
  Stop20Filled,
} from '@vicons/fluent'
import { NButton, NIcon } from 'naive-ui'
import { computed, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue'
import claudeIconUrl from '@/assets/brand/claude.svg'
import codexIconUrl from '@/assets/brand/codex.svg'
import chatSendMoonIconUrl from '@/assets/window/chat-send-moon.png'
import {
  BUDDY_ATTACHMENT_TOKEN_NODE_NAME,
  BUDDY_PROMPT_TOKEN_NODE_NAME,
  collectBuddyAttachmentTokenIds,
  collectBuddyClipboardFileReferencePaths,
  collectBuddyClipboardFiles,
  createBuddyAttachmentTokenAttrs,
  createBuddyComposerSubmitControlState,
  createBuddyComposerSubmitPayload,
  createBuddyComposerSuggestions,
  createBuddyPromptTokenAttrs,
  createEmptyBuddyComposerContent,
  findBuddyComposerTrigger,
  hasBuddyClipboardImageType,
  normalizeBuddyAttachmentTokenContent,
  serializeBuddyComposerContent,
  shouldSubmitBuddyComposerKey,
} from '@/chat/buddyChatInput'
import {
  createBuddyChatModelSelection,
  createBuddyModelSpeedOptions,
  formatBuddyNativeOptionLabel,
  isBuddyChatSendReady,
  isBuddySelectedFastServiceTier,
  normalizeEffortForModel,
  normalizeServiceTierForModel,
  resolveBuddyModelControlStateFromSelection,
} from '@/chat/buddyChatModelControls'
import {
  createBuddyChatDraftAttachment,
  createBuddyChatDraftAttachmentFromNativeClipboardImage,
  createBuddyChatDraftAttachmentFromNativeFile,
  resolveBuddyAttachmentPreviewUrl,
} from '@/chat/chatAttachmentView'
import { BuddyAttachmentToken } from '@/chat/extensions/BuddyAttachmentToken'
import { BuddyPromptToken } from '@/chat/extensions/BuddyPromptToken'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { isTauriRuntime } from '@/lib/invokeClient'
import {
  listBuddyCodexPromptContextOptions,
  listBuddyRuntimeModelOptions,
  readBuddyClipboardFiles,
  readBuddyClipboardImage,
  selectBuddyChatAttachmentFiles,
} from '@/lib/tauriRuntime'

interface BuddyComposerEditor {
  commands: {
    setContent: (content: JSONContent, options?: { emitUpdate?: boolean }) => unknown
  }
  getJSON: () => JSONContent
}

const props = defineProps<{
  cwd: string | null
  draft: {
    attachments: ReadonlyArray<BuddyChatDraftAttachment>
    contentJSON: JSONContent
    modelSelection: BuddyChatModelSelection | null
  } | null
  draftVersion: number
  disabled: boolean
  isSending: boolean
  language: BuddyLocale
  runtimeOptions: ReadonlyArray<BuddyChatRuntimeOption>
  selectedRuntime: BuddyRuntime
  showRuntimeSelector: boolean
}>()

const emit = defineEmits<{
  draftChange: [payload: {
    attachments: ReadonlyArray<BuddyChatDraftAttachment>
    contentJSON: JSONContent
    modelSelection: BuddyChatModelSelection | null
  }]
  error: [message: string]
  send: [payload: {
    attachments: ReadonlyArray<BuddyChatDraftAttachment>
    content: string
    contextItems: ReturnType<typeof createBuddyComposerSubmitPayload>['contextItems']
    inputs: ReturnType<typeof createBuddyComposerSubmitPayload>['inputs']
    modelSelection: BuddyChatModelSelection | null
  }]
  stop: []
  updateRuntime: [runtime: BuddyRuntime]
}>()

const attachments = shallowRef<ReadonlyArray<BuddyChatDraftAttachment>>([])
const contentJSON = shallowRef<JSONContent>(createEmptyBuddyComposerContent())
const composerRoot = useTemplateRef<HTMLFormElement>('composerRoot')
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const isReadingFiles = shallowRef(false)
const promptOptions = shallowRef<BuddyComposerContextOptions>({
  files: [],
  plugins: [],
  skills: [],
})
const activeTrigger = shallowRef<BuddyComposerTrigger | null>(null)
const activeSuggestionIndex = shallowRef(0)
const isLoadingPromptOptions = shallowRef(false)
const modelOptions = shallowRef<ReadonlyArray<BuddyRuntimeModelOption>>([])
const selectedModelId = shallowRef<string | null>(null)
const selectedEffort = shallowRef<string | null>(null)
const selectedServiceTier = shallowRef<string | null>(null)
const isLoadingModelOptions = shallowRef(false)
const isModelMenuOpen = shallowRef(false)
const modelMenuView = shallowRef<'main' | 'model' | 'speed'>('main')
const isRuntimeMenuOpen = shallowRef(false)
const { t } = useBuddyI18n(() => props.language)
let promptOptionsRequestId = 0
let isHydratingDraft = false
let isSyncingAttachmentTokens = false
let inlineAttachmentIds = new Set<string>()
const composerIcons = {
  checkmark: Checkmark16Regular,
  chevronDown: ChevronDown16Regular,
  chevronRight: ChevronRight16Regular,
  flash: Flash20Filled,
  stop: Stop20Filled,
}

const serializedContent = computed(() => serializeBuddyComposerContent(contentJSON.value))
const suggestions = computed(() => createBuddyComposerSuggestions(activeTrigger.value, promptOptions.value))
const hasSuggestions = computed(() => suggestions.value.length > 0)
const availableModelOptions = computed(() =>
  modelOptions.value.filter(option => option.runtime === 'codex'),
)
const selectedModel = computed(() =>
  availableModelOptions.value.find(option => option.id === selectedModelId.value) ?? null,
)
const reasoningEffortOptions = computed(() => selectedModel.value?.supportedReasoningEfforts ?? [])
const speedOptions = computed(() => createBuddyModelSpeedOptions(selectedModel.value))
const isFastModeSelected = computed(() =>
  isBuddySelectedFastServiceTier(selectedModel.value, selectedServiceTier.value),
)
const modelSelection = computed(() =>
  createBuddyChatModelSelection(selectedModel.value, selectedEffort.value, selectedServiceTier.value),
)
const selectedRuntimeOption = computed(() =>
  props.runtimeOptions.find(option => option.runtime === props.selectedRuntime)
  ?? props.runtimeOptions[0]
  ?? null,
)
const hasSelectableRuntime = computed(() =>
  props.runtimeOptions.some(option => option.isSelectable),
)
const isSelectedRuntimeSelectable = computed(() =>
  !props.showRuntimeSelector || Boolean(selectedRuntimeOption.value?.isSelectable),
)
const runtimeEchoText = computed(() => selectedRuntimeOption.value?.label ?? formatRuntimeLabel(props.selectedRuntime))
const modelEchoModelText = computed(() => {
  const model = selectedModel.value
  if (!model)
    return isLoadingModelOptions.value ? 'Model...' : 'Model'

  return model.displayName
})
const modelEchoEffortText = computed(() => {
  if (!selectedModel.value)
    return ''

  return formatBuddyNativeOptionLabel(selectedEffort.value)
})
const modelEchoText = computed(() => {
  return [
    modelEchoModelText.value,
    modelEchoEffortText.value,
  ].filter(Boolean).join(' ')
})
const canSend = computed(() =>
  isSelectedRuntimeSelectable.value
  && isBuddyChatSendReady({
    attachmentCount: attachments.value.length,
    content: serializedContent.value.content,
    isReadingFiles: isReadingFiles.value,
    modelSelection: modelSelection.value,
  }),
)
const submitControl = computed(() =>
  createBuddyComposerSubmitControlState({
    canSend: canSend.value,
    disabled: props.disabled,
    isSending: props.isSending,
  }),
)

const editor = useEditor({
  content: contentJSON.value,
  editable: !props.disabled && !props.isSending,
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
    Placeholder.configure({
      placeholder: () => t('chat.composerPlaceholder'),
    }),
    BuddyAttachmentToken,
    BuddyPromptToken,
  ],
  editorProps: {
    attributes: {
      class: 'buddy-chat-composer__prosemirror',
    },
    handleKeyDown: (_, event) => handleEditorKeyDown(event),
    handlePaste: (_, event) => handleEditorPaste(event),
  },
  onUpdate: ({ editor }) => {
    contentJSON.value = editor.getJSON()
    if (!isSyncingAttachmentTokens) {
      syncInlineAttachmentState(editor)
    }
    refreshActiveTrigger()
  },
  onSelectionUpdate: () => refreshActiveTrigger(),
})

watch(
  () => props.disabled || props.isSending,
  locked => editor.value?.setEditable(!locked, false),
)

watch(activeTrigger, (trigger) => {
  activeSuggestionIndex.value = 0
  void refreshPromptOptions(trigger)
})

watch(
  () => props.cwd,
  () => {
    void refreshPromptOptions(activeTrigger.value)
  },
)

watch(
  () => props.draftVersion,
  () => hydrateDraft(),
  { immediate: true },
)

watch(
  [
    attachments,
    contentJSON,
    modelSelection,
  ],
  () => {
    if (!props.draft || isHydratingDraft)
      return

    emit('draftChange', {
      attachments: attachments.value,
      contentJSON: contentJSON.value,
      modelSelection: modelSelection.value,
    })
  },
)

onMounted(() => {
  void refreshPromptOptions(null)
  void refreshModelOptions()
  document.addEventListener('pointerdown', handleDocumentPointerDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  editor.value?.destroy()
})

async function selectFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  if (files.length === 0)
    return

  await appendAttachmentFiles(files, { insertInlineAttachmentTokens: false })
  input.value = ''
}

async function openAttachmentPicker() {
  if (props.disabled || props.isSending || isReadingFiles.value) {
    return
  }

  if (isTauriRuntime()) {
    await appendNativeSelectedFileAttachments({ insertInlineAttachmentTokens: false })
    return
  }

  fileInput.value?.click()
}

async function appendAttachmentFiles(
  files: ReadonlyArray<File>,
  options: { insertInlineAttachmentTokens: boolean },
) {
  isReadingFiles.value = true
  try {
    const nextAttachments = await Promise.all(files.map(createBuddyChatDraftAttachment))
    appendDraftAttachments(nextAttachments, options)
  }
  catch {
    emit('error', t('chat.attachmentReadFailed'))
  }
  finally {
    isReadingFiles.value = false
  }
}

async function appendNativeSelectedFileAttachments(options: { insertInlineAttachmentTokens: boolean }) {
  isReadingFiles.value = true
  try {
    const nativeFiles = await selectBuddyChatAttachmentFiles()
    if (nativeFiles.length === 0) {
      return false
    }

    appendDraftAttachments(
      nativeFiles.map(createBuddyChatDraftAttachmentFromNativeFile),
      options,
    )
    return true
  }
  catch {
    emit('error', t('chat.attachmentReadFailed'))
    return false
  }
  finally {
    isReadingFiles.value = false
  }
}

async function appendNativeClipboardImageAttachment(options: { insertInlineAttachmentTokens: boolean }) {
  isReadingFiles.value = true
  try {
    const image = await readBuddyClipboardImage()
    if (!image) {
      return false
    }

    appendDraftAttachments([
      createBuddyChatDraftAttachmentFromNativeClipboardImage(image),
    ], options)
    return true
  }
  catch {
    emit('error', t('chat.attachmentReadFailed'))
    return false
  }
  finally {
    isReadingFiles.value = false
  }
}

async function appendNativeClipboardFileAttachments(options: { insertInlineAttachmentTokens: boolean }) {
  isReadingFiles.value = true
  try {
    const nativeFiles = await readBuddyClipboardFiles()
    if (nativeFiles.length === 0) {
      return false
    }

    appendDraftAttachments(
      nativeFiles.map(createBuddyChatDraftAttachmentFromNativeFile),
      options,
    )
    return true
  }
  catch {
    emit('error', t('chat.attachmentReadFailed'))
    return false
  }
  finally {
    isReadingFiles.value = false
  }
}

async function appendNativeClipboardAttachments(options: { insertInlineAttachmentTokens: boolean }, imageFallback: boolean) {
  if (await appendNativeClipboardFileAttachments(options)) {
    return
  }

  if (imageFallback) {
    await appendNativeClipboardImageAttachment(options)
  }
}

function appendDraftAttachments(
  nextAttachments: ReadonlyArray<BuddyChatDraftAttachment>,
  options: { insertInlineAttachmentTokens: boolean },
) {
  const firstAttachmentIndex = attachments.value.length + 1
  attachments.value = [
    ...attachments.value,
    ...nextAttachments,
  ]
  if (options.insertInlineAttachmentTokens) {
    for (const attachmentId of insertInlineAttachmentTokens(nextAttachments, firstAttachmentIndex)) {
      inlineAttachmentIds.add(attachmentId)
    }
  }
}

function removeAttachment(id: string) {
  attachments.value = attachments.value.filter(attachment => attachment.id !== id)
  inlineAttachmentIds.delete(id)
  normalizeEditorAttachmentTokenContent()
}

function submit() {
  if (!canSend.value)
    return

  const payload = createBuddyComposerSubmitPayload({
    attachments: attachments.value,
    content: editor.value?.getJSON() ?? contentJSON.value,
  })

  emit('send', {
    ...payload,
    modelSelection: modelSelection.value,
  })
  clearEditor()
  attachments.value = []
}

function handleSubmitControlClick() {
  if (submitControl.value.kind === 'stop') {
    emit('stop')
    return
  }

  submit()
}

function handleEditorKeyDown(event: KeyboardEvent) {
  if (hasSuggestions.value) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      activeSuggestionIndex.value = (activeSuggestionIndex.value + 1) % suggestions.value.length
      return true
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      activeSuggestionIndex.value = (activeSuggestionIndex.value + suggestions.value.length - 1) % suggestions.value.length
      return true
    }

    if (event.key === 'Tab' || shouldSubmitBuddyComposerKey(event)) {
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

  if (!shouldSubmitBuddyComposerKey(event)) {
    return false
  }

  event.preventDefault()
  submit()
  return true
}

function handleEditorPaste(event: ClipboardEvent) {
  if (props.disabled || props.isSending || isReadingFiles.value) {
    return false
  }

  const fileReferencePaths = collectBuddyClipboardFileReferencePaths(event.clipboardData)
  const clipboardFiles = collectBuddyClipboardFiles(event.clipboardData)
  const hasClipboardImage = hasBuddyClipboardImageType(event.clipboardData)
    || clipboardFiles.some(file => file.type.startsWith('image/'))

  if (
    isTauriRuntime()
    && (
      fileReferencePaths.length > 0
      || clipboardFiles.length > 0
      || shouldUseNativeClipboardFileFallback(event.clipboardData)
      || hasClipboardImage
    )
  ) {
    event.preventDefault()
    void appendNativeClipboardAttachments({ insertInlineAttachmentTokens: true }, hasClipboardImage)
    return true
  }

  if (clipboardFiles.length > 0) {
    event.preventDefault()
    void appendAttachmentFiles(clipboardFiles, { insertInlineAttachmentTokens: true })
    return true
  }

  if (shouldUseNativeClipboardFileFallback(event.clipboardData)) {
    event.preventDefault()
    void appendNativeClipboardFileAttachments({ insertInlineAttachmentTokens: true })
    return true
  }

  if (!isTauriRuntime() || !shouldUseNativeClipboardImageFallback(event.clipboardData)) {
    return false
  }

  event.preventDefault()
  void appendNativeClipboardImageAttachment({ insertInlineAttachmentTokens: true })
  return true
}

function syncInlineAttachmentState(currentEditor: BuddyComposerEditor) {
  const tokenIds = new Set(collectBuddyAttachmentTokenIds(contentJSON.value))
  const removedInlineAttachmentIds = [...inlineAttachmentIds]
    .filter(attachmentId => !tokenIds.has(attachmentId))
  if (removedInlineAttachmentIds.length > 0) {
    const removedIds = new Set(removedInlineAttachmentIds)
    attachments.value = attachments.value.filter(attachment => !removedIds.has(attachment.id))
  }

  inlineAttachmentIds = new Set([...inlineAttachmentIds].filter(attachmentId => tokenIds.has(attachmentId)))
  normalizeEditorAttachmentTokenContent(currentEditor)
}

function normalizeEditorAttachmentTokenContent(currentEditor: BuddyComposerEditor | null | undefined = editor.value) {
  const currentContent = currentEditor?.getJSON() ?? contentJSON.value
  const normalizedContent = normalizeBuddyAttachmentTokenContent({
    attachments: attachments.value,
    content: currentContent,
  })
  if (JSON.stringify(normalizedContent) === JSON.stringify(currentContent)) {
    contentJSON.value = currentContent
    return
  }

  contentJSON.value = normalizedContent
  if (!currentEditor) {
    return
  }

  isSyncingAttachmentTokens = true
  try {
    currentEditor.commands.setContent(normalizedContent, {
      emitUpdate: false,
    })
  }
  finally {
    isSyncingAttachmentTokens = false
  }
}

function shouldUseNativeClipboardFileFallback(clipboardData: DataTransfer | null) {
  if (!clipboardData) {
    return false
  }

  return hasClipboardFilePayload(clipboardData)
    || Array.from(clipboardData.types).some(type =>
      type === 'text/uri-list' || type === 'x-special/gnome-copied-files',
    )
}

function shouldUseNativeClipboardImageFallback(clipboardData: DataTransfer | null) {
  if (!clipboardData) {
    return true
  }

  return hasBuddyClipboardImageType(clipboardData)
    || hasClipboardFilePayload(clipboardData)
    || !hasClipboardPayloadTypes(clipboardData)
}

function hasClipboardPayloadTypes(clipboardData: DataTransfer) {
  return clipboardData.files.length > 0
    || clipboardData.items.length > 0
    || clipboardData.types.length > 0
}

function hasClipboardFilePayload(clipboardData: DataTransfer) {
  return Array.from(clipboardData.items).some(item => item.kind === 'file')
    || Array.from(clipboardData.types).includes('Files')
}

function insertInlineAttachmentTokens(
  nextAttachments: ReadonlyArray<BuddyChatDraftAttachment>,
  firstAttachmentIndex: number,
) {
  const currentEditor = editor.value
  if (!currentEditor) {
    return []
  }

  let nextAttachmentIndex = firstAttachmentIndex
  const insertedAttachmentIds: string[] = []
  const tokenContent = nextAttachments.flatMap((attachment): JSONContent[] => {
    const index = nextAttachmentIndex++
    insertedAttachmentIds.push(attachment.id)
    return [
      {
        type: BUDDY_ATTACHMENT_TOKEN_NODE_NAME,
        attrs: createBuddyAttachmentTokenAttrs({
          id: attachment.id,
          index,
          kind: attachment.kind,
        }),
      },
      {
        type: 'text',
        text: ' ',
      },
    ]
  })
  if (tokenContent.length === 0) {
    return []
  }

  return currentEditor.chain().focus().insertContent(tokenContent).run()
    ? insertedAttachmentIds
    : []
}

function selectSuggestion(option: BuddyPromptContextOption | undefined) {
  const currentEditor = editor.value
  const trigger = activeTrigger.value
  if (!currentEditor || !trigger || !option) {
    return
  }

  const to = currentEditor.state.selection.from
  const from = Math.max(1, to - trigger.query.length - 1)
  currentEditor
    .chain()
    .focus()
    .deleteRange({ from, to })
    .insertContent({
      type: BUDDY_PROMPT_TOKEN_NODE_NAME,
      attrs: createBuddyPromptTokenAttrs(option),
    })
    .insertContent(' ')
    .run()
  activeTrigger.value = null
}

function refreshActiveTrigger() {
  const currentEditor = editor.value
  if (!currentEditor || props.disabled || props.isSending) {
    activeTrigger.value = null
    return
  }

  const { from } = currentEditor.state.selection
  const textBeforeCursor = currentEditor.state.doc.textBetween(0, from, '\n', '\n')
  activeTrigger.value = findBuddyComposerTrigger(textBeforeCursor)
}

async function refreshPromptOptions(trigger: BuddyComposerTrigger | null) {
  if (trigger?.kind === 'slash') {
    return
  }

  const requestId = ++promptOptionsRequestId
  isLoadingPromptOptions.value = true
  try {
    const nextOptions = await listBuddyCodexPromptContextOptions({
      cwd: props.cwd,
      fileQuery: trigger?.kind === 'mention' ? trigger.query : null,
    })
    if (requestId !== promptOptionsRequestId) {
      return
    }

    promptOptions.value = nextOptions
  }
  catch {
    if (requestId === promptOptionsRequestId) {
      promptOptions.value = {
        files: [],
        plugins: [],
        skills: [],
      }
    }
  }
  finally {
    if (requestId === promptOptionsRequestId) {
      isLoadingPromptOptions.value = false
    }
  }
}

async function refreshModelOptions() {
  isLoadingModelOptions.value = true
  try {
    const nextOptions = await listBuddyRuntimeModelOptions()
    modelOptions.value = nextOptions
    const currentModel = selectedModelId.value
      ? nextOptions.find(option => option.id === selectedModelId.value) ?? null
      : null
    const state = currentModel
      ? {
          effort: normalizeEffortForModel(currentModel, selectedEffort.value),
          model: currentModel,
          serviceTier: normalizeServiceTierForModel(currentModel, selectedServiceTier.value),
        }
      : resolveBuddyModelControlStateFromSelection(nextOptions, props.draft?.modelSelection ?? null)

    applyModelControlState(state)
  }
  catch {
    modelOptions.value = []
    selectedModelId.value = null
    selectedEffort.value = null
    selectedServiceTier.value = null
  }
  finally {
    isLoadingModelOptions.value = false
  }
}

function clearEditor() {
  contentJSON.value = createEmptyBuddyComposerContent()
  editor.value?.commands.setContent(contentJSON.value, {
    emitUpdate: false,
  })
  inlineAttachmentIds = new Set()
  activeTrigger.value = null
}

function hydrateDraft() {
  isHydratingDraft = true
  attachments.value = props.draft?.attachments ?? []
  contentJSON.value = props.draft?.contentJSON ?? createEmptyBuddyComposerContent()
  inlineAttachmentIds = createInlineAttachmentIdSet(contentJSON.value, attachments.value)
  editor.value?.commands.setContent(contentJSON.value, {
    emitUpdate: false,
  })
  applyModelSelection(props.draft?.modelSelection ?? null)
  activeTrigger.value = null
  isHydratingDraft = false
}

function createInlineAttachmentIdSet(
  content: JSONContent,
  draftAttachments: ReadonlyArray<BuddyChatDraftAttachment>,
) {
  const attachmentIds = new Set(draftAttachments.map(attachment => attachment.id))
  return new Set(
    collectBuddyAttachmentTokenIds(content)
      .filter(attachmentId => attachmentIds.has(attachmentId)),
  )
}

function applyModelSelection(selection: BuddyChatModelSelection | null) {
  applyModelControlState(resolveBuddyModelControlStateFromSelection(modelOptions.value, selection))
}

function applyModelControlState(state: {
  effort: string | null
  model: BuddyRuntimeModelOption | null
  serviceTier: string | null
}) {
  selectedModelId.value = state.model?.id ?? null
  selectedEffort.value = state.effort
  selectedServiceTier.value = state.serviceTier
}

function getSuggestionKindLabel(option: BuddyPromptContextOption) {
  if (option.kind === 'slashCommand') {
    return '/'
  }
  if (option.kind === 'skill') {
    return '$'
  }

  return '@'
}

function toggleModelMenu() {
  if (props.disabled || props.isSending)
    return

  isRuntimeMenuOpen.value = false
  isModelMenuOpen.value = !isModelMenuOpen.value
  modelMenuView.value = 'main'
}

function toggleRuntimeMenu() {
  if (!props.showRuntimeSelector || props.disabled || props.isSending || !hasSelectableRuntime.value)
    return

  isModelMenuOpen.value = false
  isRuntimeMenuOpen.value = !isRuntimeMenuOpen.value
}

function openModelMenuView(view: 'model' | 'speed') {
  modelMenuView.value = view
}

function closeModelMenu() {
  isModelMenuOpen.value = false
  modelMenuView.value = 'main'
}

function closeRuntimeMenu() {
  isRuntimeMenuOpen.value = false
}

function selectRuntimeOption(option: BuddyChatRuntimeOption) {
  if (!option.isSelectable)
    return

  emit('updateRuntime', option.runtime)
  closeRuntimeMenu()
}

function selectReasoningEffort(effort: string) {
  selectedEffort.value = effort
  closeModelMenu()
}

function selectModelOption(option: BuddyRuntimeModelOption) {
  selectedModelId.value = option.id
  selectedEffort.value = normalizeEffortForModel(option, selectedEffort.value)
  selectedServiceTier.value = option.defaultServiceTier
  modelMenuView.value = 'main'
}

function selectSpeedOption(serviceTier: string | null) {
  selectedServiceTier.value = serviceTier
  closeModelMenu()
}

function handleDocumentPointerDown(event: PointerEvent) {
  const root = composerRoot.value
  if (!root || (!isModelMenuOpen.value && !isRuntimeMenuOpen.value))
    return

  if (event.target instanceof Node && !root.contains(event.target)) {
    closeModelMenu()
    closeRuntimeMenu()
  }
}

function resolveRuntimeIconUrl(runtime: BuddyRuntime) {
  return runtime === 'claude' ? claudeIconUrl : codexIconUrl
}

function resolveRuntimeIconClass(runtime: BuddyRuntime) {
  return {
    'buddy-chat-composer__runtime-icon--codex': runtime === 'codex',
  }
}

function formatRuntimeLabel(runtime: BuddyRuntime) {
  return runtime === 'claude' ? 'Claude' : 'Codex'
}

function resolveRuntimeDisabledReasonLabel(reason: BuddyChatRuntimeDisabledReason | null) {
  if (reason === 'control-disabled')
    return t('chat.runtimeControlDisabled')
  if (reason === 'runtime-unavailable')
    return t('chat.runtimeUnavailable')

  return ''
}
</script>

<template>
  <form
    ref="composerRoot"
    class="buddy-chat-composer"
    @submit.prevent="submit"
  >
    <div class="buddy-chat-composer__input-area">
      <ul
        v-if="attachments.length > 0"
        class="buddy-chat-composer__attachments"
      >
        <li
          v-for="attachment in attachments"
          :key="attachment.id"
          class="buddy-chat-composer__attachment"
        >
          <img
            v-if="attachment.kind === 'image' && resolveBuddyAttachmentPreviewUrl(attachment)"
            :alt="attachment.name"
            :src="resolveBuddyAttachmentPreviewUrl(attachment)"
          >
          <span
            v-else
            class="buddy-chat-composer__attachment-icon"
          >
            {{ attachment.kind === 'text' ? 'TXT' : 'BIN' }}
          </span>
          <span class="buddy-chat-composer__attachment-name">{{ attachment.name }}</span>
          <NButton
            :aria-label="t('chat.removeAttachment')"
            circle
            quaternary
            size="tiny"
            native-type="button"
            :disabled="disabled || isSending"
            @click="removeAttachment(attachment.id)"
          >
            <template #icon>
              <NIcon :component="Dismiss16Regular" />
            </template>
          </NButton>
        </li>
      </ul>

      <div class="buddy-chat-composer__editor-wrap">
        <EditorContent
          v-if="editor"
          class="buddy-chat-composer__input"
          :editor="editor"
        />

        <div
          v-if="hasSuggestions || isLoadingPromptOptions"
          class="buddy-chat-composer__suggestions"
        >
          <span
            v-if="isLoadingPromptOptions && suggestions.length === 0"
            class="buddy-chat-composer__suggestion-empty"
          >
            ...
          </span>
          <button
            v-for="(suggestion, index) in suggestions"
            :key="`${suggestion.option.kind}:${suggestion.option.value}:${suggestion.option.path ?? ''}`"
            class="buddy-chat-composer__suggestion"
            :class="{ 'buddy-chat-composer__suggestion--active': index === activeSuggestionIndex }"
            type="button"
            @mousedown.prevent="selectSuggestion(suggestion.option)"
          >
            <span class="buddy-chat-composer__suggestion-kind">
              {{ getSuggestionKindLabel(suggestion.option) }}
            </span>
            <span class="buddy-chat-composer__suggestion-main">
              <span class="buddy-chat-composer__suggestion-label">{{ suggestion.option.label }}</span>
              <span
                v-if="suggestion.option.description"
                class="buddy-chat-composer__suggestion-description"
              >
                {{ suggestion.option.description }}
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>

    <div class="buddy-chat-composer__toolbar">
      <div class="buddy-chat-composer__toolbar-left">
        <NButton
          class="buddy-chat-composer__attach"
          circle
          quaternary
          size="medium"
          native-type="button"
          :disabled="disabled || isSending || isReadingFiles"
          @click="openAttachmentPicker"
        >
          <template #icon>
            <NIcon :component="Add20Regular" />
          </template>
        </NButton>
        <input
          ref="fileInput"
          class="buddy-chat-composer__file"
          multiple
          type="file"
          @change="selectFiles"
        >
      </div>

      <div class="buddy-chat-composer__toolbar-right">
        <div
          v-if="showRuntimeSelector"
          class="buddy-chat-composer__runtime"
        >
          <button
            class="buddy-chat-composer__runtime-trigger"
            :aria-label="runtimeEchoText"
            type="button"
            :disabled="disabled || isSending || !hasSelectableRuntime"
            :title="resolveRuntimeDisabledReasonLabel(selectedRuntimeOption?.disabledReason ?? null)"
            @click="toggleRuntimeMenu"
          >
            <img
              alt=""
              class="buddy-chat-composer__runtime-icon buddy-chat-composer__runtime-trigger-icon"
              :class="resolveRuntimeIconClass(selectedRuntime)"
              draggable="false"
              :src="resolveRuntimeIconUrl(selectedRuntime)"
            >
            <span class="buddy-chat-composer__runtime-name">{{ runtimeEchoText }}</span>
            <NIcon
              class="buddy-chat-composer__model-chevron"
              :component="composerIcons.chevronDown"
            />
          </button>

          <div
            v-if="isRuntimeMenuOpen"
            class="buddy-chat-composer__runtime-popover"
            @pointerdown.stop
          >
            <button
              v-for="option in runtimeOptions"
              :key="option.runtime"
              class="buddy-chat-composer__runtime-option"
              type="button"
              :disabled="!option.isSelectable"
              @click="selectRuntimeOption(option)"
            >
              <img
                alt=""
                class="buddy-chat-composer__runtime-icon"
                :class="resolveRuntimeIconClass(option.runtime)"
                draggable="false"
                :src="resolveRuntimeIconUrl(option.runtime)"
              >
              <span class="buddy-chat-composer__runtime-option-main">
                <span>{{ option.label }}</span>
                <small v-if="option.disabledReason">
                  {{ resolveRuntimeDisabledReasonLabel(option.disabledReason) }}
                </small>
              </span>
              <NIcon
                v-if="selectedRuntime === option.runtime"
                :component="composerIcons.checkmark"
              />
            </button>
          </div>
        </div>

        <div class="buddy-chat-composer__model">
          <button
            class="buddy-chat-composer__model-trigger"
            :class="{ 'buddy-chat-composer__model-trigger--fast': isFastModeSelected }"
            :aria-label="modelEchoText"
            type="button"
            :disabled="disabled || isSending"
            @click="toggleModelMenu"
          >
            <NIcon
              v-if="isFastModeSelected"
              class="buddy-chat-composer__model-flash"
              :component="composerIcons.flash"
            />
            <span class="buddy-chat-composer__model-name">{{ modelEchoModelText }}</span>
            <span
              v-if="modelEchoEffortText"
              class="buddy-chat-composer__model-effort"
            >
              {{ modelEchoEffortText }}
            </span>
            <NIcon
              class="buddy-chat-composer__model-chevron"
              :component="composerIcons.chevronDown"
            />
          </button>

          <div
            v-if="isModelMenuOpen"
            class="buddy-chat-composer__model-popover"
            @pointerdown.stop
          >
            <div class="buddy-chat-composer__model-menu buddy-chat-composer__model-menu--main">
              <span class="buddy-chat-composer__model-menu-title">Reasoning</span>
              <button
                v-for="option in reasoningEffortOptions"
                :key="option.reasoningEffort"
                class="buddy-chat-composer__model-menu-item"
                type="button"
                @click="selectReasoningEffort(option.reasoningEffort)"
              >
                <span>{{ formatBuddyNativeOptionLabel(option.reasoningEffort) }}</span>
                <NIcon
                  v-if="selectedEffort === option.reasoningEffort"
                  :component="composerIcons.checkmark"
                />
              </button>
              <span
                v-if="reasoningEffortOptions.length === 0"
                class="buddy-chat-composer__model-menu-empty"
              >
                No reasoning options
              </span>
              <span class="buddy-chat-composer__model-menu-divider" />
              <button
                class="buddy-chat-composer__model-menu-item buddy-chat-composer__model-menu-item--nested"
                :class="{ 'buddy-chat-composer__model-menu-item--active': modelMenuView === 'model' }"
                type="button"
                @click="openModelMenuView('model')"
              >
                <span class="buddy-chat-composer__model-menu-item-main">
                  <NIcon
                    v-if="isFastModeSelected"
                    :component="composerIcons.flash"
                  />
                  <span>{{ selectedModel?.displayName ?? 'Model' }}</span>
                </span>
                <NIcon :component="composerIcons.chevronRight" />
              </button>
              <button
                v-if="speedOptions.length > 0"
                class="buddy-chat-composer__model-menu-item buddy-chat-composer__model-menu-item--nested"
                :class="{ 'buddy-chat-composer__model-menu-item--active': modelMenuView === 'speed' }"
                type="button"
                @click="openModelMenuView('speed')"
              >
                <span>Speed</span>
                <NIcon :component="composerIcons.chevronRight" />
              </button>
            </div>

            <div
              v-if="modelMenuView === 'model'"
              class="buddy-chat-composer__model-menu buddy-chat-composer__model-menu--secondary buddy-chat-composer__model-menu--model"
            >
              <span class="buddy-chat-composer__model-menu-title">Model</span>
              <button
                v-for="option in availableModelOptions"
                :key="option.id"
                class="buddy-chat-composer__model-menu-item"
                type="button"
                @click="selectModelOption(option)"
              >
                <span>{{ option.displayName }}</span>
                <NIcon
                  v-if="selectedModelId === option.id"
                  :component="composerIcons.checkmark"
                />
              </button>
              <span
                v-if="availableModelOptions.length === 0"
                class="buddy-chat-composer__model-menu-empty"
              >
                No models
              </span>
            </div>

            <div
              v-else-if="modelMenuView === 'speed'"
              class="buddy-chat-composer__model-menu buddy-chat-composer__model-menu--secondary buddy-chat-composer__model-menu--speed"
            >
              <span class="buddy-chat-composer__model-menu-title">Speed</span>
              <button
                v-for="option in speedOptions"
                :key="option.id ?? 'default'"
                class="buddy-chat-composer__model-menu-item"
                type="button"
                @click="selectSpeedOption(option.id)"
              >
                <span class="buddy-chat-composer__model-menu-item-main">
                  <NIcon
                    v-if="option.isFast"
                    :component="composerIcons.flash"
                  />
                  <span>{{ option.label }}</span>
                </span>
                <NIcon
                  v-if="selectedServiceTier === option.id"
                  :component="composerIcons.checkmark"
                />
              </button>
            </div>
          </div>
        </div>

        <NButton
          class="buddy-chat-composer__send"
          circle
          type="primary"
          color="#07132b"
          text-color="#fffaf0"
          native-type="button"
          size="medium"
          :aria-label="submitControl.kind === 'stop' ? t('chat.stop') : t('chat.send')"
          :disabled="submitControl.disabled"
          @click="handleSubmitControlClick"
        >
          <template #icon>
            <NIcon
              v-if="submitControl.kind === 'stop'"
              class="buddy-chat-composer__stop-icon"
              :component="composerIcons.stop"
            />
            <span
              v-else
              class="buddy-chat-composer__send-icon"
              aria-hidden="true"
            >
              <img
                :src="chatSendMoonIconUrl"
                alt=""
              >
            </span>
          </template>
        </NButton>
      </div>
    </div>
  </form>
</template>

<style scoped lang="scss">
.buddy-chat-composer {
  position: relative;
  display: grid;
  gap: 3px;
  border: 1px solid var(--buddy-border-light);
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgb(255 255 255 / 88%) 0%, rgb(250 253 250 / 80%) 100%),
    color-mix(in srgb, var(--buddy-bg-surface) 90%, transparent);
  box-shadow: 0 10px 22px rgb(36 54 45 / 9%);
  padding: 7px 9px;
}

.buddy-chat-composer__input-area {
  display: grid;
  gap: 5px;
  min-width: 0;
  min-height: 38px;
}

.buddy-chat-composer__attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  padding: 0;
}

.buddy-chat-composer__attachment {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) 22px;
  align-items: center;
  gap: 8px;
  max-width: min(100%, 260px);
  border: 1px solid var(--buddy-border-light);
  border-radius: 6px;
  background: var(--buddy-fill-light);
  list-style: none;
  padding: 5px;
}

.buddy-chat-composer__attachment img {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  object-fit: cover;
}

.buddy-chat-composer__attachment-icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--buddy-accent-primary) 12%, var(--buddy-bg-surface));
  color: var(--buddy-accent-primary);
  font-size: 10px;
  font-weight: 600;
}

.buddy-chat-composer__attachment-name {
  min-width: 0;
  overflow: hidden;
  color: var(--buddy-text-primary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buddy-chat-composer__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  min-height: 31px;
  gap: 8px;
}

.buddy-chat-composer__toolbar-left,
.buddy-chat-composer__toolbar-right {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 8px;
}

.buddy-chat-composer__toolbar-right {
  justify-content: flex-end;
}

.buddy-chat-composer__attach {
  --n-color-hover: var(--buddy-fill-base);
  --n-color-pressed: color-mix(in srgb, var(--buddy-fill-base) 72%, var(--buddy-accent-primary));
  --n-text-color: var(--buddy-text-secondary);
  --n-text-color-hover: var(--buddy-accent-primary);
  --n-text-color-pressed: var(--buddy-accent-primary);
}

.buddy-chat-composer__file {
  display: none;
}

.buddy-chat-composer__editor-wrap {
  position: relative;
  min-width: 0;
}

.buddy-chat-composer__input {
  min-width: 0;
}

:deep(.buddy-chat-composer__prosemirror) {
  min-height: 38px;
  max-height: 100px;
  overflow-y: auto;
  border: 0;
  outline: 0;
  color: var(--buddy-text-primary);
  font-size: 14px;
  line-height: 1.5;
  padding: 3px 2px 0;
  white-space: pre-wrap;
  word-break: break-word;
}

:deep(.buddy-chat-composer__prosemirror p) {
  margin: 0;
}

:deep(.buddy-chat-composer__prosemirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  float: left;
  height: 0;
  color: color-mix(in srgb, var(--buddy-text-placeholder) 76%, transparent);
  pointer-events: none;
}

:deep(.buddy-prompt-token-node) {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  border: 1px solid color-mix(in srgb, var(--buddy-accent-primary) 30%, var(--buddy-border-light));
  border-radius: 6px;
  background: color-mix(in srgb, var(--buddy-accent-primary) 10%, var(--buddy-bg-surface));
  color: var(--buddy-accent-primary);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.4;
  padding: 1px 5px;
  vertical-align: 1px;
}

.buddy-chat-composer__suggestions {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  left: 0;
  z-index: 20;
  display: grid;
  gap: 4px;
  max-height: 228px;
  overflow-y: auto;
  border: 1px solid var(--buddy-border-light);
  border-radius: 8px;
  background: rgb(255 255 255 / 96%);
  box-shadow: 0 14px 28px rgb(26 40 34 / 16%);
  padding: 6px;
}

.buddy-chat-composer__suggestion,
.buddy-chat-composer__suggestion-empty {
  min-width: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--buddy-text-primary);
  font: inherit;
  text-align: left;
}

.buddy-chat-composer__suggestion {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 7px;
}

.buddy-chat-composer__suggestion--active,
.buddy-chat-composer__suggestion:hover {
  background: var(--buddy-fill-base);
}

.buddy-chat-composer__suggestion-kind {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--buddy-accent-primary) 12%, var(--buddy-bg-surface));
  color: var(--buddy-accent-primary);
  font-size: 13px;
  font-weight: 700;
}

.buddy-chat-composer__suggestion-main {
  display: grid;
  min-width: 0;
  gap: 1px;
}

.buddy-chat-composer__suggestion-label,
.buddy-chat-composer__suggestion-description {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buddy-chat-composer__suggestion-label {
  font-size: 13px;
  font-weight: 650;
}

.buddy-chat-composer__suggestion-description,
.buddy-chat-composer__suggestion-empty {
  color: var(--buddy-text-placeholder);
  font-size: 12px;
}

.buddy-chat-composer__suggestion-empty {
  padding: 8px;
}

.buddy-chat-composer__runtime {
  position: relative;
  min-width: 0;
}

.buddy-chat-composer__runtime-trigger {
  display: inline-flex;
  align-items: center;
  max-width: 148px;
  height: 34px;
  min-width: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--buddy-text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  gap: 6px;
  line-height: 1;
  padding: 0 5px 0 9px;
}

.buddy-chat-composer__runtime-trigger:hover,
.buddy-chat-composer__runtime-trigger:focus-visible {
  background: color-mix(in srgb, var(--buddy-accent-primary) 8%, transparent);
  color: var(--buddy-text-primary);
  outline: 0;
}

.buddy-chat-composer__runtime-trigger:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.buddy-chat-composer__runtime-icon {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  object-fit: contain;
}

.buddy-chat-composer__runtime-trigger-icon {
  width: 16px;
  height: 16px;
}

.buddy-chat-composer__runtime-icon--codex {
  filter: brightness(0) saturate(0);
  opacity: 0.72;
}

.buddy-chat-composer__runtime-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buddy-chat-composer__runtime-popover {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  z-index: 32;
  display: grid;
  gap: 3px;
  width: 168px;
  border: 1px solid color-mix(in srgb, var(--buddy-border-light) 92%, #ffffff);
  border-radius: 12px;
  background: rgb(255 255 255 / 96%);
  box-shadow: 0 16px 32px rgb(28 42 36 / 16%);
  padding: 8px;
}

.buddy-chat-composer__runtime-option {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) 16px;
  align-items: center;
  min-width: 0;
  min-height: 38px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--buddy-text-primary);
  cursor: pointer;
  font: inherit;
  gap: 8px;
  padding: 5px 7px;
  text-align: left;
}

.buddy-chat-composer__runtime-option:hover,
.buddy-chat-composer__runtime-option:focus-visible {
  background: color-mix(in srgb, var(--buddy-text-primary) 6%, transparent);
  outline: 0;
}

.buddy-chat-composer__runtime-option:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.buddy-chat-composer__runtime-option-main {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.buddy-chat-composer__runtime-option-main span,
.buddy-chat-composer__runtime-option-main small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buddy-chat-composer__runtime-option-main span {
  font-size: 13px;
  font-weight: 600;
}

.buddy-chat-composer__runtime-option-main small {
  color: var(--buddy-text-placeholder);
  font-size: 11px;
  line-height: 1.2;
}

.buddy-chat-composer__model {
  position: relative;
  min-width: 0;
}

.buddy-chat-composer__model-trigger {
  display: inline-flex;
  align-items: center;
  max-width: 250px;
  height: 34px;
  min-width: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--buddy-text-secondary);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  line-height: 1;
  padding: 0 5px 0 9px;
}

.buddy-chat-composer__model-trigger:hover,
.buddy-chat-composer__model-trigger:focus-visible {
  background: color-mix(in srgb, var(--buddy-accent-primary) 8%, transparent);
  color: var(--buddy-text-primary);
  outline: 0;
}

.buddy-chat-composer__model-trigger:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.buddy-chat-composer__model-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buddy-chat-composer__model-effort {
  flex: 0 0 auto;
  margin-left: 4px;
  white-space: nowrap;
}

.buddy-chat-composer__model-trigger--fast {
  color: color-mix(in srgb, var(--buddy-accent-primary) 82%, var(--buddy-text-primary));
}

.buddy-chat-composer__model-flash,
.buddy-chat-composer__model-menu-item-main :deep(.n-icon) {
  flex: 0 0 auto;
  color: color-mix(in srgb, #c99a2e 84%, var(--buddy-accent-primary));
}

.buddy-chat-composer__model-chevron {
  flex: 0 0 auto;
  margin-left: 2px;
  color: color-mix(in srgb, var(--buddy-text-secondary) 82%, transparent);
}

.buddy-chat-composer__model-popover {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  z-index: 30;
  display: flex;
  flex-direction: row-reverse;
  align-items: flex-end;
  max-width: calc(100vw - 40px);
  gap: 8px;
}

.buddy-chat-composer__model-menu {
  display: grid;
  gap: 2px;
  width: 190px;
  max-height: min(330px, 56vh);
  overflow: hidden auto;
  border: 1px solid color-mix(in srgb, var(--buddy-border-light) 92%, #ffffff);
  border-radius: 12px;
  background: rgb(255 255 255 / 96%);
  background-clip: padding-box;
  box-shadow: none;
  padding: 8px;
}

.buddy-chat-composer__model-menu--secondary {
  width: 196px;
}

.buddy-chat-composer__model-menu--model {
  width: 206px;
}

.buddy-chat-composer__model-menu--speed {
  width: 166px;
}

.buddy-chat-composer__model-menu-title,
.buddy-chat-composer__model-menu-empty {
  color: var(--buddy-text-placeholder);
  font-size: 11px;
  line-height: 1.3;
  padding: 1px 7px 4px;
}

.buddy-chat-composer__model-menu-empty {
  padding-block: 7px;
}

.buddy-chat-composer__model-menu-divider {
  height: 1px;
  margin: 3px 2px;
  background: var(--buddy-border-light);
}

.buddy-chat-composer__model-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  min-height: 31px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--buddy-text-primary);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  gap: 10px;
  padding: 5px 7px;
  text-align: left;
}

.buddy-chat-composer__model-menu-item:hover,
.buddy-chat-composer__model-menu-item:focus-visible,
.buddy-chat-composer__model-menu-item--active {
  background: color-mix(in srgb, var(--buddy-text-primary) 6%, transparent);
  outline: 0;
}

.buddy-chat-composer__model-menu-item > span,
.buddy-chat-composer__model-menu-item-main > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buddy-chat-composer__model-menu-item-main {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 6px;
}

.buddy-chat-composer__model-menu-item :deep(.n-icon) {
  flex: 0 0 auto;
}

.buddy-chat-composer__send {
  position: relative;
  flex: 0 0 auto;
  overflow: hidden;
  width: 32px;
  height: 32px;
  box-shadow:
    0 8px 18px rgb(5 15 35 / 20%);
  --n-border-radius: 999px;
  --n-color: #07132b;
  --n-color-hover: #102451;
  --n-color-pressed: #030a18;
  --n-color-focus: #102451;
  --n-border: 1px solid rgb(232 190 109 / 52%);
  --n-border-hover: 1px solid rgb(255 218 139 / 72%);
  --n-border-pressed: 1px solid rgb(196 145 56 / 58%);
  --n-border-focus: 1px solid rgb(255 218 139 / 72%);
  --n-color-disabled: rgb(7 19 43 / 72%);
  --n-border-disabled: 1px solid rgb(232 190 109 / 28%);
  --n-opacity-disabled: 1;
  --n-text-color-disabled: rgb(255 250 239 / 62%);
  --n-text-color: #ffffff;
  --n-text-color-hover: #ffffff;
  --n-text-color-pressed: #ffffff;
  --n-text-color-focus: #ffffff;
}

.buddy-chat-composer__send:not(.n-button--disabled) {
  background-color: #07132b !important;
  opacity: 1 !important;
}

.buddy-chat-composer__send.n-button--disabled {
  background-color: #07132b !important;
  box-shadow: 0 6px 14px rgb(5 15 35 / 12%);
  cursor: not-allowed;
  opacity: 1 !important;
}

.buddy-chat-composer__send.n-button--disabled :deep(.n-button__border) {
  border-color: rgb(232 190 109 / 28%) !important;
}

.buddy-chat-composer__send-icon {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
}

.buddy-chat-composer__send-icon img {
  display: block;
  width: 28px;
  height: 28px;
  object-fit: contain;
}

.buddy-chat-composer__stop-icon {
  position: relative;
  z-index: 1;
  width: 19px;
  height: 19px;
}

.buddy-chat-composer__send.n-button--disabled .buddy-chat-composer__send-icon {
  opacity: 0.66;
}

.buddy-chat-composer__send.n-button--disabled .buddy-chat-composer__send-icon img {
  filter:
    grayscale(0.7)
    saturate(0.58)
    brightness(0.86);
}

@media (max-width: 560px) {
  .buddy-chat-composer__model-popover {
    max-width: calc(100vw - 24px);
    overflow-x: auto;
  }
}
</style>
