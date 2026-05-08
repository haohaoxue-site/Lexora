import type {
  DocumentItem,
  DocumentPaneState,
  DocumentSaveState,
  DocumentShareProjection,
  DocumentVersionSnapshot,
  TiptapJsonContent,
} from '@haohaoxue/samepage-contracts'
import type { ComputedRef } from 'vue'
import type {
  ActiveDocumentDetail,
  DocsDocumentCollaborationStatusTone,
} from '../typing'
import type {
  DocumentCurrent,
  RestoreDocumentVersionSnapshotResponse,
} from '@/apis/document'
import {
  DOCUMENT_PANE_STATE,
  DOCUMENT_SAVE_STATE,
  TIPTAP_SCHEMA_VERSION,
} from '@haohaoxue/samepage-contracts'
import {
  collectDocumentAssetIds,
  createCollabAwarenessState,
  getDocumentSaveStateLabel,
  getDocumentTitlePlainText,
  getDocumentVersionSnapshotSummary,
  hasDocumentContent,
  hydrateDocumentAssetAttributes,
} from '@haohaoxue/samepage-shared'
import { ElMessage } from 'element-plus'
import {
  computed,
  shallowRef,
  watch,
} from 'vue'
import {
  createDocumentCollabTicket as createDocumentCollabTicketRequest,
  getDocumentCurrent as getDocumentCurrentRequest,
  getDocumentVersionSnapshots as getDocumentVersionSnapshotsRequest,
  resolveDocumentAssets as resolveDocumentAssetsRequest,
  restoreDocumentVersionSnapshot as restoreDocumentVersionSnapshotRequest,
} from '@/apis/document'
import { useUserStore } from '@/stores/user'
import dayjs from '@/utils/dayjs'
import { useDocsDocumentCollabRuntime } from './useDocsDocumentCollabRuntime'

const UNSUPPORTED_SCHEMA_VERSION_ERROR_CODE = 'DOCUMENT_UNSUPPORTED_SCHEMA_VERSION'

type RequestError = Error & { status?: number }
type UnsupportedSchemaVersionError = Error & {
  code: typeof UNSUPPORTED_SCHEMA_VERSION_ERROR_CODE
  schemaVersion: unknown
}

/**
 * 当前文档组合参数。
 */
interface UseActiveDocumentOptions {
  activeDocumentId: ComputedRef<string | null>
  ensureExpandedPath: (documentId: string | null) => void
  patchDocumentItem: (documentId: string, input: Partial<DocumentItem>) => void
  rememberLastOpenedDocument: (documentId: string) => void
}

/**
 * 当前文档状态组合参数。
 */
interface UseActiveDocumentStateOptions {
  patchDocumentItem: (documentId: string, input: Partial<DocumentItem>) => void
}

/**
 * 当前文档保存态组合参数。
 */
interface UseActiveDocumentSaveStateOptions {
  currentDocument: ReturnType<typeof shallowRef<ActiveDocumentDetail | null>>
}

/**
 * 恢复历史版本后的状态应用参数。
 */
interface ApplyRestoredSnapshotOptions {
  documentAtRestoreStart: ActiveDocumentDetail
  restoreResponse: RestoreDocumentVersionSnapshotResponse
}

