<script setup lang="ts">
import type { LocalArtifact } from '@buddy-shared/artifacts/artifactApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { Open20Regular } from '@vicons/fluent'
import { computed, shallowRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { formatArtifactFileSize, resolveArtifactFileType } from '@/modules/tasks/model/artifacts/artifactPresentation'
import { FileIcon, FolderIcon } from '@/shared/ui/file-icon'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'

const props = defineProps<{
  artifact: LocalArtifact
  language: BuddyLocale
  compact?: boolean
}>()
const emit = defineEmits<{
  openArtifact: [artifactId: string]
}>()
const { t } = useBuddyI18n(() => props.language)
const failedPreviewUrl = shallowRef<string | null>(null)
const previewUrl = computed(() => props.artifact.kind === 'file' && props.artifact.mimeType.startsWith('image/')
  ? `lexora-artifact://preview/${encodeURIComponent(props.artifact.artifactId)}?v=${encodeURIComponent(props.artifact.updatedAt)}`
  : null)
const previewable = computed(() => previewUrl.value !== null && failedPreviewUrl.value !== previewUrl.value)
const fileType = computed(() => props.artifact.kind === 'directory'
  ? t('desktop.context.directory')
  : resolveArtifactFileType(props.artifact))
const detail = computed(() => props.artifact.kind === 'directory'
  ? props.artifact.path
  : `${formatArtifactFileSize(props.artifact.sizeBytes)} · ${props.artifact.path}`)
</script>

<template>
  <button
    class="buddy-artifact-collection__item"
    :class="{ 'is-directory': artifact.kind === 'directory', 'is-compact': compact }"
    type="button"
    :title="artifact.name"
    @click="emit('openArtifact', artifact.artifactId)"
  >
    <div
      class="buddy-artifact-collection__preview"
      :class="{
        'is-contain': artifact.mimeType === 'image/svg+xml',
      }"
    >
      <FolderIcon
        v-if="artifact.kind === 'directory'"
        class="buddy-artifact-collection__directory-icon"
      />
      <img
        v-else-if="previewable"
        :alt="artifact.name"
        class="buddy-artifact-collection__image"
        loading="lazy"
        draggable="false"
        :src="previewUrl ?? undefined"
        @error="failedPreviewUrl = previewUrl"
      >
      <FileIcon v-else :name="artifact.name" size="preview" />
    </div>
    <div class="buddy-artifact-collection__meta">
      <span class="buddy-artifact-collection__type">{{ fileType }}</span>
      <span class="buddy-artifact-collection__name">{{ artifact.name }}</span>
      <span class="buddy-artifact-collection__detail">{{ detail }}</span>
      <DesktopIcon :component="Open20Regular" class="buddy-artifact-collection__open" />
    </div>
  </button>
</template>

<style scoped lang="scss">
.buddy-artifact-collection__item {
  display: grid;
  overflow: hidden;
  min-width: 0;
  border: 1px solid var(--buddy-accent-border);
  border-radius: var(--buddy-radius-micro);
  background: var(--buddy-surface-raised);
  box-shadow: var(--buddy-shadow-soft);
  color: inherit;
  cursor: pointer;
  font: inherit;
  padding: 0;
  text-align: left;

  &:hover {
    border-color: var(--buddy-accent-solid);
    background: var(--buddy-accent-surface-subtle);
    box-shadow: var(--buddy-shadow-raised);
  }

  &:focus-visible {
    outline: 2px solid var(--buddy-focus-ring);
    outline-offset: 2px;
  }
}

.buddy-artifact-collection__preview {
  display: grid;
  height: 7rem;
  place-items: center;
  overflow: hidden;
  border-bottom: 1px solid var(--buddy-border-subtle);
  background: var(--buddy-accent-surface-subtle);
  color: var(--buddy-text-muted);

  .buddy-artifact-collection__image {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &.is-contain .buddy-artifact-collection__image {
    object-fit: contain;
    padding: 0.5rem;
  }
}

.buddy-artifact-collection__directory-icon {
  width: 3.25rem;
  height: 3.25rem;
  object-fit: contain;
}

.buddy-artifact-collection__meta {
  display: grid;
  min-width: 0;
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-areas:
    'type name open'
    'detail detail open';
  align-items: center;
  gap: 0.2rem 0.45rem;
  padding: 0.5rem 0.625rem;
}

.buddy-artifact-collection__type {
  grid-area: type;
  color: var(--buddy-accent-text);
  font-size: var(--buddy-chat-caption-font-size);
  font-weight: 650;
}

.buddy-artifact-collection__name {
  overflow: hidden;
  grid-area: name;
  color: var(--buddy-text-strong);
  font-size: var(--buddy-chat-caption-font-size);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buddy-artifact-collection__detail {
  overflow: hidden;
  grid-area: detail;
  color: var(--buddy-text-muted);
  font-family: var(--buddy-font-mono, ui-monospace, monospace);
  font-size: var(--buddy-chat-caption-font-size);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buddy-artifact-collection__open {
  width: 1rem;
  height: 1rem;
  grid-area: open;
  color: var(--buddy-chat-meta-color);
}

.buddy-artifact-collection__item.is-compact {
  flex: 0 1 96px;
  width: 96px;
  max-width: 96px;
  height: 68px;
  grid-template-rows: 40px minmax(0, 1fr);

  .buddy-artifact-collection__preview {
    height: auto;

    :deep(.buddy-file-icon),
    .buddy-artifact-collection__directory-icon {
      width: 1.75rem;
      height: 1.75rem;
    }
  }

  .buddy-artifact-collection__meta {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: 'name';
    padding: 3px 6px;
  }

  .buddy-artifact-collection__name {
    font-size: 10px;
  }

  .buddy-artifact-collection__type,
  .buddy-artifact-collection__detail,
  .buddy-artifact-collection__open {
    display: none;
  }
}
</style>
