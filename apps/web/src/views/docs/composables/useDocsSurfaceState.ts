import type {
  DocumentItem,
  DocumentPaneState,
  DocumentTreeCollectionId,
  DocumentTreeGroup,
} from '@haohaoxue/samepage-contracts'
import type { DocsSurfaceView } from '../typing'
import {
  DOCUMENT_COLLECTION,
  DOCUMENT_PANE_STATE,
  WORKSPACE_TYPE,
} from '@haohaoxue/samepage-contracts'
import { createSharedComposable } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { resolvePreferredDocumentId } from '../utils/documentTree'
import { useActiveDocument } from './useActiveDocument'
import { useDocsContext } from './useDocsContext'
import { useDocumentTree } from './useDocumentTree'

export const useDocsSurfaceState = createSharedComposable(() => {
  const {
    activeDocumentId,
    currentWorkspaceType,
    isSelectingInitialDocument,
    pendingTitleFocusDocumentId,
    routeName,
  } = useDocsContext()
  const tree = useDocumentTree()
  const activeDocument = useActiveDocument()

  const collapsedGroupIds = ref<DocumentTreeCollectionId[]>([
    DOCUMENT_COLLECTION.COLLABORATION,
  ])
  const currentSurface = computed<DocsSurfaceView>(() => {
    if (routeName.value === 'docs-pending-shares') {
      return 'pending-shares'
    }

    if (routeName.value === 'docs-permissions') {
      return 'permissions'
    }

    if (routeName.value === 'docs-trash') {
      return 'trash'
    }

    return 'document'
  })
  const isDocumentSurface = computed(() => currentSurface.value === 'document')
  const visibleTreeGroups = computed(() =>
    buildVisibleTreeGroups({
      groups: tree.treeGroups.value,
      workspaceType: currentWorkspaceType.value,
    }),
  )
  const visibleDefaultDocumentId = computed(() =>
    resolvePreferredDocumentId(visibleTreeGroups.value, tree.defaultDocumentId.value),
  )
  const hasVisibleFallbackDocument = computed(() => Boolean(visibleDefaultDocumentId.value))
  const visibleActiveCollectionId = computed(() => {
    if (!activeDocumentId.value) {
      return null
    }

    const targetDocumentId = activeDocumentId.value

    for (const group of visibleTreeGroups.value) {
      const containsActiveDocument = group.nodes.some(node => containsDocument(node, targetDocumentId))

      if (containsActiveDocument) {
        return group.id
      }
    }

    return null
  })
  const collapsedGroupIdSet = computed(() => new Set(collapsedGroupIds.value))
  const visibleBreadcrumbLabels = computed(() =>
    tree.breadcrumbLabels.value.length > 1 ? tree.breadcrumbLabels.value : [],
  )
  const documentPaneState = computed<DocumentPaneState>(() => {
    if (activeDocument.currentDocument.value) {
      return DOCUMENT_PANE_STATE.READY
    }

    if (
      activeDocument.isDocumentItemLoading.value
      || tree.isDocumentLoading.value
      || isSelectingInitialDocument.value
    ) {
      return DOCUMENT_PANE_STATE.LOADING
    }

    if (activeDocumentId.value) {
      return activeDocument.documentErrorState.value ?? DOCUMENT_PANE_STATE.ERROR
    }

    if (hasVisibleFallbackDocument.value) {
      return DOCUMENT_PANE_STATE.UNSELECTED
    }

    return DOCUMENT_PANE_STATE.EMPTY
  })

  watch(
    visibleActiveCollectionId,
    (nextCollectionId) => {
      if (!nextCollectionId) {
        return
      }

      collapsedGroupIds.value = collapsedGroupIds.value.filter(id => id !== nextCollectionId)
    },
  )

  watch(
    currentSurface,
    (nextSurface) => {
      if (nextSurface !== 'document') {
        pendingTitleFocusDocumentId.value = null
      }
    },
  )

  function toggleGroupCollapse(collectionId: DocumentTreeCollectionId) {
    collapsedGroupIds.value = collapsedGroupIdSet.value.has(collectionId)
      ? collapsedGroupIds.value.filter(id => id !== collectionId)
      : [...collapsedGroupIds.value, collectionId]
  }

  return {
    collapsedGroupIdSet,
    currentSurface,
    documentPaneState,
    hasVisibleFallbackDocument,
    isDocumentSurface,
    toggleGroupCollapse,
    visibleActiveCollectionId,
    visibleBreadcrumbLabels,
    visibleDefaultDocumentId,
    visibleTreeGroups,
  }
})

function containsDocument(item: DocumentItem, targetDocumentId: string): boolean {
  if (item.id === targetDocumentId) {
    return true
  }

  return item.children.some(child => containsDocument(child, targetDocumentId))
}

function buildVisibleTreeGroups(input: {
  groups: DocumentTreeGroup[]
  workspaceType: string
}): DocumentTreeGroup[] {
  if (input.workspaceType === WORKSPACE_TYPE.TEAM) {
    return [
      findTreeGroup(input.groups, DOCUMENT_COLLECTION.PERSONAL) ?? createEmptyTreeGroup(DOCUMENT_COLLECTION.PERSONAL),
      findTreeGroup(input.groups, DOCUMENT_COLLECTION.TEAM) ?? createEmptyTreeGroup(DOCUMENT_COLLECTION.TEAM),
    ]
  }

  const personalGroup = findTreeGroup(input.groups, DOCUMENT_COLLECTION.PERSONAL) ?? createEmptyTreeGroup(DOCUMENT_COLLECTION.PERSONAL)
  const collaborationGroup = findTreeGroup(input.groups, DOCUMENT_COLLECTION.COLLABORATION)

  return collaborationGroup ? [personalGroup, collaborationGroup] : [personalGroup]
}

function findTreeGroup(groups: DocumentTreeGroup[], collectionId: DocumentTreeCollectionId) {
  return groups.find(group => group.id === collectionId) ?? null
}

function createEmptyTreeGroup(collectionId: DocumentTreeCollectionId): DocumentTreeGroup {
  return {
    id: collectionId,
    nodes: [],
  }
}