export function useActiveDocument({
  activeDocumentId,
  ensureExpandedPath,
  patchDocumentItem,
  rememberLastOpenedDocument,
}: UseActiveDocumentOptions) {
  const userStore = useUserStore()
  const isDocumentItemLoading = shallowRef(false)
  const isSnapshotsLoading = shallowRef(false)
  let loadRequestId = 0
  let snapshotRequestId = 0

  const state = useActiveDocumentState({
    patchDocumentItem,
  })
  const collaboration = useDocsDocumentCollabRuntime()
  const collaborationAwarenessState = computed(() =>
    createCollabAwarenessState(userStore.currentUser),
  )
  const isCollaborationReadonly = computed(() => collaboration.isReadonlyFallback.value)
  const isCollaborationInitialSyncing = computed(() =>
    Boolean(collaboration.runtimeDocument.value)
    && !collaboration.isRemoteSynced.value
    && !isCollaborationReadonly.value,
  )
  const collaborationStatusLabel = computed(() => resolveEditableCollaborationStatusLabel({
    hasDocument: Boolean(state.currentDocument.value),
    isReadonlyFallback: isCollaborationReadonly.value,
    status: collaboration.connectionStatus.value,
  }))
  const collaborationStatusTone = computed(() => resolveEditableCollaborationStatusTone({
    hasDocument: Boolean(state.currentDocument.value),
    isReadonlyFallback: isCollaborationReadonly.value,
    status: collaboration.connectionStatus.value,
  }))
  const collaborationStatusHint = computed(() => resolveEditableCollaborationStatusHint({
    hasDocument: Boolean(state.currentDocument.value),
    isReadonlyFallback: isCollaborationReadonly.value,
    status: collaboration.connectionStatus.value,
  }))
  const canReconnectCollaboration = computed(() =>
    Boolean(state.currentDocument.value)
    && (collaboration.connectionStatus.value === 'disconnected' || collaboration.connectionStatus.value === 'error'),
  )
  function updateDocumentTitle(title: TiptapJsonContent) {
    state.updateDocumentTitle(title)
  }

  function updateDocumentContent(content: TiptapJsonContent) {
    state.updateDocumentContent(content)
  }

  async function loadCurrentDocument(id: string | null) {
    const requestId = ++loadRequestId

    if (!id) {
      isDocumentItemLoading.value = false
      isSnapshotsLoading.value = false
      collaboration.reset()
      state.resetCurrentDocument()
      return
    }

    isDocumentItemLoading.value = true
    isSnapshotsLoading.value = false
    state.resetCurrentDocument()

    try {
      const documentCurrent = await getDocumentCurrentRequest(id, { recordVisit: true })

      if (!isActiveLoadRequest(requestId, id)) {
        return
      }

      const resolvedBodies = await hydrateDocumentBodies(id, [
        documentCurrent.currentProjection.body,
      ])

      if (!isActiveLoadRequest(requestId, id)) {
        return
      }

      const loadedDocument = toActiveDocument({
        ...documentCurrent,
        currentProjection: {
          ...documentCurrent.currentProjection,
          body: resolvedBodies[0] ?? documentCurrent.currentProjection.body,
        },
      })

      if (!isActiveLoadRequest(requestId, id)) {
        return
      }

      state.applyLoadedDocument(loadedDocument, [])
      collaboration.prepareRemoteDocument()
      void collaboration.connect({
        documentId: id,
        createTicket: () => createDocumentCollabTicketRequest(id),
        awarenessState: collaborationAwarenessState.value,
      })
      rememberLastOpenedDocument(id)
      ensureExpandedPath(id)
    }
    catch (error) {
      if (!isActiveLoadRequest(requestId, id)) {
        return
      }

      state.setDocumentErrorState(resolveDocumentErrorState(error))
      collaboration.reset()
    }
    finally {
      if (isActiveLoadRequest(requestId, id)) {
        isDocumentItemLoading.value = false
        isSnapshotsLoading.value = false
      }
    }
  }

  async function confirmNavigation() {
    return true
  }

  async function restoreSnapshot(snapshotId: string) {
    if (!state.currentDocument.value || state.currentDocument.value.latestVersionSnapshotId === snapshotId) {
      return
    }

    const documentAtRestoreStart = state.currentDocument.value
    state.startRestore()

    try {
      const currentDocument = await getDocumentCurrentRequest(documentAtRestoreStart.id)
      const restoredDocument = await restoreDocumentVersionSnapshotRequest(documentAtRestoreStart.id, {
        baseProjectionRevision: currentDocument.currentProjection.projectionRevision,
        versionSnapshotId: snapshotId,
      })
      const [hydratedBody] = await hydrateDocumentBodies(documentAtRestoreStart.id, [
        restoredDocument.current.currentProjection.body,
      ])
      const hydratedRestoredDocument = {
        ...restoredDocument,
        current: {
          ...restoredDocument.current,
          currentProjection: {
            ...restoredDocument.current.currentProjection,
            body: hydratedBody ?? restoredDocument.current.currentProjection.body,
          },
        },
      }

      const { isNoopRestore, nextDocument } = state.applyRestoredSnapshot({
        documentAtRestoreStart,
        restoreResponse: hydratedRestoredDocument,
      })
      collaboration.reset()
      collaboration.prepareRemoteDocument()
      void collaboration.connect({
        documentId: nextDocument.id,
        createTicket: () => createDocumentCollabTicketRequest(nextDocument.id),
        awarenessState: collaborationAwarenessState.value,
      })

      if (isNoopRestore) {
        ElMessage.info('该历史记录已是当前内容')
      }
      else {
        ElMessage.success('已恢复到所选版本')
      }
    }
    catch (error) {
      if (isUnsupportedSchemaVersionError(error)) {
        state.setDocumentErrorState(DOCUMENT_PANE_STATE.UNSUPPORTED_SCHEMA)
        collaboration.reset()
      }

      ElMessage.error(resolveDocumentWriteErrorMessage(error))
    }
    finally {
      state.finishRestore()
    }
  }

  async function reloadCurrentDocument() {
    await loadCurrentDocument(activeDocumentId.value)
  }

  async function ensureSnapshotsLoaded() {
    const documentId = activeDocumentId.value

    if (!documentId || state.loadedSnapshotsDocumentId.value === documentId || isSnapshotsLoading.value) {
      return
    }

    const requestId = ++snapshotRequestId
    isSnapshotsLoading.value = true

    try {
      const loadedSnapshots = await getDocumentVersionSnapshotsRequest(documentId)

      if (!isActiveSnapshotRequest(requestId, documentId)) {
        return
      }

      const resolvedBodies = await hydrateDocumentBodies(documentId, loadedSnapshots.map(snapshot => snapshot.body))

      if (!isActiveSnapshotRequest(requestId, documentId)) {
        return
      }

      state.applyLoadedSnapshots(documentId, loadedSnapshots.map((snapshot, index) => ({
        ...snapshot,
        body: resolvedBodies[index] ?? snapshot.body,
      })))
    }
    finally {
      if (isActiveSnapshotRequest(requestId, documentId)) {
        isSnapshotsLoading.value = false
      }
    }
  }

  async function reconnectCollaboration() {
    const documentId = state.currentDocument.value?.id

    if (!documentId) {
      return false
    }

    return await collaboration.connect({
      documentId,
      createTicket: () => createDocumentCollabTicketRequest(documentId),
      awarenessState: collaborationAwarenessState.value,
    })
  }

  function isActiveLoadRequest(requestId: number, documentId: string | null) {
    return requestId === loadRequestId && activeDocumentId.value === documentId
  }

  function isActiveSnapshotRequest(requestId: number, documentId: string | null) {
    return requestId === snapshotRequestId && activeDocumentId.value === documentId
  }

  watch(
    activeDocumentId,
    async (nextDocumentId) => {
      await loadCurrentDocument(nextDocumentId)
    },
    { immediate: true },
  )

  watch(
    [
      () => state.currentDocument.value?.id ?? null,
      () => collaboration.isRemoteSynced.value,
      () => collaboration.projectionVersion.value,
    ],
    () => {
      const currentDocument = state.currentDocument.value

      if (!currentDocument || !collaboration.isRemoteSynced.value) {
        return
      }

      const projected = collaboration.projectContent()

      if (!projected) {
        return
      }

      state.syncRuntimeProjection(projected)
    },
    {
      flush: 'post',
    },
  )

  return {
    currentDocument: state.currentDocument,
    snapshots: state.snapshots,
    isDocumentItemLoading,
    isSnapshotsLoading,
    isSaving: state.isSaving,
    isRestoringSnapshot: state.isRestoringSnapshot,
    saveState: state.saveState,
    saveStateLabel: state.saveStateLabel,
    documentErrorState: state.documentErrorState,
    isCollaborationReadonly,
    isCollaborationInitialSyncing,
    collaborationConnectionStatus: collaboration.connectionStatus,
    collaborationStatusLabel,
    collaborationStatusTone,
    collaborationStatusHint,
    canReconnectCollaboration,
    confirmNavigation,
    ensureSnapshotsLoaded,
    reloadCurrentDocument,
    reconnectCollaboration,
    patchDocumentShare: state.patchDocumentShare,
    collaboration: collaboration.bindings,
    restoreSnapshot,
    updateDocumentTitle,
    updateDocumentContent,
  }
}

