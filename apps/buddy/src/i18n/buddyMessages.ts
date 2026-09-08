import enUS from './locales/en-US'
import zhCN from './locales/zh-CN'

export type BuddyI18nKey = keyof typeof zhCN

export const BUDDY_LOCALES = ['zh-CN', 'en-US'] as const
export type BuddyLocale = typeof BUDDY_LOCALES[number]

const buddyMessages = {
  'en-US': enUS,
  'zh-CN': zhCN,
} satisfies Record<BuddyLocale, Record<BuddyI18nKey, string>>

export type BuddyTranslate = (
  key: BuddyI18nKey,
  params?: Record<string, string | number>,
) => string

export function resolveBuddyLocale(language: string): BuddyLocale {
  const normalizedLanguage = language.trim().toLowerCase()
  if (normalizedLanguage === 'en' || normalizedLanguage.startsWith('en-'))
    return 'en-US'

  return 'zh-CN'
}

export function translateBuddy(
  locale: BuddyLocale,
  key: BuddyI18nKey,
  params: Record<string, string | number> = {},
) {
  return formatBuddyMessage(buddyMessages[locale][key], params)
}

function formatBuddyMessage(
  template: string,
  params: Record<string, string | number>,
) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key]
    return value === undefined ? match : String(value)
  })
}
