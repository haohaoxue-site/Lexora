import type {
  LocalAttachment,
  LocalWorkspaceDraft,
} from '@buddy-electron/shared/localChatApi'
import type { BuddyExecutionProfile } from '@buddy-shared/executionProfile'
import type { ComputedRef } from 'vue'
import {
  BUDDY_ATTACHMENT_COUNT_LIMIT,
  BUDDY_ATTACHMENT_TOTAL_BYTES_LIMIT,
} from '@buddy-shared/attachmentPolicy'
import { BUDDY_DEFAULT_EXECUTION_PROFILE } from '@buddy-shared/executionProfile'
import { shallowRef } from 'vue'

interface UseChatDraftsOptions {
  cleanupDraftAttachments: (retainedAttachmentIds: ReadonlyArray<string>) => Promise<unknown>
  onChange: () => void
  releaseAttachments: (attachmentIds: ReadonlyArray<string>) => Promise<unknown>
  targetKey: ComputedRef<string>
}

interface ChatDraftState {
  attachments: ReadonlyArray<LocalAttachment>
  composerContent: LocalWorkspaceDraft['composerContent']
  content: string
  executionProfile: BuddyExecutionProfile
  requestFingerprint: string | null
  requestId: string | null
}

export function useChatDrafts(options: UseChatDraftsOptions) {
  const draftsByScope = new Map<string, ChatDraftState>()
  const attachments = shallowRef<ReadonlyArray<LocalAttachment>>([])
  const composerContent = shallowRef<LocalWorkspaceDraft['composerContent']>(null)
  const draft = shallowRef('')
  const executionProfile = shallowRef<BuddyExecutionProfile>(BUDDY_DEFAULT_EXECUTION_PROFILE)

  async function appendAttachments(incoming: ReadonlyArray<LocalAttachment>): Promise<number> {
    const accepted = [...attachments.value]
    const rejectedIds: string[] = []
    let totalBytes = accepted.reduce((total, attachment) => total + attachment.sizeBytes, 0)
    for (const attachment of incoming) {
      if (
        accepted.length >= BUDDY_ATTACHMENT_COUNT_LIMIT
        || totalBytes + attachment.sizeBytes > BUDDY_ATTACHMENT_TOTAL_BYTES_LIMIT
      ) {
        rejectedIds.push(attachment.attachmentId)
        continue
      }
      accepted.push(attachment)
      totalBytes += attachment.sizeBytes
    }
    attachments.value = accepted
    saveCurrentDraft(true)
    if (rejectedIds.length)
      await options.releaseAttachments(rejectedIds)
    return rejectedIds.length
  }

  async function removeAttachment(index: number) {
    const removed = attachments.value[index]
    if (!removed)
      return
    attachments.value = attachments.value.filter((_item, itemIndex) => itemIndex !== index)
    saveCurrentDraft(true)
    await options.releaseAttachments([removed.attachmentId])
  }

  function updateComposerContent(content: string, value: LocalWorkspaceDraft['composerContent']) {
    draft.value = content
    composerContent.value = value
    saveCurrentDraft(true)
  }

  function saveCurrentDraft(resetRequestId = false) {
    const current = load(options.targetKey.value)
    draftsByScope.set(options.targetKey.value, {
      attachments: attachments.value,
      composerContent: composerContent.value,
      content: draft.value,
      executionProfile: executionProfile.value,
      requestFingerprint: resetRequestId ? null : current.requestFingerprint,
      requestId: resetRequestId ? null : current.requestId,
    })
    options.onChange()
  }

  function restoreCurrentDraft() {
    const current = load(options.targetKey.value)
    attachments.value = current.attachments
    composerContent.value = current.composerContent
    draft.value = current.content
    executionProfile.value = current.executionProfile
  }

  function load(key: string): ChatDraftState {
    return draftsByScope.get(key) ?? emptyDraft()
  }

  return {
    appendAttachments,
    attachments,
    cleanupAbandonedAttachments: () => options.cleanupDraftAttachments(
      [...draftsByScope.values()].flatMap(
        item => item.attachments.map(attachment => attachment.attachmentId),
      ),
    ),
    composerContent,
    draft,
    exportDrafts: (): LocalWorkspaceDraft[] => [...draftsByScope.entries()].map(([targetKey, value]) => ({
      attachments: value.attachments,
      composerContent: value.composerContent,
      content: value.content,
      executionProfile: value.executionProfile,
      requestFingerprint: value.requestFingerprint,
      requestId: value.requestId,
      targetKey,
    })),
    hydrate(drafts: ReadonlyArray<LocalWorkspaceDraft>) {
      draftsByScope.clear()
      for (const value of drafts) {
        draftsByScope.set(value.targetKey, {
          attachments: value.attachments,
          composerContent: value.composerContent,
          content: value.content,
          executionProfile: value.executionProfile,
          requestFingerprint: value.requestFingerprint,
          requestId: value.requestId,
        })
      }
    },
    load,
    executionProfile,
    prepareSend(requestFingerprint: string) {
      const current = load(options.targetKey.value)
      const requestId = current.requestFingerprint === requestFingerprint
        ? current.requestId ?? crypto.randomUUID()
        : crypto.randomUUID()
      const value = { ...load(options.targetKey.value), requestFingerprint, requestId }
      draftsByScope.set(options.targetKey.value, value)
      options.onChange()
      return value
    },
    retarget(sourceKey: string, targetKey: string) {
      const value = load(sourceKey)
      if (sourceKey !== targetKey)
        draftsByScope.delete(sourceKey)
      draftsByScope.set(targetKey, {
        ...value,
        requestFingerprint: null,
        requestId: null,
      })
      options.onChange()
    },
    removeAttachment,
    restoreCurrentDraft,
    saveCurrentDraft,
    setExecutionProfile(value: BuddyExecutionProfile) {
      executionProfile.value = value
      saveCurrentDraft(true)
    },
    clear(key: string) {
      draftsByScope.delete(key)
      options.onChange()
    },
    async discard(key: string) {
      const value = load(key)
      draftsByScope.delete(key)
      options.onChange()
      if (value.attachments.length)
        await options.releaseAttachments(value.attachments.map(item => item.attachmentId))
    },
    updateComposerContent,
  }
}

function emptyDraft(): ChatDraftState {
  return {
    attachments: [],
    composerContent: null,
    content: '',
    executionProfile: BUDDY_DEFAULT_EXECUTION_PROFILE,
    requestFingerprint: null,
    requestId: null,
  }
}
