import type { BuddyMessageQuote } from '@buddy-shared/conversation/buddyUserContent'
import type { Editor } from '@tiptap/core'
import { BUDDY_QUOTE_COUNT_LIMIT, buddyMessageQuoteSchema } from '@buddy-shared/conversation/buddyUserContent'
import { closeHistory } from '@tiptap/pm/history'

export type ChatQuoteResult = 'added' | 'duplicate' | 'limit' | 'unavailable'

export function addChatQuote(editor: Editor | undefined, quote: BuddyMessageQuote): ChatQuoteResult {
  if (!editor || editor.isDestroyed || !editor.isEditable)
    return 'unavailable'
  const parsed = buddyMessageQuoteSchema.safeParse(quote)
  if (!parsed.success)
    return 'limit'
  const quotes: readonly BuddyMessageQuote[] = editor.state.doc.attrs.quotes ?? []
  if (quotes.some(item => item.source.conversationId === quote.source.conversationId
    && item.source.messageId === quote.source.messageId && item.text === quote.text
    && (item.textOffset === undefined || quote.textOffset === undefined || item.textOffset === quote.textOffset))) {
    return 'duplicate'
  }
  if (quotes.length >= BUDDY_QUOTE_COUNT_LIMIT)
    return 'limit'
  editor.view.dispatch(closeHistory(editor.state.tr).setDocAttribute('quotes', [...quotes, parsed.data]))
  editor.view.dispatch(closeHistory(editor.state.tr))
  return 'added'
}

export function removeChatQuote(editor: Editor | undefined, id: string): void {
  if (!editor || editor.isDestroyed || !editor.isEditable)
    return
  const quotes: readonly BuddyMessageQuote[] = editor.state.doc.attrs.quotes ?? []
  const next = quotes.filter(quote => quote.id !== id)
  if (next.length === quotes.length)
    return
  editor.view.dispatch(closeHistory(editor.state.tr).setDocAttribute('quotes', next.length ? next : null))
  editor.view.dispatch(closeHistory(editor.state.tr))
}
