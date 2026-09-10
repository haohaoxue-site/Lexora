import type { ChatAgentActivityGroup } from './chatAgentActivities'
import type { ChatToolCategory, ChatToolIcon } from './chatToolRegistry'
import type { BuddyI18nKey, BuddyLocale } from '@/i18n/buddyI18n'
import { translateBuddy } from '@/i18n/buddyI18n'
import { describeChatTool } from './chatToolDisplay'
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
  key: string
  label: string
  target: string
  icon: ChatToolIcon | 'reasoning'
  active: boolean
  immediate: boolean
}

export function summarizeChatActivity(group: ChatAgentActivityGroup, language: BuddyLocale): ChatActivitySummary {
  const active = group.activeNode
  if (active?.kind === 'tool') {
    const display = describeChatTool(active, language)
    return {
      key: `${language}:${active.id}:${active.status}`,
      label: active.status === 'awaiting_approval' ? display.status : display.label,
      target: active.status === 'awaiting_approval' ? [display.label, display.target].filter(Boolean).join(' · ') : display.target,
      icon: display.icon,
      active: true,
      immediate: active.status === 'awaiting_approval',
    }
  }
  if (active?.kind === 'reasoning') {
    return { key: `${language}:${active.id}`, label: translateBuddy(language, 'desktop.chat.processReasoningRunning'), target: reasoningPreview(active.text), icon: 'reasoning', active: true, immediate: false }
  }
  const reasoning = group.nodes.findLast(node => node.kind === 'reasoning')
  return {
    key: `${language}:completed`,
    label: group.counts.length
      ? summarizeChatActivityCounts(group, language)
      : translateBuddy(language, 'desktop.chat.processReasoningDone'),
    target: group.toolCount === 0 && reasoning?.kind === 'reasoning' ? reasoningPreview(reasoning.text) : '',
    icon: group.icon,
    active: false,
    immediate: true,
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
