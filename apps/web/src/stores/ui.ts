import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'
import { STORAGE_KEY } from '@/utils/storage'

export const UI_PERSIST_KEY = STORAGE_KEY.ui

const DOCUMENT_TREE_FALLBACK_KEY = '__workspace_pending__'

interface DocumentTreeUiState {
  expandedDocumentIds: string[]
  lastOpenedDocumentId: string | null
}

function cloneDocumentTreeUiState(state: DocumentTreeUiState): DocumentTreeUiState {
  return {
    expandedDocumentIds: [...state.expandedDocumentIds],
    lastOpenedDocumentId: state.lastOpenedDocumentId,
  }
}

function createDocumentTreeUiState(): DocumentTreeUiState {
  return {
    expandedDocumentIds: [],
    lastOpenedDocumentId: null,
  }
}

function resolveDocumentTreeStateKey(workspaceId: string | null) {
  return workspaceId?.trim() || DOCUMENT_TREE_FALLBACK_KEY
}

export const useUiStore = defineStore('ui', () => {
  const workspaceSidebarCollapsed = shallowRef(false)
  const lastActiveChatSessionId = shallowRef<string | null>(null)
  const chatSessionSidebarPinned = shallowRef<boolean | null>(null)
  const _documentTreeStateByWorkspaceId = shallowRef<Record<string, DocumentTreeUiState>>({})
  const documentTreeStateByWorkspaceId = computed(() =>
    Object.fromEntries(
      Object.entries(_documentTreeStateByWorkspaceId.value).map(([workspaceId, state]) => [
        workspaceId,
        cloneDocumentTreeUiState(state),
      ]),
    ),
  )

  function setWorkspaceSidebarCollapsed(value: boolean) {
    workspaceSidebarCollapsed.value = value
  }

  function setLastActiveChatSessionId(sessionId: string | null) {
    const nextSessionId = sessionId?.trim() || null
    lastActiveChatSessionId.value = nextSessionId
  }

  function clearLastActiveChatSessionId(sessionId?: string | null) {
    if (sessionId && lastActiveChatSessionId.value !== sessionId) {
      return
    }

    lastActiveChatSessionId.value = null
  }

  function setChatSessionSidebarPinned(value: boolean | null) {
    chatSessionSidebarPinned.value = value
  }

  function getDocumentTreeState(workspaceId: string | null): DocumentTreeUiState {
    return cloneDocumentTreeUiState(
      _documentTreeStateByWorkspaceId.value[resolveDocumentTreeStateKey(workspaceId)] ?? createDocumentTreeUiState(),
    )
  }

  function patchDocumentTreeState(
    workspaceId: string | null,
    partial: Partial<DocumentTreeUiState>,
  ) {
    const stateKey = resolveDocumentTreeStateKey(workspaceId)
    const currentState = _documentTreeStateByWorkspaceId.value[stateKey] ?? createDocumentTreeUiState()

    _documentTreeStateByWorkspaceId.value = {
      ..._documentTreeStateByWorkspaceId.value,
      [stateKey]: {
        expandedDocumentIds: partial.expandedDocumentIds
          ? [...partial.expandedDocumentIds]
          : [...currentState.expandedDocumentIds],
        lastOpenedDocumentId: partial.lastOpenedDocumentId ?? currentState.lastOpenedDocumentId,
      },
    }
  }

  function setExpandedDocumentIds(workspaceId: string | null, documentIds: string[]) {
    patchDocumentTreeState(workspaceId, {
      expandedDocumentIds: documentIds,
    })
  }

  function setLastOpenedDocumentId(workspaceId: string | null, documentId: string | null) {
    patchDocumentTreeState(workspaceId, {
      lastOpenedDocumentId: documentId,
    })
  }

  function clearDocumentTreeState() {
    _documentTreeStateByWorkspaceId.value = {}
  }

  return {
    _documentTreeStateByWorkspaceId,
    chatSessionSidebarPinned,
    clearDocumentTreeState,
    clearLastActiveChatSessionId,
    documentTreeStateByWorkspaceId,
    getDocumentTreeState,
    lastActiveChatSessionId,
    setChatSessionSidebarPinned,
    setExpandedDocumentIds,
    setLastActiveChatSessionId,
    setLastOpenedDocumentId,
    setWorkspaceSidebarCollapsed,
    workspaceSidebarCollapsed,
  }
}, {
  persist: {
    key: UI_PERSIST_KEY,
    pick: [
      'workspaceSidebarCollapsed',
      'lastActiveChatSessionId',
      'chatSessionSidebarPinned',
      '_documentTreeStateByWorkspaceId',
    ],
  },
})
