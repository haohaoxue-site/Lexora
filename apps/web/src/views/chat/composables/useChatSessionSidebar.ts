import type { ChatSessionSidebarActionCommand, ChatSessionSidebarProps } from '../typing'
import { ElMessageBox } from 'element-plus'

export function useChatSessionSidebar(
  props: ChatSessionSidebarProps,
  options: {
    onDelete: (sessionId: string) => void
    onRename: (sessionId: string, title: string) => void
  },
) {
  async function promptRename(session: ChatSessionSidebarProps['sessions'][number]) {
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

    options.onRename(session.id, nextTitle)
  }

  async function confirmDelete(session: ChatSessionSidebarProps['sessions'][number]) {
    const sessionTitle = formatSessionTitle(session.title)
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

    options.onDelete(session.id)
  }

  function handleSessionAction(
    session: ChatSessionSidebarProps['sessions'][number],
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

  function getSessionItemStateClass(sessionId: string) {
    return sessionId === props.activeSessionId ? 'active' : 'idle'
  }

  return {
    getSessionItemStateClass,
    handleSessionAction,
  }
}

function formatSessionTitle(title: string) {
  return title.trim() || '未命名对话'
}
