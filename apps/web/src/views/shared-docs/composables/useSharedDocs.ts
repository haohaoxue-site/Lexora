import type { DocumentShareAccess, TiptapJsonContent } from '@haohaoxue/samepage-contracts'
import type {
  SharedDocsSurfaceState,
  SharedDocumentReaderDocument,
} from '../typing'
import { DOCUMENT_SHARE_MODE } from '@haohaoxue/samepage-contracts'
import {
  collectDocumentAssetIds,
  hydrateDocumentAssetAttributes,
} from '@haohaoxue/samepage-shared'
import { ElMessage } from 'element-plus'
import { computed, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  acceptDocumentShare,
  acceptDocumentShareRecipient,
  declineDocumentShare,
  declineDocumentShareRecipient,
  getDocumentShareAccess,
  getDocumentShareDocumentCurrent,
  getDocumentShareRecipientAccess,
  getDocumentShareRecipientDocumentCurrent,
  resolveDocumentShareAssets,
  resolveDocumentShareRecipientAssets,
} from '@/apis/document-share'
import { useAuthStore } from '@/stores/auth'
import { resolveDocumentBlockIdFromHash } from '@/utils/documentBlockAnchor'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'
import {
  isUnsupportedSharedDocumentSchemaError,
  toSharedDocumentReaderDocument,
} from '../utils/sharedDocumentReader'

type SharedRouteEntryKind = 'share' | 'recipient'

interface SharedRouteEntry {
  /** 分享入口类型 */
  kind: SharedRouteEntryKind
  /** 分享入口锚点 ID */
  id: string
}

