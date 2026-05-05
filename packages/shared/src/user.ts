import type {
  AppearancePreference,
  LanguagePreference,
  ResolvedAppearancePreference,
  UserCollabIdentity,
} from '@haohaoxue/samepage-contracts'
import {
  APPEARANCE_PREFERENCE,
  APPEARANCE_PREFERENCE_LABELS,
  LANGUAGE_PREFERENCE_LABELS,
  USER_CODE_REGEX,
} from '@haohaoxue/samepage-contracts'

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

export function normalizeUserCodeQuery(value: string): string {
  return value.trim().toUpperCase()
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
