import type { ChatTranscriptRow } from './chatTranscriptProjection'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import dayjs from 'dayjs'
import { translateBuddy } from '@/i18n/buddyI18n'
import 'dayjs/locale/zh-cn'

export interface ChatTranscriptDayDividerRow {
  createdAt: string
  key: string
  kind: 'day-divider'
}

export type ChatTranscriptDisplayRow = ChatTranscriptDayDividerRow | ChatTranscriptRow

export function projectChatTranscriptDisplayRows(
  rows: ReadonlyArray<ChatTranscriptRow>,
): ChatTranscriptDisplayRow[] {
  const displayRows: ChatTranscriptDisplayRow[] = []
  let previousDayKey: string | null = null

  for (const row of rows) {
    if (row.kind === 'message') {
      const dayKey = dayjs(row.message.createdAt).format('YYYY-MM-DD')
      if (dayKey !== previousDayKey) {
        displayRows.push({
          createdAt: row.message.createdAt,
          key: `day:${dayKey}`,
          kind: 'day-divider',
        })
        previousDayKey = dayKey
      }
    }
    displayRows.push(row)
  }

  return displayRows
}

export function formatChatDayDividerLabel(
  value: string,
  locale: BuddyLocale,
  now = Date.now(),
): string {
  const time = localizedDayjs(value, locale)
  const today = dayjs(now)
  if (time.isSame(today, 'day'))
    return translateBuddy(locale, 'desktop.chat.time.today')
  if (time.isSame(today.subtract(1, 'day'), 'day'))
    return translateBuddy(locale, 'desktop.chat.time.yesterday')
  if (time.isSame(today, 'year'))
    return time.format(locale === 'zh-CN' ? 'M月D日 dddd' : 'MMM D, dddd')
  return time.format(locale === 'zh-CN' ? 'YYYY年M月D日 dddd' : 'MMM D, YYYY dddd')
}

export function formatChatMessageTimeLabel(
  value: string,
): string {
  return dayjs(value).format('HH:mm')
}

function localizedDayjs(value: string, locale: BuddyLocale) {
  return dayjs(value).locale(locale === 'zh-CN' ? 'zh-cn' : 'en')
}
