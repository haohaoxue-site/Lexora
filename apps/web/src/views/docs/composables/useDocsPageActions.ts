import type {
  DocumentOperationJob,
  DocumentTreeCollectionId,
  MoveDocumentTreeOperationRequest,
} from '@haohaoxue/samepage-contracts'
import {
  DOCUMENT_COLLECTION,
  DOCUMENT_OPERATION_JOB_STATUS,
  DOCUMENT_PANE_STATE,
  WORKSPACE_TYPE,
} from '@haohaoxue/samepage-contracts'
import { sleep } from '@haohaoxue/samepage-shared'
import { createSharedComposable } from '@vueuse/core'
import { ElMessage, ElNotification } from 'element-plus'
import { shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  createDocumentDuplicateOperation,
  createDocumentMoveOperation,
  getDocumentOperationJob,
} from '@/apis/document'
import { useWorkspaceStore } from '@/stores/workspace'
import { useActiveDocument } from './useActiveDocument'
import { useDocsContext } from './useDocsContext'
import { useDocsShareDialog } from './useDocsShareDialog'
import { useDocsSurfaceState } from './useDocsSurfaceState'
import { useDocumentTree } from './useDocumentTree'

const DOCUMENT_OPERATION_POLL_INTERVAL_MS = 1000
const DOCUMENT_OPERATION_WAIT_TIMEOUT_MS = 5 * 60 * 1000
const DOCUMENT_OPERATION_LONG_RUNNING_DOCUMENTS_THRESHOLD = 8
const DOCUMENT_OPERATION_LONG_RUNNING_ASSETS_THRESHOLD = 3

