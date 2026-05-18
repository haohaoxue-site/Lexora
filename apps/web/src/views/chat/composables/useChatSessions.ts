import type { ChatSessionSummaryPatch } from '../utils/chat-session-summary'
import type { ChatSessionDetail, ChatSessionSummary } from '@/apis/chat'
import { createSharedComposable } from '@vueuse/core'
import { ElMessage } from 'element-plus'
import { shallowReactive, shallowRef, toRef } from 'vue'
import {
  batchDeleteChatSessions,
  createChatSession,
  deleteChatSession,
  getChatSession,
  getChatSessions,
  updateChatSessionTitle,
} from '@/apis/chat'
import { useUiStore } from '@/stores/ui'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'
import {
  acceptChatSessionSnapshot,
  beginChatSessionSnapshotRequest,
  clearActiveChatSessionSnapshot,
  createChatSessionSnapshotState,
  setActiveChatSessionSnapshot,
} from '../utils/chat-session-snapshot'
import {
  patchChatSessionSummary,
  reconcileLoadedChatSessionSummaries,
  replaceChatSessionSummary,
  upsertChatSessionSummary,
} from '../utils/chat-session-summary'

export interface ChatSession extends ChatSessionSummary {}
export interface ActiveChatSession extends ChatSessionDetail {}

export const useChatSessions = createSharedComposable(() => {
  const uiStore = useUiStore()
  const snapshotState = shallowReactive(createChatSessionSnapshotState())
  const sessions = shallowRef<ChatSession[]>([])
  const activeSessionId = toRef(snapshotState, 'activeSessionId')
  const activeSession = toRef(snapshotState, 'activeSession')
  const isLoadingSessions = shallowRef(false)

  async function loadSessions(options: {
    preserveActiveSessionId?: boolean
    selectFallbackSession?: boolean
  } = {}) {
    const {
      preserveActiveSessionId = true,
      selectFallbackSession = true,
    } = options
    isLoadingSessions.value = true

    try {
      const nextSessions = await getChatSessions()
      setLoadedSessionSummaries(nextSessions)

      if (nextSessions.length === 0) {
        clearActiveChatSessionSnapshot(snapshotState)
        return
      }

      if (!selectFallbackSession) {
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
      upsertSessionSummary(session)
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

  function clearActiveSession() {
    clearActiveChatSessionSnapshot(snapshotState)
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
    uiStore.setLastActiveChatSessionId(session.id)
    return true
  }

  async function selectSession(id: string) {
    const isCurrentSession = activeSession.value?.id === id

    if (isCurrentSession) {
      uiStore.setLastActiveChatSessionId(id)
      return true
    }

    const requestEpoch = beginChatSessionSnapshotRequest(snapshotState, id)

    try {
      const session = await getChatSession(id)
      const accepted = acceptChatSessionSnapshot(snapshotState, {
        session,
        requestEpoch,
      })

      if (accepted) {
        syncSessionSummary(session)
        uiStore.setLastActiveChatSessionId(id)
      }

      return accepted
    }
    catch (error) {
      clearActiveChatSessionSnapshot(snapshotState)
      uiStore.clearLastActiveChatSessionId(id)
      ElMessage.error(getRequestErrorDisplayMessage(error, '加载聊天会话失败'))
      return false
    }
  }

  async function deleteSession(id: string) {
    try {
      await deleteChatSession(id)
      sessions.value = sessions.value.filter(session => session.id !== id)
      uiStore.clearLastActiveChatSessionId(id)

      if (activeSessionId.value !== id) {
        return activeSessionId.value
      }

      const nextSession = sessions.value[0]
      if (!nextSession) {
        clearActiveChatSessionSnapshot(snapshotState)
        return null
      }

      return await selectSession(nextSession.id) ? nextSession.id : null
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '删除聊天会话失败'))
      return activeSessionId.value
    }
  }

  async function batchDeleteSessions(ids: string[]) {
    const sessionIds = [...new Set(ids.map(id => id.trim()).filter(Boolean))]

    if (sessionIds.length === 0) {
      return {
        nextActiveSessionId: activeSessionId.value,
        deletedSessionIds: [],
      }
    }

    try {
      const { deletedSessionIds } = await batchDeleteChatSessions({ sessionIds })
      const deletedSessionIdSet = new Set(deletedSessionIds)
      sessions.value = sessions.value.filter(session => !deletedSessionIdSet.has(session.id))

      if (deletedSessionIds.includes(uiStore.lastActiveChatSessionId ?? '')) {
        uiStore.clearLastActiveChatSessionId()
      }

      if (!activeSessionId.value || !deletedSessionIdSet.has(activeSessionId.value)) {
        return {
          nextActiveSessionId: activeSessionId.value,
          deletedSessionIds,
        }
      }

      const nextSession = sessions.value[0]
      if (!nextSession) {
        clearActiveChatSessionSnapshot(snapshotState)
        return {
          nextActiveSessionId: null,
          deletedSessionIds,
        }
      }

      return {
        nextActiveSessionId: await selectSession(nextSession.id) ? nextSession.id : null,
        deletedSessionIds,
      }
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '批量删除聊天会话失败'))
      return {
        nextActiveSessionId: activeSessionId.value,
        deletedSessionIds: [],
      }
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
      const accepted = acceptChatSessionSnapshot(snapshotState, {
        session,
        requestEpoch,
      })
      if (!accepted) {
        return null
      }

      syncSessionSummary(session)
      return session
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '刷新聊天详情失败'))
      return null
    }
  }

  function setLoadedSessionSummaries(nextSessions: ChatSessionSummary[]) {
    sessions.value = reconcileLoadedChatSessionSummaries(nextSessions, activeSession.value)
  }

  function upsertSessionSummary(session: ChatSessionSummary) {
    sessions.value = upsertChatSessionSummary(sessions.value, session)
  }

  function syncSessionSummary(session: ChatSessionSummary) {
    const currentSummary = sessions.value.find(item => item.id === session.id)
    if (!currentSummary) {
      return
    }

    sessions.value = session.updatedAt > currentSummary.updatedAt
      ? upsertChatSessionSummary(sessions.value, session)
      : replaceChatSessionSummary(sessions.value, session)
  }

  function patchSessionSummary(
    sessionId: string,
    input: ChatSessionSummaryPatch,
  ) {
    sessions.value = patchChatSessionSummary(
      sessions.value,
      sessionId,
      input,
      activeSession.value,
    )
  }

  return {
    activeSession,
    activeSessionId,
    batchDeleteSessions,
    clearActiveSession,
    createSession,
    deleteSession,
    ensureActiveSession,
    isLoadingSessions,
    loadSessions,
    patchSessionSummary,
    refreshActiveSession,
    renameSession,
    replaceActiveSession,
    selectSession,
    sessions,
  }
})
