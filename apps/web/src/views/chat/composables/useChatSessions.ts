import type { ChatSessionDetail, ChatSessionSummary } from '@/apis/chat'
import { createSharedComposable } from '@vueuse/core'
import { ElMessage } from 'element-plus'
import { shallowReactive, shallowRef, toRef } from 'vue'
import {
  createChatSession,
  deleteChatSession,
  getChatSession,
  getChatSessions,
  updateChatSessionTitle,
} from '@/apis/chat'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'
import {
  acceptChatSessionSnapshot,
  beginChatSessionSnapshotRequest,
  clearActiveChatSessionSnapshot,
  createChatSessionSnapshotState,
  setActiveChatSessionSnapshot,
} from '../utils/chat-session-snapshot'

export interface ChatSession extends ChatSessionSummary {}
export interface ActiveChatSession extends ChatSessionDetail {}

export const useChatSessions = createSharedComposable(() => {
  const snapshotState = shallowReactive(createChatSessionSnapshotState())
  const sessions = shallowRef<ChatSession[]>([])
  const activeSessionId = toRef(snapshotState, 'activeSessionId')
  const activeSession = toRef(snapshotState, 'activeSession')
  const isLoadingSessions = shallowRef(false)

  async function loadSessions(options: { preserveActiveSessionId?: boolean } = {}) {
    const { preserveActiveSessionId = true } = options
    isLoadingSessions.value = true

    try {
      const nextSessions = await getChatSessions()
      sessions.value = nextSessions

      if (nextSessions.length === 0) {
        clearActiveChatSessionSnapshot(snapshotState)
        return
      }

      const nextActiveSessionId = preserveActiveSessionId && activeSessionId.value && nextSessions.some(session => session.id === activeSessionId.value)
        ? activeSessionId.value
        : nextSessions[0].id

      if (!nextActiveSessionId) {
        clearActiveChatSessionSnapshot(snapshotState)
        return
      }

      await selectSession(nextActiveSessionId)
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '加载聊天会话失败'))
    }
    finally {
      isLoadingSessions.value = false
    }
  }

  async function createSession() {
    try {
      const session = await createChatSession()
      prependSessionSummary(session)
      setActiveChatSessionSnapshot(snapshotState, session)
      return session
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '创建聊天会话失败'))
      return null
    }
  }

  async function ensureActiveSession() {
    if (activeSession.value) {
      return activeSession.value
    }

    if (activeSessionId.value) {
      await selectSession(activeSessionId.value)
      return activeSession.value
    }

    return createSession()
  }

  function replaceActiveSession(session: ActiveChatSession) {
    const accepted = acceptChatSessionSnapshot(snapshotState, {
      session,
    })
    if (!accepted) {
      return false
    }

    patchSessionSummary(session.id, {
      modelRef: session.modelRef,
      title: session.title,
      updatedAt: session.updatedAt,
    })
    return true
  }

  async function selectSession(id: string) {
    const isCurrentSession = activeSession.value?.id === id

    if (isCurrentSession) {
      return
    }

    const requestEpoch = beginChatSessionSnapshotRequest(snapshotState, id)

    try {
      acceptChatSessionSnapshot(snapshotState, {
        session: await getChatSession(id),
        requestEpoch,
      })
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '加载聊天会话失败'))
    }
  }

  async function deleteSession(id: string) {
    try {
      await deleteChatSession(id)
      sessions.value = sessions.value.filter(session => session.id !== id)

      if (activeSessionId.value !== id) {
        return
      }

      const nextSession = sessions.value[0]
      if (!nextSession) {
        clearActiveChatSessionSnapshot(snapshotState)
        return
      }

      await selectSession(nextSession.id)
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '删除聊天会话失败'))
    }
  }

  async function renameSession(id: string, title: string) {
    const nextTitle = title.trim()

    if (!nextTitle) {
      ElMessage.warning('请输入对话名称')
      return false
    }

    try {
      const updatedSession = await updateChatSessionTitle(id, {
        title: nextTitle,
      })

      if (activeSessionId.value === id) {
        replaceActiveSession(updatedSession)
      }
      else {
        patchSessionSummary(id, {
          title: updatedSession.title,
          updatedAt: updatedSession.updatedAt,
        })
      }

      ElMessage.success('对话已重命名')
      return true
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '重命名聊天会话失败'))
      return false
    }
  }

  async function refreshActiveSession(sessionId: string) {
    const requestEpoch = beginChatSessionSnapshotRequest(snapshotState, sessionId)

    try {
      const session = await getChatSession(sessionId)
      return acceptChatSessionSnapshot(snapshotState, {
        session,
        requestEpoch,
      })
        ? session
        : null
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '刷新聊天详情失败'))
      return null
    }
  }

  async function refreshSessionList() {
    try {
      sessions.value = await getChatSessions()
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '刷新聊天列表失败'))
    }
  }

  function prependSessionSummary(session: ChatSessionSummary) {
    sessions.value = [
      session,
      ...sessions.value.filter(item => item.id !== session.id),
    ]
  }

  function patchSessionSummary(
    sessionId: string,
    input: Partial<Pick<ChatSessionSummary, 'modelRef' | 'title' | 'updatedAt'>>,
  ) {
    const targetSession = sessions.value.find(session => session.id === sessionId)

    if (!targetSession) {
      return
    }

    sessions.value = [
      {
        ...targetSession,
        ...input,
      },
      ...sessions.value.filter(session => session.id !== sessionId),
    ]
  }

  return {
    activeSession,
    activeSessionId,
    createSession,
    deleteSession,
    ensureActiveSession,
    isLoadingSessions,
    loadSessions,
    patchSessionSummary,
    refreshActiveSession,
    refreshSessionList,
    renameSession,
    replaceActiveSession,
    selectSession,
    sessions,
  }
})
