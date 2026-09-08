import type { LocalChatApi } from '@buddy-electron/shared/localChatApi'
import type { Ref } from 'vue'
import type { ChatComposerContextOptions } from '@/modules/prompt-input'
import type { LocalCapabilitiesStore } from '@/modules/settings'
import { onScopeDispose, watch } from 'vue'

interface ComposerContextOptions {
  activeBranchId: Readonly<Ref<string | null>>
  activeConversationId: Readonly<Ref<string | null>>
  draftId: Readonly<Ref<string>>
  spaceId: Readonly<Ref<string | null>>
  listSources: LocalChatApi['composerResources']['listSources']
  localCapabilities: Pick<LocalCapabilitiesStore, 'loadSkills' | 'skills'>
}

export function useComposerContextOptions(options: ComposerContextOptions) {
  let scopeVersion = 0
  watch([options.activeBranchId, options.activeConversationId, options.draftId, options.spaceId], () => {
    scopeVersion += 1
  }, { flush: 'sync' })
  onScopeDispose(() => {
    scopeVersion += 1
  })
  async function listContextOptions(fileQuery: string | null): Promise<ChatComposerContextOptions> {
    const current = scopeVersion
    const spaceId = options.spaceId.value
    const request = {
      branchId: options.activeBranchId.value,
      conversationId: options.activeConversationId.value,
      draftId: options.draftId.value,
      query: fileQuery ?? '',
      spaceId,
    }
    await options.localCapabilities.loadSkills(spaceId)
    if (current !== scopeVersion)
      return { files: [], skills: [] }
    const { files } = await options.listSources(request)
    if (current !== scopeVersion)
      return { files: [], skills: [] }
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

  return { listContextOptions }
}
