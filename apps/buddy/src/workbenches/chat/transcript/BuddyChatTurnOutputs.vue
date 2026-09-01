<script setup lang="ts">
import type { LocalArtifact } from '@buddy-electron/shared/localChatApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { Document20Regular, Open20Regular } from '@vicons/fluent'
import { NIcon, NScrollbar } from 'naive-ui'
import { computed, shallowRef, useTemplateRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'

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
const outputViews = computed(() => props.artifacts.map(artifact => ({
  artifact,
  fileType: resolveFileType(artifact),
  previewable: artifact.mimeType.startsWith('image/')
    && !failedArtifactIds.value.has(artifact.artifactId),
  previewUrl: artifact.mimeType.startsWith('image/')
    ? `lexora-artifact://preview/${encodeURIComponent(artifact.artifactId)}`
    : null,
  size: formatFileSize(artifact.sizeBytes),
})))
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

function resolveFileType(artifact: LocalArtifact): string {
  const extension = artifact.name.split('.').at(-1)
  if (extension && extension !== artifact.name && /^[a-z0-9]{1,8}$/i.test(extension))
    return extension.toUpperCase()
  const subtype = artifact.mimeType.split('/').at(-1)?.split(/[.+-]/)[0]
  return subtype?.slice(0, 8).toUpperCase() || 'FILE'
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024)
    return `${sizeBytes} B`
  const units = ['KB', 'MB', 'GB'] as const
  let value = sizeBytes / 1024
  let unit: typeof units[number] = units[0]
  for (const candidate of units.slice(1)) {
    if (value < 1024)
      break
    value /= 1024
    unit = candidate
  }
  return `${Number(value.toFixed(value >= 10 ? 1 : 2))} ${unit}`
}
</script>

<template>
  <section class="buddy-chat-turn-outputs" data-testid="chat-turn-outputs">
    <header class="buddy-chat-turn-outputs__heading">
      <strong>{{ t('desktop.chat.turnOutputs') }}</strong>
      <small>{{ artifacts.length }}</small>
    </header>
    <div
      ref="scrollRoot"
      class="buddy-chat-turn-outputs__scroll"
      @wheel="handleWheel"
    >
      <NScrollbar
        class="buddy-chat-turn-outputs__scrollbar"
        trigger="hover"
        x-scrollable
      >
        <div class="buddy-chat-turn-outputs__grid">
          <button
            v-for="view in outputViews"
            :key="view.artifact.artifactId"
            class="buddy-chat-turn-output"
            type="button"
            @click="emit('openArtifact', view.artifact.artifactId)"
          >
            <div
              class="buddy-chat-turn-output__preview"
              :class="{ 'is-contain': view.artifact.mimeType === 'image/svg+xml' }"
            >
              <img
                v-if="view.previewable"
                :alt="view.artifact.name"
                loading="lazy"
                :src="view.previewUrl ?? undefined"
                @error="markPreviewFailed(view.artifact.artifactId)"
              >
              <NIcon v-else :component="Document20Regular" />
            </div>
            <div class="buddy-chat-turn-output__meta">
              <span class="buddy-chat-turn-output__type">{{ view.fileType }}</span>
              <span class="buddy-chat-turn-output__name">{{ view.artifact.name }}</span>
              <span class="buddy-chat-turn-output__size">{{ view.size }}</span>
              <NIcon :component="Open20Regular" class="buddy-chat-turn-output__open" />
            </div>
          </button>
        </div>
      </NScrollbar>
    </div>
  </section>
</template>

<style scoped lang="scss">
.buddy-chat-turn-outputs {
  display: grid;
  width: 100%;
  min-width: 0;
  gap: var(--buddy-chat-gap-tight);
}

.buddy-chat-turn-outputs__heading {
  display: flex;
  align-items: center;
  gap: 0.4rem;

  strong {
    color: var(--buddy-text-strong);
    font-size: var(--buddy-chat-meta-font-size);
    font-weight: 650;
  }

  small {
    color: var(--buddy-text-muted);
    font-size: var(--buddy-chat-caption-font-size);
    font-weight: 400;
  }
}

.buddy-chat-turn-outputs__scroll {
  min-width: 0;
  overflow: hidden;
}

:deep(.buddy-chat-turn-outputs__scrollbar) {
  width: 100%;
}

.buddy-chat-turn-outputs__grid {
  display: grid;
  width: max-content;
  grid-auto-columns: 17rem;
  grid-auto-flow: column;
  gap: 0.625rem;
  padding: 0.125rem 0.125rem 0.5rem;
}

.buddy-chat-turn-output {
  display: grid;
  overflow: hidden;
  min-width: 0;
  border: 1px solid var(--buddy-accent-border);
  border-radius: var(--buddy-radius-micro);
  background: var(--buddy-surface-raised);
  box-shadow: var(--buddy-shadow-soft);
  color: inherit;
  font: inherit;
  padding: 0;
  text-align: left;

  cursor: pointer;

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

.buddy-chat-turn-output__preview {
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

  :deep(.n-icon) {
    width: 1.5rem;
    height: 1.5rem;
  }
}

.buddy-chat-turn-output__meta {
  display: grid;
  min-width: 0;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 0.45rem;
  padding: 0.5rem 0.625rem;
}

.buddy-chat-turn-output__type {
  color: var(--buddy-accent-text);
  font-size: var(--buddy-chat-caption-font-size);
  font-weight: 650;
}

.buddy-chat-turn-output__name {
  overflow: hidden;
  color: var(--buddy-text-strong);
  font-size: var(--buddy-chat-caption-font-size);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buddy-chat-turn-output__size {
  color: var(--buddy-text-muted);
  font-size: var(--buddy-chat-caption-font-size);
  white-space: nowrap;
}

.buddy-chat-turn-output__open {
  width: 1rem;
  height: 1rem;
  color: var(--buddy-chat-meta-color);
}
</style>
