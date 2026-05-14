import type { DocumentVersionSnapshot } from '@haohaoxue/samepage-contracts'
import type { Dayjs } from 'dayjs'
import type {
  ActiveDocumentDetail,
  DocumentHistoryEntry,
  DocumentHistoryGroup,
  DocumentHistorySection,
} from '../typing'
import { DOCUMENT_VERSION_SNAPSHOT_SOURCE } from '@haohaoxue/samepage-contracts'
import {
  getDocumentVersionSnapshotTitlePlainText,
  isSameDocumentVersionSnapshotContent,
} from '@haohaoxue/samepage-shared'
import dayjs from '@/utils/dayjs'

export function getDocumentHistoryEntryDetail(entry: DocumentHistoryEntry): string | null {
  if (entry.summary) {
    return entry.summary
  }

  if (entry.changeCount > 1) {
    return `本分钟内编辑 ${entry.changeCount} 次`
  }

  return null
}

export function buildDocumentHistorySections(options: {
  document: ActiveDocumentDetail | null
  snapshots: DocumentVersionSnapshot[]
  now?: Dayjs
}): DocumentHistorySection[] {
  if (!options.document || options.snapshots.length === 0) {
    return []
  }

  const now = options.now ?? dayjs()
  const currentContent = {
    schemaVersion: options.document.schemaVersion,
    title: options.document.title,
    body: options.document.body,
  }
  const snapshotById = new Map(options.snapshots.map(snapshot => [snapshot.id, snapshot]))
  const minuteEntries = collapseSnapshotsByMinute({
    currentContent,
    currentProjectionRevision: options.document.currentProjectionRevision,
    snapshots: options.snapshots,
    snapshotById,
  })

  const todayEntries = minuteEntries.filter(entry => dayjs(entry.snapshot.createdAt).isSame(now, 'day'))
  const yesterdayEntries = minuteEntries.filter(entry => dayjs(entry.snapshot.createdAt).isSame(now.subtract(1, 'day'), 'day'))
  const lastWeekEntries = minuteEntries.filter((entry) => {
    const snapshotTime = dayjs(entry.snapshot.createdAt)
    return snapshotTime.isAfter(now.startOf('day').subtract(7, 'day'))
      && !snapshotTime.isSame(now, 'day')
      && !snapshotTime.isSame(now.subtract(1, 'day'), 'day')
  })
  const olderEntries = minuteEntries.filter((entry) => {
    const snapshotTime = dayjs(entry.snapshot.createdAt)
    return !snapshotTime.isAfter(now.startOf('day').subtract(7, 'day'))
      && !snapshotTime.isSame(now, 'day')
      && !snapshotTime.isSame(now.subtract(1, 'day'), 'day')
  })

  const sections: DocumentHistorySection[] = []

  if (todayEntries.length > 0) {
    const recentUpdateEntries = todayEntries.filter(
      entry => entry.snapshot.source !== DOCUMENT_VERSION_SNAPSHOT_SOURCE.RESTORE,
    )
    const todayRestoreEntries = todayEntries.filter(
      entry => entry.snapshot.source === DOCUMENT_VERSION_SNAPSHOT_SOURCE.RESTORE,
    )
    const groups: DocumentHistoryGroup[] = []

    if (recentUpdateEntries.length > 0) {
      groups.push({
        id: 'today-recent-updates',
        label: '最近更新',
        entries: recentUpdateEntries,
        collapsible: true,
        defaultExpanded: true,
      })
    }

    for (const entry of todayRestoreEntries) {
      groups.push({
        id: `today-${entry.snapshotId}`,
        label: '',
        entries: [entry],
        collapsible: false,
        defaultExpanded: true,
      })
    }

    sections.push({
      id: 'today',
      label: '今天',
      groups,
    })
  }

  if (yesterdayEntries.length > 0) {
    sections.push({
      id: 'yesterday',
      label: '昨天',
      groups: groupEntriesByTimeBucket({
        entries: yesterdayEntries,
        mode: 'hour',
      }),
    })
  }

  if (lastWeekEntries.length > 0) {
    sections.push({
      id: 'last-week',
      label: '上周',
      groups: groupEntriesByTimeBucket({
        entries: lastWeekEntries,
        mode: 'day',
      }),
    })
  }

  sections.push(...buildMonthSections(olderEntries))

  return sections
}

