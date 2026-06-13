import type {
  AppearancePreference,
  LanguagePreference,
  ResolvedAppearancePreference,
  ResolvedLanguagePreference,
  UserCollabIdentity,
} from '@haohaoxue/samepage-contracts'
import { USER_CODE_REGEX } from '@haohaoxue/samepage-contracts/identity/constants'
import {
  APPEARANCE_PREFERENCE,
  APPEARANCE_PREFERENCE_LABELS,
  LANGUAGE_PREFERENCE,
  LANGUAGE_PREFERENCE_LABELS,
} from '@haohaoxue/samepage-contracts/user/constants'

export function formatLanguagePreference(value: LanguagePreference): string {
  return LANGUAGE_PREFERENCE_LABELS[value]
}

export function formatAppearancePreference(value: AppearancePreference): string {
  return APPEARANCE_PREFERENCE_LABELS[value]
}

export function resolveAppearancePreference(
  value: AppearancePreference,
  systemValue: ResolvedAppearancePreference,
): ResolvedAppearancePreference {
  return value === APPEARANCE_PREFERENCE.AUTO ? systemValue : value
}

export function resolveLanguagePreference(
  value: LanguagePreference,
  preferredLanguages: readonly string[],
): ResolvedLanguagePreference {
  if (value !== LANGUAGE_PREFERENCE.AUTO) {
    return value
  }

  for (const preferredLanguage of preferredLanguages) {
    if (isChineseLanguage(preferredLanguage)) {
      return LANGUAGE_PREFERENCE.ZH_CN
    }

    if (isEnglishLanguage(preferredLanguage)) {
      return LANGUAGE_PREFERENCE.EN_US
    }
  }

  return LANGUAGE_PREFERENCE.EN_US
}

export function normalizeUserCodeQuery(value: string): string {
  return value.trim().toUpperCase()
}

function isChineseLanguage(value: string): boolean {
  const normalized = value.trim().toLowerCase()

  return normalized === 'zh' || normalized.startsWith('zh-') || normalized.startsWith('zh_')
}

function isEnglishLanguage(value: string): boolean {
  const normalized = value.trim().toLowerCase()

  return normalized === 'en' || normalized.startsWith('en-') || normalized.startsWith('en_')
}

export function isExactUserCodeQuery(value: string): boolean {
  return USER_CODE_REGEX.test(value.trim())
}

export function resolveCollabIdentityDisambiguator(
  identity: Pick<UserCollabIdentity, 'email' | 'userCode'>,
): string {
  return identity.email?.trim() || identity.userCode
}

export function formatCollabIdentityLabel(
  identity: Pick<UserCollabIdentity, 'displayName' | 'email' | 'userCode'>,
): string {
  return `${identity.displayName} · ${resolveCollabIdentityDisambiguator(identity)}`
}
