import type {
  DocumentVersionSnapshot,
} from '@haohaoxue/samepage-contracts'
import type { ComputedRef, ShallowRef } from 'vue'
import type { ActiveDocumentDetail } from '../typing'
import { isSameDocumentVersionSnapshotContent } from '@haohaoxue/samepage-shared'
import { computed, shallowRef, watch } from 'vue'
import {
  buildHistoryPreviewDocument,
  resolveDefaultHistorySnapshotId,
} from '../utils/documentEditor'

/**
 * 文档历史态组合参数。
 */
interface UseDocsHistoryStateOptions {
  activeDocumentId: ComputedRef<string | null>
  currentDocument: ShallowRef<ActiveDocumentDetail | null>
  snapshots: ShallowRef<DocumentVersionSnapshot[]>
  isRestoringSnapshot: ShallowRef<boolean>
  ensureSnapshotsLoaded: () => Promise<void>
  restoreSnapshot: (snapshotId: string) => Promise<void>
}

export function useDocsHistoryState({
  activeDocumentId,
  currentDocument,
  snapshots,
  isRestoringSnapshot,
  ensureSnapshotsLoaded,
  restoreSnapshot,
}: UseDocsHistoryStateOptions) {
  const isHistoryMode = shallowRef(false)
  const selectedHistorySnapshotId = shallowRef<string | null>(null)
  const currentLatestSnapshot = computed(() =>
    resolveSnapshotById(snapshots.value, currentDocument.value?.latestVersionSnapshotId ?? null),
  )
  const selectedHistorySnapshot = computed(() =>
    resolveSnapshotById(snapshots.value, selectedHistorySnapshotId.value),
  )
  const previewDocument = computed(() => buildHistoryPreviewDocument({
    document: currentDocument.value,
    snapshot: isHistoryMode.value ? selectedHistorySnapshot.value : null,
  }))
  const docsDocumentEditorMode = computed(() => isHistoryMode.value ? 'history' : 'default')
  const isSelectedSnapshotCurrentContent = computed(() => {
    if (!selectedHistorySnapshot.value) {
      return false
    }

    if (!currentLatestSnapshot.value) {
      return currentDocument.value?.latestVersionSnapshotId === selectedHistorySnapshot.value.id
    }

    return isSameDocumentVersionSnapshotContent(currentLatestSnapshot.value, selectedHistorySnapshot.value)
  })
  const canRestoreSelectedSnapshot = computed(() =>
    Boolean(selectedHistorySnapshot.value)
    && !isSelectedSnapshotCurrentContent.value
    && !isRestoringSnapshot.value,
  )

  watch(
    [currentDocument, snapshots],
    ([nextDocument, nextSnapshots]) => {
      selectedHistorySnapshotId.value = resolveDefaultHistorySnapshotId({
        document: nextDocument,
        snapshots: nextSnapshots,
        currentSelectedSnapshotId: selectedHistorySnapshotId.value,
      })
    },
    { immediate: true },
  )

  watch(
    activeDocumentId,
    (nextDocumentId, previousDocumentId) => {
      if (nextDocumentId === previousDocumentId) {
        return
      }

      isHistoryMode.value = false
    },
  )

  return {
    previewDocument,
    docsDocumentEditorMode,
    isHistoryMode,
    selectedHistorySnapshotId,
    canRestoreSelectedSnapshot,
    openHistoryMode,
    closeHistoryMode,
    selectHistorySnapshot,
    restoreSelectedSnapshot,
  }

  async function openHistoryMode() {
    if (!currentDocument.value) {
      return
    }

    isHistoryMode.value = true
    await ensureSnapshotsLoaded()
    selectedHistorySnapshotId.value = resolveDefaultHistorySnapshotId({
      document: currentDocument.value,
      snapshots: snapshots.value,
      currentSelectedSnapshotId: selectedHistorySnapshotId.value,
    })
  }

  function closeHistoryMode() {
    isHistoryMode.value = false
  }

  function selectHistorySnapshot(snapshotId: string) {
    selectedHistorySnapshotId.value = snapshotId
  }

  async function restoreSelectedSnapshot() {
    if (!selectedHistorySnapshotId.value || !canRestoreSelectedSnapshot.value) {
      return
    }

    await restoreSnapshot(selectedHistorySnapshotId.value)
    selectedHistorySnapshotId.value = resolveDefaultHistorySnapshotId({
      document: currentDocument.value,
      snapshots: snapshots.value,
      currentSelectedSnapshotId: currentDocument.value?.latestVersionSnapshotId ?? null,
    })
  }
}

function resolveSnapshotById(snapshots: DocumentVersionSnapshot[], snapshotId: string | null) {
  if (!snapshotId) {
    return null
  }

  return snapshots.find(snapshot => snapshot.id === snapshotId) ?? null
}
