import { defineStore } from 'pinia'
import { shallowRef } from 'vue'
import { STORAGE_KEY } from '@/utils/storage'

export const UI_PERSIST_KEY = STORAGE_KEY.ui

const DOCUMENT_TREE_FALLBACK_KEY = '__workspace_pending__'

function resolveDocumentTreeStateKey(workspaceId: string | null) {
  return workspaceId?.trim() || DOCUMENT_TREE_FALLBACK_KEY
}

export const useUiStore = defineStore('ui', () => {
  const workspaceSidebarCollapsed = shallowRef(false)
  const lastActiveChatSessionId = shallowRef<string | null>(null)
  const chatSessionSidebarPinned = shallowRef<boolean | null>(null)
  const documentLibrarySidebarCollapsed = shallowRef(false)
  const _lastOpenedDocumentIdByWorkspaceId = shallowRef<Record<string, string | null>>({})

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

  function setDocumentLibrarySidebarCollapsed(value: boolean) {
    documentLibrarySidebarCollapsed.value = value
  }

  function getLastOpenedDocumentId(workspaceId: string | null) {
    return _lastOpenedDocumentIdByWorkspaceId.value[resolveDocumentTreeStateKey(workspaceId)] ?? null
  }

  function setLastOpenedDocumentId(workspaceId: string | null, documentId: string | null) {
    _lastOpenedDocumentIdByWorkspaceId.value = {
      ..._lastOpenedDocumentIdByWorkspaceId.value,
      [resolveDocumentTreeStateKey(workspaceId)]: documentId,
    }
  }

  function clearLastOpenedDocumentIds() {
    _lastOpenedDocumentIdByWorkspaceId.value = {}
  }

  return {
    _lastOpenedDocumentIdByWorkspaceId,
    chatSessionSidebarPinned,
    clearLastOpenedDocumentIds,
    clearLastActiveChatSessionId,
    documentLibrarySidebarCollapsed,
    getLastOpenedDocumentId,
    lastActiveChatSessionId,
    setChatSessionSidebarPinned,
    setDocumentLibrarySidebarCollapsed,
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
      'documentLibrarySidebarCollapsed',
      '_lastOpenedDocumentIdByWorkspaceId',
    ],
  },
})
