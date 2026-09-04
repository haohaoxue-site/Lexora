<script setup lang="ts">
import type { LocalArtifact, LocalArtifactText } from '@buddy-electron/shared/localChatApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { NSpin } from 'naive-ui'
import { computed, shallowRef, watch } from 'vue'
import { materialFolderIconUrls } from '@/assets/file-icons/materialFileIcons'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import BuddyFileIcon from '@/ui/files/BuddyFileIcon.vue'
import BuddyImagePreview from '@/ui/media/BuddyImagePreview.vue'

const props = withDefaults(defineProps<{
  artifact: LocalArtifact
  language: BuddyLocale
  readArtifactText: (artifactId: string) => Promise<LocalArtifactText>
  showToolbar?: boolean
}>(), {
  showToolbar: true,
})

const { t } = useBuddyI18n(() => props.language)
const previewFailed = shallowRef(false)
const previewIndex = shallowRef(0)
const previewOpen = shallowRef(false)
const textPreview = shallowRef<LocalArtifactText | null>(null)
const textPreviewFailed = shallowRef(false)
const textPreviewLoading = shallowRef(false)
let textLoadGeneration = 0
const previewUrl = computed(() => (
  props.artifact.kind === 'file'
  && props.artifact.mimeType.startsWith('image/')
  && !previewFailed.value
    ? `lexora-artifact://preview/${encodeURIComponent(props.artifact.artifactId)}?v=${encodeURIComponent(props.artifact.updatedAt)}`
    : null
))
const previewSources = computed(() => previewUrl.value ? [previewUrl.value] : [])
const textPreviewable = computed(() => (
  props.artifact.kind === 'file' && isTextMimeType(props.artifact.mimeType)
))
const detail = computed(() => props.artifact.kind === 'directory'
  ? t('desktop.context.directory')
  : [
      resolveFileType(props.artifact),
      formatFileSize(props.artifact.sizeBytes),
      formatDate(props.artifact.updatedAt, props.language),
    ].join(' · '))

watch(
  () => [props.artifact.artifactId, props.artifact.updatedAt] as const,
  async ([artifactId]) => {
    previewFailed.value = false
    previewIndex.value = 0
    previewOpen.value = false
    textPreview.value = null
    textPreviewFailed.value = false
    textPreviewLoading.value = false
    const generation = ++textLoadGeneration
    if (!textPreviewable.value)
      return
    textPreviewLoading.value = true
    try {
      const result = await props.readArtifactText(artifactId)
      if (generation === textLoadGeneration)
        textPreview.value = result
    }
    catch {
      if (generation === textLoadGeneration)
        textPreviewFailed.value = true
    }
    finally {
      if (generation === textLoadGeneration)
        textPreviewLoading.value = false
    }
  },
  { immediate: true },
)

function openPreview() {
  if (previewUrl.value)
    previewOpen.value = true
}

function resolveFileType(artifact: LocalArtifact): string {
  const extension = artifact.name.split('.').at(-1)
  if (extension && extension !== artifact.name && /^[a-z0-9]{1,8}$/i.test(extension))
    return extension.toUpperCase()
  return artifact.mimeType.split('/').at(-1)?.split(/[.+-]/)[0]?.toUpperCase() || 'FILE'
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

function formatDate(value: string, locale: BuddyLocale): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function isTextMimeType(mimeType: string): boolean {
  return mimeType.startsWith('text/') || [
    'application/json',
    'application/toml',
    'application/xml',
    'application/yaml',
  ].includes(mimeType)
}
</script>

<template>
  <section class="desktop-artifact-context-surface">
    <BuddyImagePreview
      v-model:current="previewIndex"
      v-model:show="previewOpen"
      :language="language"
      :sources="previewSources"
    />
    <header v-if="showToolbar" class="desktop-artifact-context-surface__toolbar">
      <div>
        <strong>{{ artifact.name }}</strong>
        <small>{{ artifact.path }}</small>
      </div>
      <span>{{ detail }}</span>
    </header>
    <div class="desktop-artifact-context-surface__viewport">
      <button
        v-if="previewUrl"
        class="desktop-artifact-context-surface__preview-trigger"
        type="button"
        :aria-label="t('desktop.imagePreview.open', { name: artifact.name })"
        @click="openPreview"
      >
        <img
          :alt="artifact.name"
          :src="previewUrl"
          @error="previewFailed = true"
        >
      </button>
      <div v-else-if="textPreviewLoading" class="desktop-artifact-context-surface__fallback">
        <NSpin size="small" />
        <span>{{ t('common.loading') }}</span>
      </div>
      <pre
        v-else-if="textPreview"
        class="desktop-artifact-context-surface__text"
      ><code>{{ textPreview.text }}</code></pre>
      <div v-else class="desktop-artifact-context-surface__fallback">
        <img
          v-if="artifact.kind === 'directory'"
          alt=""
          class="desktop-artifact-context-surface__folder-icon"
          draggable="false"
          :src="materialFolderIconUrls.collapsed"
        >
        <BuddyFileIcon v-else :name="artifact.name" size="preview" />
        <strong>{{ artifact.name }}</strong>
        <span v-if="artifact.kind === 'directory'" class="desktop-artifact-context-surface__path">
          {{ artifact.path }}
        </span>
        <span v-else>{{ t(textPreviewFailed ? 'desktop.context.previewLoadFailed' : 'desktop.context.previewUnavailable') }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.desktop-artifact-context-surface {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  background: var(--buddy-surface-base);
}

.desktop-artifact-context-surface__toolbar {
  display: flex;
  height: var(--buddy-context-toolbar-height);
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid var(--buddy-border-subtle);
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

.desktop-artifact-context-surface__viewport {
  display: grid;
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: auto;
  background: var(--buddy-surface-subtle);
  padding: 1rem;
  place-items: center;
}

.desktop-artifact-context-surface__preview-trigger {
  display: grid;
  max-width: 100%;
  max-height: 100%;
  place-items: center;
  border: 0;
  background: transparent;
  cursor: zoom-in;
  padding: 0;
}

.desktop-artifact-context-surface__preview-trigger:focus-visible {
  outline: 2px solid var(--buddy-focus-ring);
  outline-offset: 3px;
}

.desktop-artifact-context-surface__folder-icon {
  width: 4rem;
  height: 4rem;
  object-fit: contain;
}

.desktop-artifact-context-surface__preview-trigger img {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.desktop-artifact-context-surface__fallback {
  display: grid;
  max-width: 24rem;
  justify-items: center;
  gap: 0.5rem;
  color: var(--buddy-text-muted);
  text-align: center;
}

.desktop-artifact-context-surface__fallback strong {
  color: var(--buddy-text-primary);
  font-size: 0.82rem;
}

.desktop-artifact-context-surface__fallback span {
  font-size: 0.75rem;
}

.desktop-artifact-context-surface__fallback .desktop-artifact-context-surface__path {
  max-width: 100%;
  font-family: var(--buddy-font-mono, ui-monospace, monospace);
  overflow-wrap: anywhere;
}

.desktop-artifact-context-surface__text {
  align-self: stretch;
  justify-self: stretch;
  min-width: 0;
  margin: 0;
  overflow: auto;
  border: 1px solid var(--buddy-border-subtle);
  border-radius: var(--buddy-radius-micro);
  background: var(--buddy-surface-base);
  color: var(--buddy-text-primary);
  font-family: var(--buddy-font-mono, ui-monospace, monospace);
  font-size: 0.75rem;
  line-height: 1.65;
  padding: 0.875rem;
  tab-size: 2;
  white-space: pre;
}
</style>
