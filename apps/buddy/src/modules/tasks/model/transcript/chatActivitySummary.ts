import type { ChatAgentActivityGroup } from './chatAgentActivities'
import type { ChatToolCategory, ChatToolIcon } from './chatToolRegistry'
import type { BuddyI18nKey, BuddyLocale } from '@/i18n/buddyI18n'
import { translateBuddy } from '@/i18n/buddyI18n'
import { normalizeProcessNarration } from './chatToolPresentation'

const countLabels: Record<ChatToolCategory, BuddyI18nKey> = {
  read: 'desktop.chat.activityReadCount',
  search: 'desktop.chat.activitySearchCount',
  command: 'desktop.chat.activityCommandCount',
  create: 'desktop.chat.activityCreateCount',
  edit: 'desktop.chat.activityEditCount',
  web: 'desktop.chat.activityWebCount',
  other: 'desktop.chat.activityToolCount',
}

const fileCountLabels: Partial<Record<ChatToolCategory, BuddyI18nKey>> = {
  read: 'desktop.chat.activityReadFiles',
  create: 'desktop.chat.activityCreateFiles',
  edit: 'desktop.chat.activityEditFiles',
}

const summaryOrder: readonly ChatToolCategory[] = ['create', 'edit', 'read', 'search', 'command', 'web', 'other']

export interface ChatActivitySummary {
  label: string
  target: string
  icon: ChatToolIcon | 'reasoning'
}

export function summarizeChatActivity(group: ChatAgentActivityGroup, language: BuddyLocale): ChatActivitySummary {
  const reasoning = group.nodes.findLast(node => node.kind === 'reasoning' && node.status !== 'running')
  return {
    label: group.counts.length
      ? summarizeChatActivityCounts(group, language)
      : translateBuddy(language, reasoning?.status === 'interrupted' ? 'desktop.chat.processReasoningInterrupted' : 'desktop.chat.processReasoningDone'),
    target: group.toolCount === 0 && reasoning?.kind === 'reasoning' ? reasoningPreview(reasoning.text) : '',
    icon: group.icon,
  }
}

export function summarizeChatActivityCounts(group: ChatAgentActivityGroup, language: BuddyLocale, limit = 3): string {
  const counts = group.counts.toSorted((left, right) => summaryOrder.indexOf(left.category) - summaryOrder.indexOf(right.category))
  const labels = counts.slice(0, limit).map(({ category, count, files }) => {
    const fileLabel = fileCountLabels[category]
    return files !== null && fileLabel
      ? translateBuddy(language, fileLabel, { count: files })
      : translateBuddy(language, countLabels[category], { count })
  })
  const remaining = counts.slice(limit).reduce((total, entry) => total + entry.count, 0)
  if (remaining)
    labels.push(translateBuddy(language, 'desktop.chat.activityMoreCalls', { count: remaining }))
  return labels.join(' · ')
}

export function reasoningPreview(text: string): string {
  const line = text.trim().split('\n', 1)[0] ?? ''
  return normalizeProcessNarration(line.slice(0, 240))
}
