import type { LocalChangeSetDetail, LocalChangeSetSummary } from '@buddy-shared/changes/changeApi'
import { computed, readonly, shallowRef, watch } from 'vue'

interface ChangePreviewOptions {
  changeSet: () => LocalChangeSetSummary
  getDetail: () => (changeSetId: string) => Promise<LocalChangeSetDetail>
}

export function useChangePreview(options: ChangePreviewOptions) {
  const detail = shallowRef<LocalChangeSetDetail | null>(null)
  const failed = shallowRef(false)
  const loading = shallowRef(true)
  const selectedFileId = shallowRef<string | null>(null)
  const selectedFile = computed(() => detail.value?.files.find(file => file.id === selectedFileId.value)
    ?? detail.value?.files[0] ?? null)

  watch([
    () => options.changeSet().changeSetId,
    () => options.changeSet().updatedAt,
    options.getDetail,
  ], async ([changeSetId, , getDetail], previous, onCleanup) => {
    let active = true
    onCleanup(() => {
      active = false
    })
    if (changeSetId !== previous?.[0]) {
      detail.value = null
      selectedFileId.value = null
    }
    failed.value = false
    loading.value = detail.value === null
    try {
      const result = await getDetail(changeSetId)
      if (!active)
        return
      detail.value = result
      selectedFileId.value = selectedFile.value?.id ?? null
    }
    catch {
      if (active)
        failed.value = true
    }
    finally {
      if (active)
        loading.value = false
    }
  }, { immediate: true, flush: 'sync' })

  function selectFile(fileId: string) {
    if (detail.value?.files.some(file => file.id === fileId))
      selectedFileId.value = fileId
  }

  return { detail: readonly(detail), failed: readonly(failed), loading: readonly(loading), selectedFile: readonly(selectedFile), selectFile }
}
