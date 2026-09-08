import type { LocalCapabilitiesOptions, LocalCapabilitiesStore } from './typing'
import { useConnectorSettings } from './useConnectorSettings'
import { useSkillCatalog } from './useSkillCatalog'

export function useLocalCapabilitiesStore(options: LocalCapabilitiesOptions): LocalCapabilitiesStore {
  const skills = useSkillCatalog(options)
  const connectors = useConnectorSettings(options)
  return {
    ...skills,
    ...connectors,
    language: options.language,
    dispose() {
      skills.dispose()
      connectors.dispose()
    },
  }
}