export function useActiveDocumentState({
  patchDocumentItem,
}: UseActiveDocumentStateOptions) {
  const currentDocument = shallowRef<ActiveDocumentDetail | null>(null)
  const snapshots = shallowRef<DocumentVersionSnapshot[]>([])
  const isSaving = shallowRef(false)
  const isRestoringSnapshot = shallowRef(false)
  const documentErrorState = shallowRef<DocumentPaneState | null>(null)
  const loadedSnapshotsDocumentId = shallowRef<string | null>(null)
  const save = useActiveDocumentSaveState({
    currentDocument,
  })

  function updateDocumentTitle(title: TiptapJsonContent) {
    if (!currentDocument.value) {
      return
    }

    currentDocument.value = {
      ...currentDocument.value,
      title,
    }

    patchDocumentItem(currentDocument.value.id, {
      title: getDocumentTitlePlainText(title),
    })
  }

  function updateDocumentContent(content: TiptapJsonContent) {
    if (!currentDocument.value) {
      return
    }

    currentDocument.value = {
      ...currentDocument.value,
      body: content,
    }
  }

  function syncRuntimeProjection(projection: {
    title: TiptapJsonContent
    body: TiptapJsonContent
  }) {
    if (!currentDocument.value) {
      return
    }

    if (
      JSON.stringify(currentDocument.value.title) === JSON.stringify(projection.title)
      && JSON.stringify(currentDocument.value.body) === JSON.stringify(projection.body)
    ) {
      return
    }

    currentDocument.value = {
      ...currentDocument.value,
      title: projection.title,
      body: projection.body,
    }

    patchDocumentItem(currentDocument.value.id, {
      title: getDocumentTitlePlainText(projection.title),
    })
  }

  function applyLoadedDocument(document: ActiveDocumentDetail, loadedSnapshots: DocumentVersionSnapshot[]) {
    currentDocument.value = document
    snapshots.value = loadedSnapshots
    documentErrorState.value = null
    loadedSnapshotsDocumentId.value = loadedSnapshots.length ? document.id : null
    save.captureLoadedDocument(document)
  }

  function applyLoadedSnapshots(documentId: string, loadedSnapshots: DocumentVersionSnapshot[]) {
    if (currentDocument.value?.id !== documentId) {
      return
    }

    snapshots.value = loadedSnapshots
    loadedSnapshotsDocumentId.value = documentId
  }

  function patchDocumentShare(documentId: string, share: DocumentShareProjection | null) {
    if (currentDocument.value?.id !== documentId) {
      return
    }

    currentDocument.value = {
      ...currentDocument.value,
      share,
    }
  }

  function startRestore() {
    isRestoringSnapshot.value = true
  }

  function finishRestore() {
    isRestoringSnapshot.value = false
  }

  function applyRestoredSnapshot({
    documentAtRestoreStart,
    restoreResponse,
  }: ApplyRestoredSnapshotOptions) {
    const nextDocument = toActiveDocument(restoreResponse.current)
    const isNoopRestore = restoreResponse.current.currentProjection.projectionRevision === documentAtRestoreStart.currentProjectionRevision
      && restoreResponse.snapshot.id === documentAtRestoreStart.latestVersionSnapshotId

    currentDocument.value = nextDocument
    snapshots.value = prependSnapshot(snapshots.value, restoreResponse.snapshot)
    save.markSaved(restoreResponse.current.currentProjection.updatedAt)
    patchDocumentItem(nextDocument.id, buildTreePatch({
      title: nextDocument.title,
      body: nextDocument.body,
      updatedAt: restoreResponse.current.currentProjection.updatedAt,
    }))

    return {
      isNoopRestore,
      nextDocument,
    }
  }

  function resetCurrentDocument() {
    currentDocument.value = null
    snapshots.value = []
    documentErrorState.value = null
    loadedSnapshotsDocumentId.value = null
    save.reset()
  }

  function setDocumentErrorState(state: DocumentPaneState) {
    currentDocument.value = null
    snapshots.value = []
    documentErrorState.value = state
    loadedSnapshotsDocumentId.value = null
    save.reset()
  }

  return {
    currentDocument,
    snapshots,
    isSaving,
    isRestoringSnapshot,
    loadedSnapshotsDocumentId,
    saveState: save.saveState,
    saveStateLabel: save.saveStateLabel,
    documentErrorState,
    updateDocumentTitle,
    updateDocumentContent,
    syncRuntimeProjection,
    applyLoadedDocument,
    applyLoadedSnapshots,
    patchDocumentShare,
    startRestore,
    finishRestore,
    applyRestoredSnapshot,
    resetCurrentDocument,
    setDocumentErrorState,
  }
}

