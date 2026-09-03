<script setup lang="ts">
import type { LocalArtifact } from '@buddy-electron/shared/localChatApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { Open20Regular } from '@vicons/fluent'
import { NIcon, NScrollbar } from 'naive-ui'
import { computed, shallowRef, useTemplateRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import BuddyFileIcon from '@/ui/files/BuddyFileIcon.vue'
import { formatArtifactFileSize, resolveArtifactFileType } from './artifactPresentation'

const props = defineProps<{
  artifacts: ReadonlyArray<LocalArtifact>
  language: BuddyLocale
}>()
const emit = defineEmits<{
  openArtifact: [artifactId: string]
}>()

const { t } = useBuddyI18n(() => props.language)
const scrollRoot = useTemplateRef<HTMLElement>('scrollRoot')
const failedArtifactIds = shallowRef<ReadonlySet<string>>(new Set())
const outputViews = computed(() => props.artifacts.map((artifact) => {
  const deleted = artifact.deletedAt !== null
  const image = artifact.mimeType.startsWith('image/')
  return {
    artifact,
    deleted,
    detail: deleted
      ? t('desktop.chat.artifactDeleted')
      : formatArtifactFileSize(artifact.sizeBytes),
    fileType: resolveArtifactFileType(artifact),
    previewable: image && !deleted && !failedArtifactIds.value.has(artifact.artifactId),
    previewUrl: image && !deleted
      ? `lexora-artifact://preview/${encodeURIComponent(artifact.artifactId)}?v=${encodeURIComponent(artifact.updatedAt)}`
      : null,
  }
}))

function markPreviewFailed(artifactId: string) {
  failedArtifactIds.value = new Set([...failedArtifactIds.value, artifactId])
}

function handleWheel(event: WheelEvent) {
  if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY))
    return
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
    class="buddy-artifact-gallery__scroll"
    @wheel="handleWheel"
  >
    <NScrollbar class="buddy-artifact-gallery__scrollbar" trigger="hover" x-scrollable>
      <div class="buddy-artifact-gallery__grid">
        <button
          v-for="view in outputViews"
          :key="view.artifact.artifactId"
          class="buddy-artifact-gallery__item"
          :class="{ 'is-deleted': view.deleted }"
          :data-change-type="view.artifact.changeType"
          :disabled="view.deleted"
          type="button"
          @click="emit('openArtifact', view.artifact.artifactId)"
        >
          <div
            class="buddy-artifact-gallery__preview"
            :class="{ 'is-contain': view.artifact.mimeType === 'image/svg+xml' }"
          >
            <img
              v-if="view.previewable"
              :alt="view.artifact.name"
              loading="lazy"
              :src="view.previewUrl ?? undefined"
              @error="markPreviewFailed(view.artifact.artifactId)"
            >
            <BuddyFileIcon v-else :name="view.artifact.name" size="preview" />
          </div>
          <div class="buddy-artifact-gallery__meta">
            <span class="buddy-artifact-gallery__type">{{ view.fileType }}</span>
            <span class="buddy-artifact-gallery__name">{{ view.artifact.name }}</span>
            <span class="buddy-artifact-gallery__detail">{{ view.detail }}</span>
            <NIcon
              v-if="!view.deleted"
              :component="Open20Regular"
              class="buddy-artifact-gallery__open"
            />
          </div>
        </button>
      </div>
    </NScrollbar>
  </div>
</template>

<style scoped lang="scss">
.buddy-artifact-gallery__scroll {
  min-width: 0;
  overflow: hidden;
}

:deep(.buddy-artifact-gallery__scrollbar) {
  width: 100%;
}

.buddy-artifact-gallery__grid {
  display: grid;
  width: max-content;
  grid-auto-columns: 17rem;
  grid-auto-flow: column;
  gap: 0.625rem;
  padding: 0.125rem 0.125rem 0.5rem;
}

.buddy-artifact-gallery__item {
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

  &.is-deleted {
    border-color: var(--buddy-border-subtle);
    box-shadow: none;
    cursor: default;
    opacity: 0.62;
  }
}

.buddy-artifact-gallery__preview {
  display: grid;
  height: 7rem;
  place-items: center;
  overflow: hidden;
  border-bottom: 1px solid var(--buddy-border-subtle);
  background: var(--buddy-accent-surface-subtle);
  color: var(--buddy-text-muted);

  img {
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

.buddy-artifact-gallery__meta {
  display: grid;
  min-width: 0;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 0.45rem;
  padding: 0.5rem 0.625rem;
}

.buddy-artifact-gallery__type {
  color: var(--buddy-accent-text);
  font-size: var(--buddy-chat-caption-font-size);
  font-weight: 650;
}

.buddy-artifact-gallery__name {
  overflow: hidden;
  color: var(--buddy-text-strong);
  font-size: var(--buddy-chat-caption-font-size);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.is-deleted .buddy-artifact-gallery__name {
  text-decoration: line-through;
}

.buddy-artifact-gallery__detail {
  color: var(--buddy-text-muted);
  font-size: var(--buddy-chat-caption-font-size);
  white-space: nowrap;
}

.buddy-artifact-gallery__open {
  width: 1rem;
  height: 1rem;
  color: var(--buddy-chat-meta-color);
}
</style>
