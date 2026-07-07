import type { Config } from 'dompurify'
import type { BuddyTranslate } from '@/i18n/buddyI18n'
import type { BuddyMessage, BuddyMessageAttachment, BuddyMessageRole } from '@/lib/tauriRuntime'
import DOMPurify from 'dompurify'
import { parse } from 'marked'

export interface BuddyChatMessageViewRow {
  attachments: ReadonlyArray<BuddyMessageAttachment>
  conversationId: string | null
  id: string
  content: string
  contentHtml: string
  createdAt: string
  role: BuddyMessageRole
  roleLabel: string
  versionStatus: BuddyMessage['versionStatus']
}

export interface BuddyChatMessageViewRowsOptions {
  cache?: BuddyChatMessageViewRowCache
}

export interface BuddyChatMessageViewRowCache {
  get: (message: BuddyMessage, t: BuddyTranslate) => BuddyChatMessageViewRow
}

const MARKDOWN_SANITIZE_CONFIG = {
  FORBID_TAGS: ['script', 'style'],
  USE_PROFILES: {
    html: true,
  },
} satisfies Config

export function createChatMessageViewRows(
  messages: ReadonlyArray<BuddyMessage>,
  t: BuddyTranslate,
  options: BuddyChatMessageViewRowsOptions = {},
): ReadonlyArray<BuddyChatMessageViewRow> {
  if (options.cache)
    return messages.map(message => options.cache!.get(message, t))

  return messages.map((message) => {
    const attachments = message.attachments ?? []
    const content = createVisibleMessageContent(message, attachments)

    return {
      attachments,
      conversationId: message.conversationId,
      content,
      contentHtml: renderBuddyMarkdownHtml(content),
      createdAt: message.createdAt,
      id: message.id,
      role: message.role,
      roleLabel: resolveRoleLabel(message.role, t),
      versionStatus: message.versionStatus,
    }
  })
}

export function createChatMessageViewRowCache(
  maxSize = 240,
): BuddyChatMessageViewRowCache {
  const rows = new Map<string, BuddyChatMessageViewRow>()

  return {
    get(message, t) {
      const attachments = message.attachments ?? []
      const content = createVisibleMessageContent(message, attachments)
      const roleLabel = resolveRoleLabel(message.role, t)
      const key = createMessageViewCacheKey(message, attachments, content, roleLabel)
      const cached = rows.get(key)
      if (cached) {
        rows.delete(key)
        rows.set(key, cached)

        return cached
      }

      const row = {
        attachments,
        conversationId: message.conversationId,
        content,
        contentHtml: renderBuddyMarkdownHtml(content),
        createdAt: message.createdAt,
        id: message.id,
        role: message.role,
        roleLabel,
        versionStatus: message.versionStatus,
      }
      rows.set(key, row)
      pruneMapToSize(rows, maxSize)

      return row
    },
  }
}

export function renderBuddyMarkdownHtml(content: string): string {
  const html = parse(content, {
    async: false,
    breaks: true,
    gfm: true,
  })

  return sanitizeBuddyMarkdownHtml(html)
}

function sanitizeBuddyMarkdownHtml(html: string): string {
  const purifier = DOMPurify as typeof DOMPurify & {
    sanitize?: (dirty: string, config?: Config) => string
  }
  if (typeof purifier.sanitize === 'function')
    return purifier.sanitize(html, MARKDOWN_SANITIZE_CONFIG)

  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, '')
    .replace(/\s+(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, '')
}

function resolveRoleLabel(role: BuddyMessageRole, t: BuddyTranslate) {
  if (role === 'assistant')
    return t('message.role.assistant')

  if (role === 'system')
    return t('message.role.system')

  if (role === 'tool')
    return t('message.role.tool')

  return t('message.role.user')
}

function createMessageViewCacheKey(
  message: BuddyMessage,
  attachments: ReadonlyArray<BuddyMessageAttachment>,
  content: string,
  roleLabel: string,
) {
  return [
    message.id,
    message.conversationId ?? '',
    message.role,
    message.versionStatus ?? '',
    message.createdAt,
    roleLabel,
    hashString(content),
    attachments.map(createAttachmentCacheKey).join('|'),
  ].join('\u001F')
}

function createAttachmentCacheKey(attachment: BuddyMessageAttachment) {
  return [
    attachment.attachmentId ?? '',
    attachment.kind,
    attachment.name,
    attachment.mimeType ?? '',
    attachment.sizeBytes ?? '',
    attachment.dataUrl?.length ?? '',
    attachment.previewPath ?? '',
  ].join(':')
}

function pruneMapToSize<TKey, TValue>(map: Map<TKey, TValue>, maxSize: number) {
  while (map.size > maxSize) {
    const firstKey = map.keys().next().value
    if (firstKey === undefined)
      break

    map.delete(firstKey)
  }
}

function hashString(value: string): string {
  let hash = 5381
  for (let index = 0; index < value.length; index += 1)
    hash = (hash * 33) ^ value.charCodeAt(index)

  return (hash >>> 0).toString(36)
}

function createVisibleMessageContent(
  message: BuddyMessage,
  attachments: ReadonlyArray<BuddyMessageAttachment>,
) {
  if (message.role === 'assistant')
    return stripMemoryCitationFallback(message.content)

  if (message.role !== 'user' || attachments.length === 0)
    return message.content

  return message.content
    .replace(/\s*\[(?:Image|File) #\d+\]\s*/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .trim()
}

function stripMemoryCitationFallback(content: string): string {
  return content
    .replace(/<oai-mem-citation>[\s\S]*?<\/oai-mem-citation>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}