export function useActiveDocumentSaveState({
  currentDocument,
}: UseActiveDocumentSaveStateOptions) {
  const saveState = shallowRef<DocumentSaveState>(DOCUMENT_SAVE_STATE.IDLE)
  const lastPersistedAt = shallowRef<string | null>(null)
  const lastUpdatedFromNow = computed(() =>
    lastPersistedAt.value ? dayjs(lastPersistedAt.value).fromNow() : null,
  )
  const saveStateLabel = computed(() => getDocumentSaveStateLabel({
    hasDocument: Boolean(currentDocument.value),
    saveState: saveState.value,
    lastUpdatedFromNow: lastUpdatedFromNow.value,
  }))

  function captureLoadedDocument(document: ActiveDocumentDetail) {
    lastPersistedAt.value = document.updatedAt
    saveState.value = DOCUMENT_SAVE_STATE.IDLE
  }

  function markSaved(persistedAt: string) {
    lastPersistedAt.value = persistedAt
    saveState.value = DOCUMENT_SAVE_STATE.SAVED
  }

  function reset() {
    lastPersistedAt.value = null
    saveState.value = DOCUMENT_SAVE_STATE.IDLE
  }

  return {
    saveState,
    saveStateLabel,
    captureLoadedDocument,
    markSaved,
    reset,
  }
}

