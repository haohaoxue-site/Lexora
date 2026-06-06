import type { Transaction } from '@tiptap/pm/state'
import { Extension } from '@tiptap/core'
import { isChangeOrigin } from '@tiptap/extension-collaboration'
import { Plugin, PluginKey } from '@tiptap/pm/state'

const SELECTION_VISIBILITY_META = 'samepageSelectionVisibility'

export const SelectionVisibility = Extension.create({
  name: 'SelectionVisibility',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey(this.name),
        appendTransaction: (transactions, _, newState) => {
          if (!shouldScrollSelectionIntoView(transactions)) {
            return null
          }

          return newState.tr
            .scrollIntoView()
            .setMeta(SELECTION_VISIBILITY_META, true)
            .setMeta('addToHistory', false)
        },
      }),
    ]
  },
})

function shouldScrollSelectionIntoView(transactions: readonly Transaction[]) {
  if (!transactions.some(transaction => transaction.docChanged || transaction.selectionSet)) {
    return false
  }

  if (transactions.some(transaction =>
    transaction.scrolledIntoView
    || transaction.getMeta(SELECTION_VISIBILITY_META)
    || transaction.getMeta('preventUpdate'),
  )) {
    return false
  }

  return !transactions.every(transaction => isChangeOrigin(transaction))
}
