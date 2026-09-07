import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type { LocalSpace } from '@buddy-electron/shared/localChatApi'
import type { LocalCapabilitiesStore } from '@/stores/useLocalCapabilitiesStore'
import type { ChatComposerContextOptions } from '@/workbenches/chat/composer/chatComposerInput'
import type { useChatDrafts } from '@/workbenches/chat/state/useChatDrafts'
import { computed, readonly } from 'vue'

interface ValueRef<T> {
  readonly value: T
}

export interface TaskSpaceInput {
  memoryScope: 'personal_and_space' | 'space_only'
  name: string
  primaryDirectory: TaskSpacePrimaryDirectoryInput | null
}

export interface TaskSpacePrimaryDirectoryInput {
  id: string | null
  root: string
}

interface UseTaskSpacesOptions {
  activateDraftScope: (spaceId: string | null) => void
  activeBranchId: ValueRef<string | null>
  activeConversationId: ValueRef<string | null>
  api: LexoraDesktopApi['localChat']
  drafts: ReturnType<typeof useChatDrafts>
  draftId: ValueRef<string>
  localCapabilities: LocalCapabilitiesStore
  onError: (error: unknown) => void
  persistWorkspaceState: () => Promise<boolean>
  spaceId: ValueRef<string | null>
  spaces: ValueRef<ReadonlyArray<LocalSpace>>
  refreshIndex: () => Promise<void>
  selectDefaultModel: () => void
}

export function useTaskSpaces(options: UseTaskSpacesOptions) {
  const activeSpace = computed(() => options.spaces.value.find(
    space => space.id === options.spaceId.value,
  ) ?? null)
  const workingDirectory = computed(() => activeSpace.value?.primaryDirectory?.root ?? null)
  const scope = computed(() => activeSpace.value ? 'space' as const : 'global' as const)

  async function activateSpaceDraft(spaceId: string) {
    const space = options.spaces.value.find(
      item => item.id === spaceId && item.revokedAt === null,
    )
    if (!space)
      return
    options.activateDraftScope(space.id)
    options.selectDefaultModel()
    await options.persistWorkspaceState()
  }

  async function createSpace(input: TaskSpaceInput) {
    try {
      const space = await options.api.spaces.create(input)
      await options.refreshIndex()
      await activateSpaceDraft(space.id)
      return true
    }
    catch (error) {
      options.onError(error)
      return false
    }
  }

  async function updateSpace(input: TaskSpaceInput & { spaceId: string }) {
    try {
      await options.api.spaces.update(input)
      await options.refreshIndex()
      if (options.spaceId.value === input.spaceId)
        await options.localCapabilities.loadSkills(input.spaceId)
      return true
    }
    catch (error) {
      options.onError(error)
      return false
    }
  }

  async function deleteSpace(spaceId: string) {
    try {
      await options.api.spaces.delete(spaceId)
      await options.drafts.discard(`space:${spaceId}`)
      if (options.spaceId.value === spaceId)
        options.activateDraftScope(null)
      await options.refreshIndex()
      await options.persistWorkspaceState()
      return true
    }
    catch (error) {
      options.onError(error)
      return false
    }
  }

  async function selectSpaceDirectory(): Promise<string | null> {
    try {
      return await options.api.spaces.selectDirectory()
    }
    catch (error) {
      options.onError(error)
      return null
    }
  }

  async function listContextOptions(fileQuery: string | null): Promise<ChatComposerContextOptions> {
    const spaceId = options.spaceId.value
    await options.localCapabilities.loadSkills(spaceId)
    const { files } = await options.api.composerResources.listSources({
      branchId: options.activeBranchId.value,
      conversationId: options.activeConversationId.value,
      draftId: options.draftId.value,
      query: fileQuery ?? '',
      spaceId,
    })
    return {
      files: files.map(file => ({
        category: file.category,
        description: file.description,
        kind: 'file' as const,
        label: file.name,
        path: file.path,
        value: JSON.stringify(file.source),
        source: file.source,
      })),
      skills: options.localCapabilities.skills.value.skills
        .filter(skill => skill.enabled)
        .map(skill => ({
          description: skill.description,
          kind: 'skill' as const,
          label: skill.name,
          path: null,
          value: skill.name,
        })),
    }
  }

  return {
    activeSpace: readonly(activeSpace),
    createSpace,
    deleteSpace,
    listContextOptions,
    scope: readonly(scope),
    activateSpaceDraft,
    selectSpaceDirectory,
    updateSpace,
    workingDirectory: readonly(workingDirectory),
  }
}
