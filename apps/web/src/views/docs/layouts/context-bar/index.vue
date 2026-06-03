<script setup lang="ts">
import {
  DOCUMENT_PUBLICATION_SITE_STATUS,
  DOCUMENT_SITE_PUBLICATION_ROUTE_PREFIX,
} from '@haohaoxue/samepage-contracts/document/publication/constants'
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import { getPublicationSiteManagement } from '@/apis/document-publication'
import { useWorkspaceStore } from '@/stores/workspace'
import DocumentHeaderActions from '../../components/document-header-actions'
import { useActiveDocument } from '../../composables/useActiveDocument'
import { useDocsControlCenterTabs } from '../../composables/useDocsControlCenterTabs'
import { useDocsSurfaceState } from '../../composables/useDocsSurfaceState'
import DocsControlCenterContextBarLayout from '../control-center-context-bar'

const {
  canReconnectCollaboration,
  collaborationStatusHint,
  collaborationStatusLabel,
  collaborationStatusTone,
  reconnectCollaboration,
} = useActiveDocument()
const workspaceStore = useWorkspaceStore()
const { currentSurface, isDocumentSurface, visibleBreadcrumbLabels } = useDocsSurfaceState()
const { activeTab } = useDocsControlCenterTabs()
const PUBLICATION_SITE_STATE_EVENT = 'samepage:publication-site-state-change'
const publicationSiteState = shallowRef<{
  id: string
  active: boolean
} | null>(null)

const surfaceContext = computed(() => {
  return {
    title: '',
    description: '',
  }
})
const isControlCenterSurface = computed(() => currentSurface.value !== 'document')
const isPublicationSettingsSurface = computed(() => currentSurface.value === 'publication-settings')
const isSingleLine = computed(() => isDocumentSurface.value || !surfaceContext.value.description)
const connectionStatusClass = computed(() =>
  collaborationStatusTone.value ? `is-${collaborationStatusTone.value}` : null,
)
const connectionStatusTitle = computed(() =>
  collaborationStatusHint.value || collaborationStatusLabel.value || undefined,
)
const publicationSiteUrl = computed(() => publicationSiteState.value
  ? new URL(`${DOCUMENT_SITE_PUBLICATION_ROUTE_PREFIX}/${publicationSiteState.value.id}`, window.location.origin).toString()
  : '',
)
const canOpenPublicationSite = computed(() => Boolean(publicationSiteUrl.value && publicationSiteState.value?.active))
const publicationSiteActionLabel = computed(() =>
  publicationSiteState.value && !publicationSiteState.value.active ? '站点已关闭' : '查看站点',
)

watch(
  [isPublicationSettingsSurface, () => workspaceStore.currentWorkspace?.id ?? ''],
  ([isPublicationSurface, workspaceId]) => {
    if (!isPublicationSurface || !workspaceId) {
      publicationSiteState.value = null
      return
    }

    void loadPublicationSite(workspaceId)
  },
  { immediate: true },
)

onMounted(() => {
  window.addEventListener(PUBLICATION_SITE_STATE_EVENT, handlePublicationSiteStateChange as EventListener)
})

onBeforeUnmount(() => {
  window.removeEventListener(PUBLICATION_SITE_STATE_EVENT, handlePublicationSiteStateChange as EventListener)
})

async function loadPublicationSite(workspaceId: string) {
  try {
    const response = await getPublicationSiteManagement(workspaceId)
    publicationSiteState.value = response.site
      ? {
          id: response.site.id,
          active: response.site.status === DOCUMENT_PUBLICATION_SITE_STATUS.ACTIVE,
        }
      : null
  }
  catch {
    publicationSiteState.value = null
  }
}

function openPublicationSite() {
  if (!canOpenPublicationSite.value) {
    return
  }

  window.open(publicationSiteUrl.value, '_blank', 'noopener,noreferrer')
}

function handlePublicationSiteStateChange(event: Event) {
  const nextState = (event as CustomEvent<typeof publicationSiteState.value>).detail
  publicationSiteState.value = nextState
}
</script>

<template>
  <div class="docs-view-context flex w-full items-center justify-between gap-4">
    <DocsControlCenterContextBarLayout
      v-if="isControlCenterSurface"
      v-model="activeTab"
    />

    <div
      v-else
      class="docs-view-context__content grid h-11 min-w-0 flex-1 content-center gap-1 overflow-hidden [grid-template-rows:1.25rem_1.25rem]"
      :class="{ 'is-single-line': isSingleLine }"
    >
      <template v-if="isDocumentSurface">
        <div class="docs-view-context__breadcrumb-shell flex min-w-0 items-center gap-2">
          <ElBreadcrumb v-if="visibleBreadcrumbLabels.length" separator="/" class="min-w-0">
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
            class="docs-view-context__connection-status is-actionable inline-flex h-4 w-4 shrink-0 items-center justify-center border-0 bg-transparent p-0"
            :class="connectionStatusClass"
            :title="connectionStatusTitle"
            @click="reconnectCollaboration"
          >
            <span class="docs-view-context__connection-dot h-2 w-2 rounded-full" aria-hidden="true" />
          </button>

          <span
            v-else-if="collaborationStatusLabel"
            class="docs-view-context__connection-status inline-flex h-4 w-4 shrink-0 items-center justify-center border-0 bg-transparent p-0"
            :class="connectionStatusClass"
            :title="connectionStatusTitle"
          >
            <span class="docs-view-context__connection-dot h-2 w-2 rounded-full" aria-hidden="true" />
          </span>
        </div>
      </template>

      <template v-else>
        <div class="flex items-center text-[0.95rem] font-semibold leading-5 text-main">
          {{ surfaceContext.title }}
        </div>

        <div
          v-if="surfaceContext.description"
          class="docs-view-context__surface-description flex max-w-full items-center overflow-hidden text-xs leading-5 text-ellipsis whitespace-nowrap"
        >
          {{ surfaceContext.description }}
        </div>
      </template>
    </div>

    <div v-if="isDocumentSurface" class="docs-view-context__actions flex shrink-0 items-center gap-2">
      <DocumentHeaderActions />
    </div>
    <div v-else-if="isPublicationSettingsSurface" class="docs-view-context__actions flex shrink-0 items-center gap-2">
      <ElButton :disabled="!canOpenPublicationSite" type="primary" @click="openPublicationSite">
        {{ publicationSiteActionLabel }}
      </ElButton>
    </div>
  </div>
</template>

<style scoped lang="scss">
.docs-view-context {
  .docs-view-context__content.is-single-line {
    grid-template-rows: 1.25rem;
    height: 1.25rem;
  }

  .docs-view-context__connection-status {
    --docs-view-context-connection-color: var(--brand-text-secondary);

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
    background: var(--docs-view-context-connection-color);
    box-shadow: 0 0 0 0.2rem color-mix(in srgb, var(--docs-view-context-connection-color) 14%, transparent);
  }

  .docs-view-context__surface-description {
    color: color-mix(in srgb, var(--brand-text-secondary) 75%, transparent);
  }
}
</style>
