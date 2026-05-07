<script setup lang="ts">
import type {
  DocsContextBarLayoutEmits,
  DocsContextBarLayoutProps,
} from './typing'
import { computed } from 'vue'
import DocumentShareStatusEntry from '../components/DocumentShareStatusEntry.vue'

const props = defineProps<DocsContextBarLayoutProps>()
const emits = defineEmits<DocsContextBarLayoutEmits>()
const contextStatusParts = computed(() =>
  [props.saveStateLabel, props.collaborationStatusLabel].filter(Boolean) as string[],
)
const hasStatusHint = computed(() =>
  props.isDocumentSurface && Boolean(props.collaborationStatusHint),
)

const surfaceContext = computed(() => {
  if (props.currentSurface === 'pending-shares') {
    return {
      title: '待接收分享',
      description: '查看还未确认接收的分享',
    }
  }

  if (props.currentSurface === 'permissions') {
    return {
      title: '权限管理',
      description: '查看当前空间内已开启分享的文档',
    }
  }

  if (props.currentSurface === 'trash') {
    return {
      title: '回收站',
      description: '',
    }
  }

  return {
    title: '',
    description: '',
  }
})
const isSingleLine = computed(() => !props.isDocumentSurface && !surfaceContext.value.description)
</script>

<template>
  <div class="docs-view-context w-full">
    <div
      class="docs-view-context__content"
      :class="{ 'is-single-line': isSingleLine, 'has-status-hint': hasStatusHint }"
    >
      <template v-if="props.isDocumentSurface">
        <div class="docs-view-context__breadcrumb-shell">
          <ElBreadcrumb v-if="props.visibleBreadcrumbLabels.length" separator="/" class="docs-view-context__breadcrumb">
            <ElBreadcrumbItem
              v-for="label in props.visibleBreadcrumbLabels"
              :key="label"
            >
              <span class="truncate text-sm text-secondary">{{ label }}</span>
            </ElBreadcrumbItem>
          </ElBreadcrumb>
        </div>

        <div class="docs-view-context__save-state">
          <template v-for="(part, index) in contextStatusParts" :key="`${part}:${index}`">
            <span>{{ part }}</span>
            <span v-if="index < contextStatusParts.length - 1" class="docs-view-context__save-state-separator">·</span>
          </template>

          <button
            v-if="props.canReconnectCollaboration"
            type="button"
            class="docs-view-context__reconnect-button"
            @click="emits('reconnectCollaboration')"
          >
            重新连接
          </button>
        </div>

        <p v-if="props.collaborationStatusHint" class="docs-view-context__status-hint">
          {{ props.collaborationStatusHint }}
        </p>
      </template>

      <template v-else>
        <div class="docs-view-context__surface-title">
          {{ surfaceContext.title }}
        </div>

        <div v-if="surfaceContext.description" class="docs-view-context__surface-description">
          {{ surfaceContext.description }}
        </div>
      </template>
    </div>

    <div v-if="props.isDocumentSurface && props.documentId" class="docs-view-context__actions">
      <DocumentShareStatusEntry
        :document-id="props.documentId"
        :share="props.documentShare"
        :can-open="props.canOpenShareDialog"
        @open-share="emits('openShare', $event)"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.docs-view-context {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;

  .docs-view-context__content {
    display: grid;
    gap: 0.25rem;
    grid-template-rows: 1.25rem 1.25rem;
    align-content: center;
    height: 2.75rem;
    min-width: 0;
    overflow: hidden;
    flex: 1 1 0%;
  }

  .docs-view-context__content.is-single-line {
    grid-template-rows: 1.25rem;
    height: 1.25rem;
  }

  .docs-view-context__content.has-status-hint {
    grid-template-rows: 1.25rem 1.25rem auto;
    height: auto;
  }

  .docs-view-context__breadcrumb-shell {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .docs-view-context__breadcrumb {
    min-width: 0;
  }

  .docs-view-context__save-state {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    max-width: 100%;
    overflow: hidden;
    color: color-mix(in srgb, var(--brand-text-secondary) 75%, transparent);
    font-size: 12px;
    line-height: 1.25rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .docs-view-context__save-state-separator {
    color: color-mix(in srgb, var(--brand-text-secondary) 55%, transparent);
  }

  .docs-view-context__reconnect-button {
    padding: 0;
    border: none;
    background: transparent;
    color: var(--brand-primary);
    font-size: 12px;
    line-height: 1.25rem;
    cursor: pointer;
  }

  .docs-view-context__reconnect-button:hover {
    color: color-mix(in srgb, var(--brand-primary) 82%, black);
  }

  .docs-view-context__status-hint {
    margin: 0;
    max-width: 100%;
    overflow: hidden;
    color: color-mix(in srgb, var(--brand-text-secondary) 78%, transparent);
    font-size: 12px;
    line-height: 1rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .docs-view-context__surface-title {
    display: flex;
    align-items: center;
    color: var(--brand-text-primary);
    font-size: 0.95rem;
    font-weight: 600;
    line-height: 1.25rem;
  }

  .docs-view-context__surface-description {
    display: flex;
    align-items: center;
    max-width: 100%;
    overflow: hidden;
    color: color-mix(in srgb, var(--brand-text-secondary) 75%, transparent);
    font-size: 12px;
    line-height: 1.25rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .docs-view-context__actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }
}
</style>
