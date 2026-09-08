import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type {
  LocalComposerDraft,
  LocalConversation,
  LocalConversationSummary,
  LocalSpace,
  LocalWorkspaceDraft,
  LocalWorkspaceSetting,
  LocalWorkspaceStateValue,
} from '@buddy-electron/shared/localChatApi'
import type { BuddyComposerDraftScope } from '@buddy-shared/composerDraft'
import type { ChatDraftSnapshot, useChatDrafts } from '@/workbenches/chat/state/useChatDrafts'
import type { ChatSession } from '@/workbenches/chat/state/useChatSession'

interface ValueRef<T> {
  readonly value: T
}

interface UseTaskWorkspacePersistenceOptions {
  beforePersist?: () => Promise<void>
  api: Pick<LexoraDesktopApi['localChat'], 'composerDrafts' | 'workspaceState'>
  conversations: ValueRef<ReadonlyArray<LocalConversationSummary>>
  drafts: ReturnType<typeof useChatDrafts>
  getConversation: (conversationId: string) => LocalConversation | null
  onError: (error: unknown) => void
  spaces: ValueRef<ReadonlyArray<LocalSpace>>
  session: ChatSession
}

export function useTaskWorkspacePersistence(options: UseTaskWorkspacePersistenceOptions) {
  let hydrated = false
  let disposed = false
  let requestedVersion = 0
  let confirmedVersion = 0
  let inFlight: Promise<boolean> | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let maxWaitTimer: ReturnType<typeof setTimeout> | undefined

  async function hydrate(setting: LocalWorkspaceSetting | null): Promise<boolean> {
    try {
      const value = setting?.value ?? null
      const activeConversationId = options.conversations.value.some(
        conversation => conversation.id === value?.activeConversationId,
      )
        ? value!.activeConversationId
        : null
      const spaceId = options.spaces.value.some(
        space => space.id === value?.spaceId && space.revokedAt === null,
      )
        ? value!.spaceId
        : null
      options.session.hydrate({
        activeBranchId: options.conversations.value.find(
          conversation => conversation.id === activeConversationId,
        )?.activeBranchId ?? null,
        activeConversationId,
        spaceId,
      })
      options.drafts.hydrate([])

      if (isLegacyWorkspaceStateValue(value)) {
        for (const legacy of value.drafts) {
          if (legacy.attachments.length)
            throw new Error('Legacy attachment drafts require explicit migration')
          const targetKey = normalizeLegacyTargetKey(legacy, options.conversations.value)
          if (!targetKey)
            continue
          options.drafts.importLegacy(targetKey, legacy)
        }
      }

      for (const snapshot of options.drafts.listSnapshots())
        await persistSnapshot(snapshot)
      await ensureDraft(currentTargetKey())
      hydrated = true
      if (isLegacyWorkspaceStateValue(value))
        await writeWorkspaceState()
      return true
    }
    catch (error) {
      options.onError(error)
      hydrated = false
      return false
    }
  }

  function persist(): Promise<boolean> {
    if (!hydrated || disposed)
      return Promise.resolve(false)
    requestedVersion += 1
    return flush()
  }

  function flushPending(): Promise<boolean> {
    if (!hydrated || disposed)
      return Promise.resolve(false)
    requestedVersion += 1
    return flush()
  }

  function flush(): Promise<boolean> {
    cancelScheduledSave()
    inFlight ??= drain().then((confirmed) => {
      inFlight = null
      return confirmed && confirmedVersion < requestedVersion ? flush() : confirmed
    })
    return inFlight
  }

  async function drain(): Promise<boolean> {
    try {
      while (confirmedVersion < requestedVersion) {
        await options.beforePersist?.()
        const version = requestedVersion
        for (const snapshot of options.drafts.listSnapshots())
          await persistSnapshot(snapshot)
        await writeWorkspaceState()
        confirmedVersion = version
      }
      return true
    }
    catch (error) {
      options.onError(error)
      return false
    }
    finally {
      cancelScheduledSave()
    }
  }

  async function ensureDraft(targetKey: string): Promise<ChatDraftSnapshot> {
    let snapshot = options.drafts.snapshot(targetKey)
    if (snapshot.revision !== null)
      return snapshot
    const remote = await options.api.composerDrafts.open({
      draftId: snapshot.draftId,
      initialContent: snapshot.content,
      initialExecutionConfig: {
        approvalPolicy: snapshot.approvalPolicy,
        executionProfile: snapshot.executionProfile,
      },
      initialModelSelection: snapshot.modelSelection,
      scope: parseTargetKey(targetKey),
    })
    options.drafts.confirmOpen(snapshot, remote, targetKey.startsWith('message-edit:'))
    snapshot = options.drafts.snapshot(targetKey)
    return snapshot
  }

  async function persistSnapshot(submitted: ChatDraftSnapshot): Promise<void> {
    let snapshot = submitted.revision === null
      ? await ensureDraft(submitted.targetKey)
      : submitted
    const scope = parseTargetKey(snapshot.targetKey)
    if ('conversationId' in scope) {
      const conversation = options.getConversation(scope.conversationId)
      if (conversation) {
        options.drafts.setPermissionSettings({
          approvalPolicy: conversation.approvalPolicy,
          executionProfile: conversation.executionProfile,
        }, snapshot.targetKey)
        snapshot = options.drafts.snapshot(snapshot.targetKey)
      }
    }
    if (options.drafts.isPersisted(snapshot))
      return
    const expectedRevision = requireRevision(snapshot.revision)
    try {
      const remote = await options.api.composerDrafts.save({
        content: snapshot.content,
        draftId: snapshot.draftId,
        executionConfig: {
          approvalPolicy: snapshot.approvalPolicy,
          executionProfile: snapshot.executionProfile,
        },
        expectedRevision,
        modelSelection: snapshot.modelSelection,
      })
      options.drafts.confirmSave(snapshot, remote)
    }
    catch (error) {
      const remote = await options.api.composerDrafts.get(snapshot.draftId).catch(() => null)
      if (!remote || remote.revision !== expectedRevision + 1 || !sameDraftValue(remote, snapshot))
        throw error
      options.drafts.confirmSave(snapshot, remote)
    }
  }

  async function writeWorkspaceState(): Promise<void> {
    const value: LocalWorkspaceStateValue = {
      activeConversationId: options.session.activeConversationId.value,
      spaceId: options.session.spaceId.value,
    }
    try {
      await options.api.workspaceState.write(value)
    }
    catch (error) {
      const current = await options.api.workspaceState.read().catch(() => null)
      if (!current || JSON.stringify(current.value) !== JSON.stringify(value))
        throw error
    }
  }

  function currentTargetKey(): string {
    const conversationId = options.session.activeConversationId.value
    const branchId = options.session.activeBranchId.value
    if (conversationId && branchId)
      return `conversation:${conversationId}:${branchId}`
    const spaceId = options.session.spaceId.value
    return spaceId ? `space:${spaceId}` : 'global'
  }

  function cancelScheduledSave() {
    clearTimeout(debounceTimer)
    clearTimeout(maxWaitTimer)
    debounceTimer = undefined
    maxWaitTimer = undefined
  }

  function persistIfHydrated() {
    if (!hydrated || disposed)
      return
    requestedVersion += 1
    if (inFlight)
      return
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => void flush(), 300)
    maxWaitTimer ??= setTimeout(() => void flush(), 1_500)
  }

  return {
    dispose() {
      disposed = true
      cancelScheduledSave()
      if (hydrated && confirmedVersion < requestedVersion)
        void flush()
    },
    hydrate,
    flushPending,
    persist,
    persistIfHydrated,
    read: () => options.api.workspaceState.read(),
  }
}