export const useDocsPageActions = createSharedComposable(() => {
  const router = useRouter()
  const workspaceStore = useWorkspaceStore()
  const {
    activeDocumentId,
    currentWorkspaceId,
    currentWorkspaceType,
    isSelectingInitialDocument,
    navigateToDocument,
  } = useDocsContext()
  const tree = useDocumentTree()
  const activeDocument = useActiveDocument()
  const surfaceState = useDocsSurfaceState()
  const { canOpenShareDialog } = useDocsShareDialog()
  const isDocumentOperationRunning = shallowRef(false)

  let lastInaccessibleRedirectDocumentId: string | null = null

  watch(
    currentWorkspaceId,
    async (nextWorkspaceId, previousWorkspaceId) => {
      if (nextWorkspaceId === previousWorkspaceId) {
        return
      }

      await tree.loadTree()

      if (
        !surfaceState.isDocumentSurface.value
        || !nextWorkspaceId
        || activeDocumentId.value === surfaceState.visibleDefaultDocumentId.value
      ) {
        return
      }

      await navigateToDocument(surfaceState.visibleDefaultDocumentId.value, {
        replace: true,
        skipConfirm: true,
      })
    },
  )

  watch(
    [currentWorkspaceId, tree.activeCollectionId],
    async ([, nextActiveCollectionId], previousState) => {
      const [, previousActiveCollectionId] = previousState ?? []
      const isInitialRun = previousState === undefined
      const hasResolvedHiddenDocument
        = !isInitialRun && Boolean(nextActiveCollectionId) && nextActiveCollectionId !== previousActiveCollectionId

      if (!isInitialRun && !hasResolvedHiddenDocument) {
        return
      }

      if (!surfaceState.isDocumentSurface.value) {
        return
      }

      if (
        !activeDocumentId.value
        || !nextActiveCollectionId
        || surfaceState.visibleActiveCollectionId.value
      ) {
        return
      }

      await navigateToDocument(surfaceState.visibleDefaultDocumentId.value, {
        replace: true,
        skipConfirm: true,
      })
    },
    { immediate: true },
  )

  watch(
    [
      activeDocumentId,
      currentWorkspaceId,
      surfaceState.documentPaneState,
      surfaceState.visibleDefaultDocumentId,
      surfaceState.isDocumentSurface,
      activeDocument.isDocumentItemLoading,
    ],
    async ([nextDocumentId, nextWorkspaceId, nextPaneState, nextDefaultDocumentId, isDocumentSurface, isDocumentItemLoading]) => {
      if (!isDocumentSurface || !nextWorkspaceId || !nextDocumentId || isDocumentItemLoading) {
        return
      }

      if (
        nextPaneState !== DOCUMENT_PANE_STATE.NOT_FOUND
        && nextPaneState !== DOCUMENT_PANE_STATE.FORBIDDEN
      ) {
        return
      }

      if (lastInaccessibleRedirectDocumentId === nextDocumentId) {
        return
      }

      lastInaccessibleRedirectDocumentId = nextDocumentId
      const targetDocumentId = nextDefaultDocumentId === nextDocumentId
        ? null
        : nextDefaultDocumentId

      ElMessage.warning(resolveInaccessibleDocumentRedirectMessage({
        paneState: nextPaneState,
        hasFallbackDocument: Boolean(targetDocumentId),
      }))

      await navigateToDocument(targetDocumentId, {
        replace: true,
        skipConfirm: true,
      })
    },
  )

  async function openDocument(documentId: string) {
    lastInaccessibleRedirectDocumentId = null
    await navigateToDocument(documentId)
  }

  async function openDefaultDocument(input: { replace?: boolean } = {}) {
    if (!surfaceState.visibleDefaultDocumentId.value) {
      return
    }

    lastInaccessibleRedirectDocumentId = null
    await navigateToDocument(surfaceState.visibleDefaultDocumentId.value, input)
  }

  function resolveDefaultRootCollectionId() {
    return currentWorkspaceType.value === WORKSPACE_TYPE.TEAM
      ? DOCUMENT_COLLECTION.TEAM
      : DOCUMENT_COLLECTION.PERSONAL
  }

  async function createRootDocument(collectionId: DocumentTreeCollectionId = resolveDefaultRootCollectionId()) {
    if (collectionId === DOCUMENT_COLLECTION.COLLABORATION) {
      return
    }

    lastInaccessibleRedirectDocumentId = null
    await tree.createRootDocument(collectionId)
  }

  async function duplicateDocumentTree(documentId: string) {
    const isCurrentDocument = activeDocument.currentDocument.value?.id === documentId

    if (isCurrentDocument) {
      const canContinue = await activeDocument.confirmNavigation()

      if (!canContinue) {
        return
      }
    }

    try {
      isDocumentOperationRunning.value = true
      const response = await createDocumentDuplicateOperation(documentId)
      const job = await waitDocumentOperationJob(response.job, {
        runningTitle: '正在创建副本',
        runningMessage: '文档较多或资源较大时会多花一些时间，完成后会自动打开副本',
      })

      await tree.loadTree()

      if (job.resultDocumentId) {
        tree.expandDocument(job.resultDocumentId)
        await navigateToDocument(job.resultDocumentId, {
          skipConfirm: true,
        })
      }

      ElMessage.success('副本已创建')
    }
    catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '创建副本失败')
    }
    finally {
      isDocumentOperationRunning.value = false
    }
  }

  async function moveDocumentTree(
    documentId: string,
    payload: MoveDocumentTreeOperationRequest,
  ) {
    const isCurrentDocument = activeDocument.currentDocument.value?.id === documentId

    if (isCurrentDocument) {
      const canContinue = await activeDocument.confirmNavigation()

      if (!canContinue) {
        return
      }
    }

    try {
      isDocumentOperationRunning.value = true
      const response = await createDocumentMoveOperation(documentId, payload)
      const job = await waitDocumentOperationJob(response.job, {
        runningTitle: '正在移动文档',
        runningMessage: '文档层级较深时会多花一些时间，完成后会自动切换到目标位置',
      })

      if (payload.targetWorkspaceId !== currentWorkspaceId.value) {
        workspaceStore.selectWorkspace(payload.targetWorkspaceId)
      }

      await tree.loadTree()

      if (job.resultDocumentId) {
        await navigateToDocument(job.resultDocumentId, {
          skipConfirm: true,
        })
      }

      if (isCurrentDocument) {
        await activeDocument.reloadCurrentDocument()
      }

      ElMessage.success('文档已移动')
    }
    catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '移动文档失败')
    }
    finally {
      isDocumentOperationRunning.value = false
    }
  }

  async function loadInitialTree() {
    await tree.loadTree()

    if (
      !surfaceState.isDocumentSurface.value
      || activeDocumentId.value
      || !surfaceState.visibleDefaultDocumentId.value
    ) {
      return
    }

    isSelectingInitialDocument.value = true

    try {
      await navigateToDocument(surfaceState.visibleDefaultDocumentId.value, {
        replace: true,
        skipConfirm: true,
      })
    }
    finally {
      isSelectingInitialDocument.value = false
    }
  }

  function openPermissionsOverview() {
    if (!canOpenShareDialog.value) {
      ElMessage.warning('仅 MAINTAINER 可以查看分享管理')
      return
    }

    void router.push({
      name: 'docs-permissions',
    })
  }

  function openPendingShares() {
    void router.push({
      name: 'docs-pending-shares',
    })
  }

  function openTrashPage() {
    void router.push({
      name: 'docs-trash',
    })
  }

  return {
    createRootDocument,
    duplicateDocumentTree,
    isDocumentOperationRunning,
    loadInitialTree,
    moveDocumentTree,
    openDefaultDocument,
    openDocument,
    openPendingShares,
    openPermissionsOverview,
    openTrashPage,
  }
})

