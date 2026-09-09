import type { BuddyMessageQuote } from '@buddy-shared/conversation/buddyUserContent'
import type { Ref } from 'vue'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { useMessage } from 'naive-ui'
import { onScopeDispose, provide, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { chatQuoteNavigationKey } from './chatQuoteContext'
import { useChatQuoteHighlight } from './useChatQuoteHighlight'

export function useChatQuoteNavigation(options: {
  root: Readonly<Ref<HTMLElement | null>>
  ownerKey: Readonly<Ref<string>>
  surfaceKey: Readonly<Ref<string>>
  language: () => BuddyLocale
  conversationId: () => string | null
  viewMode: () => string | undefined
  revealMessage: (messageId: string) => Promise<void>
  loadQuote: (messageId: string, quoteId: string) => Promise<BuddyMessageQuote | null>
  openSource: (source: BuddyMessageQuote['source']) => Promise<'opened' | 'unavailable' | 'cancelled'>
}) {
  const message = useMessage()
  const { t } = useBuddyI18n(options.language)
  const highlight = useChatQuoteHighlight()
  let generation = 0
  watch(options.ownerKey, () => {
    generation++
    highlight.clear()
  }, { flush: 'sync' })
  watch(options.surfaceKey, highlight.clear, { flush: 'sync' })
  onScopeDispose(() => {
    generation++
  })
  provide(chatQuoteNavigationKey, locate)

  function findSource(value: BuddyMessageQuote): HTMLElement | undefined {
    return [...(options.root.value?.querySelectorAll<HTMLElement>('[data-quote-source]') ?? [])]
      .find((element) => {
        const source = JSON.parse(element.dataset.quoteSource!) as BuddyMessageQuote['source']
        return source.messageId === value.source.messageId && element.checkVisibility()
      })
  }

  function highlightSource(value: BuddyMessageQuote): boolean {
    const source = findSource(value)
    const root = options.root.value
    if (!source || !root)
      return false
    if (!highlight.show(source, value, root)) {
      source.scrollIntoView({ block: 'center', behavior: 'auto' })
      message.info(t('desktop.chat.quoteTextUnavailable'))
    }
    return true
  }

  async function locate(value: BuddyMessageQuote): Promise<void> {
    const request = ++generation
    highlight.clear()
    try {
      if (value.source.conversationId === options.conversationId()) {
        const viewMode = options.viewMode()
        if (viewMode !== 'canvas') {
          await options.revealMessage(value.source.messageId)
          if (request !== generation || options.viewMode() !== viewMode)
            return
          if (highlightSource(value))
            return
        }
        const result = await options.openSource(value.source)
        if (request !== generation || result === 'cancelled')
          return
        if (result === 'opened' && highlightSource(value))
          return
      }
    }
    catch {}
    if (request === generation)
      message.warning(t('desktop.chat.quoteSourceUnavailable'))
  }

  async function locateStored(messageId: string, quoteId: string): Promise<void> {
    const request = ++generation
    highlight.clear()
    try {
      const value = await options.loadQuote(messageId, quoteId)
      if (request !== generation)
        return
      if (value) {
        await locate(value)
        return
      }
    }
    catch {}
    if (request === generation)
      message.warning(t('desktop.chat.quoteSourceUnavailable'))
  }

  return { locateStored }
}