function isLegacyWorkspaceStateValue(
  value: LocalWorkspaceSetting['value'] | null,
): value is LocalWorkspaceStateValue & { drafts: ReadonlyArray<LocalWorkspaceDraft> } {
  return Boolean(value && Array.isArray((value as { drafts?: unknown }).drafts))
}

function parseTargetKey(targetKey: string): BuddyComposerDraftScope {
  if (targetKey === 'global')
    return { kind: 'global' }
  const parts = targetKey.split(':')
  if (parts[0] === 'space' && parts.length === 2 && parts[1])
    return { kind: 'space', spaceId: parts[1] }
  if (parts[0] === 'conversation' && parts.length === 3 && parts[1] && parts[2]) {
    return {
      branchId: parts[2],
      conversationId: parts[1],
      kind: 'conversation_branch',
    }
  }
  if (
    parts[0] === 'message-edit'
    && parts.length === 4
    && parts[1]
    && parts[2]
    && parts[3]
  ) {
    return {
      branchId: parts[2],
      conversationId: parts[1],
      kind: 'message_edit',
      userMessageId: parts[3],
    }
  }
  throw new Error('Invalid Composer draft scope')
}

function normalizeLegacyTargetKey(
  draft: LocalWorkspaceDraft,
  conversations: ReadonlyArray<LocalConversationSummary>,
): string | null {
  if (draft.targetKey === 'global' || draft.targetKey.startsWith('space:'))
    return draft.targetKey
  const parts = draft.targetKey.split(':')
  if (parts[0] !== 'conversation' || !parts[1])
    return null
  if (parts[2])
    return draft.targetKey
  const branchId = conversations.find(conversation => conversation.id === parts[1])?.activeBranchId
  return branchId ? `conversation:${parts[1]}:${branchId}` : null
}

function requireRevision(revision: number | null): number {
  if (revision === null)
    throw new Error('Composer draft was not opened')
  return revision
}

function sameDraftValue(remote: LocalComposerDraft, snapshot: ChatDraftSnapshot): boolean {
  return JSON.stringify({
    content: remote.content,
    executionConfig: remote.executionConfig,
    modelSelection: remote.modelSelection,
  }) === JSON.stringify({
    content: snapshot.content,
    executionConfig: {
      approvalPolicy: snapshot.approvalPolicy,
      executionProfile: snapshot.executionProfile,
    },
    modelSelection: snapshot.modelSelection,
  })
}