export function toActiveDocument(documentCurrent: DocumentCurrent): ActiveDocumentDetail {
  assertSupportedSchemaVersion(documentCurrent.currentProjection.schemaVersion)

  return {
    ...documentCurrent.document,
    currentProjectionId: documentCurrent.currentProjection.id,
    currentProjectionRevision: documentCurrent.currentProjection.projectionRevision,
    schemaVersion: documentCurrent.currentProjection.schemaVersion,
    title: documentCurrent.currentProjection.title,
    body: documentCurrent.currentProjection.body,
  }
}

async function hydrateDocumentBodies(documentId: string, bodies: TiptapJsonContent[]) {
  const assetIds = Array.from(new Set(bodies.flatMap(body => collectDocumentAssetIds(body))))

  if (!assetIds.length) {
    return bodies
  }

  const resolvedAssets = await resolveDocumentAssetsRequest(documentId, {
    assetIds,
  })
  const assetsById = Object.fromEntries(
    resolvedAssets.assets.map(asset => [asset.id, asset]),
  )

  return bodies.map(body => hydrateDocumentAssetAttributes(body, assetsById))
}

export function resolveDocumentErrorState(error: unknown): DocumentPaneState {
  if (isUnsupportedSchemaVersionError(error)) {
    return DOCUMENT_PANE_STATE.UNSUPPORTED_SCHEMA
  }

  const requestError = error as RequestError

  if (requestError.status === 403) {
    return DOCUMENT_PANE_STATE.FORBIDDEN
  }

  if (requestError.status === 404) {
    return DOCUMENT_PANE_STATE.NOT_FOUND
  }

  return DOCUMENT_PANE_STATE.ERROR
}

