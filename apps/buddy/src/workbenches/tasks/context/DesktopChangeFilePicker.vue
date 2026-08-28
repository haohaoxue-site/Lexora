<script setup lang="ts">
import type { LocalFileChangeDetail } from '@buddy-electron/shared/localChatApi'
import type {
  TreeOption,
  TreeOverrideNodeClickBehavior,
} from 'naive-ui'
import type {
  ChangeFileTreeNode,
  FileChangeType,
} from './changeContextPresentation'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { TextBulletListTree20Regular } from '@vicons/fluent'
import { NIcon, NPopover, NTree } from 'naive-ui'
import { computed, h, shallowRef, watch } from 'vue'
import {
  materialFileIconUrls,
  materialFolderIconUrls,
} from '@/assets/file-icons/materialFileIcons'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { buildChangeFileTree } from './changeContextPresentation'

const props = defineProps<{
  files: ReadonlyArray<LocalFileChangeDetail>
  language: BuddyLocale
  selectedFileId: string | null
}>()
const emit = defineEmits<{
  selectFile: [fileId: string]
}>()

const { t } = useBuddyI18n(() => props.language)
const open = shallowRef(false)
const treeData = computed(() => buildChangeFileTree(props.files))
const expandedKeys = shallowRef<Array<string | number>>([])
const expandedKeySet = computed(() => new Set(expandedKeys.value))
const selectedKeys = computed(() => props.selectedFileId ? [props.selectedFileId] : [])
const overrideNodeClick: TreeOverrideNodeClickBehavior = ({ option }) => (
  option.kind === 'directory' ? 'toggleExpand' : 'toggleSelect'
)

watch(treeData, (nodes) => {
  expandedKeys.value = collectDirectoryKeys(nodes)
}, { immediate: true })

function renderPrefix({ option }: { option: TreeOption }) {
  const node = option as ChangeFileTreeNode
  if (node.kind === 'directory') {
    const expanded = node.key !== undefined && expandedKeySet.value.has(node.key)
    return h('img', {
      'alt': '',
      'aria-hidden': 'true',
      'class': 'desktop-change-file-picker__directory-icon',
      'draggable': false,
      'src': expanded
        ? materialFolderIconUrls.expanded
        : materialFolderIconUrls.collapsed,
    })
  }
  const fileIcon = node.fileIcon ?? 'file'
  return h('img', {
    'alt': '',
    'aria-hidden': 'true',
    'class': 'desktop-change-file-picker__file-icon',
    'data-file-icon': fileIcon,
    'draggable': false,
    'src': materialFileIconUrls[fileIcon],
  })
}

function renderSuffix({ option }: { option: TreeOption }) {
  const node = option as ChangeFileTreeNode
  if (node.kind !== 'file' || !node.changeType)
    return null
  return h('span', { class: 'desktop-change-file-picker__file-meta' }, [
    node.lineCounts
      ? h('span', {
          'aria-label': t('desktop.context.changedLines', {
            added: node.lineCounts.added,
            deleted: node.lineCounts.deleted,
          }),
          'class': 'desktop-change-file-picker__line-counts',
          'role': 'img',
        }, [
          h('b', { 'aria-hidden': 'true', 'class': 'is-added' }, `+${node.lineCounts.added}`),
          h('b', { 'aria-hidden': 'true', 'class': 'is-deleted' }, `-${node.lineCounts.deleted}`),
        ])
      : null,
    renderChangeStatus(node.changeType),
  ])
}

function selectFile(keys: Array<string | number>): void {
  const fileId = keys.at(-1)
  if (typeof fileId !== 'string' || !props.files.some(file => file.id === fileId))
    return
  emit('selectFile', fileId)
  open.value = false
}

function collectDirectoryKeys(nodes: ReadonlyArray<TreeOption>): Array<string | number> {
  return nodes.flatMap((option) => {
    const node = option as ChangeFileTreeNode
    const children = node.children ? collectDirectoryKeys(node.children) : []
    return node.kind === 'directory' && node.key !== undefined
      ? [node.key, ...children]
      : children
  })
}

function renderChangeStatus(changeType: FileChangeType) {
  const mark = changeType === 'created'
    ? h('path', { d: 'M5 8h6M8 5v6' })
    : changeType === 'deleted'
      ? h('path', { d: 'M5 8h6' })
      : h('circle', { cx: 8, cy: 8, fill: 'currentColor', r: 1.5, stroke: 'none' })
  return h('svg', {
    'aria-label': t(`desktop.context.changeType.${changeType}`),
    'class': [
      'desktop-change-file-picker__change-status',
      `is-${changeType}`,
    ],
    'fill': 'none',
    'role': 'img',
    'stroke': 'currentColor',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'stroke-width': 1.5,
    'viewBox': '0 0 16 16',
  }, [
    h('rect', { height: 11.5, rx: 2, width: 11.5, x: 2.25, y: 2.25 }),
    mark,
  ])
}
</script>

