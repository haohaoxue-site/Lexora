import type { DocumentShareProjection } from '@haohaoxue/samepage-contracts'
import type { MaybeRefOrGetter } from 'vue'
import { DOCUMENT_SHARE_MODE } from '@haohaoxue/samepage-contracts'
import {
  getDocumentShareProjectionIconName,
  getDocumentShareProjectionMode,
  getDocumentShareProjectionModeLabel,
} from '@haohaoxue/samepage-shared'
import { computed, toValue } from 'vue'

/**
 * 分享状态入口参数。
 */
interface UseDocumentShareStatusEntryOptions {
  documentId: MaybeRefOrGetter<string>
  share: MaybeRefOrGetter<DocumentShareProjection | null | undefined>
}

export function useDocumentShareStatusEntry(options: UseDocumentShareStatusEntryOptions) {
  const documentId = computed(() => toValue(options.documentId).trim())
  const share = computed(() => toValue(options.share) ?? null)
  const localPolicy = computed(() => share.value?.localPolicy ?? null)
  const effectivePolicy = computed(() => share.value?.effectivePolicy ?? null)
  const effectiveMode = computed(() => getDocumentShareProjectionMode(share.value))
  const isInherited = computed(() => !localPolicy.value && Boolean(effectivePolicy.value))
  const isShared = computed(() => effectiveMode.value !== DOCUMENT_SHARE_MODE.NONE)
  const targetDocumentId = computed(() => documentId.value)
  const statusLabel = computed(() => getDocumentShareProjectionModeLabel(share.value))
  const iconName = computed(() => getDocumentShareProjectionIconName(share.value))

  return {
    iconName,
    isInherited,
    isShared,
    statusLabel,
    targetDocumentId,
  }
}
