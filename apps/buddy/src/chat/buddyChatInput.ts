import type { JSONContent } from '@tiptap/core'
import type { BuddyChatDraftAttachment } from '@/chat/chatAttachmentView'
import type {
  BuddyChatPromptContextItem,
  BuddyCodexUserInput,
  BuddyPromptContextOption,
  BuddyPromptContextOptionKind,
} from '@/lib/tauriRuntime'

export const BUDDY_PROMPT_TOKEN_NODE_NAME = 'buddyPromptToken'
export const BUDDY_ATTACHMENT_TOKEN_NODE_NAME = 'buddyAttachmentToken'

export type BuddyPromptTokenKind = BuddyPromptContextOptionKind
export type BuddyAttachmentTokenKind = 'image' | 'file'

export interface BuddyPromptTokenAttrs {
  kind: BuddyPromptTokenKind
  label: string
  value: string
  path: string | null
  description: string | null
}

export interface BuddyAttachmentTokenAttrs {
  attachmentId: string
  index: number
  kind: BuddyAttachmentTokenKind
}

export interface BuddyClipboardData {
  files?: ArrayLike<File>
  getData?: (format: string) => string
  items?: ArrayLike<{
    getAsFile: () => File | null
    kind: string
    type: string
  }>
  types?: ArrayLike<string>
}

export interface BuddyComposerSerializedInput {
  content: string
  contextItems: BuddyChatPromptContextItem[]
  inputs: BuddyCodexUserInput[]
}

export interface BuddyComposerSubmitPayload {
  attachments: ReadonlyArray<BuddyChatDraftAttachment>
  content: string
  contextItems: BuddyChatPromptContextItem[]
  inputs: BuddyCodexUserInput[]
}

export interface BuddyComposerSubmitControlState {
  disabled: boolean
  kind: 'send' | 'stop'
}

export interface BuddyComposerTrigger {
  kind: 'slash' | 'skill' | 'mention'
  query: string
  start: number
  end: number
}

export interface BuddyComposerSuggestion {
  option: BuddyPromptContextOption
  searchText: string
}

export interface BuddyComposerContextOptions {
  files: ReadonlyArray<BuddyPromptContextOption>
  plugins: ReadonlyArray<BuddyPromptContextOption>
  skills: ReadonlyArray<BuddyPromptContextOption>
}

export const BUDDY_SLASH_COMMAND_OPTIONS: readonly BuddyPromptContextOption[] = [
  {
    description: '先拆计划，再进入执行。',
    kind: 'slashCommand',
    label: '/plan',
    value: '/plan',
    path: null,
  },
  {
    description: '按代码审查方式优先找风险、缺陷和测试缺口。',
    kind: 'slashCommand',
    label: '/review',
    value: '/review',
    path: null,
  },
  {
    description: '查看当前任务、运行状态和关键上下文。',
    kind: 'slashCommand',
    label: '/status',
    value: '/status',
    path: null,
  },
  {
    description: '请求 Codex 进入技能选择上下文。',
    kind: 'slashCommand',
    label: '/skills',
    value: '/skills',
    path: null,
  },
  {
    description: '请求 Codex 进入插件选择上下文。',
    kind: 'slashCommand',
    label: '/plugins',
    value: '/plugins',
    path: null,
  },
]

