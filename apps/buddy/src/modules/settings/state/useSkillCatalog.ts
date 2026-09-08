import type { LocalSkillCatalog } from '@buddy-shared/skills/skillApi'
import type { LocalCapabilitiesOptions, SkillCatalogStore } from './typing'
import { readonly, shallowRef } from 'vue'
import { resolveLocalChatErrorMessage } from '@/shared/lib/localChatError'

const EMPTY_SKILL_CATALOG: LocalSkillCatalog = { diagnostics: [], skills: [] }

export function useSkillCatalog(options: LocalCapabilitiesOptions): SkillCatalogStore {
  const skills = shallowRef<LocalSkillCatalog>(EMPTY_SKILL_CATALOG)
  const isLoadingSkills = shallowRef(false)
  const skillsError = shallowRef<string | null>(null)
  let cached: { spaceId: string | null, catalog: LocalSkillCatalog } | null = null
  let pending: { spaceId: string | null, promise: Promise<boolean> } | null = null
  let generation = 0
  let disposed = false

  function loadSkills(spaceId: string | null = null): Promise<boolean> {
    if (disposed)
      return Promise.resolve(false)
    if (pending?.spaceId === spaceId)
      return pending.promise
    const current = ++generation
    pending = null
    skillsError.value = null
    if (cached?.spaceId === spaceId) {
      skills.value = cached.catalog
      isLoadingSkills.value = false
      return Promise.resolve(true)
    }
    skills.value = EMPTY_SKILL_CATALOG
    isLoadingSkills.value = true
    const promise = load(spaceId, current)
    pending = { promise, spaceId }
    return promise
  }

  async function load(spaceId: string | null, current: number): Promise<boolean> {
    try {
      const catalog = await options.api.skills.list(spaceId)
      if (disposed || current !== generation)
        return false
      skills.value = catalog
      cached = { catalog, spaceId }
      return true
    }
    catch (error) {
      if (!disposed && current === generation)
        skillsError.value = resolveLocalChatErrorMessage(error, options.language.value)
      return false
    }
    finally {
      if (!disposed && current === generation) {
        pending = null
        isLoadingSkills.value = false
      }
    }
  }

  return {
    dispose: () => { disposed = true },
    isLoadingSkills: readonly(isLoadingSkills),
    loadSkills,
    refreshSkills: (spaceId = null) => {
      cached = null
      pending = null
      return loadSkills(spaceId)
    },
    skills: readonly(skills),
    skillsError: readonly(skillsError),
  }
}
