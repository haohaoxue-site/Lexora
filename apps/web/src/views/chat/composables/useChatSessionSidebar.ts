import type { ChatSessionSidebarProps } from '../typing'
import { ElMessageBox } from 'element-plus'

export function useChatSessionSidebar(
  props: ChatSessionSidebarProps,
  onDelete: (sessionId: string) => void,
) {
  async function confirmDelete(session: ChatSessionSidebarProps['sessions'][number]) {
    const sessionTitle = session.title.trim() || '未命名对话'
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

    onDelete(session.id)
  }

  function getSessionItemStateClass(sessionId: string) {
    return sessionId === props.activeSessionId ? 'active' : 'idle'
  }

  return {
    confirmDelete,
    getSessionItemStateClass,
  }
}
