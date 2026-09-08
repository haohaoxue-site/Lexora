import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type { LocalComposerDraft } from '@buddy-shared/conversation/composerApi'
import type { LocalConversation, LocalConversationSummary } from '@buddy-shared/conversation/conversationApi'
import type { LocalWorkspaceDraft, LocalWorkspaceSetting, LocalWorkspaceStateValue } from '@buddy-shared/conversation/workspaceApi'
import type { LocalSpace } from '@buddy-shared/spaces/spaceApi'
import type { ChatDraftSnapshot, DraftRestorationConflict, DraftRestorationState } from './typing'

import type { ChatSession } from '@/modules/tasks/state/conversations/useChatSession'
import type { useChatDrafts } from '@/modules/tasks/state/drafts/useChatDrafts'
import { computed, readonly, shallowRef } from 'vue'
import { createDraftScopeKey, normalizeLegacyDraftScopeKey, parseDraftScopeKey } from '../../model/drafts/draftScope'
import { createDraftValueFingerprint } from '../../model/drafts/draftValueFingerprint'

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
  onDraftRestored?: (targetKey: string) => void
  initialModelSelection?: (targetKey: string) => LocalComposerDraft['modelSelection']
  spaces: ValueRef<ReadonlyArray<LocalSpace>>
  session: ChatSession
}

