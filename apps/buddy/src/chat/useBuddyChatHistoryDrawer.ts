import type { MaybeRefOrGetter } from 'vue'
import type {
  BuddyChatConversationListItem,
  BuddyChatProjectListItem,
  BuddyChatWorkspaceTarget,
} from '@/chat/buddyChatWorkspace'
import { computed, shallowRef, toValue } from 'vue'
import {
  formatBuddyConversationRelativeTime,
  resolveDrawerConversationStatus,
} from '@/chat/buddyChatWorkspace'

export type BuddyHistoryDrawerSection = 'conversations' | 'projects'

export function useBuddyChatHistoryDrawer(options: {
  language: MaybeRefOrGetter<string>
  projectItems: MaybeRefOrGetter<ReadonlyArray<BuddyChatProjectListItem>>
  target: MaybeRefOrGetter<BuddyChatWorkspaceTarget>
}) {
  const collapsedSections = shallowRef<ReadonlyArray<BuddyHistoryDrawerSection>>([])
  const expandedProjectRoots = shallowRef<ReadonlyArray<string>>([])

  const projectRootByConversationId = computed(() => {
    const entries = new Map<string, string>()
    for (const project of toValue(options.projectItems)) {
      for (const conversation of project.conversations)
        entries.set(conversation.id, project.root)
    }

    return entries
  })

  const currentProjectRoot = computed(() => {
    const target = toValue(options.target)
    if (target.kind === 'draft')
      return target.scope === 'project' ? target.projectRoot : null
    if (target.kind === 'conversation')
      return projectRootByConversationId.value.get(target.conversationId) ?? null

    return null
  })

  function isExpanded(projectRoot: string) {
    return expandedProjectRoots.value.includes(projectRoot)
  }

  function toggleProject(projectRoot: string) {
    expandedProjectRoots.value = isExpanded(projectRoot)
      ? expandedProjectRoots.value.filter(root => root !== projectRoot)
      : [
          ...expandedProjectRoots.value,
          projectRoot,
        ]
  }

  function isSectionExpanded(section: BuddyHistoryDrawerSection) {
    return !collapsedSections.value.includes(section)
  }

  function toggleSection(section: BuddyHistoryDrawerSection) {
    collapsedSections.value = isSectionExpanded(section)
      ? [
          ...collapsedSections.value,
          section,
        ]
      : collapsedSections.value.filter(item => item !== section)
  }

  function resolveConversationMeta(conversation: BuddyChatConversationListItem) {
    const status = resolveDrawerConversationStatus(conversation.latestRunStatus)
    if (status === 'running' || status === 'failed')
      return status

    return formatBuddyConversationRelativeTime(conversation.updatedAt, toValue(options.language))
  }

  return {
    currentProjectRoot,
    isExpanded,
    isSectionExpanded,
    resolveConversationMeta,
    toggleProject,
    toggleSection,
  }
}
