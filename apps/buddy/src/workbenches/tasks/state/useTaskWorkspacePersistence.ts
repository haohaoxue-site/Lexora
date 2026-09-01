import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type {
  LocalConversationSummary,
  LocalSpace,
  LocalWorkspaceSetting,
  LocalWorkspaceStateValue,
} from '@buddy-electron/shared/localChatApi'
import type { useChatDrafts } from '@/workbenches/chat/state/useChatDrafts'
import type { ChatSession } from '@/workbenches/chat/state/useChatSession'
import { localWorkspaceStateValueSchema } from '@buddy-electron/shared/localChatApiSchemas'

interface ValueRef<T> {
  readonly value: T
}

interface UseTaskWorkspacePersistenceOptions {
  api: LexoraDesktopApi['localChat']['workspaceState']
  conversations: ValueRef<ReadonlyArray<LocalConversationSummary>>
  drafts: ReturnType<typeof useChatDrafts>
  onError: (error: unknown) => void
  spaces: ValueRef<ReadonlyArray<LocalSpace>>
  session: ChatSession
}

export function useTaskWorkspacePersistence(options: UseTaskWorkspacePersistenceOptions) {
  let hydrated = false
  let writeQueue = Promise.resolve()

  async function hydrate(setting: LocalWorkspaceSetting | null): Promise<boolean> {
    const parsed = setting
      ? localWorkspaceStateValueSchema.safeParse(setting.value)
      : null
    const valid = setting === null || parsed?.success === true

    if (parsed?.success) {
      options.drafts.hydrate(parsed.data.drafts)
      const activeConversationId = options.conversations.value.some(
        conversation => conversation.id === parsed.data.activeConversationId,
      )
        ? parsed.data.activeConversationId
        : null
      const spaceId = options.spaces.value.some(
        space => space.id === parsed.data.spaceId && space.revokedAt === null,
      )
        ? parsed.data.spaceId
        : null
      options.session.hydrate({
        activeBranchId: options.conversations.value.find(
          conversation => conversation.id === activeConversationId,
        )?.activeBranchId ?? null,
        activeConversationId,
        spaceId,
      })
    }
    else if (setting === null) {
      options.drafts.hydrate([])
    }

    hydrated = valid
    options.drafts.restoreCurrentDraft()
    if (valid) {
      await options.drafts.cleanupAbandonedAttachments().catch((error) => {
        options.onError(error)
      })
    }
    return valid
  }

  function persist(): Promise<boolean> {
    const value: LocalWorkspaceStateValue = {
      activeConversationId: options.session.activeConversationId.value,
      drafts: options.drafts.exportDrafts(),
      spaceId: options.session.spaceId.value,
    }
    const write = writeQueue.then(async () => {
      await options.api.write(value)
    })
    writeQueue = write.catch((error) => {
      options.onError(error)
    })
    return write.then(() => true, () => false)
  }

  function persistIfHydrated() {
    if (hydrated)
      void persist()
  }

  return {
    hydrate,
    persist,
    persistIfHydrated,
    read: () => options.api.read(),
  }
}
