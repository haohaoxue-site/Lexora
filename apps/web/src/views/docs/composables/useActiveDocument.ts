import type {
  DocumentItem,
  DocumentPageWidthMode,
  DocumentPaneState,
  DocumentSaveState,
  DocumentVersionSnapshot,
  TiptapJsonContent,
} from '@haohaoxue/lexora-contracts'
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
} from '@haohaoxue/lexora-contracts/document/constants'
import { TIPTAP_SCHEMA_VERSION } from '@haohaoxue/lexora-contracts/tiptap/constants'
import { createCollabAwarenessState } from '@haohaoxue/lexora-shared/collab'
import {
  collectDocumentAssetIds,
  getDocumentSaveStateLabel,
  getDocumentTitlePlainText,
  getDocumentVersionSnapshotSummary,
  hasDocumentContent,
  hydrateDocumentAssetAttributes,
} from '@haohaoxue/lexora-shared/document'
import { createSharedComposable, useOnline } from '@vueuse/core'
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
import { translate } from '@/i18n'
import { useUserStore } from '@/stores/user'
import dayjs from '@/utils/dayjs'
import { ElMessage } from '@/utils/element-plus'
import { useDocsContext } from './useDocsContext'
import { useDocsDocumentCollabRuntime } from './useDocsDocumentCollabRuntime'
import { useDocumentTree } from './useDocumentTree'

const UNSUPPORTED_SCHEMA_VERSION_ERROR_CODE = 'DOCUMENT_UNSUPPORTED_SCHEMA_VERSION'

type RequestError = Error & { status?: number }
type UnsupportedSchemaVersionError = Error & {
  code: typeof UNSUPPORTED_SCHEMA_VERSION_ERROR_CODE
  schemaVersion: unknown
}

interface UseActiveDocumentStateOptions {
  patchDocumentItem: (documentId: string, input: Partial<DocumentItem>) => void
}

interface UseActiveDocumentSaveStateOptions {
  currentDocument: ReturnType<typeof shallowRef<ActiveDocumentDetail | null>>
}

interface ApplyRestoredSnapshotOptions {
  documentAtRestoreStart: ActiveDocumentDetail
  restoreResponse: RestoreDocumentVersionSnapshotResponse
}

