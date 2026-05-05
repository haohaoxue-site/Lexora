import type { Transaction } from '@tiptap/pm/state'
import { isChangeOrigin } from '@tiptap/extension-collaboration'

export function isCollaborationOriginTransaction(
  transaction: Transaction | null | undefined,
) {
  if (!transaction || typeof transaction.getMeta !== 'function') {
    return false
  }

  return isChangeOrigin(transaction)
}
