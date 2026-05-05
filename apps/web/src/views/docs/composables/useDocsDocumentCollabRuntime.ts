import type {
  CollabAwarenessState,
  CreateCollabTicketResponse,
  TiptapJsonContent,
} from '@haohaoxue/samepage-contracts'
import type { HocuspocusProvider } from '@hocuspocus/provider'
import type { DocsDocumentEditorCollaborationBindings } from '../typing'
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
          connectionError.value = reason || '协作鉴权失败'
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
      connectionError.value = resolveDocumentCollaborationError(error)
      replaceProvider(null)
      return false
    }
  }

  function disconnect() {
    connectRequestId += 1
    clearProviderReconnectTimer()
    connectionError.value = null
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
      connectionError.value = '协作连接在同步前断开'
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
