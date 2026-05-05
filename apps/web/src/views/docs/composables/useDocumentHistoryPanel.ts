import type { DocumentVersionSnapshot } from '@haohaoxue/samepage-contracts'
import type {
  ComputedRef,
  MaybeRefOrGetter,
} from 'vue'
import type {
  ActiveDocumentDetail,
  DocumentHistoryEntry,
  DocumentHistoryGroup,
  DocumentHistorySection,
} from '../typing'
import {
  computed,
  shallowRef,
  toValue,
  watch,
} from 'vue'
import {
  buildDocumentHistorySections,
  getDocumentHistoryEntryDetail,
} from '../utils/documentHistory'

/**
 * 文档历史面板组合参数。
 */
interface UseDocumentHistoryPanelOptions {
  document: MaybeRefOrGetter<ActiveDocumentDetail | null>
  snapshots: MaybeRefOrGetter<DocumentVersionSnapshot[]>
  selectedSnapshotId: MaybeRefOrGetter<string | null>
  onSelect: (snapshotId: string) => void
}

/**
 * 文档历史分组展开态组合参数。
 */
interface UseDocumentHistoryGroupStateOptions {
  historySections: ComputedRef<DocumentHistorySection[]>
  selectedSnapshotId: MaybeRefOrGetter<string | null>
}

export function useDocumentHistoryPanel({
  document,
  snapshots,
  selectedSnapshotId,
  onSelect,
}: UseDocumentHistoryPanelOptions) {
  const hasDocument = computed(() => Boolean(toValue(document)))
  const historySections = computed(() => buildDocumentHistorySections({
    document: toValue(document),
    snapshots: toValue(snapshots),
  }))
  const groups = useDocumentHistoryGroupState({
    historySections,
    selectedSnapshotId,
  })

  function selectEntry(snapshotId: string) {
    onSelect(snapshotId)
    groups.expandGroupBySnapshotId(snapshotId)
  }

  function isEntrySelected(entry: DocumentHistoryEntry) {
    return toValue(selectedSnapshotId) === entry.snapshotId
  }

  return {
    hasDocument,
    historySections,
    isGroupExpanded: groups.isGroupExpanded,
    selectEntry,
    toggleGroup: groups.toggleGroup,
    isEntrySelected,
    resolveEntryDetail,
  }
}

function useDocumentHistoryGroupState({
  historySections,
  selectedSnapshotId,
}: UseDocumentHistoryGroupStateOptions) {
  const expandedGroupState = shallowRef<Record<string, boolean>>({})

  watch(
    [historySections, () => toValue(selectedSnapshotId)],
    ([nextSections, nextSelectedSnapshotId]) => {
      const nextExpandedState = buildExpandedGroupState(nextSections, expandedGroupState.value)

      if (nextSelectedSnapshotId) {
        const targetGroup = findHistoryGroupBySnapshotId(nextSections, nextSelectedSnapshotId)

        if (targetGroup?.collapsible) {
          nextExpandedState[targetGroup.id] = true
        }
      }

      expandedGroupState.value = nextExpandedState
    },
    { immediate: true },
  )

  function toggleGroup(groupId: string) {
    expandedGroupState.value = {
      ...expandedGroupState.value,
      [groupId]: !(expandedGroupState.value[groupId] ?? false),
    }
  }

  function expandGroupBySnapshotId(snapshotId: string) {
    const targetGroup = findHistoryGroupBySnapshotId(historySections.value, snapshotId)

    if (!targetGroup?.collapsible) {
      return
    }

    expandedGroupState.value = {
      ...expandedGroupState.value,
      [targetGroup.id]: true,
    }
  }

  function isGroupExpanded(group: DocumentHistoryGroup) {
    return !group.collapsible || (expandedGroupState.value[group.id] ?? group.defaultExpanded)
  }

  return {
    toggleGroup,
    expandGroupBySnapshotId,
    isGroupExpanded,
  }
}

function resolveEntryDetail(entry: DocumentHistoryEntry) {
  return getDocumentHistoryEntryDetail(entry)
}

function buildExpandedGroupState(
  sections: DocumentHistorySection[],
  currentExpandedGroupState: Record<string, boolean>,
) {
  const nextExpandedState: Record<string, boolean> = {}

  for (const section of sections) {
    for (const group of section.groups) {
      if (!group.collapsible) {
        continue
      }

      nextExpandedState[group.id] = currentExpandedGroupState[group.id] ?? group.defaultExpanded
    }
  }

  return nextExpandedState
}

function findHistoryGroupBySnapshotId(sections: DocumentHistorySection[], snapshotId: string) {
  return sections
    .flatMap(section => section.groups)
    .find(group => group.entries.some(entry => entry.snapshotId === snapshotId))
}
