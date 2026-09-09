<script setup lang="ts">
import type { editor } from 'monaco-editor/editor/editor.api.js'
import type { ChangeFilePresentation } from './changeContextPresentation'
import type { ObserveChangeFile } from './useChangeFileViewport'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { ChevronDown16Regular, ChevronRight16Regular } from '@vicons/fluent'
import { computed, shallowRef, useTemplateRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { FileIcon } from '@/shared/ui/file-icon'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'
import DesktopMonacoDiff from './DesktopMonacoDiff.vue'

const props = defineProps<{ file: ChangeFilePresentation, collapsed: boolean, observe: ObserveChangeFile, language: BuddyLocale, wrap: boolean, sideBySide: boolean }>()
defineEmits<{ toggle: [] }>()
const { t } = useBuddyI18n(() => props.language)
const root = useTemplateRef<HTMLElement>('root')
const visible = shallowRef(false)
const contentHeight = shallowRef(160)
const viewState = shallowRef<editor.IDiffEditorViewState | null>(null)
watch(root, (element, _previous, onCleanup) => {
  if (element)
    onCleanup(props.observe(element, value => visible.value = value))
}, { flush: 'post' })
watch(() => [props.file.path, props.file.beforeText, props.file.afterText], () => viewState.value = null)
const counts = computed(() => props.file.lineCounts)
const parentPath = computed(() => props.file.path.includes('/') ? props.file.path.slice(0, props.file.path.lastIndexOf('/') + 1) : '')
const fileName = computed(() => props.file.path.slice(parentPath.value.length))
</script>

<template>
  <article ref="root" class="desktop-change-file-block" :data-change-id="file.id">
    <button class="desktop-change-file-block__header" type="button" :aria-expanded="!collapsed" @click="$emit('toggle')">
      <DesktopIcon :component="collapsed ? ChevronRight16Regular : ChevronDown16Regular" />
      <FileIcon :name="file.path" />
      <span class="desktop-change-file-block__path" :title="file.path">
        <span v-if="parentPath" class="desktop-change-file-block__directory">{{ parentPath }}</span>
        <span class="desktop-change-file-block__filename">{{ fileName }}</span>
      </span>
      <span v-if="counts" class="desktop-change-file-block__counts"><span class="is-added">+{{ counts.added }}</span><span class="is-deleted">-{{ counts.deleted }}</span></span>
    </button>
    <template v-if="!collapsed">
      <DesktopMonacoDiff v-if="file.preview === 'text' && visible" :before="file.beforeText ?? ''" :after="file.afterText ?? ''" :language="file.language" :path="file.path" :wrap="wrap" :side-by-side="sideBySide" :initial-height="contentHeight" :view-state="viewState" fit-content @height="contentHeight = $event" @view-state="viewState = $event">
        <template #loading>
          {{ t('desktop.context.editorLoading') }}
        </template>
        <template #error>
          {{ t('desktop.context.editorLoadFailed') }}
        </template>
      </DesktopMonacoDiff>
      <div v-else-if="file.preview === 'text'" class="desktop-change-file-block__placeholder" :style="{ height: `${contentHeight}px` }" />
      <div v-else class="desktop-change-file-block__unavailable">
        {{ t(`desktop.context.changePreview.${file.preview}`) }}
      </div>
      <div v-if="file.redacted" class="desktop-change-file-block__redacted">
        {{ t('desktop.context.changeRedacted') }}
      </div>
    </template>
  </article>
</template>

<style scoped>
.desktop-change-file-block { min-width: 0; flex: none; overflow: hidden; border: 1px solid var(--buddy-border-strong); border-radius: 8px; background: var(--buddy-surface-base); }
.desktop-change-file-block__header { display: flex; width: 100%; min-width: 0; min-height: 42px; align-items: center; gap: 8px; padding: 8px 12px; border: 0; background: var(--buddy-surface-subtle); color: var(--buddy-text-primary); cursor: pointer; text-align: left; }
.desktop-change-file-block__header[aria-expanded='true'] { border-bottom: 1px solid var(--buddy-border-subtle); }
.desktop-change-file-block__header:hover { background: var(--buddy-state-hover); }
.desktop-change-file-block__header:focus-visible { outline: 2px solid var(--buddy-focus-ring); outline-offset: -2px; }
.desktop-change-file-block__path { display: flex; min-width: 0; flex: 1; font-family: var(--buddy-font-mono); font-size: 12px; white-space: nowrap; }
.desktop-change-file-block__directory { min-width: 0; overflow: hidden; color: var(--buddy-text-muted); text-overflow: ellipsis; }
.desktop-change-file-block__filename { min-width: 0; flex: 0 0 auto; max-width: 100%; overflow: hidden; font-weight: 500; text-overflow: ellipsis; }
.desktop-change-file-block__counts { display: flex; flex: none; gap: 5px; font-family: var(--buddy-font-mono); font-size: 11px; font-weight: 500; }
.is-added { color: var(--buddy-status-success-text); }
.is-deleted { color: var(--buddy-status-danger-text); }
.desktop-change-file-block__placeholder { background: var(--buddy-surface-base); }
.desktop-change-file-block__unavailable { display: grid; min-height: 100px; padding: 16px; place-content: center; color: var(--buddy-text-muted); font-size: 12px; }
.desktop-change-file-block__redacted { padding: 6px 12px; color: var(--buddy-text-muted); font-size: 11px; }
</style>