function resolveInaccessibleDocumentRedirectMessage(input: {
  paneState: string
  hasFallbackDocument: boolean
}) {
  if (input.paneState === DOCUMENT_PANE_STATE.FORBIDDEN) {
    return input.hasFallbackDocument
      ? '你无权访问这篇文档，已为你打开其他可访问文档'
      : '你无权访问这篇文档，已返回文档页'
  }

  return input.hasFallbackDocument
    ? '当前文档不存在或你无权访问，已为你打开其他可访问文档'
    : '当前文档不存在或你无权访问，已返回文档页'
}

async function waitDocumentOperationJob(
  initialJob: DocumentOperationJob,
  message: {
    runningTitle: string
    runningMessage: string
  },
): Promise<DocumentOperationJob> {
  const shouldShowLongRunningHint = initialJob.documentsTotal > DOCUMENT_OPERATION_LONG_RUNNING_DOCUMENTS_THRESHOLD
    || initialJob.assetsTotal > DOCUMENT_OPERATION_LONG_RUNNING_ASSETS_THRESHOLD
  const notification = shouldShowLongRunningHint
    ? ElNotification({
        title: message.runningTitle,
        message: message.runningMessage,
        duration: 0,
      })
    : null

  try {
    let currentJob = initialJob
    const startedAt = Date.now()

    while (
      currentJob.status === DOCUMENT_OPERATION_JOB_STATUS.PENDING
      || currentJob.status === DOCUMENT_OPERATION_JOB_STATUS.RUNNING
    ) {
      if (Date.now() - startedAt > DOCUMENT_OPERATION_WAIT_TIMEOUT_MS) {
        throw new Error('文档任务执行时间过长，请稍后刷新查看结果')
      }

      await sleep(DOCUMENT_OPERATION_POLL_INTERVAL_MS)
      currentJob = await getDocumentOperationJob(currentJob.id)
    }

    if (currentJob.status === DOCUMENT_OPERATION_JOB_STATUS.FAILED) {
      throw new Error(currentJob.errorMessage ?? '文档任务执行失败')
    }

    return currentJob
  }
  finally {
    notification?.close()
  }
}
