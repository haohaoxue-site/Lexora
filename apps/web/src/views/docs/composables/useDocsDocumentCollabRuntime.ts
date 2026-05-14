import type {
  CollabAwarenessState,
  CollabErrorCode,
  CreateCollabTicketResponse,
  TiptapJsonContent,
} from '@haohaoxue/samepage-contracts'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import type { DocsDocumentEditorCollaborationBindings } from '../typing'
import { COLLAB_ERROR_CODE } from '@haohaoxue/samepage-contracts'
import { stripDocumentAssetRuntimeAttributes } from '@haohaoxue/samepage-shared'
import { HocuspocusProvider as HocuspocusRuntimeProvider } from '@hocuspocus/provider'
import { computed, onScopeDispose, shallowRef, watch } from 'vue'
import * as Y from 'yjs'
import {
  projectTiptapDocumentCollaborationYdoc,
  TIPTAP_DOCUMENT_COLLABORATION_FIELD,
} from '@/components/tiptap-editor'

const TRAILING_SLASH_PATTERN = /\/+$/
const COLLABORATION_RECONNECT_GRACE_PERIOD = 5000
const DOCUMENT_COLLABORATION_PERSISTENCE_CLOSE_CODE = 4004
const COLLABORATION_CLOSE_MESSAGE_BY_REASON = {
  [COLLAB_ERROR_CODE.TICKET_INVALID]: '协作票据无效，请重新连接后继续编辑。',
  [COLLAB_ERROR_CODE.TICKET_EXPIRED]: '协作票据已失效，请重新连接后继续编辑。',
  [COLLAB_ERROR_CODE.TICKET_REPLAYED]: '协作票据已被使用，请重新连接后继续编辑。',
  [COLLAB_ERROR_CODE.RATE_LIMITED]: '协作连接过于频繁，请稍后再试。',
  [COLLAB_ERROR_CODE.CONNECTION_LIMIT_EXCEEDED]: '协作连接数已达上限，请稍后再试。',
  [COLLAB_ERROR_CODE.DOCUMENT_MISMATCH]: '协作文档不匹配，请刷新后重试。',
  [COLLAB_ERROR_CODE.ENTRY_MISMATCH]: '协作入口不匹配，请刷新后重试。',
  [COLLAB_ERROR_CODE.RUNTIME_EPOCH_EXPIRED]: '文档运行时已更新，请重新连接后继续编辑。',
  [COLLAB_ERROR_CODE.PERMISSION_INVALIDATED]: '文档权限状态已变化，请重新连接后继续编辑。',
  [COLLAB_ERROR_CODE.READONLY_WRITE_REJECTED]: '当前协作会话没有写入权限，请重新连接后继续编辑。',
  [COLLAB_ERROR_CODE.UPDATE_TOO_LARGE]: '本次协作更新过大，已暂停编辑，请拆分内容后重试。',
  [COLLAB_ERROR_CODE.UPDATE_SEQUENCE_GAP]: '协作保存水位异常，已暂停编辑，请重新加载文档后再继续。',
  [COLLAB_ERROR_CODE.UPDATE_CHECKPOINTED]: '协作保存水位已过期，已暂停编辑，请重新加载文档后再继续。',
  [COLLAB_ERROR_CODE.CHECKPOINT_EXPIRED]: '协作保存 checkpoint 已过期，已暂停编辑，请重新加载文档后再继续。',
  [COLLAB_ERROR_CODE.PERSISTENCE_FAILED]: '协作保存失败，已暂停编辑以避免内容丢失。',
} satisfies Record<CollabErrorCode, string>

/**
 * 协作投影结果。
 */
export interface DocsDocumentCollabProjection {
  /** 标题内容 */
  title: TiptapJsonContent
  /** 正文内容 */
  body: TiptapJsonContent
}

/**
 * 协作连接状态。
 */
export type DocsDocumentCollabConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error'

/**
 * 建立协作连接输入。
 */
