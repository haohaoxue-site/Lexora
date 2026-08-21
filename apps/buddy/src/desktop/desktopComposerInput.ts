import type { JSONContent } from '@tiptap/core'
import type { LocalPromptContextItem } from '../../electron/shared/localChatApi'
import type { BuddyChatCommandDescriptionKey } from '../../shared/buddyChatCommands'
import { BUDDY_CHAT_COMMANDS } from '../../shared/buddyChatCommands'

export const DESKTOP_PROMPT_TOKEN_NODE_NAME = 'desktopPromptToken'

export interface DesktopPromptContextOption extends LocalPromptContextItem {
  description: string | null
  label: string
  path: string | null
}

export interface DesktopComposerContextOptions {
  files: ReadonlyArray<DesktopPromptContextOption>
  skills: ReadonlyArray<DesktopPromptContextOption>
}

export interface DesktopComposerTrigger {
  kind: 'slash' | 'skill' | 'mention'
  query: string
}

export interface DesktopComposerSubmitPayload {
  content: string
  contextItems: ReadonlyArray<LocalPromptContextItem>
}

export interface DesktopPromptTokenAttrs {
  description: string | null
  kind: LocalPromptContextItem['kind']
  label: string
  path: string | null
  value: string
}

const TRIGGER_BOUNDARY_PATTERN = /[\s([{，。！？；：、"'`]$/u

export function createEmptyDesktopComposerContent(): JSONContent {
  return { content: [{ type: 'paragraph' }], type: 'doc' }
}

export function createDesktopComposerContentFromText(text: string): JSONContent {
  return {
    content: text.split('\n').map(line => ({
      content: line ? [{ text: line, type: 'text' }] : undefined,
      type: 'paragraph',
    })),
    type: 'doc',
  }
}

export function serializeDesktopComposerContent(content: JSONContent): DesktopComposerSubmitPayload {
  const contextItems: LocalPromptContextItem[] = []
  let text = ''
  serializeNode(content, value => text += value, contextItems)
  return { content: text.trim(), contextItems }
}

export function findDesktopComposerTrigger(textBeforeCursor: string): DesktopComposerTrigger | null {
  const candidateSlashIndex = findTriggerStart(textBeforeCursor, '/')
  const slashIndex = candidateSlashIndex >= 0
    && textBeforeCursor.slice(0, candidateSlashIndex).trim().length === 0
    ? candidateSlashIndex
    : -1
  const skillIndex = findTriggerStart(textBeforeCursor, '$')
  const mentionIndex = findTriggerStart(textBeforeCursor, '@')
  const triggerIndex = Math.max(slashIndex, skillIndex, mentionIndex)
  if (triggerIndex < 0)
    return null

  const query = textBeforeCursor.slice(triggerIndex + 1)
  if (query.includes('\n'))
    return null
  const trigger = textBeforeCursor[triggerIndex]
  return {
    kind: trigger === '/' ? 'slash' : trigger === '$' ? 'skill' : 'mention',
    query,
  }
}

export function createDesktopComposerSuggestions(
  trigger: DesktopComposerTrigger | null,
  options: DesktopComposerContextOptions,
  translateCommand: (key: BuddyChatCommandDescriptionKey) => string = key => key,
) {
  if (!trigger)
    return []
  const candidates = trigger.kind === 'slash'
    ? BUDDY_CHAT_COMMANDS.map(command => ({
        description: translateCommand(command.descriptionKey),
        kind: 'slashCommand' as const,
        label: `/${command.name}`,
        path: null,
        value: `/${command.name}`,
      }))
    : trigger.kind === 'skill' ? options.skills : options.files
  const query = trigger.query.trim().toLowerCase()
  return candidates
    .filter(option => [option.label, option.value, option.path, option.description]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(query))
    .slice(0, 8)
    .map(option => ({ option }))
}

export function shouldSubmitDesktopComposerKey(
  event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'isComposing' | 'key' | 'metaKey' | 'shiftKey'>,
) {
  return event.key === 'Enter'
    && !event.isComposing
    && !event.shiftKey
    && !event.altKey
    && !event.ctrlKey
    && !event.metaKey
}

export function createDesktopPromptTokenAttrs(
  option: DesktopPromptContextOption,
): DesktopPromptTokenAttrs {
  return { ...option }
}

export function createDesktopPromptTokenText(attrs: DesktopPromptTokenAttrs): string {
  if (attrs.kind === 'skill')
    return `$${attrs.label || attrs.value}`
  if (attrs.kind === 'slashCommand')
    return attrs.value
  return `@${attrs.label || attrs.value}`
}

function serializeNode(
  node: JSONContent,
  append: (value: string) => void,
  contextItems: LocalPromptContextItem[],
): void {
  if (node.type === 'text') {
    append(node.text ?? '')
    return
  }
  if (node.type === 'hardBreak') {
    append('\n')
    return
  }
  if (node.type === DESKTOP_PROMPT_TOKEN_NODE_NAME) {
    const attrs = readPromptTokenAttrs(node.attrs)
    append(createDesktopPromptTokenText(attrs))
    contextItems.push({ kind: attrs.kind, value: attrs.value })
    return
  }
  node.content?.forEach((child, index) => {
    serializeNode(child, append, contextItems)
    if (node.type === 'doc' && index < node.content!.length - 1)
      append('\n')
  })
}

function readPromptTokenAttrs(attrs: JSONContent['attrs']): DesktopPromptTokenAttrs {
  const value = typeof attrs?.value === 'string' ? attrs.value : ''
  const kind = attrs?.kind === 'skill' || attrs?.kind === 'slashCommand'
    ? attrs.kind
    : 'file'
  return {
    description: typeof attrs?.description === 'string' ? attrs.description : null,
    kind,
    label: typeof attrs?.label === 'string' ? attrs.label : value,
    path: typeof attrs?.path === 'string' ? attrs.path : null,
    value,
  }
}

function findTriggerStart(value: string, trigger: '/' | '$' | '@'): number {
  const index = value.lastIndexOf(trigger)
  if (index < 0 || (index > 0 && !TRIGGER_BOUNDARY_PATTERN.test(value[index - 1] ?? '')))
    return -1
  return index
}