export function useSharedDocs() {
  const route = useRoute()
  const authStore = useAuthStore()
  let accessRequestId = 0
  let documentRequestId = 0
  const surfaceState = shallowRef<SharedDocsSurfaceState>('loading')
  const access = shallowRef<DocumentShareAccess | null>(null)
  const document = shallowRef<SharedDocumentReaderDocument | null>(null)
  const activeBlockId = computed(() => resolveDocumentBlockIdFromHash(route.hash))
  const isActionPending = shallowRef(false)
  const errorMessage = shallowRef('')
  const routeEntry = computed<SharedRouteEntry | null>(() => resolveSharedRouteEntry(route.params))
  const routeEntryKey = computed(() => routeEntry.value ? `${routeEntry.value.kind}:${routeEntry.value.id}` : '')

  watch(
    routeEntryKey,
    async () => {
      await reload()
    },
    {
      immediate: true,
    },
  )

  return {
    surfaceState,
    access,
    document,
    activeBlockId,
    errorMessage,
    isActionPending,
    acceptShare,
    declineShare,
    reload,
  }

  async function reload() {
    const entry = resolveCurrentRouteEntry()

    if (!entry) {
      accessRequestId += 1
      documentRequestId += 1
      access.value = null
      document.value = null
      errorMessage.value = ''
      surfaceState.value = 'invalid'
      return
    }

    const requestId = ++accessRequestId
    documentRequestId += 1
    surfaceState.value = 'loading'
    errorMessage.value = ''
    document.value = null

    await loadShareAccess(entry, requestId)
  }

  async function acceptShare() {
    const entry = resolveCurrentRouteEntry()

    if (!entry || !access.value || isActionPending.value) {
      return
    }

    isActionPending.value = true

    try {
      const nextAccess = await acceptRouteEntry(entry)

      if (!isSameRouteEntry(entry)) {
        return
      }

      const requestId = ++accessRequestId
      access.value = nextAccess
      await syncSurfaceFromAccess(nextAccess, entry, requestId)
    }
    catch (error) {
      if (isSameRouteEntry(entry)) {
        handleSurfaceError(error)
        ElMessage.error('接受分享失败，请稍后重试')
      }
    }
    finally {
      isActionPending.value = false
    }
  }

  async function declineShare() {
    const entry = resolveCurrentRouteEntry()

    if (!entry || !access.value || isActionPending.value) {
      return
    }

    isActionPending.value = true

    try {
      const nextAccess = await declineRouteEntry(entry)

      if (!isSameRouteEntry(entry)) {
        return
      }

      accessRequestId += 1
      access.value = nextAccess
      surfaceState.value = 'confirm'
    }
    catch (error) {
      if (isSameRouteEntry(entry)) {
        handleSurfaceError(error)
        ElMessage.error('暂时无法更新分享状态，请稍后重试')
      }
    }
    finally {
      isActionPending.value = false
    }
  }

  async function loadShareAccess(entry: SharedRouteEntry, requestId: number) {
    try {
      const nextAccess = await getRouteEntryAccess(entry)

      if (!isActiveAccessRequest(requestId, entry)) {
        return
      }

      access.value = nextAccess
      await syncSurfaceFromAccess(nextAccess, entry, requestId)
    }
    catch (error) {
      if (!isActiveAccessRequest(requestId, entry)) {
        return
      }

      const requestError = error as Error & { status?: number }

      if (requestError.status === 401) {
        await authStore.navigateToLogin({
          redirectPath: route.fullPath,
        })
        return
      }

      access.value = null
      handleSurfaceError(error)
    }
  }

  async function syncSurfaceFromAccess(
    nextAccess: DocumentShareAccess,
    entry: SharedRouteEntry,
    requestId: number,
  ) {
    if (!isActiveAccessRequest(requestId, entry)) {
      return
    }

    if (shouldOpenReaderDirectly(nextAccess, entry)) {
      const hasLoadedDocument = await loadSharedDocument(entry, nextAccess.documentId)

      if (!hasLoadedDocument || !isActiveAccessRequest(requestId, entry)) {
        return
      }

      surfaceState.value = 'reader'
      return
    }

    surfaceState.value = 'confirm'
  }

  async function loadSharedDocument(entry: SharedRouteEntry, documentId: string) {
    const requestId = ++documentRequestId
    const documentCurrent = await getRouteEntryDocumentCurrent(entry, documentId)

    if (!isActiveDocumentRequest(requestId, entry)) {
      return false
    }

    const resolvedBodies = await hydrateSharedBodies([documentCurrent.currentProjection.body], requestId, entry, documentId)

    if (!isActiveDocumentRequest(requestId, entry)) {
      return false
    }

    const nextDocument = toSharedDocumentReaderDocument({
      ...documentCurrent,
      currentProjection: {
        ...documentCurrent.currentProjection,
        body: resolvedBodies[0] ?? documentCurrent.currentProjection.body,
      },
    })
    document.value = nextDocument
    return true
  }

  async function hydrateSharedBodies(
    bodies: TiptapJsonContent[],
    requestId: number,
    entry: SharedRouteEntry,
    documentId: string,
  ) {
    const assetIds = Array.from(new Set(bodies.flatMap(body => collectDocumentAssetIds(body))))

    if (!assetIds.length) {
      return bodies
    }

    const resolvedAssets = entry.kind === 'share'
      ? await resolveDocumentShareAssets(entry.id, documentId, { assetIds })
      : await resolveDocumentShareRecipientAssets(entry.id, documentId, { assetIds })

    if (!isActiveDocumentRequest(requestId, entry)) {
      return bodies
    }

    const assetsById = Object.fromEntries(
      resolvedAssets.assets.map(asset => [asset.id, asset]),
    )

    return bodies.map(body => hydrateDocumentAssetAttributes(body, assetsById))
  }

  function handleSurfaceError(error: unknown) {
    if (isUnsupportedSharedDocumentSchemaError(error)) {
      surfaceState.value = 'error'
      errorMessage.value = '当前阅读器版本暂不支持这篇文档，请稍后重试'
      return
    }

    const requestError = error as Error & { status?: number }

    if (requestError.status === 404) {
      surfaceState.value = 'invalid'
      errorMessage.value = getRequestErrorDisplayMessage(error, '该分享暂时不可用')
      return
    }

    if (requestError.status === 403) {
      surfaceState.value = 'invalid'
      errorMessage.value = getRequestErrorDisplayMessage(error, '这次分享不属于你')
      return
    }

    surfaceState.value = 'error'
    errorMessage.value = '暂时无法加载分享文档，请稍后重试'
  }

  function resolveCurrentRouteEntry() {
    return routeEntry.value
  }

  function isSameRouteEntry(entry: SharedRouteEntry) {
    const currentEntry = routeEntry.value
    return currentEntry?.kind === entry.kind && currentEntry.id === entry.id
  }

  function isActiveAccessRequest(requestId: number, entry: SharedRouteEntry) {
    return requestId === accessRequestId && isSameRouteEntry(entry)
  }

  function isActiveDocumentRequest(requestId: number, entry: SharedRouteEntry) {
    return requestId === documentRequestId && isSameRouteEntry(entry)
  }

  function shouldOpenReaderDirectly(nextAccess: DocumentShareAccess, entry: SharedRouteEntry) {
    if (entry.kind === 'share' && nextAccess.share.mode !== DOCUMENT_SHARE_MODE.DIRECT_USER) {
      return true
    }

    return nextAccess.recipientStatus === 'ACTIVE'
  }
}

function resolveSharedRouteEntry(params: Record<string, unknown>): SharedRouteEntry | null {
  const recipientId = typeof params.recipientId === 'string' ? params.recipientId.trim() : ''

  if (recipientId) {
    return {
      kind: 'recipient',
      id: recipientId,
    }
  }

  const shareId = typeof params.shareId === 'string' ? params.shareId.trim() : ''

  if (!shareId) {
    return null
  }

  return {
    kind: 'share',
    id: shareId,
  }
}

async function getRouteEntryAccess(entry: SharedRouteEntry): Promise<DocumentShareAccess> {
  return entry.kind === 'share'
    ? await getDocumentShareAccess(entry.id)
    : await getDocumentShareRecipientAccess(entry.id)
}

async function acceptRouteEntry(entry: SharedRouteEntry): Promise<DocumentShareAccess> {
  return entry.kind === 'share'
    ? await acceptDocumentShare(entry.id)
    : await acceptDocumentShareRecipient(entry.id)
}

async function declineRouteEntry(entry: SharedRouteEntry): Promise<DocumentShareAccess> {
  return entry.kind === 'share'
    ? await declineDocumentShare(entry.id)
    : await declineDocumentShareRecipient(entry.id)
}

async function getRouteEntryDocumentCurrent(entry: SharedRouteEntry, documentId: string) {
  return entry.kind === 'share'
    ? await getDocumentShareDocumentCurrent(entry.id, documentId)
    : await getDocumentShareRecipientDocumentCurrent(entry.id, documentId)
}
