<script setup lang="ts">
import { computed } from 'vue'
import DocumentHeaderActions from '../components/DocumentHeaderActions.vue'
import { useActiveDocument } from '../composables/useActiveDocument'
import { useDocsSurfaceState } from '../composables/useDocsSurfaceState'

const {
  canReconnectCollaboration,
  collaborationStatusHint,
  collaborationStatusLabel,
  collaborationStatusTone,
  currentDocument,
  reconnectCollaboration,
} = useActiveDocument()
const { currentSurface, isDocumentSurface, visibleBreadcrumbLabels } = useDocsSurfaceState()

const surfaceContext = computed(() => {
  if (currentSurface.value === 'pending-shares') {
    return {
      title: '待接收分享',
      description: '查看还未确认接收的分享',
    }
  }

  if (currentSurface.value === 'permissions') {
    return {
      title: '权限管理',
      description: '查看当前空间内已开启分享的文档',
    }
  }

  if (currentSurface.value === 'trash') {
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
const isSingleLine = computed(() => isDocumentSurface.value || !surfaceContext.value.description)
const connectionStatusClass = computed(() =>
  collaborationStatusTone.value ? `is-${collaborationStatusTone.value}` : null,
)
const connectionStatusTitle = computed(() =>
  collaborationStatusHint.value || collaborationStatusLabel.value || undefined,
)
</script>

<template>
  <div class="docs-view-context w-full">
    <div
      class="docs-view-context__content"
      :class="{ 'is-single-line': isSingleLine }"
    >
      <template v-if="isDocumentSurface">
        <div class="docs-view-context__breadcrumb-shell">
          <ElBreadcrumb v-if="visibleBreadcrumbLabels.length" separator="/" class="docs-view-context__breadcrumb">
            <ElBreadcrumbItem
              v-for="label in visibleBreadcrumbLabels"
              :key="label"
            >
              <span class="truncate text-sm text-secondary">{{ label }}</span>
            </ElBreadcrumbItem>
          </ElBreadcrumb>

          <button
            v-if="collaborationStatusLabel && canReconnectCollaboration"
            type="button"
            class="docs-view-context__connection-status is-actionable"
            :class="connectionStatusClass"
            :title="connectionStatusTitle"
            @click="reconnectCollaboration"
          >
            <span class="docs-view-context__connection-dot" aria-hidden="true" />
          </button>

          <span
            v-else-if="collaborationStatusLabel"
            class="docs-view-context__connection-status"
            :class="connectionStatusClass"
            :title="connectionStatusTitle"
          >
            <span class="docs-view-context__connection-dot" aria-hidden="true" />
          </span>
        </div>
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

    <div v-if="isDocumentSurface && currentDocument?.id" class="docs-view-context__actions">
      <DocumentHeaderActions />
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

  .docs-view-context__breadcrumb-shell {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    min-width: 0;
  }

  .docs-view-context__breadcrumb {
    min-width: 0;
  }

  .docs-view-context__connection-status {
    --docs-view-context-connection-color: var(--brand-text-secondary);

    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 1rem;
    height: 1rem;
    padding: 0;
    border: 0;
    background: transparent;

    &.is-connected {
      --docs-view-context-connection-color: var(--brand-success);
    }

    &.is-connecting {
      --docs-view-context-connection-color: var(--brand-warning);
    }

    &.is-danger {
      --docs-view-context-connection-color: var(--brand-error);
    }

    &.is-actionable {
      cursor: pointer;
    }
  }

  .docs-view-context__connection-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 9999px;
    background: var(--docs-view-context-connection-color);
    box-shadow: 0 0 0 0.2rem color-mix(in srgb, var(--docs-view-context-connection-color) 14%, transparent);
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
