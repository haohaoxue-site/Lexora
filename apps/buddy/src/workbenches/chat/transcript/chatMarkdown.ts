import type { Config } from 'dompurify'
import DOMPurify from 'dompurify'
import { parse, parseInline } from 'marked'

const sanitizeConfig = {
  FORBID_TAGS: ['script', 'style'],
  USE_PROFILES: { html: true },
} satisfies Config

export function renderChatMarkdown(text: string): string {
  return DOMPurify.sanitize(
    parse(text, { async: false, breaks: true, gfm: true }),
    sanitizeConfig,
  )
}

export function renderChatInlineMarkdown(text: string): string {
  return DOMPurify.sanitize(
    parseInline(text, { async: false, breaks: false, gfm: true }),
    sanitizeConfig,
  )
}

export function toChatSummaryText(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_~`#>]/g, '')
    .replace(/^\s*[-+]\s+/g, '')
    .trim()
}
