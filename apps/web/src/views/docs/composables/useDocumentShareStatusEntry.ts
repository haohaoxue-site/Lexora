import { DOCUMENT_SHARE_MODE } from '@haohaoxue/samepage-contracts'
import {
  getDocumentShareProjectionIconName,
  getDocumentShareProjectionMode,
  getDocumentShareProjectionModeLabel,
} from '@haohaoxue/samepage-shared'
import { computed } from 'vue'
import { useActiveDocument } from './useActiveDocument'
import { useDocsShareDialog } from './useDocsShareDialog'

export function useDocumentShareStatusEntry() {
  const { currentDocument } = useActiveDocument()
  const { canOpenShareDialog, openDocumentShareDialog } = useDocsShareDialog()

  const documentId = computed(() => currentDocument.value?.id ?? '')
  const share = computed(() => currentDocument.value?.share ?? null)
  const localPolicy = computed(() => share.value?.localPolicy ?? null)
  const effectivePolicy = computed(() => share.value?.effectivePolicy ?? null)
  const effectiveMode = computed(() => getDocumentShareProjectionMode(share.value))
  const isInherited = computed(() => !localPolicy.value && Boolean(effectivePolicy.value))
  const isShared = computed(() => effectiveMode.value !== DOCUMENT_SHARE_MODE.NONE)
  const statusLabel = computed(() => getDocumentShareProjectionModeLabel(share.value))
  const iconName = computed(() => getDocumentShareProjectionIconName(share.value))
  const isDisabled = computed(() => !documentId.value || !canOpenShareDialog.value)

  function handleOpenShareDialog() {
    if (!documentId.value) {
      return
    }

    openDocumentShareDialog(documentId.value)
  }

  return {
    documentId,
    handleOpenShareDialog,
    iconName,
    isDisabled,
    isInherited,
    isShared,
    statusLabel,
  }
}
