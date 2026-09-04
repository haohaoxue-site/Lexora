<script setup lang="ts">
import type { LocalArtifact } from '@buddy-electron/shared/localChatApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { Open20Regular } from '@vicons/fluent'
import { NIcon, NScrollbar } from 'naive-ui'
import { computed, shallowRef, useTemplateRef } from 'vue'
import { materialFolderIconUrls } from '@/assets/file-icons/materialFileIcons'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import BuddyFileIcon from '@/ui/files/BuddyFileIcon.vue'
import { formatArtifactFileSize, resolveArtifactFileType } from '@/workbenches/chat/transcript/artifactPresentation'

const props = withDefaults(defineProps<{
  artifacts: ReadonlyArray<LocalArtifact>
  language: BuddyLocale
  layout?: 'grid' | 'strip'
}>(), {
  layout: 'strip',
})
const emit = defineEmits<{
  openArtifact: [artifactId: string]
}>()

const { t } = useBuddyI18n(() => props.language)
const scrollRoot = useTemplateRef<HTMLElement>('scrollRoot')
const failedArtifactIds = shallowRef<ReadonlySet<string>>(new Set())
const artifactViews = computed(() => props.artifacts.map((artifact) => {
  const image = artifact.kind === 'file' && artifact.mimeType.startsWith('image/')
  return {
    artifact,
    detail: artifact.kind === 'directory'
      ? artifact.path
      : `${formatArtifactFileSize(artifact.sizeBytes)} · ${artifact.path}`,
    fileType: artifact.kind === 'directory'
      ? t('desktop.context.directory')
      : resolveArtifactFileType(artifact),
    previewable: image && !failedArtifactIds.value.has(artifact.artifactId),
    previewUrl: image
      ? `lexora-artifact://preview/${encodeURIComponent(artifact.artifactId)}?v=${encodeURIComponent(artifact.updatedAt)}`
      : null,
  }
}))

function markPreviewFailed(artifactId: string) {
  failedArtifactIds.value = new Set([...failedArtifactIds.value, artifactId])
}

function handleWheel(event: WheelEvent) {
  if (
    props.layout !== 'strip'
    || event.ctrlKey
    || Math.abs(event.deltaX) >= Math.abs(event.deltaY)
  ) {
    return
  }
  const scrollport = findHorizontalScrollport()
  if (!scrollport)
    return
  const multiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE
    ? 16
    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ? scrollport.clientWidth
      : 1
  const nextLeft = Math.min(
    Math.max(0, scrollport.scrollLeft + event.deltaY * multiplier),
    scrollport.scrollWidth - scrollport.clientWidth,
  )
  if (Math.abs(nextLeft - scrollport.scrollLeft) < 1)
    return
  event.preventDefault()
  scrollport.scrollLeft = nextLeft
}

function findHorizontalScrollport(): HTMLElement | null {
  return [...scrollRoot.value?.querySelectorAll<HTMLElement>('*') ?? []]
    .find((element) => {
      const overflowX = getComputedStyle(element).overflowX
      return element.scrollWidth > element.clientWidth + 1
        && (overflowX === 'auto' || overflowX === 'scroll')
    }) ?? null
}
</script>

<template>
  <div
    ref="scrollRoot"
    class="buddy-artifact-collection__scroll"
    :class="`is-${layout}`"
    @wheel="handleWheel"
  >
    <NScrollbar class="buddy-artifact-collection__scrollbar" trigger="hover" x-scrollable>
      <div class="buddy-artifact-collection__items" :class="`is-${layout}`">
        <button
          v-for="view in artifactViews"
          :key="view.artifact.artifactId"
          class="buddy-artifact-collection__item"
          :class="{ 'is-directory': view.artifact.kind === 'directory' }"
          type="button"
          @click="emit('openArtifact', view.artifact.artifactId)"
        >
          <div
            class="buddy-artifact-collection__preview"
            :class="{
              'is-contain': view.artifact.mimeType === 'image/svg+xml',
            }"
          >
            <img
              v-if="view.artifact.kind === 'directory'"
              alt=""
              class="buddy-artifact-collection__directory-icon"
              draggable="false"
              :src="materialFolderIconUrls.collapsed"
            >
            <img
              v-else-if="view.previewable"
              :alt="view.artifact.name"
              loading="lazy"
              :src="view.previewUrl ?? undefined"
              @error="markPreviewFailed(view.artifact.artifactId)"
            >
            <BuddyFileIcon v-else :name="view.artifact.name" size="preview" />
          </div>
          <div class="buddy-artifact-collection__meta">
            <span class="buddy-artifact-collection__type">{{ view.fileType }}</span>
            <span class="buddy-artifact-collection__name">{{ view.artifact.name }}</span>
            <span class="buddy-artifact-collection__detail">{{ view.detail }}</span>
            <NIcon :component="Open20Regular" class="buddy-artifact-collection__open" />
          </div>
        </button>
      </div>
    </NScrollbar>
  </div>
</template>

<style scoped lang="scss">
.buddy-artifact-collection__scroll {
  min-width: 0;
  overflow: hidden;
}

:deep(.buddy-artifact-collection__scrollbar) {
  width: 100%;
}

.buddy-artifact-collection__items {
  display: grid;
  gap: 0.625rem;
  padding: 0.125rem;

  &.is-strip {
    width: max-content;
    grid-auto-columns: 17rem;
    grid-auto-flow: column;
    padding-bottom: 0.5rem;
  }

  &.is-grid {
    width: 100%;
    grid-template-columns: repeat(auto-fill, minmax(min(15rem, 100%), 1fr));
  }
}

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

  img:not(.buddy-artifact-collection__directory-icon) {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &.is-contain img {
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
</style>
