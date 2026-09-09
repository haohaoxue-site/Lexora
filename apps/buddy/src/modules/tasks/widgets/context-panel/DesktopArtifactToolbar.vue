<script setup lang="ts">
import type { LocalArtifact } from '@buddy-shared/artifacts/artifactApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { formatDate, formatFileSize, resolveFileType } from './artifactContextPresentation'

const props = defineProps<{ artifact: LocalArtifact, language: BuddyLocale }>()
const { t } = useBuddyI18n(() => props.language)
const detail = computed(() => props.artifact.kind === 'directory'
  ? t('desktop.context.directory')
  : [
      resolveFileType(props.artifact),
      formatFileSize(props.artifact.sizeBytes),
      formatDate(props.artifact.updatedAt, props.language),
    ].join(' · '))
</script>

<template>
  <header class="desktop-artifact-context-surface__toolbar">
    <div>
      <strong>{{ artifact.name }}</strong>
      <small>{{ artifact.path }}</small>
    </div>
    <span>{{ detail }}</span>
  </header>
</template>

<style scoped>
.desktop-artifact-context-surface__toolbar {
  display: flex;
  width: 100%;
  height: var(--buddy-context-toolbar-height);
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0 0.75rem;
}

.desktop-artifact-context-surface__toolbar div {
  display: grid;
  min-width: 0;
  gap: 0.1rem;
}

.desktop-artifact-context-surface__toolbar strong,
.desktop-artifact-context-surface__toolbar small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.desktop-artifact-context-surface__toolbar strong {
  color: var(--buddy-text-strong);
  font-size: 0.8rem;
  font-weight: 600;
}

.desktop-artifact-context-surface__toolbar small {
  color: var(--buddy-text-muted);
  font-family: var(--buddy-font-mono, ui-monospace, monospace);
  font-size: 0.68rem;
}

.desktop-artifact-context-surface__toolbar span {
  flex: none;
  color: var(--buddy-text-muted);
  font-size: 0.7rem;
  white-space: nowrap;
}
</style>