<template>
  <NPopover
    class="buddy-raw-popover"
    raw
    :show="open"
    :show-arrow="false"
    placement="bottom-start"
    to=".buddy-app"
    trigger="click"
    @update:show="open = $event"
  >
    <template #trigger>
      <button
        class="desktop-change-file-picker__trigger"
        data-testid="change-file-picker-trigger"
        type="button"
        aria-haspopup="tree"
        :aria-expanded="open"
        :aria-label="t('desktop.context.changedFilesLabel')"
      >
        <NIcon :component="TextBulletListTree20Regular" />
      </button>
    </template>

    <section
      class="desktop-change-file-picker__panel"
      data-testid="change-file-picker"
      :aria-label="t('desktop.context.changedFilesLabel')"
    >
      <header>
        <strong>{{ t('desktop.context.changedFilesLabel') }}</strong>
        <span>{{ t('desktop.context.changedFiles', { count: files.length }) }}</span>
      </header>
      <div class="desktop-change-file-picker__tree">
        <NTree
          block-line
          :cancelable="false"
          :data="treeData"
          :expanded-keys="expandedKeys"
          :override-default-node-click-behavior="overrideNodeClick"
          :render-prefix="renderPrefix"
          :render-suffix="renderSuffix"
          :selected-keys="selectedKeys"
          @update:expanded-keys="expandedKeys = $event"
          @update:selected-keys="selectFile"
        />
      </div>
    </section>
  </NPopover>
</template>

<style scoped>
.desktop-change-file-picker__trigger {
  display: grid;
  width: 1.75rem;
  height: 1.75rem;
  flex: none;
  place-items: center;
  border: 0;
  border-radius: var(--buddy-icon-button-radius);
  background: transparent;
  color: var(--buddy-text-secondary);
  cursor: pointer;
  padding: 0;
}

.desktop-change-file-picker__trigger:hover,
.desktop-change-file-picker__trigger[aria-expanded="true"] {
  background: var(--buddy-state-hover);
  color: var(--buddy-text-strong);
}

.desktop-change-file-picker__trigger:focus-visible {
  outline: 2px solid var(--buddy-focus-ring);
  outline-offset: -2px;
}

.desktop-change-file-picker__trigger :deep(.n-icon) {
  width: 1.1rem;
  height: 1.1rem;
  font-size: 1.1rem;
}

.desktop-change-file-picker__panel {
  display: flex;
  width: min(27rem, calc(100vw - 2rem));
  max-height: min(30rem, calc(100vh - 8rem));
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--buddy-border-strong);
  border-radius: var(--buddy-radius-small);
  background: var(--buddy-surface-raised);
  box-shadow: var(--buddy-shadow-overlay);
  color: var(--buddy-text-primary);
}

.desktop-change-file-picker__panel > header {
  display: flex;
  min-height: 2.5rem;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border-bottom: 1px solid var(--buddy-border-subtle);
  padding: 0 0.75rem;
}

.desktop-change-file-picker__panel > header strong {
  font-size: 0.75rem;
  font-weight: 600;
}

.desktop-change-file-picker__panel > header span {
  color: var(--buddy-text-muted);
  font-size: 0.68rem;
}

.desktop-change-file-picker__tree {
  min-height: 0;
  overflow: auto;
  padding: 0.45rem;
}

.desktop-change-file-picker__tree :deep(.n-tree-node-content) {
  min-width: 0;
  min-height: 1.8rem;
  border-radius: var(--buddy-radius-micro);
  font-size: 0.72rem;
}

.desktop-change-file-picker__tree :deep(.n-tree-node-switcher) {
  display: none;
}

.desktop-change-file-picker__tree :deep(.n-tree-node-content__text) {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.desktop-change-file-picker__tree :deep(.n-tree-node-content__suffix) {
  display: flex;
  align-self: stretch;
  align-items: center;
  flex: none;
  margin-left: auto;
}

.desktop-change-file-picker__tree :deep(.desktop-change-file-picker__directory-icon),
.desktop-change-file-picker__tree :deep(.desktop-change-file-picker__file-icon) {
  display: block;
  width: 1rem;
  height: 1rem;
  flex: none;
  object-fit: contain;
}

.desktop-change-file-picker__tree :deep(.desktop-change-file-picker__file-meta),
.desktop-change-file-picker__tree :deep(.desktop-change-file-picker__line-counts) {
  display: flex;
  align-items: center;
}

.desktop-change-file-picker__tree :deep(.desktop-change-file-picker__file-meta) {
  height: 100%;
  align-self: stretch;
  gap: 0.5rem;
}

.desktop-change-file-picker__tree :deep(.desktop-change-file-picker__line-counts) {
  height: 100%;
  align-self: stretch;
  gap: 0.18rem;
  font-family: var(--buddy-font-mono, ui-monospace, monospace);
  font-size: 0.65rem;
  line-height: 1;
}

.desktop-change-file-picker__tree :deep(.desktop-change-file-picker__line-counts b) {
  display: block;
  font-weight: 500;
  line-height: 1;
  transform: translateY(1px);
}

.desktop-change-file-picker__tree :deep(.desktop-change-file-picker__line-counts .is-added),
.desktop-change-file-picker__tree :deep(.desktop-change-file-picker__change-status.is-created) {
  color: var(--buddy-status-success-text);
}

.desktop-change-file-picker__tree :deep(.desktop-change-file-picker__change-status.is-modified) {
  color: var(--buddy-status-warning-text);
}

.desktop-change-file-picker__tree :deep(.desktop-change-file-picker__line-counts .is-deleted),
.desktop-change-file-picker__tree :deep(.desktop-change-file-picker__change-status.is-deleted) {
  color: var(--buddy-status-danger-text);
}

.desktop-change-file-picker__tree :deep(.desktop-change-file-picker__change-status) {
  display: block;
  width: 0.95rem;
  height: 0.95rem;
  flex: none;
}
</style>
