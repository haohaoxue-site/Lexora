import type { BuddyMessageQuote } from '@buddy-shared/conversation/buddyUserContent'
import { onScopeDispose } from 'vue'
import { chatQuoteBodySelector, findChatQuoteTextRanges, scrollChatQuoteRange } from './chatQuoteText'

const highlightName = 'buddy-message-quote'
const highlightDuration = 2400

export function useChatQuoteHighlight() {
  let current: Highlight | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  function clear() {
    clearTimeout(timer)
    timer = undefined
    if (current && CSS.highlights.get(highlightName) === current)
      CSS.highlights.delete(highlightName)
    current = null
  }

  function show(source: HTMLElement, quote: BuddyMessageQuote, root: HTMLElement): boolean {
    clear()
    const body = source.querySelector<HTMLElement>(chatQuoteBodySelector)
    if (!body)
      return false
    const ranges = findChatQuoteTextRanges(body, quote)
    if (!ranges.length)
      return false
    current = new Highlight(...ranges)
    CSS.highlights.set(highlightName, current)
    scrollChatQuoteRange(ranges[0]!, root)
    timer = setTimeout(clear, highlightDuration)
    return true
  }

  onScopeDispose(clear)
  return { show, clear }
}
