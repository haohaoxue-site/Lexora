import type { FormRules } from 'naive-ui'
import type { MaybeRefOrGetter } from 'vue'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { customProviderSchema } from '@buddy-shared/providers/providerApi'
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'

export function useProviderFormRules(language: MaybeRefOrGetter<BuddyLocale>, identifierAvailable = (_id: string) => true) {
  const { t } = useBuddyI18n(language)
  return computed<FormRules>(() => ({
    displayName: [{ trigger: ['input', 'blur'], validator: (_rule, value) => customProviderSchema.shape.displayName.safeParse(value).success || new Error(t('desktop.providers.invalidDisplayName')) }],
    api: [{ trigger: ['change', 'blur'], validator: (_rule, value) => customProviderSchema.shape.api.safeParse(value).success || new Error(t('desktop.providers.invalidApiType')) }],
    baseUrl: [{ trigger: ['input', 'blur'], validator: (_rule, value) => customProviderSchema.shape.baseUrl.safeParse(value?.trim()).success || new Error(t('desktop.providers.invalidBaseUrl')) }],
    description: [{ trigger: ['input', 'blur'], validator: (_rule, value) => customProviderSchema.shape.description.safeParse(value).success || new Error(t('desktop.providers.invalidDescription')) }],
    id: [{
      key: 'id',
      trigger: ['input', 'blur'],
      validator: (_rule, value) => {
        const parsed = customProviderSchema.shape.id.safeParse(value)
        if (!parsed.success)
          return new Error(t('desktop.providers.invalidIdentifier'))
        return identifierAvailable(parsed.data) || new Error(t('desktop.providers.identifierConflict'))
      },
    }],
  }))
}