const TRIGGER_BOUNDARY_PATTERN = /[\s([{，。！？；：、"'`]$/u
const BUDDY_CLIPBOARD_FILE_REFERENCE_TYPES = [
  'text/uri-list',
  'x-special/gnome-copied-files',
  'Files',
]

export function createEmptyBuddyComposerContent(): JSONContent {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
      },
    ],
  }
}

export function serializeBuddyComposerContent(content: JSONContent): BuddyComposerSerializedInput {
  const state: SerializeState = {
    contextItems: [],
    inputContextItems: [],
    text: '',
    textElements: [],
  }
  serializeNode(content, state)

  const trimmedText = trimSerializedText(state.text, state.textElements)
  const inputs: BuddyCodexUserInput[] = []
  if (trimmedText.text.length > 0) {
    inputs.push({
      type: 'text',
      text: trimmedText.text,
      text_elements: trimmedText.textElements,
    })
  }

  for (const item of state.inputContextItems) {
    if (item.kind === 'skill' && item.path) {
      inputs.push({
        type: 'skill',
        name: item.value,
        path: item.path,
      })
    }
    else if (item.kind === 'file' && item.path) {
      inputs.push({
        type: 'mention',
        name: item.label,
        path: item.path,
      })
    }
  }

  return {
    content: trimmedText.text,
    contextItems: state.contextItems,
    inputs,
  }
}

export function createBuddyComposerSuggestions(
  trigger: BuddyComposerTrigger | null,
  options: BuddyComposerContextOptions,
): BuddyComposerSuggestion[] {
  if (!trigger) {
    return []
  }

  const candidates = trigger.kind === 'slash'
    ? BUDDY_SLASH_COMMAND_OPTIONS
    : trigger.kind === 'skill'
      ? options.skills
      : [...options.plugins, ...options.files]
  const query = normalizeSearchText(trigger.query)

  return candidates
    .map(option => ({
      option,
      searchText: createOptionSearchText(option),
    }))
    .filter(suggestion => normalizeSearchText(suggestion.searchText).includes(query))
    .slice(0, 8)
}

export function shouldSubmitBuddyComposerKey(
  event: Pick<KeyboardEvent, 'isComposing' | 'key' | 'shiftKey'>
    & Partial<Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey'>>,
) {
  return event.key === 'Enter'
    && !event.isComposing
    && !event.shiftKey
    && !event.altKey
    && !event.ctrlKey
    && !event.metaKey
}

export function createBuddyComposerSubmitControlState(options: {
  canSend: boolean
  disabled: boolean
  isSending: boolean
}): BuddyComposerSubmitControlState {
  if (options.isSending) {
    return {
      disabled: false,
      kind: 'stop',
    }
  }

  return {
    disabled: options.disabled || !options.canSend,
    kind: 'send',
  }
}

export function findBuddyComposerTrigger(textBeforeCursor: string): BuddyComposerTrigger | null {
  const slashIndex = findTriggerStart(textBeforeCursor, '/')
  const skillIndex = findTriggerStart(textBeforeCursor, '$')
  const mentionIndex = findTriggerStart(textBeforeCursor, '@')
  const triggerIndex = Math.max(slashIndex, skillIndex, mentionIndex)
  if (triggerIndex < 0) {
    return null
  }

  const triggerChar = textBeforeCursor[triggerIndex]
  const query = textBeforeCursor.slice(triggerIndex + 1)
  if (query.includes('\n')) {
    return null
  }

  return {
    end: textBeforeCursor.length,
    kind: triggerChar === '/'
      ? 'slash'
      : triggerChar === '$'
        ? 'skill'
        : 'mention',
    query,
    start: triggerIndex,
  }
}

export function createBuddyPromptTokenAttrs(option: BuddyPromptContextOption): BuddyPromptTokenAttrs {
  return {
    description: option.description ?? null,
    kind: option.kind,
    label: option.label,
    path: option.path ?? null,
    value: option.value,
  }
}

export function createBuddyPromptTokenText(attrs: BuddyPromptTokenAttrs | BuddyChatPromptContextItem) {
  if (attrs.kind === 'skill') {
    return `$${attrs.label || attrs.value}`
  }
  if (attrs.kind === 'slashCommand') {
    return attrs.value
  }

  return `@${attrs.label || attrs.value}`
}

export function createBuddyAttachmentTokenAttrs(options: {
  id: string
  index: number
  kind: BuddyChatDraftAttachment['kind']
}): BuddyAttachmentTokenAttrs {
  return {
    attachmentId: options.id,
    index: options.index,
    kind: options.kind === 'image' ? 'image' : 'file',
  }
}

export function createBuddyAttachmentTokenText(attrs: BuddyAttachmentTokenAttrs) {
  const index = Number.isInteger(attrs.index) && attrs.index > 0 ? attrs.index : 1
  return attrs.kind === 'image'
    ? `[Image #${index}]`
    : `[File #${index}]`
}

export function collectBuddyClipboardImageFiles(clipboardData: BuddyClipboardData | null | undefined) {
  return collectBuddyClipboardFiles(clipboardData).filter(isImageFile)
}

export function collectBuddyClipboardFiles(clipboardData: BuddyClipboardData | null | undefined) {
  if (!clipboardData) {
    return []
  }

  const itemFiles = Array.from(clipboardData.items ?? [])
    .filter(item => item.kind === 'file')
    .map(item => item.getAsFile())
    .filter((file): file is File => file !== null)
  if (itemFiles.length > 0) {
    return itemFiles
  }

  return Array.from(clipboardData.files ?? [])
}

export function hasBuddyClipboardImageType(clipboardData: BuddyClipboardData | null | undefined) {
  if (!clipboardData) {
    return false
  }

  return Array.from(clipboardData.items ?? []).some(item => isClipboardImageType(item.type))
    || Array.from(clipboardData.types ?? []).some(isClipboardImageType)
}

export function collectBuddyClipboardFileReferencePaths(clipboardData: BuddyClipboardData | null | undefined) {
  if (!clipboardData?.getData) {
    return []
  }

  const types = new Set(Array.from(clipboardData.types ?? []))
  const payloads = [
    clipboardData.getData('text/uri-list'),
    clipboardData.getData('x-special/gnome-copied-files'),
  ]
  const plainText = clipboardData.getData('text/plain')
  if (hasBuddyClipboardFileReferenceType(types) || isLikelyPlainFileReferenceText(plainText)) {
    payloads.push(plainText)
  }

  return uniqueValues(payloads.flatMap(parseBuddyClipboardFileReferenceText))
}

export function collectBuddyAttachmentTokenIds(content: JSONContent) {
  const ids: string[] = []
  collectAttachmentTokenIds(content, ids)
  return ids
}

export function normalizeBuddyAttachmentTokenContent(options: {
  attachments: ReadonlyArray<BuddyChatDraftAttachment>
  content: JSONContent
}) {
  return normalizeAttachmentTokenNode(
    options.content,
    createAttachmentTokenNormalizationState(options.attachments),
  ) ?? createEmptyBuddyComposerContent()
}

export function createBuddyComposerSubmitPayload(options: {
  attachments: ReadonlyArray<BuddyChatDraftAttachment>
  content: JSONContent
}): BuddyComposerSubmitPayload {
  const serialized = serializeBuddyComposerContent(options.content)

  return {
    attachments: options.attachments,
    content: serialized.content,
    contextItems: serialized.contextItems,
    inputs: serialized.inputs,
  }
}

interface SerializeState {
  contextItems: BuddyChatPromptContextItem[]
  inputContextItems: BuddyChatPromptContextItem[]
  text: string
  textElements: Array<{
    byteRange: {
      start: number
      end: number
    }
    placeholder: string | null
  }>
}

interface AttachmentTokenNormalizationState {
  attachmentById: Map<string, BuddyChatDraftAttachment>
  indexById: Map<string, number>
}

function serializeNode(node: JSONContent, state: SerializeState) {
  if (node.type === 'text') {
    appendText(state, node.text ?? '')
    return
  }

  if (node.type === 'hardBreak') {
    appendText(state, '\n')
    return
  }

  if (node.type === BUDDY_PROMPT_TOKEN_NODE_NAME) {
    appendPromptToken(state, readPromptTokenAttrs(node.attrs))
    return
  }

  if (node.type === BUDDY_ATTACHMENT_TOKEN_NODE_NAME) {
    appendAttachmentToken(state, readAttachmentTokenAttrs(node.attrs))
    return
  }

  if (!node.content?.length) {
    return
  }

  node.content.forEach((child, index) => {
    serializeNode(child, state)
    if (node.type === 'doc' && index < (node.content?.length ?? 0) - 1) {
      appendText(state, '\n')
    }
  })
}

function collectAttachmentTokenIds(node: JSONContent, ids: string[]) {
  if (node.type === BUDDY_ATTACHMENT_TOKEN_NODE_NAME) {
    const id = readString(node.attrs?.attachmentId)
    if (id) {
      ids.push(id)
    }
    return
  }

  node.content?.forEach(child => collectAttachmentTokenIds(child, ids))
}

function createAttachmentTokenNormalizationState(
  attachments: ReadonlyArray<BuddyChatDraftAttachment>,
): AttachmentTokenNormalizationState {
  const attachmentById = new Map<string, BuddyChatDraftAttachment>()
  const indexById = new Map<string, number>()

  for (const [index, attachment] of attachments.entries()) {
    attachmentById.set(attachment.id, attachment)
    indexById.set(attachment.id, index + 1)
  }

  return {
    attachmentById,
    indexById,
  }
}

function normalizeAttachmentTokenNode(
  node: JSONContent,
  state: AttachmentTokenNormalizationState,
): JSONContent | null {
  if (node.type === BUDDY_ATTACHMENT_TOKEN_NODE_NAME) {
    return normalizeAttachmentTokenLeaf(node, state)
  }

  if (!node.content?.length) {
    return node
  }

  const content = normalizeAttachmentTokenChildren(node.content, state)

  return {
    ...node,
    content: content.length > 0 ? content : undefined,
  }
}

function normalizeAttachmentTokenChildren(
  children: JSONContent[],
  state: AttachmentTokenNormalizationState,
) {
  const content: JSONContent[] = []
  let skipNextGeneratedSpace = false

  for (const child of children) {
    if (isStaleAttachmentTokenNode(child, state)) {
      skipNextGeneratedSpace = true
      continue
    }

    const normalizedChild = normalizeAttachmentTokenNode(child, state)
    if (!normalizedChild) {
      skipNextGeneratedSpace = child.type === BUDDY_ATTACHMENT_TOKEN_NODE_NAME
      continue
    }

    if (skipNextGeneratedSpace && normalizedChild.type === 'text' && normalizedChild.text === ' ') {
      skipNextGeneratedSpace = false
      continue
    }
    skipNextGeneratedSpace = false

    appendNormalizedChild(content, normalizedChild)
  }

  return content
}

function normalizeAttachmentTokenLeaf(
  node: JSONContent,
  state: AttachmentTokenNormalizationState,
): JSONContent | null {
  const attachmentId = readString(node.attrs?.attachmentId)
  const attachment = state.attachmentById.get(attachmentId)
  if (!attachment) {
    return null
  }

  const index = state.indexById.get(attachmentId) ?? 1

  return {
    ...node,
    attrs: {
      ...node.attrs,
      ...createBuddyAttachmentTokenAttrs({
        id: attachmentId,
        index,
        kind: attachment.kind,
      }),
    },
  }
}

function isStaleAttachmentTokenNode(
  node: JSONContent,
  state: AttachmentTokenNormalizationState,
) {
  return node.type === BUDDY_ATTACHMENT_TOKEN_NODE_NAME
    && !state.attachmentById.has(readString(node.attrs?.attachmentId))
}

function appendNormalizedChild(content: JSONContent[], child: JSONContent) {
  const previous = content.at(-1)
  if (previous?.type === 'text' && child.type === 'text') {
    previous.text = `${previous.text ?? ''}${child.text ?? ''}`
    return
  }

  content.push(child)
}

function hasBuddyClipboardFileReferenceType(types: ReadonlySet<string>) {
  return BUDDY_CLIPBOARD_FILE_REFERENCE_TYPES.some(type => types.has(type))
}

function isLikelyPlainFileReferenceText(text: string) {
  const lines = splitClipboardReferenceLines(text)
  return lines.length > 0 && lines.every(isLocalFileReferenceLine)
}

function parseBuddyClipboardFileReferenceText(text: string) {
  return splitClipboardReferenceLines(text)
    .filter(line => line !== 'copy' && line !== 'cut')
    .map(parseBuddyClipboardFileReferenceLine)
    .filter((path): path is string => Boolean(path))
}

function splitClipboardReferenceLines(text: string) {
  return text
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'))
}

function parseBuddyClipboardFileReferenceLine(line: string) {
  if (line.startsWith('file://')) {
    return parseLocalFileUriPath(line)
  }

  return line.startsWith('/') ? line : null
}

function isLocalFileReferenceLine(line: string) {
  return line === 'copy'
    || line === 'cut'
    || line.startsWith('file://')
    || line.startsWith('/')
}

function parseLocalFileUriPath(uri: string) {
  try {
    const url = new URL(uri)
    if (url.protocol !== 'file:' || (url.hostname && url.hostname !== 'localhost')) {
      return null
    }

    return decodeURIComponent(url.pathname)
  }
  catch {
    return null
  }
}

function uniqueValues(values: string[]) {
  return [...new Set(values)]
}

function appendPromptToken(state: SerializeState, attrs: BuddyPromptTokenAttrs) {
  const placeholder = createBuddyPromptTokenText(attrs)
  const start = byteLength(state.text)
  appendText(state, placeholder)
  const end = byteLength(state.text)
  state.textElements.push({
    byteRange: {
      end,
      start,
    },
    placeholder,
  })

  const contextItem: BuddyChatPromptContextItem = {
    description: attrs.description,
    kind: attrs.kind,
    label: attrs.label,
    path: attrs.path,
    value: attrs.value,
  }
  state.contextItems.push(contextItem)
  if (attrs.kind === 'skill' || attrs.kind === 'file') {
    state.inputContextItems.push(contextItem)
  }
}

function appendAttachmentToken(state: SerializeState, attrs: BuddyAttachmentTokenAttrs) {
  const placeholder = createBuddyAttachmentTokenText(attrs)
  const start = byteLength(state.text)
  appendText(state, placeholder)
  const end = byteLength(state.text)
  state.textElements.push({
    byteRange: {
      end,
      start,
    },
    placeholder,
  })
}

function appendText(state: SerializeState, text: string) {
  state.text += text
}

function trimSerializedText(
  text: string,
  textElements: SerializeState['textElements'],
) {
  const leadingLength = text.length - text.trimStart().length
  const trailingStart = text.trimEnd().length
  const leadingBytes = byteLength(text.slice(0, leadingLength))
  const trimmedText = text.trim()
  const keptTextElements = textElements
    .map((element) => {
      const start = element.byteRange.start - leadingBytes
      const end = element.byteRange.end - leadingBytes

      return {
        ...element,
        byteRange: {
          end,
          start,
        },
      }
    })
    .filter((element) => {
      const originalStart = element.byteRange.start + leadingBytes
      return originalStart >= leadingBytes && originalStart < byteLength(text.slice(0, trailingStart))
    })

  return {
    text: trimmedText,
    textElements: keptTextElements,
  }
}

function readPromptTokenAttrs(attrs: JSONContent['attrs']): BuddyPromptTokenAttrs {
  const value = readString(attrs?.value)
  const label = readString(attrs?.label) || value
  const kind = readPromptTokenKind(attrs?.kind)

  return {
    description: readNullableString(attrs?.description),
    kind,
    label,
    path: readNullableString(attrs?.path),
    value,
  }
}

function readPromptTokenKind(value: unknown): BuddyPromptTokenKind {
  return value === 'skill' || value === 'plugin' || value === 'file' || value === 'slashCommand'
    ? value
    : 'file'
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function readNullableString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function readAttachmentTokenAttrs(attrs: JSONContent['attrs']): BuddyAttachmentTokenAttrs {
  const rawIndex = Number(attrs?.index)
  return {
    attachmentId: readString(attrs?.attachmentId),
    index: Number.isInteger(rawIndex) && rawIndex > 0 ? rawIndex : 1,
    kind: attrs?.kind === 'image' ? 'image' : 'file',
  }
}

function findTriggerStart(value: string, trigger: '/' | '$' | '@') {
  const index = value.lastIndexOf(trigger)
  if (index < 0) {
    return -1
  }
  if (index > 0 && !TRIGGER_BOUNDARY_PATTERN.test(value[index - 1] ?? '')) {
    return -1
  }

  return index
}

function createOptionSearchText(option: BuddyPromptContextOption) {
  return [
    option.label,
    option.value,
    option.path,
    option.description,
  ].filter(Boolean).join(' ')
}

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase()
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).length
}

function isImageFile(file: File) {
  return file.type.startsWith('image/')
}

function isClipboardImageType(type: string) {
  return type.startsWith('image/') || type === 'application/x-qt-image'
}
