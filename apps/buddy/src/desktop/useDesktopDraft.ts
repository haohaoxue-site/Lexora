import type { ComputedRef } from 'vue'
import type {
  LocalAttachment,
  LocalWorkspaceDraft,
} from '../../electron/shared/localChatApi'
import { shallowRef } from 'vue'

interface UseDesktopDraftOptions {
  cleanupDraftAttachments: (retainedAttachmentIds: ReadonlyArray<string>) => Promise<unknown>
  onChange: () => void
  releaseAttachments: (attachmentIds: ReadonlyArray<string>) => Promise<unknown>
  targetKey: ComputedRef<string>
}

interface DesktopDraftState {
  attachments: ReadonlyArray<LocalAttachment>
  composerContent: LocalWorkspaceDraft['composerContent']
  content: string
  requestFingerprint: string | null
  requestId: string | null
}

const ATTACHMENT_COUNT_LIMIT = 16
const ATTACHMENT_TOTAL_BYTES_LIMIT = 32 * 1024 * 1024

export function useDesktopDraft(options: UseDesktopDraftOptions) {
  const store = new Map<string, DesktopDraftState>()
  const attachments = shallowRef<ReadonlyArray<LocalAttachment>>([])
  const composerContent = shallowRef<LocalWorkspaceDraft['composerContent']>(null)
  const draft = shallowRef('')

  async function appendAttachments(incoming: ReadonlyArray<LocalAttachment>): Promise<number> {
    const accepted = [...attachments.value]
    const rejectedIds: string[] = []
    let totalBytes = accepted.reduce((total, attachment) => total + attachment.sizeBytes, 0)
    for (const attachment of incoming) {
      if (
        accepted.length >= ATTACHMENT_COUNT_LIMIT
        || totalBytes + attachment.sizeBytes > ATTACHMENT_TOTAL_BYTES_LIMIT
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
    store.set(options.targetKey.value, {
      attachments: attachments.value,
      composerContent: composerContent.value,
      content: draft.value,
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
  }

  function load(key: string): DesktopDraftState {
    return store.get(key) ?? emptyDraft()
  }

  return {
    appendAttachments,
    attachments,
    cleanupAbandonedAttachments: () => options.cleanupDraftAttachments(
      [...store.values()].flatMap(item => item.attachments.map(attachment => attachment.attachmentId)),
    ),
    composerContent,
    draft,
    exportDrafts: (): LocalWorkspaceDraft[] => [...store.entries()].map(([targetKey, value]) => ({
      attachments: value.attachments,
      composerContent: value.composerContent,
      content: value.content,
      requestFingerprint: value.requestFingerprint,
      requestId: value.requestId,
      targetKey,
    })),
    hydrate(drafts: ReadonlyArray<LocalWorkspaceDraft>) {
      store.clear()
      for (const value of drafts) {
        store.set(value.targetKey, {
          attachments: value.attachments,
          composerContent: value.composerContent,
          content: value.content,
          requestFingerprint: value.requestFingerprint,
          requestId: value.requestId,
        })
      }
    },
    load,
    prepareSend(requestFingerprint: string) {
      const current = load(options.targetKey.value)
      const requestId = current.requestFingerprint === requestFingerprint
        ? current.requestId ?? crypto.randomUUID()
        : crypto.randomUUID()
      const value = { ...load(options.targetKey.value), requestFingerprint, requestId }
      store.set(options.targetKey.value, value)
      options.onChange()
      return value
    },
    retarget(sourceKey: string, targetKey: string) {
      const value = load(sourceKey)
      if (sourceKey !== targetKey)
        store.delete(sourceKey)
      store.set(targetKey, {
        ...value,
        requestFingerprint: null,
        requestId: null,
      })
      options.onChange()
    },
    removeAttachment,
    restoreCurrentDraft,
    saveCurrentDraft,
    clear(key: string) {
      store.delete(key)
      options.onChange()
    },
    async discard(key: string) {
      const value = load(key)
      store.delete(key)
      options.onChange()
      if (value.attachments.length)
        await options.releaseAttachments(value.attachments.map(item => item.attachmentId))
    },
    updateComposerContent,
  }
}

function emptyDraft(): DesktopDraftState {
  return {
    attachments: [],
    composerContent: null,
    content: '',
    requestFingerprint: null,
    requestId: null,
  }
}
