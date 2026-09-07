import type { BuddyInputReferenceStore } from '../BuddyInputReference'
import type { BuddyInProcessExtension } from '../createBuddyResourceLoader'
import {
  BuddyInputReferenceError,
  matchesBuddyInputPlaceholder,
} from '../BuddyInputReference'

export function createInputReferenceExtension(
  store: BuddyInputReferenceStore,
): BuddyInProcessExtension {
  return {
    name: 'lexora-input-reference',
    factory(pi) {
      pi.on('message_end', (event) => {
        const input = store.pending
        if (!input || event.message.role !== 'user')
          return
        if (!matchesBuddyInputPlaceholder(event.message.content, input))
          throw new BuddyInputReferenceError('INPUT_REFERENCE_MISMATCH')
        store.pending = null
        return { message: { ...event.message, buddyInput: input } }
      })
    },
  }
}