export const useActiveDocument = createSharedComposable(() => {
  const { activeDocumentId, pendingTitleFocusDocumentId } = useDocsContext()
  const { patchDocumentItem, rememberLastOpenedDocument } = useDocumentTree()
  const userStore = useUserStore()
  const isDocumentItemLoading = shallowRef(false)
  const isSnapshotsLoading = shallowRef(false)
  const isReconnectingCollaboration = shallowRef(false)
  const isOnline = useOnline()
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
    connectionError: collaboration.connectionError.value,
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
    connectionError: collaboration.connectionError.value,
    hasDocument: Boolean(state.currentDocument.value),
    isReadonlyFallback: isCollaborationReadonly.value,
    status: collaboration.connectionStatus.value,
  }))
  const canReconnectCollaboration = computed(() =>
    Boolean(state.currentDocument.value)
    && Boolean(state.currentDocument.value?.access.capabilities.canEdit)
    && !isReconnectingCollaboration.value
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
      const documentCurrent = await getDocumentCurrentRequest(id)

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

      if (loadedDocument.access.capabilities.canEdit) {
        collaboration.prepareRemoteDocument()
        void collaboration.connect({
          documentId: id,
          createTicket: () => createDocumentCollabTicketRequest(id),
          awarenessState: collaborationAwarenessState.value,
        })
      }
      else {
        collaboration.reset()
      }

      rememberLastOpenedDocument(id)
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
    if (!state.currentDocument.value) {
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
      reconnectDocumentIfWritable(nextDocument)

      if (isNoopRestore) {
        ElMessage.info(translate('docs.history.restoreAlreadyCurrent'))
      }
      else {
        ElMessage.success(translate('docs.history.restoreSuccess'))
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

    if (!documentId || !state.currentDocument.value?.access.capabilities.canEdit || isReconnectingCollaboration.value) {
      return false
    }

    isReconnectingCollaboration.value = true

    try {
      return await collaboration.connect({
        documentId,
        createTicket: () => createDocumentCollabTicketRequest(documentId),
        awarenessState: collaborationAwarenessState.value,
      })
    }
    finally {
      isReconnectingCollaboration.value = false
    }
  }

  function isActiveLoadRequest(requestId: number, documentId: string | null) {
    return requestId === loadRequestId && activeDocumentId.value === documentId
  }

  function isActiveSnapshotRequest(requestId: number, documentId: string | null) {
    return requestId === snapshotRequestId && activeDocumentId.value === documentId
  }

  function markTitleAutofocusApplied() {
    if (state.currentDocument.value?.id !== pendingTitleFocusDocumentId.value) {
      return
    }

    pendingTitleFocusDocumentId.value = null
  }

  function applyDocumentTitleChanged(documentCurrent: DocumentCurrent) {
    if (!state.patchDocumentTitle(documentCurrent)) {
      return
    }

    if (state.currentDocument.value) {
      reconnectDocumentIfWritable(state.currentDocument.value)
    }
  }

  function reconnectDocumentIfWritable(document: ActiveDocumentDetail) {
    collaboration.reset()

    if (!document.access.capabilities.canEdit) {
      return
    }

    collaboration.prepareRemoteDocument()
    void collaboration.connect({
      documentId: document.id,
      createTicket: () => createDocumentCollabTicketRequest(document.id),
      awarenessState: collaborationAwarenessState.value,
    })
  }

  watch(
    activeDocumentId,
    async (nextDocumentId) => {
      await loadCurrentDocument(nextDocumentId)
    },
    { immediate: true },
  )

  watch(
    activeDocumentId,
    (nextDocumentId) => {
      if (
        pendingTitleFocusDocumentId.value
        && nextDocumentId !== pendingTitleFocusDocumentId.value
      ) {
        pendingTitleFocusDocumentId.value = null
      }
    },
  )

  watch(isOnline, (nextOnline, previousOnline) => {
    if (
      !nextOnline
      || previousOnline !== false
      || collaboration.connectionStatus.value !== 'disconnected'
    ) {
      return
    }

    void reconnectCollaboration()
  })

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
    applyDocumentTitleChanged,
    canReconnectCollaboration,
    collaboration: collaboration.bindings,
    collaborationConnectionStatus: collaboration.connectionStatus,
    collaborationStatusHint,
    collaborationStatusLabel,
    collaborationStatusTone,
    confirmNavigation,
    currentDocument: state.currentDocument,
    documentErrorState: state.documentErrorState,
    ensureSnapshotsLoaded,
    isCollaborationInitialSyncing,
    isCollaborationReadonly,
    isDocumentItemLoading,
    isRestoringSnapshot: state.isRestoringSnapshot,
    isSaving: state.isSaving,
    isSnapshotsLoading,
    markTitleAutofocusApplied,
    patchDocumentPageWidthMode: state.patchDocumentPageWidthMode,
    reconnectCollaboration,
    reloadCurrentDocument,
    restoreSnapshot,
    saveState: state.saveState,
    saveStateLabel: state.saveStateLabel,
    snapshots: state.snapshots,
    updateDocumentContent,
    updateDocumentTitle,
  }
})

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

  function patchDocumentPageWidthMode(documentId: string, pageWidthMode: DocumentPageWidthMode) {
    if (currentDocument.value?.id !== documentId) {
      return
    }

    currentDocument.value = {
      ...currentDocument.value,
      pageWidthMode,
    }
  }

  function patchDocumentTitle(documentCurrent: DocumentCurrent) {
    if (currentDocument.value?.id !== documentCurrent.document.id) {
      return false
    }

    currentDocument.value = {
      ...currentDocument.value,
      currentProjectionId: documentCurrent.currentProjection.id,
      currentProjectionRevision: documentCurrent.currentProjection.projectionRevision,
      latestVersionSnapshotId: documentCurrent.document.latestVersionSnapshotId,
      summary: documentCurrent.document.summary,
      title: documentCurrent.currentProjection.title,
      updatedAt: documentCurrent.document.updatedAt,
    }

    patchDocumentItem(documentCurrent.document.id, {
      hasContent: documentCurrent.document.summary.length > 0,
      summary: documentCurrent.document.summary,
      title: getDocumentTitlePlainText(documentCurrent.currentProjection.title),
      updatedAt: documentCurrent.document.updatedAt,
    })
    save.markSaved(documentCurrent.currentProjection.updatedAt)
    return true
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
    applyLoadedDocument,
    applyLoadedSnapshots,
    applyRestoredSnapshot,
    currentDocument,
    documentErrorState,
    finishRestore,
    isRestoringSnapshot,
    isSaving,
    loadedSnapshotsDocumentId,
    patchDocumentPageWidthMode,
    patchDocumentTitle,
    resetCurrentDocument,
    saveState: save.saveState,
    saveStateLabel: save.saveStateLabel,
    setDocumentErrorState,
    snapshots,
    startRestore,
    syncRuntimeProjection,
    updateDocumentContent,
    updateDocumentTitle,
  }
}

function useActiveDocumentSaveState({
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
    captureLoadedDocument,
    markSaved,
    reset,
    saveState,
    saveStateLabel,
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
    return translate('docs.history.restoreUnsupportedVersion')
  }

  const requestError = error as RequestError

  if (requestError.status === 409) {
    return translate('docs.history.restoreVersionChanged')
  }

  return translate('docs.history.restoreNoChange')
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
  connectionError: string | null
  hasDocument: boolean
  isReadonlyFallback: boolean
  status: ReturnType<typeof useDocsDocumentCollabRuntime>['connectionStatus']['value']
}): string | null {
  if (!input.hasDocument) {
    return null
  }

  if (input.isReadonlyFallback) {
    if (input.connectionError) {
      return translate('docs.collabRuntime.statusPausedReadonly')
    }

    return input.status === 'error'
      ? translate('docs.collabRuntime.statusUnavailableReadonly')
      : translate('docs.collabRuntime.statusInterruptedReadonly')
  }

  switch (input.status) {
    case 'connecting':
      return translate('docs.collabRuntime.statusConnecting')
    case 'connected':
      return translate('docs.collabRuntime.statusConnected')
    case 'disconnected':
      return translate('docs.collabRuntime.statusDisconnected')
    case 'error':
      return translate('docs.collabRuntime.statusError')
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
  connectionError: string | null
  hasDocument: boolean
  isReadonlyFallback: boolean
  status: ReturnType<typeof useDocsDocumentCollabRuntime>['connectionStatus']['value']
}): string | null {
  if (!input.hasDocument) {
    return null
  }

  if (input.isReadonlyFallback) {
    if (input.connectionError) {
      return translate('docs.collabRuntime.readonlyWithError', { error: input.connectionError })
    }

    return input.status === 'error'
      ? translate('docs.collabRuntime.readonlyError')
      : translate('docs.collabRuntime.readonlyDisconnected')
  }

  if (input.status === 'error' && input.connectionError) {
    return input.connectionError
  }

  if (input.status === 'disconnected') {
    return translate('docs.collabRuntime.disconnectedHint')
  }

  return null
}