export function useTaskWorkspacePersistence(options: UseTaskWorkspacePersistenceOptions) {
  const restorationState = shallowRef<DraftRestorationState>('pending')
  const conflict = shallowRef<{ targetKey: string, remote: LocalComposerDraft } | null>(null)
  const restorationConflict = computed<DraftRestorationConflict | null>(() => {
    const current = conflict.value
    if (!current)
      return null
    const local = options.drafts.listSnapshots().find(snapshot => snapshot.targetKey === current.targetKey)
    return local ? { ...current, local } : null
  })
  let restoration: Promise<boolean> | null = null
  let initialNavigation: { generation: number, draft: ChatDraftSnapshot } | null = null
  const initialDrafts = new Map<string, ChatDraftSnapshot>()
  const importedLegacyScopes = new Set<string>()
  let disposed = false
  let requestedVersion = 0
  let confirmedVersion = 0
  let inFlight: Promise<boolean> | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  let maxWaitTimer: ReturnType<typeof setTimeout> | undefined

  function restore(navigationReady: Promise<unknown> = Promise.resolve()): Promise<boolean> {
    if (disposed)
      return Promise.resolve(false)
    if (restorationState.value === 'conflict')
      return Promise.resolve(false)
    if (restorationState.value === 'ready')
      return Promise.resolve(true)
    if (restoration)
      return restoration
    if (!initialNavigation) {
      for (const snapshot of options.drafts.listSnapshots())
        initialDrafts.set(snapshot.targetKey, snapshot)
      initialNavigation = {
        generation: options.session.generation(),
        draft: options.drafts.snapshot(currentTargetKey()),
      }
    }
    restorationState.value = 'restoring'
    restoration = restoreWorkspace(navigationReady).finally(() => restoration = null)
    return restoration
  }

  async function restoreWorkspace(navigationReady: Promise<unknown>): Promise<boolean> {
    try {
      const [setting] = await Promise.all([options.api.workspaceState.read(), navigationReady])
      if (disposed)
        return false
      const value = setting?.value ?? null
      const baseline = initialNavigation!
      if (options.session.isCurrent(baseline.generation) && options.drafts.isUnchanged(baseline.draft)) {
        const conversation = options.conversations.value.find(item => item.id === value?.activeConversationId)
        const space = options.spaces.value.find(item => item.id === value?.spaceId && item.revokedAt === null)
        options.session.hydrate({
          activeBranchId: conversation?.activeBranchId ?? null,
          activeConversationId: conversation?.id ?? null,
          spaceId: space?.id ?? null,
        })
      }

      if (isLegacyWorkspaceStateValue(value)) {
        for (const legacy of value.drafts) {
          if (legacy.attachments.length)
            throw new Error('Legacy attachment drafts require explicit migration')
          const targetKey = normalizeLegacyDraftScopeKey(legacy, options.conversations.value)
          if (!targetKey || importedLegacyScopes.has(targetKey))
            continue
          const initial = initialDrafts.get(targetKey)
          const current = options.drafts.listSnapshots().find(draft => draft.targetKey === targetKey)
          if (!current || (initial && options.drafts.isUnchanged(initial))) {
            options.drafts.importLegacy(targetKey, legacy)
            initialDrafts.set(targetKey, options.drafts.snapshot(targetKey))
          }
          importedLegacyScopes.add(targetKey)
        }
      }

      let unopened = options.drafts.listSnapshots().find(snapshot => snapshot.revision === null)
      while (unopened) {
        await ensureDraft(unopened.targetKey, true)
        if (disposed)
          return false
        unopened = options.drafts.listSnapshots().find(snapshot => snapshot.revision === null)
      }
      restorationState.value = 'ready'
      if (isLegacyWorkspaceStateValue(value) || requestedVersion > confirmedVersion)
        return persist()
      return true
    }
    catch (error) {
      if (!disposed) {
        restorationState.value = error instanceof DraftRestorationConflictError ? 'conflict' : 'failed'
        if (!(error instanceof DraftRestorationConflictError))
          options.onError(error)
      }
      return false
    }
  }

  async function resolveRemote(targetKey: string): Promise<boolean> {
    const current = restorationConflict.value
    if (disposed || !current || current.targetKey !== targetKey)
      return false
    try {
      const remote = await options.api.composerDrafts.get(current.remote.draftId)
      if (disposed || conflict.value?.targetKey !== targetKey || !options.drafts.isUnchanged(current.local))
        return false
      if (!options.drafts.confirmOpen(current.local, remote))
        return false
      options.onDraftRestored?.(targetKey)
      initialDrafts.set(targetKey, options.drafts.snapshot(targetKey))
      conflict.value = null
      restorationState.value = 'pending'
      return restore()
    }
    catch (error) {
      if (!disposed)
        options.onError(error)
      return false
    }
  }

  function persist(): Promise<boolean> {
    if (restorationState.value !== 'ready' || disposed)
      return Promise.resolve(false)
    requestedVersion += 1
    return flush()
  }

  function flushPending(): Promise<boolean> {
    if (restorationState.value !== 'ready' || disposed)
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
      if (!(error instanceof DraftRestorationConflictError))
        options.onError(error)
      return false
    }
    finally {
      cancelScheduledSave()
    }
  }

  async function ensureDraft(targetKey: string, restoring = false): Promise<ChatDraftSnapshot> {
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
      initialModelSelection: snapshot.modelSelection ?? options.initialModelSelection?.(targetKey) ?? null,
      scope: parseDraftScopeKey(targetKey),
    })
    if (restoring && disposed)
      return snapshot
    const current = options.drafts.listSnapshots().find(draft => draft.targetKey === targetKey)
    if (!current || current.editorSessionId !== snapshot.editorSessionId)
      return current ?? snapshot
    const initial = initialDrafts.get(targetKey)
    const preserveRecoveryEdits = restoring && (initial
      ? !options.drafts.isUnchanged(initial)
      : current.editVersion > 0)
    if ((preserveRecoveryEdits || current.editVersion > 0) && current.draftId !== remote.draftId) {
      conflict.value = { targetKey, remote }
      restorationState.value = 'conflict'
      throw new DraftRestorationConflictError()
    }
    if (options.drafts.confirmOpen(snapshot, remote, targetKey.startsWith('message-edit:') || preserveRecoveryEdits))
      options.onDraftRestored?.(targetKey)
    snapshot = options.drafts.snapshot(targetKey)
    return snapshot
  }

  async function persistSnapshot(submitted: ChatDraftSnapshot): Promise<void> {
    let snapshot = submitted.revision === null
      ? await ensureDraft(submitted.targetKey)
      : submitted
    const scope = parseDraftScopeKey(snapshot.targetKey)
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
    return createDraftScopeKey({
      conversationId: options.session.activeConversationId.value,
      branchId: options.session.activeBranchId.value,
      spaceId: options.session.spaceId.value,
    })
  }

  function cancelScheduledSave() {
    clearTimeout(debounceTimer)
    clearTimeout(maxWaitTimer)
    debounceTimer = undefined
    maxWaitTimer = undefined
  }

  function persistIfHydrated() {
    if (disposed)
      return
    requestedVersion += 1
    if (restorationState.value !== 'ready')
      return
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
      if (restorationState.value === 'ready' && confirmedVersion < requestedVersion)
        void flush()
    },
    restore,
    resolveRemote,
    restorationConflict: readonly(restorationConflict),
    restorationState: readonly(restorationState),
    flushPending,
    persist,
    persistIfHydrated,
  }
}

function isLegacyWorkspaceStateValue(
  value: LocalWorkspaceSetting['value'] | null,
): value is LocalWorkspaceStateValue & { drafts: ReadonlyArray<LocalWorkspaceDraft> } {
  return Boolean(value && Array.isArray((value as { drafts?: unknown }).drafts))
}

function requireRevision(revision: number | null): number {
  if (revision === null)
    throw new Error('Composer draft was not opened')
  return revision
}

function sameDraftValue(remote: LocalComposerDraft, snapshot: ChatDraftSnapshot): boolean {
  return createDraftValueFingerprint(remote) === createDraftValueFingerprint({
    content: snapshot.content,
    executionConfig: {
      approvalPolicy: snapshot.approvalPolicy,
      executionProfile: snapshot.executionProfile,
    },
    modelSelection: snapshot.modelSelection,
  })
}

class DraftRestorationConflictError extends Error {}
