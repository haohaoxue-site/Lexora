import type { ChatSessionSidebarActionCommand } from '../typing'
import type { ChatSession } from './useChatSessions'
import { computed, shallowRef } from 'vue'
import { ElMessage, ElMessageBox } from '@/utils/element-plus'
import { useChatRouteState } from './useChatRouteState'
import { useChatSessions } from './useChatSessions'

export function useChatSessionSidebar() {
  const { activeSessionId, batchDeleteSessions, deleteSession, renameSession, selectSession } = useChatSessions()
  const { navigateToNewChat, navigateToSession } = useChatRouteState()
  const isSelectionMode = shallowRef(false)
  const selectedSessionIds = shallowRef<Set<string>>(new Set())
  const isBatchDeleting = shallowRef(false)
  const selectedCount = computed(() => selectedSessionIds.value.size)
  const hasSelectedSessions = computed(() => selectedCount.value > 0)

  function getSessionItemStateClass(sessionId: string) {
    if (isSelectionMode.value && selectedSessionIds.value.has(sessionId)) {
      return 'selected'
    }

    return sessionId === activeSessionId.value ? 'active' : 'idle'
  }

  function isSessionSelected(sessionId: string) {
    return selectedSessionIds.value.has(sessionId)
  }

  function enterSelectionMode() {
    isSelectionMode.value = true
    selectedSessionIds.value = new Set()
  }

  function exitSelectionMode() {
    isSelectionMode.value = false
    selectedSessionIds.value = new Set()
  }

  function toggleSessionSelected(sessionId: string) {
    const nextSelectedSessionIds = new Set(selectedSessionIds.value)

    if (nextSelectedSessionIds.has(sessionId)) {
      nextSelectedSessionIds.delete(sessionId)
    }
    else {
      nextSelectedSessionIds.add(sessionId)
    }

    selectedSessionIds.value = nextSelectedSessionIds
  }

  async function handleSessionClick(sessionId: string) {
    if (isSelectionMode.value) {
      toggleSessionSelected(sessionId)
      return
    }

    await selectSessionRoute(sessionId)
  }

  async function promptRename(session: ChatSession) {
    const sessionTitle = formatSessionTitle(session.title)
    const nextTitle = await ElMessageBox.prompt(
      '请输入新的对话名称',
      '重命名对话',
      {
        inputValue: sessionTitle,
        inputPlaceholder: '对话名称',
        inputValidator: value => Boolean(value.trim()) || '请输入对话名称',
        confirmButtonText: '保存',
        cancelButtonText: '取消',
      },
    ).then(result => typeof result.value === 'string' ? result.value.trim() : '').catch(() => null)

    if (!nextTitle || nextTitle === sessionTitle) {
      return
    }

    void renameSession(session.id, nextTitle)
  }

  async function confirmDelete(session: ChatSession) {
    const sessionTitle = formatSessionTitle(session.title)
    const deletingActiveSession = activeSessionId.value === session.id
    const confirmed = await ElMessageBox.confirm(
      `确认删除「${sessionTitle}」吗？此操作不可恢复。`,
      '删除对话',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      },
    ).then(() => true).catch(() => false)

    if (!confirmed) {
      return
    }

    const nextSessionId = await deleteSession(session.id)
    if (!deletingActiveSession) {
      return
    }

    if (nextSessionId) {
      await navigateToSession(nextSessionId, { replace: true })
      return
    }

    await navigateToNewChat()
  }

  async function selectSessionRoute(sessionId: string) {
    await selectSession(sessionId)
    await navigateToSession(sessionId)
  }

  async function confirmBatchDelete() {
    if (selectedCount.value === 0) {
      ElMessage.warning('请选择要删除的对话')
      return
    }

    const deletingActiveSession = Boolean(activeSessionId.value && selectedSessionIds.value.has(activeSessionId.value))
    const confirmed = await ElMessageBox.confirm(
      `确认删除选中的 ${selectedCount.value} 个对话吗？此操作不可恢复。`,
      '批量删除对话',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
      },
    ).then(() => true).catch(() => false)

    if (!confirmed) {
      return
    }

    isBatchDeleting.value = true

    try {
      const result = await batchDeleteSessions([...selectedSessionIds.value])
      if (result.deletedSessionIds.length === 0) {
        return
      }

      exitSelectionMode()

      if (!deletingActiveSession) {
        return
      }

      if (result.nextActiveSessionId) {
        await navigateToSession(result.nextActiveSessionId, { replace: true })
        return
      }

      await navigateToNewChat()
    }
    finally {
      isBatchDeleting.value = false
    }
  }

  function handleSessionAction(
    session: ChatSession,
    command: ChatSessionSidebarActionCommand | string | number | object,
  ) {
    if (command === 'rename') {
      void promptRename(session)
      return
    }

    if (command === 'delete') {
      void confirmDelete(session)
    }
  }

  return {
    activeSessionId: computed(() => activeSessionId.value),
    confirmBatchDelete,
    enterSelectionMode,
    exitSelectionMode,
    getSessionItemStateClass,
    handleSessionAction,
    handleSessionClick,
    hasSelectedSessions,
    isBatchDeleting,
    isSelectionMode,
    isSessionSelected,
    selectedCount,
  }
}

function formatSessionTitle(title: string) {
  return title.trim() || '未命名对话'
}
