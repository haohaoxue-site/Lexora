import type { Ref } from 'vue'
import type { ChatApi } from './createChatApi'
import type { ChatSessionDetail } from '@/apis/chat'
import type { ChatComposerModelRef } from '@/components/chat-composer/typing'
import { ElMessage } from 'element-plus'
import { computed, shallowRef } from 'vue'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'
import { useChatModels } from './useChatModels'
import { useChatRuntimeConfig } from './useChatRuntimeConfig'
import {
  isSameNullableModelRef,
  normalizeNullableModelRef,
  resolveChatRequestModelRef,
} from './utils/chat-model-selection'

export interface ChatComposerModelSessions {
  activeSession: Ref<ChatSessionDetail | null>
  replaceActiveSession: (session: ChatSessionDetail) => boolean
}

export type ChatComposerModelController = ReturnType<typeof createChatComposerModelController>

export function createChatComposerModelController(
  sessions: ChatComposerModelSessions,
  api: ChatApi,
) {
  const { loadRuntimeConfig, runtimeConfig } = useChatRuntimeConfig()
  const { modelOptions, refreshModels } = useChatModels()
  const newSessionModelDraft = shallowRef<ChatComposerModelRef | null>(null)
  const hasNewSessionModelDraft = shallowRef(false)

  const sessionModelRef = computed(() => sessions.activeSession.value?.modelRef ?? null)
  const requestModelRef = computed(() => resolveChatRequestModelRef(
    sessionModelRef.value,
    modelOptions.value,
    runtimeConfig.value.defaultModel,
  ))
  const composerSelectedModelRef = computed(() =>
    sessions.activeSession.value
      ? sessionModelRef.value
      : hasNewSessionModelDraft.value ? newSessionModelDraft.value : requestModelRef.value,
  )
  const isConfigured = computed(() => Boolean(composerSelectedModelRef.value))

  async function loadModelState() {
    if (await loadRuntimeConfig()) {
      await refreshModels({
        silent: true,
        showSuccessMessage: false,
        skipRuntimeConfigReload: true,
      })
    }
  }

  async function selectComposerModel(modelRef: ChatComposerModelRef | null) {
    const nextModelRef = normalizeNullableModelRef(modelRef)
    const activeSession = sessions.activeSession.value

    if (!activeSession) {
      newSessionModelDraft.value = nextModelRef
      hasNewSessionModelDraft.value = true
      return true
    }

    if (isSameNullableModelRef(nextModelRef, activeSession.modelRef)) {
      return true
    }

    try {
      const updatedSession = await api.updateSessionModel(activeSession.id, {
        modelRef: nextModelRef,
      })
      sessions.replaceActiveSession(updatedSession)
      return true
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '切换模型失败'))
      return false
    }
  }

  function clearNewSessionModelDraft() {
    newSessionModelDraft.value = null
    hasNewSessionModelDraft.value = false
  }

  return {
    clearNewSessionModelDraft,
    composerSelectedModelRef,
    isConfigured,
    loadModelState,
    requestModelRef,
    selectComposerModel,
  }
}
