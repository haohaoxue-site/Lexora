import type { BuddyChatCommandDescriptionKey } from '@buddy-shared/conversation/buddyChatCommands'

import type { BuddyUserContentV1 } from '@buddy-shared/conversation/buddyUserContent'
import type { LocalPromptContextItem } from '@buddy-shared/conversation/chatApi'
import type { BuddyComposerSource } from '@buddy-shared/conversation/composerResource'
import type { JSONContent } from '@tiptap/core'
import { BUDDY_CHAT_COMMANDS } from '@buddy-shared/conversation/buddyChatCommands'
import { buddyUserContentToText } from '@buddy-shared/conversation/buddyUserContent'
import { chatComposerDocumentToUserContent } from './chatComposerDocument'

export interface ChatPromptContextOption extends LocalPromptContextItem {
  description: string | null
  category?: 'artifact' | 'history' | 'space'
  label: string
  path: string | null
  source?: BuddyComposerSource
}

export interface ChatComposerContextOptions {
  files: ReadonlyArray<ChatPromptContextOption>
  skills: ReadonlyArray<ChatPromptContextOption>
}

export function createChatComposerSourceOptions(
  options: ReadonlyArray<ChatPromptContextOption>,
  query = '',
): ReadonlyArray<ChatPromptContextOption> {
  return filterChatComposerOptions(options, query)
    .filter(option => option.kind === 'file')
}

export interface ChatComposerTrigger {
  kind: 'slash' | 'skill' | 'mention'
  query: string
}

export interface ChatComposerSubmitPayload {
  content: string
  userContent?: BuddyUserContentV1
}

const TRIGGER_BOUNDARY_PATTERN = /[\s([{，。！？；：、"'`]$/u

export function createEmptyChatComposerContent(): JSONContent {
  return { content: [{ type: 'paragraph' }], type: 'doc' }
}

export function createChatComposerContentFromText(text: string): JSONContent {
  return {
    content: text.split('\n').map(line => ({
      content: line ? [{ text: line, type: 'text' }] : undefined,
      type: 'paragraph',
    })),
    type: 'doc',
  }
}

export function serializeChatComposerContent(content: JSONContent): ChatComposerSubmitPayload {
  const userContent = chatComposerDocumentToUserContent(content)
  return { content: buddyUserContentToText(userContent).trim(), userContent }
}

export function findChatComposerTrigger(textBeforeCursor: string): ChatComposerTrigger | null {
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
  if (/\s/u.test(query))
    return null
  const trigger = textBeforeCursor[triggerIndex]
  return {
    kind: trigger === '/' ? 'slash' : trigger === '$' ? 'skill' : 'mention',
    query,
  }
}

export function createChatComposerSuggestions(
  trigger: ChatComposerTrigger | null,
  options: ChatComposerContextOptions,
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
    : trigger.kind === 'skill' ? options.skills : createChatComposerSourceOptions(options.files, trigger.query)
  const query = trigger.query.trim().toLowerCase()
  return (trigger.kind === 'mention' ? candidates : filterChatComposerOptions(candidates, query))
    .slice(0, 8)
    .map(option => ({ option }))
}

export function shouldSubmitChatComposerKey(
  event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'isComposing' | 'key' | 'metaKey' | 'shiftKey'>,
) {
  return event.key === 'Enter'
    && !event.isComposing
    && !event.shiftKey
    && !event.altKey
    && !event.ctrlKey
    && !event.metaKey
}

function findTriggerStart(value: string, trigger: '/' | '$' | '@'): number {
  const index = value.lastIndexOf(trigger)
  if (index < 0 || (index > 0 && !TRIGGER_BOUNDARY_PATTERN.test(value[index - 1] ?? '')))
    return -1
  return index
}

function filterChatComposerOptions(
  options: ReadonlyArray<ChatPromptContextOption>,
  query: string,
): ReadonlyArray<ChatPromptContextOption> {
  const normalizedQuery = query.trim().toLowerCase()
  return options.filter(option => [option.label, option.value, option.path, option.description]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(normalizedQuery))
}
