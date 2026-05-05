<script setup lang="ts">
import type { DocumentShareProjection } from '@haohaoxue/samepage-contracts'
import { useDocumentShareStatusEntry } from '../composables/useDocumentShareStatusEntry'

const props = defineProps<{
  documentId: string
  share: DocumentShareProjection | null
  canOpen: boolean
}>()
const emits = defineEmits<{
  openShare: [documentId: string]
}>()

const {
  iconName,
  isInherited,
  isShared,
  statusLabel,
  targetDocumentId,
} = useDocumentShareStatusEntry({
  documentId: () => props.documentId,
  share: () => props.share,
})

function openShareDialog() {
  if (!targetDocumentId.value) {
    return
  }

  emits('openShare', targetDocumentId.value)
}
</script>

<template>
  <ElButton
    text
    class="document-share-status-entry"
    :class="{ 'is-shared': isShared, 'is-inherited': isInherited }"
    :disabled="!props.documentId || !props.canOpen"
    @click="openShareDialog"
  >
    <span class="document-share-status-entry__content">
      <span class="document-share-status-entry__icon-shell">
        <SvgIcon
          category="ui"
          :icon="iconName"
          size="14px"
        />
      </span>

      <span class="document-share-status-entry__label">
        {{ statusLabel }}
      </span>
    </span>
  </ElButton>
</template>

<style scoped lang="scss">
.document-share-status-entry {
  --share-entry-color: var(--brand-text-secondary);
  --share-entry-border-color: color-mix(in srgb, var(--brand-border-base) 78%, transparent);
  --share-entry-bg-color: color-mix(in srgb, white 82%, var(--brand-bg-base));
  --share-entry-hover-color: var(--brand-text-primary);
  --share-entry-hover-border-color: color-mix(in srgb, var(--brand-primary) 24%, transparent);
  --share-entry-hover-bg-color: color-mix(in srgb, var(--brand-primary) 6%, white);
  --el-button-text-color: var(--share-entry-color);
  --el-button-hover-text-color: var(--share-entry-hover-color);
  --el-button-active-text-color: var(--share-entry-hover-color);
  --el-button-border-color: var(--share-entry-border-color);
  --el-button-hover-border-color: var(--share-entry-hover-border-color);
  --el-button-active-border-color: var(--share-entry-hover-border-color);
  --el-button-bg-color: var(--share-entry-bg-color);
  --el-button-hover-bg-color: var(--share-entry-hover-bg-color);
  --el-button-active-bg-color: var(--share-entry-hover-bg-color);
  min-height: 2rem;
  padding: 0 0.8rem;
  border: 1px solid var(--share-entry-border-color);
  border-radius: 999px;
  background: var(--share-entry-bg-color);
  color: var(--share-entry-color);
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    color 0.2s ease;

  &:hover,
  &:focus-visible {
    color: var(--share-entry-hover-color);
    border-color: var(--share-entry-hover-border-color);
    background: var(--share-entry-hover-bg-color);
  }

  &.is-shared {
    --share-entry-color: var(--brand-primary);
    --share-entry-border-color: color-mix(in srgb, var(--brand-primary) 26%, transparent);
    --share-entry-bg-color: color-mix(in srgb, var(--brand-primary) 8%, white);
  }

  &.is-inherited {
    --share-entry-color: color-mix(in srgb, var(--brand-primary) 68%, var(--brand-text-secondary));
    --share-entry-border-color: color-mix(in srgb, var(--brand-primary) 18%, transparent);
    --share-entry-bg-color: color-mix(in srgb, var(--brand-primary) 4%, white);
  }

  .document-share-status-entry__content {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
  }

  .document-share-status-entry__icon-shell {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 0.95rem;
    height: 0.95rem;
  }

  .document-share-status-entry__label {
    font-size: 13px;
    font-weight: 600;
    line-height: 1;
  }
}
</style>
