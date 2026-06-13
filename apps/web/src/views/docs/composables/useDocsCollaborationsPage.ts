import type {
  DocumentCollaborationConsoleTreeItem,
  DocumentCollaborationPermission,
  DocumentCollaborationScope,
} from '@haohaoxue/samepage-contracts/document/collaboration'
import {
  DOCUMENT_COLLABORATION_PERMISSION,
  DOCUMENT_COLLABORATION_SCOPE,
} from '@haohaoxue/samepage-contracts/document/collaboration/constants'
import { useClipboard } from '@vueuse/core'
import { computed, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  disableDocumentCollaborationLink,
  listDocumentCollaborationConsoleTree,
  upsertDocumentCollaborationLink,
} from '@/apis/document-collaboration'
import { translate } from '@/i18n'
import { useWorkspaceStore } from '@/stores/workspace'
import { ElMessage } from '@/utils/element-plus'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'
import { useDocsCollaborationDialog } from './useDocsCollaborationDialog'

export function useDocsCollaborationsPage() {
  const router = useRouter()
  const workspaceStore = useWorkspaceStore()
  const { openDocumentCollaborationDialog } = useDocsCollaborationDialog()
  const { copy, isSupported: isClipboardSupported } = useClipboard({
    legacy: true,
  })
  const tree = shallowRef<DocumentCollaborationConsoleTreeItem[]>([])
  const isLoading = shallowRef(false)
  const updatingDocumentId = shallowRef<string | null>(null)
  const errorMessage = shallowRef('')
  const currentWorkspaceId = computed(() => workspaceStore.currentWorkspace?.id ?? '')
  let loadRequestId = 0

  watch(currentWorkspaceId, async () => {
    await loadItems()
  }, {
    immediate: true,
  })

  return {
    errorMessage,
    isLoading,
    tree,
    loadItems,
    openCollaborationDetail,
    openDocument,
    updatingDocumentId,
    copyCollaborationLink,
    updateLinkEnabled,
    updateLinkPermission,
    updateLinkScope,
  }

  async function loadItems() {
    const workspaceId = currentWorkspaceId.value
    const requestId = ++loadRequestId

    if (!workspaceId) {
      tree.value = []
      errorMessage.value = ''
      isLoading.value = false
      return
    }

    isLoading.value = true
    errorMessage.value = ''

    try {
      const response = await listDocumentCollaborationConsoleTree(workspaceId)

      if (requestId !== loadRequestId) {
        return
      }

      tree.value = response.tree
    }
    catch (error) {
      if (requestId !== loadRequestId) {
        return
      }

      tree.value = []
      errorMessage.value = getRequestErrorDisplayMessage(error, translate('docs.collaboration.loadManagementFailed'))
    }
    finally {
      if (requestId === loadRequestId) {
        isLoading.value = false
      }
    }
  }

  function openCollaborationDetail(documentId: string) {
    openDocumentCollaborationDialog(documentId)
  }

  async function updateLinkEnabled(documentId: string, enabled: boolean) {
    const item = findCollaborationTreeItem(tree.value, documentId)

    if (!enabled) {
      if (!item?.linkInvite) {
        return
      }

      await runLinkMutation(documentId, async () => {
        await disableDocumentCollaborationLink(documentId)
        ElMessage.success(translate('docs.collaboration.linkDisabled'))
      })
      return
    }

    await upsertLink(documentId, {
      enabled: true,
      permission: item?.linkInvite?.permission ?? DOCUMENT_COLLABORATION_PERMISSION.READ,
      scope: item?.linkInvite?.scope ?? DOCUMENT_COLLABORATION_SCOPE.SELF,
    })
  }

  async function updateLinkPermission(documentId: string, permission: DocumentCollaborationPermission) {
    const item = findCollaborationTreeItem(tree.value, documentId)

    await upsertLink(documentId, {
      enabled: item?.linkInvite?.enabled ?? true,
      permission,
      scope: item?.linkInvite?.scope ?? DOCUMENT_COLLABORATION_SCOPE.SELF,
    })
  }

  async function updateLinkScope(documentId: string, scope: DocumentCollaborationScope) {
    const item = findCollaborationTreeItem(tree.value, documentId)

    await upsertLink(documentId, {
      enabled: item?.linkInvite?.enabled ?? true,
      permission: item?.linkInvite?.permission ?? DOCUMENT_COLLABORATION_PERMISSION.READ,
      scope,
    })
  }

  async function upsertLink(
    documentId: string,
    payload: {
      enabled: boolean
      permission: DocumentCollaborationPermission
      scope: DocumentCollaborationScope
    },
  ) {
    await runLinkMutation(documentId, async () => {
      await upsertDocumentCollaborationLink(documentId, payload)
      ElMessage.success(translate('docs.collaboration.linkSaved'))
    })
  }

  async function runLinkMutation(documentId: string, action: () => Promise<void>) {
    if (updatingDocumentId.value) {
      return
    }

    updatingDocumentId.value = documentId

    try {
      await action()
      await loadItems()
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, translate('docs.collaboration.linkUpdateFailed')))
    }
    finally {
      updatingDocumentId.value = null
    }
  }

  async function copyCollaborationLink(documentId: string) {
    const item = findCollaborationTreeItem(tree.value, documentId)
    const resolverCode = item?.linkInvite?.enabled ? item.linkInvite.resolverCode : ''

    if (!resolverCode) {
      return
    }

    if (!isClipboardSupported.value) {
      ElMessage.error(translate('docs.common.copyUnsupported'))
      return
    }

    try {
      await copy(new URL(`/r/${encodeURIComponent(resolverCode)}`, window.location.origin).toString())
      ElMessage.success(translate('docs.collaboration.linkCopied'))
    }
    catch {
      ElMessage.error(translate('docs.common.copyFailed'))
    }
  }

  async function openDocument(documentId: string) {
    try {
      await router.push({
        name: 'docs',
        params: {
          id: documentId,
        },
      })
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, translate('docs.collaboration.openDocumentFailed')))
    }
  }
}

function findCollaborationTreeItem(
  tree: DocumentCollaborationConsoleTreeItem[],
  documentId: string,
): DocumentCollaborationConsoleTreeItem | null {
  for (const item of tree) {
    if (item.id === documentId) {
      return item
    }

    const child = findCollaborationTreeItem(item.children, documentId)

    if (child) {
      return child
    }
  }

  return null
}
