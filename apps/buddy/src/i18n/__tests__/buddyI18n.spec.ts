import type { BuddyI18nKey } from '../buddyI18n'
import { describe, expect, it } from 'vitest'
import { shallowRef } from 'vue'
import { BUDDY_LOCALES, resolveBuddyLocale, translateBuddy, useBuddyI18n } from '../buddyI18n'
import enUS from '../locales/en-US'
import zhCN from '../locales/zh-CN'

describe('buddy localization', () => {
  it('keeps the same keys and interpolation arguments in both languages', () => {
    expect(Object.keys(enUS).sort()).toEqual(Object.keys(zhCN).sort())
    for (const key of Object.keys(zhCN) as BuddyI18nKey[]) {
      const parameters = (template: string) => [...template.matchAll(/\{(\w+)\}/g)]
        .map(match => match[1])
        .sort()
      expect(parameters(enUS[key]), key).toEqual(parameters(zhCN[key]))
    }
  })

  it.each([
    ['en', 'en-US'],
    [' EN-gb ', 'en-US'],
    ['en-US', 'en-US'],
    ['zh-CN', 'zh-CN'],
    ['zh-TW', 'zh-CN'],
    ['de-DE', 'zh-CN'],
    ['', 'zh-CN'],
  ])('resolves %j to %s', (input, expected) => {
    expect(resolveBuddyLocale(input)).toBe(expected)
  })

  it('interpolates zero and text without discarding unprovided arguments', () => {
    expect(translateBuddy('zh-CN', 'desktop.chat.contextUsageUsed', { used: 0, total: '128K' }))
      .toBe('已使用 0 / 128K')
    expect(translateBuddy('en-US', 'desktop.chat.contextUsageUsed', { used: 0 }))
      .toBe('0 of {total} used')
    expect(translateBuddy('zh-CN', 'common.detectedVersion', { version: '' }))
      .toBe('已识别 ')
    expect(BUDDY_LOCALES.map(locale => translateBuddy(locale, 'common.missing')))
      .toEqual(['-', '-'])
  })

  it('keeps the existing reactive translation entry synchronized with the language source', () => {
    const language = shallowRef('zh-CN')
    const { locale, t, languageOptions } = useBuddyI18n(() => language.value)

    expect(t('common.cancel')).toBe('取消')
    language.value = 'en-GB'
    expect(locale.value).toBe('en-US')
    expect(t('common.cancel')).toBe('Cancel')
    language.value = 'unsupported'
    expect(locale.value).toBe('zh-CN')
    expect(t('common.cancel')).toBe('取消')
    expect(languageOptions.value).toEqual([
      { label: '中文', value: 'zh-CN' },
      { label: 'English', value: 'en-US' },
    ])
  })
})
