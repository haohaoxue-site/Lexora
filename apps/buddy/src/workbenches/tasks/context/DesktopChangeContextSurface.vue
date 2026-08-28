<script setup lang="ts">
import type {
  LocalChangeSetDetail,
  LocalChangeSetSummary,
} from '@buddy-electron/shared/localChatApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import {
  DocumentLock20Regular,
  DocumentProhibited20Regular,
} from '@vicons/fluent'
import { NIcon, NSpin } from 'naive-ui'
import { computed, shallowRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import {
  countChangedLines,
  fileNameFromPath,
} from './changeContextPresentation'
import DesktopChangeFilePicker from './DesktopChangeFilePicker.vue'
import DesktopMonacoDiff from './DesktopMonacoDiff.vue'

const props = defineProps<{
  changeSet: LocalChangeSetSummary
  getChangeSet: (changeSetId: string) => Promise<LocalChangeSetDetail>
  language: BuddyLocale
}>()
const emit = defineEmits<{
  activeFileChange: [payload: { changeSetId: string, fileName: string | null }]
}>()

const { t } = useBuddyI18n(() => props.language)
const detail = shallowRef<LocalChangeSetDetail | null>(null)
const failed = shallowRef(false)
const loading = shallowRef(true)
const selectedFileId = shallowRef<string | null>(null)
let loadGeneration = 0

const selectedFile = computed(() => detail.value?.files.find(
  file => file.id === selectedFileId.value,
) ?? detail.value?.files[0] ?? null)
const lineCounts = computed(() => {
  const file = selectedFile.value
  return file?.preview === 'text'
    ? countChangedLines(file.beforeText ?? '', file.afterText ?? '')
    : null
})
const unavailableIcon = computed(() => (
  selectedFile.value?.preview === 'sensitive'
    ? DocumentLock20Regular
    : DocumentProhibited20Regular
))

watch(
  [() => props.changeSet.changeSetId, () => props.changeSet.updatedAt],
  async ([changeSetId]) => {
    const generation = ++loadGeneration
    failed.value = false
    loading.value = true
    detail.value = null
    selectedFileId.value = null
    try {
      const result = await props.getChangeSet(changeSetId)
      if (generation !== loadGeneration)
        return
      detail.value = result
      selectedFileId.value = result.files[0]?.id ?? null
    }
    catch {
      if (generation === loadGeneration)
        failed.value = true
    }
    finally {
      if (generation === loadGeneration)
        loading.value = false
    }
  },
  { immediate: true },
)

watch(
  [() => props.changeSet.changeSetId, () => selectedFile.value?.path ?? null],
  ([changeSetId, path]) => emit('activeFileChange', {
    changeSetId,
    fileName: path ? fileNameFromPath(path) : null,
  }),
  { immediate: true },
)
</script>

<template>
  <section class="desktop-change-context-surface">
    <header class="desktop-change-context-surface__toolbar">
      <div class="desktop-change-context-surface__overview">
        <DesktopChangeFilePicker
          v-if="detail?.files.length"
          :files="detail.files"
          :language="language"
          :selected-file-id="selectedFile?.id ?? null"
          @select-file="selectedFileId = $event"
        />
        <span
          v-if="detail?.files.length"
          class="desktop-change-context-surface__file-summary"
        >
          {{ t('desktop.context.changedFilesSummary', { count: detail.files.length }) }}
        </span>
      </div>

      <div v-if="selectedFile" class="desktop-change-context-surface__current-file">
        <strong><span>{{ selectedFile.path }}</span></strong>
        <span
          v-if="lineCounts"
          class="desktop-change-context-surface__line-counts"
          data-testid="change-line-counts"
          :aria-label="t('desktop.context.changedLines', {
            added: lineCounts.added,
            deleted: lineCounts.deleted,
          })"
        >
          <b class="is-added">+{{ lineCounts.added }}</b>
          <b class="is-deleted">-{{ lineCounts.deleted }}</b>
        </span>
      </div>
    </header>

    <div v-if="loading" class="desktop-change-context-surface__state">
      <NSpin size="small" />
      <span>{{ t('common.loading') }}</span>
    </div>
    <div v-else-if="failed" class="desktop-change-context-surface__state is-error">
      {{ t('desktop.context.changesLoadFailed') }}
    </div>
    <div v-else-if="!detail?.files.length" class="desktop-change-context-surface__state">
      {{ t('desktop.context.noCapturedChanges') }}
    </div>
    <main v-else-if="selectedFile" class="desktop-change-context-surface__preview">
      <DesktopMonacoDiff
        v-if="selectedFile.preview === 'text'"
        :after="selectedFile.afterText ?? ''"
        :before="selectedFile.beforeText ?? ''"
        :language="selectedFile.language"
        :path="selectedFile.path"
      >
        <template #loading>
          {{ t('desktop.context.editorLoading') }}
        </template>
        <template #error>
          {{ t('desktop.context.editorLoadFailed') }}
        </template>
      </DesktopMonacoDiff>
      <div v-else class="desktop-change-context-surface__unavailable">
        <span class="desktop-change-context-surface__unavailable-icon" aria-hidden="true">
          <NIcon :component="unavailableIcon" />
        </span>
        <strong>{{ t(`desktop.context.changePreview.${selectedFile.preview}`) }}</strong>
        <span v-if="selectedFile.redacted">{{ t('desktop.context.changeRedacted') }}</span>
      </div>
    </main>
  </section>