function collapseSnapshotsByMinute(options: {
  currentContent: Pick<DocumentVersionSnapshot, 'schemaVersion' | 'title' | 'body'>
  currentProjectionRevision: number
  snapshots: DocumentVersionSnapshot[]
  snapshotById: Map<string, DocumentVersionSnapshot>
}): DocumentHistoryEntry[] {
  const minuteGroups: DocumentVersionSnapshot[][] = []

  for (const snapshot of options.snapshots) {
    const minuteKey = dayjs(snapshot.createdAt).startOf('minute').valueOf()
    const lastGroup = minuteGroups.at(-1)

    if (lastGroup && dayjs(lastGroup[0].createdAt).startOf('minute').valueOf() === minuteKey) {
      lastGroup.push(snapshot)
      continue
    }

    minuteGroups.push([snapshot])
  }

  return minuteGroups.map((group, index) => {
    const snapshot = group[0]
    const previousSnapshot = minuteGroups[index + 1]?.[0] ?? null

    return {
      snapshotId: snapshot.id,
      snapshot,
      timeLabel: formatHistoryTime(snapshot.createdAt),
      summary: resolveHistoryEntrySummary(snapshot, previousSnapshot, options.snapshotById),
      userDisplayName: snapshot.createdByUser?.displayName ?? '未知用户',
      changeCount: group.length,
      isCurrentSnapshot: snapshot.basedOnProjectionRevision === options.currentProjectionRevision,
      isCurrentContent: isSameDocumentVersionSnapshotContent(options.currentContent, snapshot),
    }
  })
}

function resolveHistoryEntrySummary(
  snapshot: DocumentVersionSnapshot,
  previousSnapshot: DocumentVersionSnapshot | null,
  snapshotById: Map<string, DocumentVersionSnapshot>,
) {
  if (snapshot.source === DOCUMENT_VERSION_SNAPSHOT_SOURCE.RESTORE && snapshot.restoredFromVersionSnapshotId) {
    const restoredFromSnapshot = snapshotById.get(snapshot.restoredFromVersionSnapshotId)

    if (!restoredFromSnapshot) {
      return '还原了历史版本'
    }

    return `还原自 ${formatHistoryTime(restoredFromSnapshot.createdAt)} 的版本`
  }

  if (!previousSnapshot) {
    return null
  }

  const nextTitle = getDocumentVersionSnapshotTitlePlainText(snapshot)
  const previousTitle = getDocumentVersionSnapshotTitlePlainText(previousSnapshot)

  if (nextTitle && nextTitle !== previousTitle) {
    return `文档命名为${nextTitle}`
  }

  return null
}

function groupEntriesByTimeBucket(options: {
  entries: DocumentHistoryEntry[]
  mode: 'hour' | 'day'
}): DocumentHistoryGroup[] {
  const groups = new Map<string, DocumentHistoryEntry[]>()

  for (const entry of options.entries) {
    const bucketKey = options.mode === 'hour'
      ? dayjs(entry.snapshot.createdAt).startOf('hour').toISOString()
      : dayjs(entry.snapshot.createdAt).startOf('day').toISOString()
    const currentEntries = groups.get(bucketKey) ?? []
    currentEntries.push(entry)
    groups.set(bucketKey, currentEntries)
  }

  return Array.from(groups.entries()).map(([bucketKey, entries]) => ({
    id: bucketKey,
    label: options.mode === 'hour'
      ? formatHourBucketLabel(bucketKey)
      : formatDayBucketLabel(bucketKey),
    entries,
    collapsible: true,
    defaultExpanded: false,
  }))
}

function buildMonthSections(entries: DocumentHistoryEntry[]): DocumentHistorySection[] {
  const sections = new Map<string, DocumentHistoryEntry[]>()

  for (const entry of entries) {
    const sectionKey = dayjs(entry.snapshot.createdAt).startOf('month').toISOString()
    const currentEntries = sections.get(sectionKey) ?? []
    currentEntries.push(entry)
    sections.set(sectionKey, currentEntries)
  }

  return Array.from(sections.entries()).map(([sectionKey, sectionEntries]) => ({
    id: sectionKey,
    label: dayjs(sectionKey).format('M月'),
    groups: groupEntriesByTimeBucket({
      entries: sectionEntries,
      mode: 'day',
    }),
  }))
}

function formatHistoryTime(value: string) {
  return dayjs(value).format('M月D日 HH:mm')
}

function formatHourBucketLabel(value: string) {
  const time = dayjs(value)
  return `${time.format('M月D日 HH')}点`
}

function formatDayBucketLabel(value: string) {
  return dayjs(value).format('M月D日')
}
