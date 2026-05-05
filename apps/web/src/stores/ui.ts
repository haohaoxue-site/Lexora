import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'

export const UI_PERSIST_KEY = 'samepage_ui'

const DOCUMENT_TREE_FALLBACK_KEY = '__workspace_pending__'

interface DocumentTreeUiState {
  expandedDocumentIds: string[]
  lastOpenedDocumentId: string | null
}

interface ChatSelectedModelRef {
  configId: string
  modelId: string
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

function normalizeUiString(value: string | null | undefined) {
  const normalizedValue = value?.trim() ?? ''
  return normalizedValue || null
}

function normalizeChatSelectedModelRef(value: ChatSelectedModelRef | null | undefined): ChatSelectedModelRef | null {
  const configId = normalizeUiString(value?.configId)
  const modelId = normalizeUiString(value?.modelId)

  if (!configId || !modelId) {
    return null
  }

  return { configId, modelId }
}

function normalizeUiStringList(values: readonly string[]) {
  const normalizedValues: string[] = []
  const seenValues = new Set<string>()

  for (const value of values) {
    const normalizedValue = value.trim()

    if (!normalizedValue || seenValues.has(normalizedValue)) {
      continue
    }

    seenValues.add(normalizedValue)
    normalizedValues.push(normalizedValue)
  }

  return normalizedValues
}

export const useUiStore = defineStore('ui', () => {
  const workspaceSidebarCollapsed = shallowRef(false)
  const _documentTreeStateByWorkspaceId = shallowRef<Record<string, DocumentTreeUiState>>({})
  const _homeVisibleWidgetIds = shallowRef<string[] | null>(null)
  const _chatSelectedModelRef = shallowRef<ChatSelectedModelRef | null>(null)
  const documentTreeStateByWorkspaceId = computed(() =>
    Object.fromEntries(
      Object.entries(_documentTreeStateByWorkspaceId.value).map(([workspaceId, state]) => [
        workspaceId,
        cloneDocumentTreeUiState(state),
      ]),
    ),
  )
  const homeVisibleWidgetIds = computed(() =>
    _homeVisibleWidgetIds.value ? [..._homeVisibleWidgetIds.value] : null,
  )
  const chatSelectedModelRef = computed(() => normalizeChatSelectedModelRef(_chatSelectedModelRef.value))

  function setWorkspaceSidebarCollapsed(value: boolean) {
    workspaceSidebarCollapsed.value = value
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

  function setHomeVisibleWidgetIds(widgetIds: string[]) {
    _homeVisibleWidgetIds.value = normalizeUiStringList(widgetIds)
  }

  function setChatSelectedModelRef(modelRef: ChatSelectedModelRef | null) {
    _chatSelectedModelRef.value = normalizeChatSelectedModelRef(modelRef)
  }

  return {
    _chatSelectedModelRef,
    _documentTreeStateByWorkspaceId,
    _homeVisibleWidgetIds,
    chatSelectedModelRef,
    clearDocumentTreeState,
    documentTreeStateByWorkspaceId,
    getDocumentTreeState,
    homeVisibleWidgetIds,
    setChatSelectedModelRef,
    setExpandedDocumentIds,
    setHomeVisibleWidgetIds,
    setLastOpenedDocumentId,
    setWorkspaceSidebarCollapsed,
    workspaceSidebarCollapsed,
  }
}, {
  persist: {
    key: UI_PERSIST_KEY,
    pick: [
      'workspaceSidebarCollapsed',
      '_documentTreeStateByWorkspaceId',
      '_homeVisibleWidgetIds',
      '_chatSelectedModelRef',
    ],
  },
})
