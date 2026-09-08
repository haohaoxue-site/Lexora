import type { LocalChatApi } from '@buddy-electron/shared/localChatApi'
import type { LocalConnector, LocalConnectorConfig, LocalConnectorCredential, LocalConnectorCredentialMutation } from '@buddy-shared/connectors/connectorApi'
import type { LocalSkillCatalog } from '@buddy-shared/skills/skillApi'
import type { Ref } from 'vue'
import type { BuddyLocale } from '@/i18n/buddyI18n'

export interface LocalCapabilitiesOptions {
  api: Pick<LocalChatApi, 'connectors' | 'skills'>
  language: Readonly<Ref<BuddyLocale>>
}

export interface ConnectorSaveInput {
  config: LocalConnectorConfig
  credential: LocalConnectorCredentialMutation
}

export interface SkillCatalogStore {
  skills: Readonly<Ref<LocalSkillCatalog>>
  isLoadingSkills: Readonly<Ref<boolean>>
  skillsError: Readonly<Ref<string | null>>
  loadSkills: (spaceId?: string | null) => Promise<boolean>
  refreshSkills: (spaceId?: string | null) => Promise<boolean>
  dispose: () => void
}

export interface ConnectorSettingsStore {
  connectors: Readonly<Ref<readonly LocalConnector[]>>
  connectorsError: Readonly<Ref<string | null>>
  isLoadingConnectors: Readonly<Ref<boolean>>
  isMutatingConnectors: Readonly<Ref<boolean>>
  loadConnectors: () => Promise<boolean>
  saveConnector: (input: ConnectorSaveInput) => Promise<boolean>
  removeConnector: (connectorId: string) => Promise<boolean>
  trustConnector: (connectorId: string) => Promise<boolean>
  setConnectorCredential: (connectorId: string, credential: LocalConnectorCredential) => Promise<boolean>
  clearConnectorCredential: (connectorId: string) => Promise<boolean>
  dispose: () => void
}

export interface LocalCapabilitiesStore extends SkillCatalogStore, ConnectorSettingsStore {
  language: Readonly<Ref<BuddyLocale>>
}

export interface DesktopLocalSettingsCapability extends LocalCapabilitiesStore {
  spaceId: Readonly<Ref<string | null>>
}
