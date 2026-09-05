import type { LocalMessage } from '@buddy-electron/shared/localChatApi'
import type {
  ChatTranscriptProjection,
  ChatTranscriptRow,
  ChatTranscriptRowPatch,
} from './chatTranscriptProjection'
import { getChatMessageText, isVisibleChatMessage } from './chatMessageContent'

const CHAT_OUTLINE_SNIPPET_LENGTH = 120

export interface ChatOutlineItem {
  attachmentOnly: boolean
  kind: 'input' | 'output'
  messageId: string
  text: string
}

interface CachedChatOutlineProjection {
  currentMessages: ReadonlyArray<LocalMessage>
  items: ReadonlyArray<ChatOutlineItem>
  loadedMessages: ReadonlyArray<LocalMessage>
  messageIndexByRowIndex: ReadonlyArray<number | null>
  outlineIndexByMessageId: ReadonlyMap<string, number>
  rows: ReadonlyArray<ChatTranscriptRow>
}

export function createChatOutlineProjector() {
  let cached: CachedChatOutlineProjection | null = null

  return {
    project(
      projection: ChatTranscriptProjection,
      loadedMessages: ReadonlyArray<LocalMessage>,
    ): ReadonlyArray<ChatOutlineItem> {
      const updated = cached && patchChatOutlineProjection(cached, projection, loadedMessages)
      if (updated) {
        cached = updated
        return updated.items
      }
      const currentMessages = projectChatTranscriptMessages(projection.rows)
      const outline = projectChatOutlineItemsWithIndex(
        mergeChatOutlineMessages(loadedMessages, currentMessages),
      )
      cached = {
        currentMessages,
        items: outline.items,
        loadedMessages,
        messageIndexByRowIndex: indexChatTranscriptMessages(projection.rows),
        outlineIndexByMessageId: outline.indexByMessageId,
        rows: projection.rows,
      }
      return outline.items
    },
  }
}

export function projectChatOutlineItems(
  messages: ReadonlyArray<LocalMessage>,
): ChatOutlineItem[] {
  return projectChatOutlineItemsWithIndex(messages).items
}

function projectChatOutlineItemsWithIndex(
  messages: ReadonlyArray<LocalMessage>,
): {
  indexByMessageId: ReadonlyMap<string, number>
  items: ChatOutlineItem[]
} {
  const items: ChatOutlineItem[] = []
  const indexByMessageId = new Map<string, number>()
  const outputIndexByRunId = new Map<string, number>()
  const outputMessageIdByRunId = new Map<string, string>()

  for (const message of messages) {
    if (!isVisibleChatMessage(message) || message.role === 'tool')
      continue

    const item = toOutlineItem(message)
    if (item.kind === 'output' && message.runId) {
      const outputIndex = outputIndexByRunId.get(message.runId)
      if (outputIndex !== undefined) {
        items[outputIndex] = item
        const previousMessageId = outputMessageIdByRunId.get(message.runId)
        if (previousMessageId)
          indexByMessageId.delete(previousMessageId)
        indexByMessageId.set(message.id, outputIndex)
        outputMessageIdByRunId.set(message.runId, message.id)
        continue
      }
      outputIndexByRunId.set(message.runId, items.length)
      outputMessageIdByRunId.set(message.runId, message.id)
      indexByMessageId.set(message.id, items.length)
      items.push(item)
      continue
    }
    indexByMessageId.set(message.id, items.length)
    items.push(item)
  }

  return { indexByMessageId, items }
}

export function mergeChatOutlineMessages(
  loadedMessages: ReadonlyArray<LocalMessage>,
  currentMessages: ReadonlyArray<LocalMessage>,
): LocalMessage[] {
  const currentById = new Map(currentMessages.map(message => [message.id, message]))
  const loadedIds = new Set(loadedMessages.map(message => message.id))

  return [
    ...loadedMessages.map(message => currentById.get(message.id) ?? message),
    ...currentMessages.filter(message => !loadedIds.has(message.id)),
  ]
}

function patchChatOutlineProjection(
  cached: CachedChatOutlineProjection,
  projection: ChatTranscriptProjection,
  loadedMessages: ReadonlyArray<LocalMessage>,
): CachedChatOutlineProjection | null {
  if (
    loadedMessages !== cached.loadedMessages
    || projection.update.kind !== 'patch'
    || projection.update.previousRows !== cached.rows
    || projection.update.patches.some(patch => !preservesOutlineStructure(cached.rows, patch))
  ) {
    return null
  }

  let currentMessages: LocalMessage[] | null = null
  let items: ChatOutlineItem[] | null = null
  for (const patch of projection.update.patches) {
    const previous = cached.rows[patch.index]
    const next = patch.rows[0]
    if (previous?.kind !== 'message' || next?.kind !== 'message')
      continue
    const messageIndex = cached.messageIndexByRowIndex[patch.index]
    if (messageIndex === null || messageIndex === undefined)
      return null
    currentMessages ??= [...cached.currentMessages]
    currentMessages[messageIndex] = next.message
    const outlineIndex = cached.outlineIndexByMessageId.get(next.message.id)
    if (outlineIndex === undefined)
      continue
    items ??= [...cached.items]
    items[outlineIndex] = toOutlineItem(next.message)
  }

  return {
    ...cached,
    currentMessages: currentMessages ?? cached.currentMessages,
    items: items ?? cached.items,
    rows: projection.rows,
  }
}

function preservesOutlineStructure(
  rows: ReadonlyArray<ChatTranscriptRow>,
  patch: ChatTranscriptRowPatch,
): boolean {
  if (patch.deleteCount !== 1 || patch.rows.length !== 1)
    return false
  const previous = rows[patch.index]
  const next = patch.rows[0]
  if (!previous || !next || previous.kind !== next.kind || previous.key !== next.key)
    return false
  if (previous.kind !== 'message' || next.kind !== 'message')
    return true
  return previous.message.id === next.message.id
    && previous.message.role === next.message.role
    && previous.message.runId === next.message.runId
    && isVisibleChatMessage(previous.message) === isVisibleChatMessage(next.message)
}

function projectChatTranscriptMessages(
  rows: ReadonlyArray<ChatTranscriptRow>,
): LocalMessage[] {
  return rows.flatMap(row => row.kind === 'message' ? [row.message] : [])
}

function indexChatTranscriptMessages(
  rows: ReadonlyArray<ChatTranscriptRow>,
): Array<number | null> {
  let messageIndex = 0
  return rows.map((row) => {
    if (row.kind !== 'message')
      return null
    return messageIndex++
  })
}

function toOutlineItem(message: LocalMessage): ChatOutlineItem {
  const text = getChatMessageText(message).replace(/\s+/g, ' ').trim()

  return {
    attachmentOnly: text.length === 0,
    kind: message.role === 'user' ? 'input' : 'output',
    messageId: message.id,
    text: text.length > CHAT_OUTLINE_SNIPPET_LENGTH
      ? `${text.slice(0, CHAT_OUTLINE_SNIPPET_LENGTH).trimEnd()}…`
      : text,
  }
}
