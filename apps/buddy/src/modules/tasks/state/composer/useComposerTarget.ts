import type { BuddyUserContentV1 } from '@buddy-shared/conversation/buddyUserContent'
import type { BuddyComposerDraftScope } from '@buddy-shared/conversation/composerDraft'
import type { Ref } from 'vue'
import type { ChatDrafts, ComposerDraftReceipt } from '../drafts/typing'
import { buddyComposerDraftScopeKey } from '@buddy-shared/conversation/composerDraft'
import { computed, onScopeDispose, watch } from 'vue'
import { parseDraftScopeKey } from '../../model/drafts/draftScope'

export type ComposerFollowupTarget = Extract<BuddyComposerDraftScope, { kind: 'message_followup' }>
type ComposerEditTarget = Extract<BuddyComposerDraftScope, { kind: 'message_edit' }>

export function useComposerTarget(options: {
  drafts: ChatDrafts
  conversationId: Readonly<Ref<string | null>>
  branchId: Readonly<Ref<string | null>>
  persist: () => Promise<boolean>
}) {
  const current = computed(() => parseDraftScopeKey(options.drafts.targetKey.value))
  const editing = computed(() => current.value.kind === 'message_edit' ? current.value : null)
  const followup = computed(() => current.value.kind === 'message_followup' ? current.value : null)
  let intent = 0
  let disposed = false

  function cancel(key = options.drafts.targetKey.value) {
    intent++
    return options.drafts.cancelIsolated(key)
  }

  function cancelFollowup() {
    intent++
    if (followup.value)
      cancel()
  }

  async function beginFollowup(target: ComposerFollowupTarget, canChange: () => boolean) {
    if (!canChange() || editing.value || target.conversationId !== options.conversationId.value)
      return false
    const requested = ++intent
    if (!await options.persist() || requested !== intent || disposed || !canChange())
      return false
    options.drafts.resumeIsolated(buddyComposerDraftScopeKey(target))
    return await options.persist() && requested === intent && !disposed
  }

  function beginEdit(target: ComposerEditTarget, content: BuddyUserContentV1) {
    if (editing.value || target.conversationId !== options.conversationId.value
      || target.branchId !== options.branchId.value) {
      return false
    }
    cancelFollowup()
    return options.drafts.beginIsolated(buddyComposerDraftScopeKey(target), content)
  }

  function complete(receipt: ComposerDraftReceipt, destinationKey: string, sourceKey: string) {
    const source = parseDraftScopeKey(sourceKey)
    return source.kind === 'message_edit' || source.kind === 'message_followup'
      ? options.drafts.completeIsolated(receipt, destinationKey, sourceKey)
      : options.drafts.acknowledgeSend(receipt, destinationKey)
  }

  watch([options.conversationId, options.branchId], () => intent++, { flush: 'sync' })
  onScopeDispose(() => {
    disposed = true
    cancel()
  })

  return { current, editing, followup, beginEdit, beginFollowup, cancel, cancelFollowup, complete }
}

export type ComposerTarget = ReturnType<typeof useComposerTarget>
