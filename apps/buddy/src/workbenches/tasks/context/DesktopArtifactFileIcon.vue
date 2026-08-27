<script setup lang="ts">
import {
  Code16Regular,
  Document16Regular,
  DocumentPdf16Regular,
  Image16Regular,
  Table16Regular,
} from '@vicons/fluent'
import { NIcon } from 'naive-ui'
import { computed } from 'vue'

const props = defineProps<{
  mimeType: string
  name: string
}>()

type ArtifactFileKind = 'code' | 'document' | 'image' | 'pdf' | 'table'

const fileKind = computed<ArtifactFileKind>(() => {
  const extension = props.name.split('.').at(-1)?.toLowerCase()
  if (props.mimeType.startsWith('image/'))
    return 'image'
  if (props.mimeType === 'application/pdf' || extension === 'pdf')
    return 'pdf'
  if (
    props.mimeType.includes('spreadsheet')
    || props.mimeType === 'text/csv'
    || ['csv', 'tsv', 'xls', 'xlsx'].includes(extension ?? '')
  ) {
    return 'table'
  }
  if (
    props.mimeType === 'application/json'
    || props.mimeType.includes('javascript')
    || props.mimeType.includes('typescript')
    || ['css', 'html', 'js', 'json', 'jsx', 'ts', 'tsx', 'vue', 'xml', 'yaml', 'yml'].includes(extension ?? '')
  ) {
    return 'code'
  }
  return 'document'
})
const icon = computed(() => ({
  code: Code16Regular,
  document: Document16Regular,
  image: Image16Regular,
  pdf: DocumentPdf16Regular,
  table: Table16Regular,
})[fileKind.value])
</script>

<template>
  <NIcon
    class="desktop-artifact-file-icon"
    :class="`is-${fileKind}`"
    :component="icon"
  />
</template>

<style scoped>
.desktop-artifact-file-icon {
  width: 1rem;
  height: 1rem;
  flex: none;
  font-size: 1rem;
}

.desktop-artifact-file-icon.is-image {
  color: var(--buddy-data-blue);
}

.desktop-artifact-file-icon.is-pdf {
  color: var(--buddy-status-danger-text);
}

.desktop-artifact-file-icon.is-table {
  color: var(--buddy-status-success-text);
}

.desktop-artifact-file-icon.is-code {
  color: var(--buddy-data-violet);
}

.desktop-artifact-file-icon.is-document {
  color: var(--buddy-accent-text);
}
</style>
