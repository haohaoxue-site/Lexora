import type { BuddyMessageQuote } from '@buddy-shared/conversation/buddyUserContent'
import { buddyMessageQuoteSchema } from '@buddy-shared/conversation/buddyUserContent'
import { chatQuoteBodySelector, chatQuoteExcludedSelector, readChatQuoteTextOffset } from './chatQuoteText'

export function readChatQuoteSelection(root: HTMLElement, selection: Selection | null): { body: HTMLElement, quote: BuddyMessageQuote } | null {
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1)
    return null
  const range = selection.getRangeAt(0)
  const start = elementFor(range.startContainer)
  const end = elementFor(range.endContainer)
  const body = start?.closest<HTMLElement>(chatQuoteBodySelector)
  if (!body || !root.contains(body) || end?.closest(chatQuoteBodySelector) !== body
    || start?.closest(chatQuoteExcludedSelector) || end?.closest(chatQuoteExcludedSelector)) {
    return null
  }
  const text = selection.toString()
  if (!text.trim())
    return null
  const metadata = body.closest<HTMLElement>('[data-quote-source]')?.dataset.quoteSource
  if (!metadata)
    return null
  try {
    const source = buddyMessageQuoteSchema.unwrap().shape.source.parse(JSON.parse(metadata))
    return { body, quote: { id: crypto.randomUUID(), source, text, textOffset: readChatQuoteTextOffset(body, range) } }
  }
  catch {
    return null
  }
}

function elementFor(node: Node): Element | null {
  return node instanceof Element ? node : node.parentElement
}
