import type { WorkspaceType } from '@haohaoxue/samepage-contracts'
import type { TiptapEditorCommentRequest } from '@/components/tiptap-editor'
import { createSharedComposable } from '@vueuse/core'
import { ElMessage } from 'element-plus'
import { computed, shallowRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useWorkspaceStore } from '@/stores/workspace'
import { resolveDocumentBlockIdFromHash } from '@/utils/documentBlockAnchor'

export interface NavigateToDocumentOptions {
  replace?: boolean
  skipConfirm?: boolean
  focusTitle?: boolean
}

export const useDocsContext = createSharedComposable(() => {
  const route = useRoute()
  const router = useRouter()
  const workspaceStore = useWorkspaceStore()

  const activeDocumentId = computed(() => typeof route.params.id === 'string' ? route.params.id : null)
  const activeBlockId = computed(() => resolveDocumentBlockIdFromHash(route.hash))
  const currentWorkspaceId = computed(() => workspaceStore.currentWorkspace?.id ?? null)
  const currentWorkspaceType = computed<WorkspaceType>(() => workspaceStore.currentWorkspaceType)
  const routeName = computed(() => route.name)
  const routeKey = computed(() => route.fullPath)
  const isSelectingInitialDocument = shallowRef(false)
  const pendingHistoryDocumentId = shallowRef<string | null>(null)
  const pendingTitleFocusDocumentId = shallowRef<string | null>(null)

  async function confirmNavigation() {
    return true
  }

  async function navigateToDocument(
    documentId: string | null,
    options: NavigateToDocumentOptions = {},
  ) {
    if (documentId === activeDocumentId.value) {
      if (options.focusTitle && documentId) {
        pendingTitleFocusDocumentId.value = documentId
      }

      return true
    }

    if (!options.skipConfirm) {
      const canNavigate = await confirmNavigation()

      if (!canNavigate) {
        return false
      }
    }

    if (options.focusTitle && documentId) {
      pendingTitleFocusDocumentId.value = documentId
    }

    await router[options.replace ? 'replace' : 'push']({
      name: 'docs',
      ...(documentId ? { params: { id: documentId } } : {}),
      hash: '',
    })

    return true
  }

  function handleRequestComment(request: TiptapEditorCommentRequest) {
    void request
    ElMessage.info('评论能力稍后接入')
  }

  return {
    activeBlockId,
    activeDocumentId,
    confirmNavigation,
    currentWorkspaceId,
    currentWorkspaceType,
    handleRequestComment,
    isSelectingInitialDocument,
    navigateToDocument,
    pendingHistoryDocumentId,
    pendingTitleFocusDocumentId,
    routeKey,
    routeName,
  }
})
