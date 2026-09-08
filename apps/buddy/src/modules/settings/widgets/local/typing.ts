import type { LocalConnector } from '@buddy-shared/connectors/connectorApi'
import type { LocalSkillCatalog } from '@buddy-shared/skills/skillApi'
import type { ConnectorSaveInput } from '../../state/typing'
import type { BuddyLocale } from '@/i18n/buddyI18n'

export interface SkillsSettingsProps {
  catalog: LocalSkillCatalog
  error: string | null
  language: BuddyLocale
  loading: boolean
}

export interface ConnectorsSettingsProps {
  busy: boolean
  connectors: readonly LocalConnector[]
  error: string | null
  language: BuddyLocale
  saveConnector: (input: ConnectorSaveInput) => Promise<boolean>
}

export interface ConnectorsSettingsEmits {
  clearCredential: [connectorId: string]
  remove: [connectorId: string]
  trust: [connectorId: string]
}
