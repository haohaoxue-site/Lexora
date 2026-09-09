import type { BuddyMessageQuote } from '@buddy-shared/conversation/buddyUserContent'

export const chatQuoteBodySelector = '.buddy-chat-message-content__text'
export const chatQuoteExcludedSelector = '[data-quote-exclude], button, input, textarea, [contenteditable="true"], .code-block-header, .line-numbers, .line-number, [aria-hidden="true"], [hidden]'

interface QuoteTextSpan {
  node: Text
  start: number
  offsets: number[]
}

function indexQuoteText(body: HTMLElement) {
  const spans: QuoteTextSpan[] = []
  const text: string[] = []
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement
      return !parent || parent.closest(chatQuoteExcludedSelector) || getComputedStyle(parent).userSelect === 'none'
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT
    },
  })
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const span: QuoteTextSpan = { node: node as Text, start: text.length, offsets: [] }
    for (let offset = 0; offset < span.node.length; offset++) {
      const character = span.node.data[offset]!
      if (/\s/u.test(character))
        continue
      text.push(character)
      span.offsets.push(offset)
    }
    if (span.offsets.length)
      spans.push(span)
  }
  return { text: text.join(''), spans }
}

export function readChatQuoteTextOffset(body: HTMLElement, range: Range): number | undefined {
  for (const span of indexQuoteText(body).spans) {
    const index = span.offsets.findIndex(offset => range.isPointInRange(span.node, offset))
    if (index !== -1)
      return span.start + index
  }
}

export function findChatQuoteTextRanges(body: HTMLElement, quote: Pick<BuddyMessageQuote, 'text' | 'textOffset'>): Range[] {
  const needle = quote.text.replace(/\s/gu, '')
  if (!needle)
    return []
  const { text, spans } = indexQuoteText(body)
  let start = quote.textOffset ?? -1
  if (start < 0 || text.slice(start, start + needle.length) !== needle) {
    start = text.indexOf(needle)
    if (start === -1 || text.includes(needle, start + 1))
      return []
  }
  const end = start + needle.length
  return spans.flatMap((span) => {
    const from = Math.max(0, start - span.start)
    const to = Math.min(span.offsets.length, end - span.start)
    if (from >= to)
      return []
    const range = document.createRange()
    range.setStart(span.node, span.start > start ? 0 : span.offsets[from]!)
    range.setEnd(span.node, span.start + span.offsets.length < end ? span.node.length : span.offsets[to - 1]! + 1)
    return [range]
  })
}

export function scrollChatQuoteRange(range: Range, root: HTMLElement) {
  let parent = range.startContainer.parentElement
  while (parent && root.contains(parent)) {
    const style = getComputedStyle(parent)
    const rect = range.getClientRects()[0]
    if (!rect)
      return
    const bounds = parent.getBoundingClientRect()
    if (/auto|scroll/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight)
      parent.scrollTop += rect.top - bounds.top - (parent.clientHeight - rect.height) / 2
    if (/auto|scroll/.test(style.overflowX) && parent.scrollWidth > parent.clientWidth) {
      if (rect.left < bounds.left)
        parent.scrollLeft += rect.left - bounds.left
      else if (rect.right > bounds.right)
        parent.scrollLeft += rect.right - bounds.right
    }
    parent = parent.parentElement
  }
}