export function resolveDocumentWriteErrorMessage(error: unknown): string {
  if (isUnsupportedSchemaVersionError(error)) {
    return '当前编辑器版本不支持这篇文档，请刷新或升级后再试'
  }

  const requestError = error as RequestError

  if (requestError.status === 409) {
    return '文档版本已变化，请刷新后重试'
  }

  return '操作失败，当前内容未变更'
}

export function isUnsupportedSchemaVersionError(error: unknown): error is UnsupportedSchemaVersionError {
  return error instanceof Error
    && (error as Partial<UnsupportedSchemaVersionError>).code === UNSUPPORTED_SCHEMA_VERSION_ERROR_CODE
}

function buildTreePatch(options: {
  title: TiptapJsonContent
  body: TiptapJsonContent
  updatedAt: string
}): Partial<DocumentItem> {
  return {
    title: getDocumentTitlePlainText(options.title),
    summary: getDocumentVersionSnapshotSummary({
      body: options.body,
    }, 120, ''),
    updatedAt: options.updatedAt,
    hasContent: hasDocumentContent(options.body),
  }
}

function prependSnapshot(snapshots: DocumentVersionSnapshot[], nextSnapshot: DocumentVersionSnapshot) {
  return [
    nextSnapshot,
    ...snapshots.filter(snapshot => snapshot.id !== nextSnapshot.id),
  ]
}

function assertSupportedSchemaVersion(schemaVersion: unknown): asserts schemaVersion is typeof TIPTAP_SCHEMA_VERSION {
  if (schemaVersion === TIPTAP_SCHEMA_VERSION) {
    return
  }

  throw createUnsupportedSchemaVersionError(schemaVersion)
}

function createUnsupportedSchemaVersionError(schemaVersion: unknown): UnsupportedSchemaVersionError {
  const error = new Error(`Unsupported document schema version: ${String(schemaVersion)}`) as UnsupportedSchemaVersionError
  error.code = UNSUPPORTED_SCHEMA_VERSION_ERROR_CODE
  error.schemaVersion = schemaVersion
  return error
}

function resolveEditableCollaborationStatusLabel(input: {
  hasDocument: boolean
  isReadonlyFallback: boolean
  status: ReturnType<typeof useDocsDocumentCollabRuntime>['connectionStatus']['value']
}): string | null {
  if (!input.hasDocument) {
    return null
  }

  if (input.isReadonlyFallback) {
    return input.status === 'error'
      ? '协作不可用，当前只读保护'
      : '协作已中断，当前只读保护'
  }

  switch (input.status) {
    case 'connecting':
      return '协作连接中'
    case 'connected':
      return '协作已连接'
    case 'disconnected':
      return '协作正在重连'
    case 'error':
      return '协作连接失败'
    default:
      return null
  }
}

function resolveEditableCollaborationStatusTone(input: {
  hasDocument: boolean
  isReadonlyFallback: boolean
  status: ReturnType<typeof useDocsDocumentCollabRuntime>['connectionStatus']['value']
}): DocsDocumentCollaborationStatusTone | null {
  if (!input.hasDocument) {
    return null
  }

  if (input.isReadonlyFallback) {
    return 'danger'
  }

  switch (input.status) {
    case 'connecting':
      return 'connecting'
    case 'connected':
      return 'connected'
    case 'disconnected':
    case 'error':
      return 'danger'
    default:
      return 'neutral'
  }
}

function resolveEditableCollaborationStatusHint(input: {
  hasDocument: boolean
  isReadonlyFallback: boolean
  status: ReturnType<typeof useDocsDocumentCollabRuntime>['connectionStatus']['value']
}): string | null {
  if (!input.hasDocument) {
    return null
  }

  if (input.isReadonlyFallback) {
    return input.status === 'error'
      ? '当前内容已进入只读保护，点击重新连接后再尝试继续编辑。'
      : '当前内容已进入只读保护，重新连接后才能继续编辑。'
  }

  if (input.status === 'disconnected') {
    return '短暂断线中，正在尝试恢复协作连接。'
  }

  return null
}
