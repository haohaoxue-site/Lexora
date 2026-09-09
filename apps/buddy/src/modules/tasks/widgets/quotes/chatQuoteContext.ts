import type { BuddyMessageQuote } from '@buddy-shared/conversation/buddyUserContent'
import type { InjectionKey } from 'vue'

export const chatQuoteNavigationKey: InjectionKey<(quote: BuddyMessageQuote) => Promise<void>> = Symbol('chat-quote-navigation')
