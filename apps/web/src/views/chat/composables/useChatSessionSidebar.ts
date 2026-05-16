import type { ChatSessionSidebarActionCommand } from '../typing'
import type { ChatSession } from './useChatSessions'
import { ElMessageBox } from 'element-plus'
import { computed } from 'vue'
import { useChatRouteState } from './useChatRouteState'
import { useChatSessions } from './useChatSessions'

export function useChatSessionSidebar() {
  const { activeSessionId, deleteSession, renameSession, selectSession } = useChatSessions()
  const { navigateToNewChat, navigateToSession } = useChatRouteState()

  function getSessionItemStateClass(sessionId: string) {
    return sessionId === activeSessionId.value ? 'active' : 'idle'
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

  async function createNewChat() {
    await navigateToNewChat()
  }

  async function selectSessionRoute(sessionId: string) {
    await selectSession(sessionId)
    await navigateToSession(sessionId)
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
    createNewChat,
    getSessionItemStateClass,
    handleSessionAction,
    selectSession: selectSessionRoute,
  }
}

function formatSessionTitle(title: string) {
  return title.trim() || '未命名对话'
}
