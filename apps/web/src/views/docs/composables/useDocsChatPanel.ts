import type { ComputedRef, Ref } from 'vue'
import type { ChatSessionDetail } from '@/apis/chat'
import type { ChatComposerModelRef } from '@/components/chat-composer/typing'
import type { ChatStreamController, SendChatComposerMessageInput } from '@/composables/chat/createChatStreamController'
import { createSharedComposable } from '@vueuse/core'
import { ElMessageBox } from 'element-plus'
import { computed, onMounted, shallowRef, watch } from 'vue'
import { createChatComposerHostState } from '@/composables/chat/createChatComposerHostState'
import { useActiveDocument } from './useActiveDocument'
import { useDocsChatEngine } from './useDocsChatEngine'

interface DocsChatPanelSessions {
  activeSession: Ref<ChatSessionDetail | null>
  activeSessionId: Ref<string | null>
  clearActiveSession: () => void
  deleteSession: (id: string, options?: { selectFallbackSession?: boolean }) => Promise<string | null>
  loadSessions?: (options?: { preserveActiveSessionId?: boolean, selectFallbackSession?: boolean }) => Promise<void>
  renameSession: (id: string, title: string) => Promise<boolean>
  replaceActiveSession: (session: ChatSessionDetail) => boolean
  selectSession: (id: string) => Promise<boolean>
}

interface DocsChatPanelStream {
  cancelActiveRun: ChatStreamController['cancelActiveRun']
  cancelRunId: ChatStreamController['cancelRunId']
  isStreaming: ChatStreamController['isStreaming']
  sendMessage: (input: SendChatComposerMessageInput) => Promise<boolean>
}

interface DocsChatPanelOverlay {
  renderSession: ComputedRef<ChatSessionDetail | null>
}

interface DocsChatPanelModel {
  clearNewSessionModelDraft: () => void
  composerSelectedModelRef: ComputedRef<ChatComposerModelRef | null>
  isConfigured: ComputedRef<boolean>
  loadModelState?: () => Promise<void>
  selectComposerModel: (modelRef: ChatComposerModelRef | null) => Promise<boolean>
}

export const useDocsChatPanel = createSharedComposable(() => {
  const engine = useDocsChatEngine()
  const controller = createDocsChatPanelController({
    sessions: engine.sessions,
    stream: engine.stream,
    overlay: engine.overlay,
    model: engine.model,
  })
  const { currentDocument } = useActiveDocument()

  watch(
    () => currentDocument.value?.id ?? null,
    () => controller.clearSelectionContexts(),
  )

  onMounted(() => {
    void engine.model.loadModelState?.()
  })

  return controller
})

export function createDocsChatPanelController(options: {
  sessions: DocsChatPanelSessions
  stream: DocsChatPanelStream
  overlay?: DocsChatPanelOverlay
  model: DocsChatPanelModel
}) {
  const host = createChatComposerHostState({
    model: options.model,
    sendMessage: options.stream.sendMessage,
  })
  const isOpen = shallowRef(false)
  const composerFocusRequestVersion = shallowRef(0)
  const renameDialogVisible = shallowRef(false)
  const renameDraft = shallowRef('')
  const isRenaming = shallowRef(false)
  const isDeleting = shallowRef(false)

  const renderSession = computed(() =>
    options.overlay?.renderSession.value ?? options.sessions.activeSession.value,
  )
  const messages = computed(() => renderSession.value?.messages ?? [])
  const hasActiveSession = computed(() => Boolean(options.sessions.activeSession.value))
  const activeSessionTitle = computed(() => options.sessions.activeSession.value?.title ?? '新对话')

  function openPanel() {
    isOpen.value = true
  }

  function togglePanel() {
    isOpen.value = !isOpen.value
  }

  async function loadHistorySessions() {
    await options.sessions.loadSessions?.({
      preserveActiveSessionId: true,
      selectFallbackSession: false,
    })
  }

  async function selectHistorySession(sessionId: string) {
    const selected = await options.sessions.selectSession(sessionId)
    if (!selected) {
      return false
    }

    host.resetComposer()
    options.model.clearNewSessionModelDraft()
    return true
  }

  function startNewSession() {
    options.sessions.clearActiveSession()
    host.resetComposer()
    options.model.clearNewSessionModelDraft()
  }

  function clearSelectionContexts() {
    const nextAttachments = host.attachments.value.filter(attachment => attachment.scope.kind !== 'selection')
    if (nextAttachments.length !== host.attachments.value.length) {
      host.attachments.value = nextAttachments
    }

    if (host.highlightAttachmentId.value && !nextAttachments.some(attachment => attachment.id === host.highlightAttachmentId.value)) {
      host.highlightAttachmentId.value = null
    }
  }

  function requestComposerFocus() {
    composerFocusRequestVersion.value += 1
  }

  function openRenameDialog() {
    const session = options.sessions.activeSession.value
    if (!session) {
      return
    }

    renameDraft.value = session.title
    renameDialogVisible.value = true
  }

  async function submitRename(title: string) {
    const session = options.sessions.activeSession.value
    const nextTitle = title.trim()

    if (!session || !nextTitle || isRenaming.value) {
      return false
    }

    isRenaming.value = true
    try {
      const renamed = await options.sessions.renameSession(session.id, nextTitle)
      if (renamed) {
        renameDialogVisible.value = false
      }
      return renamed
    }
    finally {
      isRenaming.value = false
    }
  }

  async function confirmDeleteActiveSession() {
    if (!options.sessions.activeSession.value || isDeleting.value) {
      return false
    }

    try {
      await ElMessageBox.confirm(
        '删除后将退出这条文档对话，进入新的空白对话态。',
        '删除对话',
        {
          type: 'warning',
          confirmButtonText: '删除',
          cancelButtonText: '取消',
        },
      )
    }
    catch {
      return false
    }

    return deleteActiveSession()
  }

  async function deleteActiveSession() {
    const session = options.sessions.activeSession.value
    if (!session || isDeleting.value) {
      return false
    }

    isDeleting.value = true
    try {
      await options.sessions.deleteSession(session.id, {
        selectFallbackSession: false,
      })
      host.resetComposer()
      options.model.clearNewSessionModelDraft()
      return true
    }
    finally {
      isDeleting.value = false
    }
  }

  return {
    activeSessionTitle,
    attachments: host.attachments,
    cancelActiveRun: options.stream.cancelActiveRun,
    cancelRunId: options.stream.cancelRunId,
    clearSelectionContexts,
    composerFocusRequestVersion,
    composerSelectedModelRef: options.model.composerSelectedModelRef,
    confirmDeleteActiveSession,
    contentJSON: host.contentJSON,
    deleteActiveSession,
    handlePlaceholderCommand: host.handlePlaceholderCommand,
    handlePlaceholderUpload: host.handlePlaceholderUpload,
    handleSend: host.handleSend,
    hasActiveSession,
    highlightAttachment: host.highlightAttachment,
    highlightAttachmentId: host.highlightAttachmentId,
    isConfigured: options.model.isConfigured,
    isDeleting,
    isOpen,
    isRenaming,
    isStreaming: options.stream.isStreaming,
    loadHistorySessions,
    messages,
    openPanel,
    openRenameDialog,
    renameDialogVisible,
    renameDraft,
    registerBeforeSendHandler: host.registerBeforeSendHandler,
    resetComposer: host.resetComposer,
    requestComposerFocus,
    selectComposerModel: options.model.selectComposerModel,
    selectHistorySession,
    startNewSession,
    submitRename,
    togglePanel,
  }
}
