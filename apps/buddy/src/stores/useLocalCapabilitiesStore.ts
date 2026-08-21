import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type {
  LocalConnector,
  LocalConnectorConfig,
  LocalConnectorCredential,
  LocalConnectorCredentialMutation,
  LocalSkillCatalog,
} from '@buddy-electron/shared/localChatApi'
import type { ShallowRef } from 'vue'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { readonly, shallowRef } from 'vue'
import { resolveLocalChatErrorMessage } from '@/lib/localChatError'

interface UseLocalCapabilitiesStoreOptions {
  api: LexoraDesktopApi['localChat']
  language: Readonly<ShallowRef<BuddyLocale>>
}

const EMPTY_SKILL_CATALOG: LocalSkillCatalog = { diagnostics: [], skills: [] }

export function useLocalCapabilitiesStore(options: UseLocalCapabilitiesStoreOptions) {
  const skills = shallowRef<LocalSkillCatalog>(EMPTY_SKILL_CATALOG)
  const connectors = shallowRef<ReadonlyArray<LocalConnector>>([])
  const isLoadingSkills = shallowRef(false)
  const isLoadingConnectors = shallowRef(false)
  const skillsError = shallowRef<string | null>(null)
  const connectorsError = shallowRef<string | null>(null)
  let loadedSkillsProjectId: string | null | undefined
  let skillLoadGeneration = 0

  async function loadSkills(projectId: string | null = null): Promise<boolean> {
    if (loadedSkillsProjectId !== undefined && loadedSkillsProjectId === projectId)
      return true
    const generation = ++skillLoadGeneration
    isLoadingSkills.value = true
    skillsError.value = null
    try {
      const catalog = await options.api.skills.list(projectId)
      if (generation !== skillLoadGeneration)
        return false
      skills.value = catalog
      loadedSkillsProjectId = projectId
      return true
    }
    catch (error) {
      skillsError.value = resolveLocalChatErrorMessage(error, options.language.value)
      return false
    }
    finally {
      if (generation === skillLoadGeneration)
        isLoadingSkills.value = false
    }
  }

  async function loadConnectors(): Promise<boolean> {
    isLoadingConnectors.value = true
    connectorsError.value = null
    try {
      connectors.value = await options.api.connectors.list()
      return true
    }
    catch (error) {
      connectorsError.value = resolveLocalChatErrorMessage(error, options.language.value)
      return false
    }
    finally {
      isLoadingConnectors.value = false
    }
  }

  async function saveConnector(input: {
    config: LocalConnectorConfig
    credential: LocalConnectorCredentialMutation
  }) {
    try {
      connectors.value = await options.api.connectors.upsert(input)
      return true
    }
    catch (error) {
      connectorsError.value = resolveLocalChatErrorMessage(error, options.language.value)
      return false
    }
  }

  async function removeConnector(connectorId: string) {
    try {
      await options.api.connectors.remove(connectorId)
      await loadConnectors()
      return true
    }
    catch (error) {
      connectorsError.value = resolveLocalChatErrorMessage(error, options.language.value)
      return false
    }
  }

  async function trustConnector(connectorId: string) {
    try {
      await options.api.connectors.trust(connectorId)
      await loadConnectors()
      return true
    }
    catch (error) {
      connectorsError.value = resolveLocalChatErrorMessage(error, options.language.value)
      return false
    }
  }

  async function setConnectorCredential(connectorId: string, credential: LocalConnectorCredential) {
    try {
      await options.api.connectors.setCredential(connectorId, credential)
      await loadConnectors()
      return true
    }
    catch (error) {
      connectorsError.value = resolveLocalChatErrorMessage(error, options.language.value)
      return false
    }
  }

  async function clearConnectorCredential(connectorId: string) {
    try {
      await options.api.connectors.clearCredential(connectorId)
      await loadConnectors()
      return true
    }
    catch (error) {
      connectorsError.value = resolveLocalChatErrorMessage(error, options.language.value)
      return false
    }
  }

  return {
    clearConnectorCredential,
    connectors: readonly(connectors),
    connectorsError: readonly(connectorsError),
    isLoadingConnectors: readonly(isLoadingConnectors),
    isLoadingSkills: readonly(isLoadingSkills),
    language: options.language,
    loadConnectors,
    loadSkills,
    removeConnector,
    saveConnector,
    setConnectorCredential,
    skills: readonly(skills),
    skillsError: readonly(skillsError),
    trustConnector,
  }
}

export type LocalCapabilitiesStore = ReturnType<typeof useLocalCapabilitiesStore>
