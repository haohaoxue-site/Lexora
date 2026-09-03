<script setup lang="ts">
import type { LocalArtifact } from '@buddy-electron/shared/localChatApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { Open16Regular } from '@vicons/fluent'
import { NIcon } from 'naive-ui'
import { computed } from 'vue'
import { materialFolderIconUrls } from '@/assets/file-icons/materialFileIcons'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import BuddyFileIcon from '@/ui/files/BuddyFileIcon.vue'
import { formatArtifactFileSize } from './artifactPresentation'
import { buildArtifactTree, flattenArtifactTree } from './artifactTree'

const props = defineProps<{
  artifacts: ReadonlyArray<LocalArtifact>
  language: BuddyLocale
}>()
const emit = defineEmits<{
  openArtifact: [artifactId: string]
}>()

const { t } = useBuddyI18n(() => props.language)
const rows = computed(() => flattenArtifactTree(buildArtifactTree(props.artifacts)))
</script>

<template>
  <div class="buddy-artifact-tree" role="tree">
    <template v-for="row in rows" :key="`${row.node.kind}:${row.node.path}`">
      <div
        v-if="row.node.kind === 'folder'"
        class="buddy-artifact-tree__folder"
        role="treeitem"
        :style="{ '--artifact-depth': row.depth }"
      >
        <img alt="" :src="materialFolderIconUrls.expanded">
        <span>{{ row.node.name }}</span>
      </div>
      <button
        v-else
        class="buddy-artifact-tree__file"
        :class="{ 'is-deleted': row.node.artifact.deletedAt !== null }"
        :data-change-type="row.node.artifact.changeType"
        :disabled="row.node.artifact.deletedAt !== null"
        role="treeitem"
        :style="{ '--artifact-depth': row.depth }"
        type="button"
        @click="emit('openArtifact', row.node.artifact.artifactId)"
      >
        <BuddyFileIcon :name="row.node.artifact.name" size="medium" />
        <span class="buddy-artifact-tree__name">{{ row.node.artifact.name }}</span>
        <span class="buddy-artifact-tree__detail">
          {{ row.node.artifact.deletedAt === null ? formatArtifactFileSize(row.node.artifact.sizeBytes) : t('desktop.chat.artifactDeleted') }}
        </span>
        <NIcon
          v-if="row.node.artifact.deletedAt === null"
          :component="Open16Regular"
          class="buddy-artifact-tree__open"
        />
      </button>
    </template>
  </div>
</template>

<style scoped>
.buddy-artifact-tree {
  display: grid;
  overflow: hidden;
  border: 1px solid var(--buddy-border-subtle);
  border-radius: var(--buddy-radius-micro);
  background: var(--buddy-surface-raised);
  box-shadow: var(--buddy-shadow-soft);
}

.buddy-artifact-tree__folder,
.buddy-artifact-tree__file {
  min-width: 0;
  min-height: 2.4rem;
  align-items: center;
  border: 0;
  border-bottom: 1px solid var(--buddy-border-subtle);
  padding: 0.4rem 0.65rem 0.4rem calc(0.65rem + var(--artifact-depth) * 1.15rem);
}

.buddy-artifact-tree__folder:last-child,
.buddy-artifact-tree__file:last-child {
  border-bottom: 0;
}

.buddy-artifact-tree__folder {
  display: flex;
  gap: 0.5rem;
  background: var(--buddy-surface-subtle);
  color: var(--buddy-text-secondary);
  font-size: var(--buddy-chat-caption-font-size);
  font-weight: 600;
}

.buddy-artifact-tree__folder img {
  width: 1.4rem;
  height: 1.4rem;
}

.buddy-artifact-tree__file {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  gap: 0.55rem;
  width: 100%;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.buddy-artifact-tree__file:hover {
  background: var(--buddy-accent-surface-subtle);
}

.buddy-artifact-tree__file:focus-visible {
  position: relative;
  outline: 2px solid var(--buddy-focus-ring);
  outline-offset: -2px;
}

.buddy-artifact-tree__file.is-deleted {
  cursor: default;
  opacity: 0.58;
}

.buddy-artifact-tree__name {
  overflow: hidden;
  color: var(--buddy-text-strong);
  font-size: var(--buddy-chat-caption-font-size);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.is-deleted .buddy-artifact-tree__name {
  text-decoration: line-through;
}

.buddy-artifact-tree__detail {
  color: var(--buddy-text-muted);
  font-size: var(--buddy-chat-caption-font-size);
  white-space: nowrap;
}

.buddy-artifact-tree__open {
  color: var(--buddy-chat-meta-color);
}
</style>