export interface ConnectDocsDocumentCollabInput {
  /** 文档 ID */
  documentId: string
  /** 协作票据请求 */
  createTicket: () => Promise<CreateCollabTicketResponse>
  /** awareness 初始状态 */
  awarenessState?: CollabAwarenessState | null
}

export function useDocsDocumentCollabRuntime() {
  const runtimeDocument = shallowRef<Y.Doc | null>(null)
  const provider = shallowRef<HocuspocusProvider | null>(null)
  const awarenessState = shallowRef<CollabAwarenessState | null>(null)
  const connectionStatus = shallowRef<DocsDocumentCollabConnectionStatus>('idle')
  const connectionError = shallowRef<string | null>(null)
  const hasTerminalConnectionError = shallowRef(false)
  const isReadonlyFallback = shallowRef(false)
  const isRemoteSynced = shallowRef(false)
  const currentRuntimeEpoch = shallowRef<number | null>(null)
  const projectionVersion = shallowRef(0)
  const sessionVersion = shallowRef(0)
  let connectRequestId = 0
  let readonlyFallbackTimer: ReturnType<typeof setTimeout> | null = null
  let providerReconnectTimer: ReturnType<typeof setTimeout> | null = null
  const bindings = computed<DocsDocumentEditorCollaborationBindings | null>(() => {
    if (!runtimeDocument.value || !provider.value || !isRemoteSynced.value) {
      return null
    }

    return {
      sessionKey: `collaboration-${sessionVersion.value}`,
      title: {
        document: runtimeDocument.value,
        field: TIPTAP_DOCUMENT_COLLABORATION_FIELD.TITLE,
        provider: provider.value,
        awarenessState: awarenessState.value,
      },
      body: {
        document: runtimeDocument.value,
        field: TIPTAP_DOCUMENT_COLLABORATION_FIELD.BODY,
        provider: provider.value,
        awarenessState: awarenessState.value,
      },
    }
  })

  function prepareRemoteDocument() {
    disconnect()
    currentRuntimeEpoch.value = null
    replaceRuntimeDocument(new Y.Doc())
    isRemoteSynced.value = false
  }

  function projectContent(): DocsDocumentCollabProjection | null {
    if (!runtimeDocument.value) {
      return null
    }

    const projected = projectTiptapDocumentCollaborationYdoc(runtimeDocument.value)

    return {
      title: projected.title,
      body: stripDocumentAssetRuntimeAttributes(projected.body),
    }
  }

  async function connect(input: ConnectDocsDocumentCollabInput) {
    const requestId = ++connectRequestId
    return await connectWithRequest(input, requestId)
  }

  async function connectWithRequest(input: ConnectDocsDocumentCollabInput, requestId: number) {
    const initialDocument = runtimeDocument.value
    if (!initialDocument) {
      return false
    }
    let document = initialDocument

    awarenessState.value = input.awarenessState ?? null
    connectionError.value = null
    hasTerminalConnectionError.value = false
    isRemoteSynced.value = false
    clearProviderReconnectTimer()
    applyConnectionStatus('connecting')

    try {
      const ticket = await input.createTicket()

      if (!isActiveConnectRequest(requestId, document)) {
        return false
      }

      if (currentRuntimeEpoch.value !== null && currentRuntimeEpoch.value !== ticket.runtimeEpoch) {
        replaceProvider(null)
        replaceRuntimeDocument(new Y.Doc())
        const nextDocument = runtimeDocument.value

        if (!nextDocument || !isActiveRequest(requestId)) {
          return false
        }

        document = nextDocument
      }

      currentRuntimeEpoch.value = ticket.runtimeEpoch

      let createdProvider: HocuspocusProvider | null = null
      const nextProvider = new HocuspocusRuntimeProvider({
        name: input.documentId,
        document,
        url: resolveDocumentCollaborationWebsocketUrl(ticket.publicWsUrl, input.documentId, ticket.token),
        token: ticket.token,
        onAuthenticationFailed: ({ reason }) => {
          if (!isActiveConnectRequest(requestId, document)) {
            return
          }

          applyConnectionStatus('error')
          hasTerminalConnectionError.value = true
          connectionError.value = resolveDocumentCollaborationCloseState({ reason }).message
            ?? reason
            ?? '协作鉴权失败'
        },
        onClose: ({ event }) => {
          if (!isActiveConnectRequest(requestId, document)) {
            return
          }

          const closeState = resolveDocumentCollaborationCloseState(event)

          if (!closeState.message) {
            return
          }

          connectionError.value = closeState.message
          hasTerminalConnectionError.value = closeState.terminal
        },
        onStatus: ({ status }) => {
          if (!isActiveConnectRequest(requestId, document)) {
            return
          }

          if (createdProvider) {
            syncRemoteSyncedFromProvider(createdProvider)
          }

          if (status === 'disconnected') {
            handleProviderDisconnected({
              document,
              input,
              requestId,
            })
            return
          }

          applyConnectionStatus(status)
        },
        onSynced: ({ state }) => {
          if (!isActiveConnectRequest(requestId, document)) {
            return
          }

          isRemoteSynced.value = state
        },
      })
      createdProvider = nextProvider

      nextProvider.awareness?.setLocalState(input.awarenessState ?? null)

      if (!isActiveConnectRequest(requestId, document)) {
        nextProvider.destroy()
        return false
      }

      replaceProvider(nextProvider)
      return true
    }
    catch (error) {
      if (!isActiveConnectRequest(requestId, document)) {
        return false
      }

      applyConnectionStatus('error')
      hasTerminalConnectionError.value = true
      connectionError.value = resolveDocumentCollaborationError(error)
      replaceProvider(null)
      return false
    }
  }

  function disconnect() {
    connectRequestId += 1
    clearProviderReconnectTimer()
    connectionError.value = null
    hasTerminalConnectionError.value = false
    applyConnectionStatus('idle')
    replaceProvider(null)
  }

  function reset() {
    disconnect()
    awarenessState.value = null
    currentRuntimeEpoch.value = null
    replaceRuntimeDocument(null)
  }

  watch(
    runtimeDocument,
    (nextDocument, previousDocument, onCleanup) => {
      if (previousDocument) {
        previousDocument.off('update', handleRuntimeDocumentUpdate)
      }

      projectionVersion.value += 1

      if (!nextDocument) {
        return
      }

      nextDocument.on('update', handleRuntimeDocumentUpdate)
      onCleanup(() => {
        nextDocument.off('update', handleRuntimeDocumentUpdate)
      })
    },
    {
      immediate: true,
    },
  )

  onScopeDispose(() => {
    reset()
  })

  return {
    bindings,
    runtimeDocument,
    provider,
    connectionStatus,
    connectionError,
    isReadonlyFallback,
    isRemoteSynced,
    projectionVersion,
    prepareRemoteDocument,
    projectContent,
    connect,
    disconnect,
    reset,
  }

  function handleRuntimeDocumentUpdate() {
    projectionVersion.value += 1
  }

  function isActiveConnectRequest(requestId: number, document: Y.Doc) {
    return requestId === connectRequestId && runtimeDocument.value === document
  }

  function isActiveRequest(requestId: number) {
    return requestId === connectRequestId
  }

  function handleProviderDisconnected(payload: {
    document: Y.Doc
    input: ConnectDocsDocumentCollabInput
    requestId: number
  }) {
    const wasRemoteSynced = isRemoteSynced.value
    isRemoteSynced.value = false

    if (!isActiveConnectRequest(payload.requestId, payload.document)) {
      return
    }

    if (!wasRemoteSynced) {
      connectionError.value ??= '协作连接在同步前断开'
      hasTerminalConnectionError.value = true
      replaceProvider(null)
      applyConnectionStatus('error')
      return
    }

    if (hasTerminalConnectionError.value) {
      replaceProvider(null)
      applyConnectionStatus('error')
      return
    }

    applyConnectionStatus('disconnected')
    const reconnectRequestId = ++connectRequestId
    replaceProvider(null)
    providerReconnectTimer = setTimeout(() => {
      providerReconnectTimer = null
      void connectWithRequest(payload.input, reconnectRequestId)
    }, 0)
  }

  function replaceProvider(nextProvider: HocuspocusProvider | null) {
    if (provider.value === nextProvider) {
      return
    }

    provider.value?.destroy()
    provider.value = nextProvider
    if (!nextProvider) {
      isRemoteSynced.value = false
    }
    sessionVersion.value += 1
  }

  function replaceRuntimeDocument(nextDocument: Y.Doc | null) {
    if (runtimeDocument.value === nextDocument) {
      return
    }

    runtimeDocument.value?.destroy()
    runtimeDocument.value = nextDocument
    if (!nextDocument) {
      isRemoteSynced.value = false
    }
    sessionVersion.value += 1
  }

  function applyConnectionStatus(nextStatus: DocsDocumentCollabConnectionStatus) {
    connectionStatus.value = nextStatus

    if (nextStatus === 'error') {
      activateReadonlyFallback()
      return
    }

    if (nextStatus === 'disconnected') {
      scheduleReadonlyFallback()
      return
    }

    clearReadonlyFallback()
  }

  function scheduleReadonlyFallback() {
    clearReadonlyFallbackTimer()

    readonlyFallbackTimer = setTimeout(() => {
      readonlyFallbackTimer = null

      if (connectionStatus.value !== 'disconnected') {
        return
      }

      activateReadonlyFallback()
    }, COLLABORATION_RECONNECT_GRACE_PERIOD)
  }

  function activateReadonlyFallback() {
    clearReadonlyFallbackTimer()
    isReadonlyFallback.value = true
  }

  function clearReadonlyFallback() {
    clearReadonlyFallbackTimer()
    isReadonlyFallback.value = false
  }

  function clearReadonlyFallbackTimer() {
    if (!readonlyFallbackTimer) {
      return
    }

    clearTimeout(readonlyFallbackTimer)
    readonlyFallbackTimer = null
  }

  function clearProviderReconnectTimer() {
    if (!providerReconnectTimer) {
      return
    }

    clearTimeout(providerReconnectTimer)
    providerReconnectTimer = null
  }

  function syncRemoteSyncedFromProvider(nextProvider: HocuspocusProvider) {
    if (!nextProvider.synced) {
      return
    }

    isRemoteSynced.value = true
  }
}