</template>

<style scoped>
.desktop-change-context-surface {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  background: var(--buddy-surface-base);
}

.desktop-change-context-surface__toolbar {
  display: flex;
  height: var(--buddy-context-toolbar-height);
  min-width: 0;
  flex: none;
  align-items: center;
  gap: 0.75rem;
  border-bottom: 1px solid var(--buddy-border-subtle);
  padding: 0 0.75rem;
}

.desktop-change-context-surface__overview,
.desktop-change-context-surface__current-file,
.desktop-change-context-surface__line-counts {
  display: flex;
  align-items: center;
}

.desktop-change-context-surface__overview {
  flex: none;
  gap: 0.4rem;
}

.desktop-change-context-surface__file-summary {
  color: var(--buddy-text-secondary);
  font-size: 0.7rem;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
}

.desktop-change-context-surface__line-counts b {
  display: block;
  font-weight: 600;
  line-height: 1;
  transform: translateY(1px);
}

.desktop-change-context-surface__line-counts .is-added {
  color: var(--buddy-status-success-text);
}

.desktop-change-context-surface__line-counts .is-deleted {
  color: var(--buddy-status-danger-text);
}

.desktop-change-context-surface__current-file {
  min-width: 0;
  align-self: stretch;
  margin-left: auto;
  gap: 0.55rem;
}

.desktop-change-context-surface__current-file > strong {
  display: flex;
  min-width: 0;
  height: 100%;
  align-items: center;
}

.desktop-change-context-surface__current-file > strong > span {
  min-width: 0;
  overflow: hidden;
  color: var(--buddy-text-primary);
  font-size: 0.73rem;
  font-weight: 600;
  line-height: 1.4;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.desktop-change-context-surface__line-counts {
  flex: none;
  align-self: stretch;
  gap: 0.32rem;
  font-family: var(--buddy-font-mono, ui-monospace, monospace);
  font-size: 0.68rem;
  line-height: 1;
}

.desktop-change-context-surface__preview {
  display: grid;
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.desktop-change-context-surface__state,
.desktop-change-context-surface__unavailable {
  display: grid;
  min-width: 0;
  min-height: 0;
  flex: 1;
  place-content: center;
  justify-items: center;
  gap: 0.5rem;
  color: var(--buddy-text-muted);
  font-size: 0.75rem;
  text-align: center;
}

.desktop-change-context-surface__unavailable {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  gap: 0.75rem;
  padding: 2rem;
}

.desktop-change-context-surface__state.is-error {
  color: var(--buddy-status-danger-text);
}

.desktop-change-context-surface__unavailable-icon {
  display: grid;
  width: 3.5rem;
  height: 3.5rem;
  place-items: center;
  border-radius: 0.75rem;
  background: var(--buddy-surface-subtle);
  color: var(--buddy-text-secondary);
}

.desktop-change-context-surface__unavailable-icon :deep(.n-icon) {
  width: 1.75rem;
  height: 1.75rem;
  font-size: 1.75rem;
}

.desktop-change-context-surface__unavailable strong {
  color: var(--buddy-text-secondary);
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.5;
}

.desktop-change-context-surface__unavailable > span:last-child:not(:first-child) {
  line-height: 1.5;
}
</style>
