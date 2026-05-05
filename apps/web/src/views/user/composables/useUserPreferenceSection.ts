import { APPEARANCE_PREFERENCE_VALUES, LANGUAGE_PREFERENCE_VALUES } from '@haohaoxue/samepage-contracts'
import { formatAppearancePreference, formatLanguagePreference } from '@haohaoxue/samepage-shared'

export function useUserPreferenceSection() {
  return {
    appearanceOptions: APPEARANCE_PREFERENCE_VALUES,
    formatAppearancePreference,
    formatLanguagePreference,
    languageOptions: LANGUAGE_PREFERENCE_VALUES,
  }
}