function resolveDocumentCollaborationError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return '暂时无法建立协作连接'
}

interface DocumentCollaborationCloseEventLike {
  code?: number
  reason?: string
}

function resolveDocumentCollaborationCloseState(event: DocumentCollaborationCloseEventLike): {
  message: string | null
  terminal: boolean
} {
  const reason = resolveDocumentCollaborationCloseReason(event.reason)

  if (reason) {
    return {
      message: COLLABORATION_CLOSE_MESSAGE_BY_REASON[reason],
      terminal: true,
    }
  }

  if (event.code === DOCUMENT_COLLABORATION_PERSISTENCE_CLOSE_CODE) {
    return {
      message: COLLABORATION_CLOSE_MESSAGE_BY_REASON[COLLAB_ERROR_CODE.PERSISTENCE_FAILED],
      terminal: true,
    }
  }

  return {
    message: null,
    terminal: false,
  }
}

function resolveDocumentCollaborationCloseReason(reason: string | undefined): CollabErrorCode | null {
  if (!reason) {
    return null
  }

  const closeReason = reason.trim()

  return Object.values(COLLAB_ERROR_CODE).includes(closeReason as CollabErrorCode)
    ? closeReason as CollabErrorCode
    : null
}

function resolveDocumentCollaborationWebsocketUrl(publicWsUrl: string, documentId: string, ticket: string): string {
  const endpoint = `${publicWsUrl.replace(TRAILING_SLASH_PATTERN, '')}/${encodeURIComponent(documentId)}`
  const url = new URL(endpoint, window.location.href)

  if (url.protocol === 'http:') {
    url.protocol = 'ws:'
  }
  else if (url.protocol === 'https:') {
    url.protocol = 'wss:'
  }

  url.searchParams.set('ticket', ticket)

  return url.toString()
}
