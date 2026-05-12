import type { ChatModelSelection } from '@/apis/chat'
import { AI_MODEL_INTENT_KEY } from '@haohaoxue/samepage-contracts'
import { createSharedComposable } from '@vueuse/core'
import { ElMessage } from 'element-plus'
import { computed, reactive, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import { getAiDefaultModels } from '@/apis/ai'
import { updateChatSessionModel } from '@/apis/chat'
import { showAiDefaultModelMissingDialog } from '@/composables/useAiDefaultModelDialog'
import {
  buildAiDefaultModelPolicyRecord,
  isAiDefaultModelPolicyReady,
  resolveEffectiveAiDefaultModelPolicy,
} from '@/utils/ai-default-model'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'
import { formatModelOptionLabel } from '@/views/provider/utils/modelDisplay'
import {
  createModelSelection,
  normalizeNullableModelRef,
  resolveChatRequestModelRef,
  resolveSavedChatModelRef,
  resolveSelectedChatModel,
  toDraft,
} from '../utils/chat-model-selection'
import { useChatModels } from './useChatModels'
import { useChatRuntimeConfig } from './useChatRuntimeConfig'
import { useChatSessions } from './useChatSessions'

export const useChatModelSettings = createSharedComposable(() => {
  const router = useRouter()
  const { runtimeConfig, isLoadingRuntimeConfig } = useChatRuntimeConfig()
  const { modelOptions, refreshModels } = useChatModels()
  const { activeSession, ensureActiveSession, replaceActiveSession } = useChatSessions()

  const modelSettingsDialogVisible = shallowRef(false)
  const isCheckingDefaultModel = shallowRef(false)
  const modelSettingsDraft = reactive<ChatModelSelection>(toDraft(createModelSelection()))

  const sessionModelRef = computed(() => activeSession.value?.modelRef ?? null)
  const manualModelRef = computed(() => normalizeNullableModelRef(sessionModelRef.value))
  const selectedModel = computed(() => resolveSelectedChatModel(
    sessionModelRef.value,
    modelOptions.value,
    runtimeConfig.value.defaultModel,
  ))
  const requestModelRef = computed(() => resolveChatRequestModelRef(
    sessionModelRef.value,
    modelOptions.value,
    runtimeConfig.value.defaultModel,
  ))
  const isConfigured = computed(() => Boolean(requestModelRef.value))
  const modelBadgeStateClass = computed(() => isConfigured.value ? 'configured' : 'idle')

  const currentModelLabel = computed(() => {
    if (selectedModel.value) {
      return formatModelOptionLabel(selectedModel.value.providerName, selectedModel.value.modelName)
    }

    return manualModelRef.value?.modelId ?? '未选择模型'
  })

  const inputPlaceholder = computed(() => {
    if (isLoadingRuntimeConfig.value && !requestModelRef.value) {
      return '正在加载 AI 服务状态'
    }

    if (!isConfigured.value) {
      return '请先选择模型'
    }

    return '输入消息...'
  })

  async function ensureChatDefaultModelReady(): Promise<boolean> {
    try {
      const policies = await getAiDefaultModels()
      const effectivePolicy = resolveEffectiveAiDefaultModelPolicy(
        buildAiDefaultModelPolicyRecord(policies),
        AI_MODEL_INTENT_KEY.CHAT_ASSISTANT_DEFAULT,
      )

      if (isAiDefaultModelPolicyReady(effectivePolicy)) {
        return true
      }

      showAiDefaultModelMissingDialog({
        router,
        title: '对话默认模型未配置',
        message: effectivePolicy.invalidReason || '请先配置对话默认模型，或为对话入口单独配置默认模型。',
      })
      return false
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '检查对话默认模型失败'))
      return false
    }
  }

  async function openModelSettingsDialog() {
    if (isCheckingDefaultModel.value) {
      return
    }

    isCheckingDefaultModel.value = true

    try {
      if (!await ensureChatDefaultModelReady()) {
        return
      }

      const session = await ensureActiveSession()
      if (!session) {
        return
      }

      Object.assign(
        modelSettingsDraft,
        toDraft(createModelSelection(session.modelRef ?? runtimeConfig.value.defaultModel ?? null)),
      )
      modelSettingsDialogVisible.value = true

      await refreshModels({
        silent: true,
        showSuccessMessage: false,
        skipRuntimeConfigReload: true,
        draftModelRef: modelSettingsDraft.modelRef ?? null,
        onDraftModelRefResolved: (nextDraftModelRef) => {
          modelSettingsDraft.modelRef = nextDraftModelRef ? { ...nextDraftModelRef } : null
        },
      })
    }
    finally {
      isCheckingDefaultModel.value = false
    }
  }

  async function saveModelSettings() {
    const session = await ensureActiveSession()
    if (!session) {
      return false
    }

    const nextModelRef = resolveSavedChatModelRef(modelSettingsDraft)
    if (!nextModelRef) {
      ElMessage.warning('请选择聊天模型')
      return false
    }

    try {
      const updatedSession = await updateChatSessionModel(session.id, {
        modelRef: nextModelRef,
      })
      replaceActiveSession(updatedSession)
      Object.assign(modelSettingsDraft, toDraft(createModelSelection(updatedSession.modelRef)))
      modelSettingsDialogVisible.value = false
      ElMessage.success('聊天模型已保存')
      return true
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '保存聊天模型失败'))
      return false
    }
  }

  return {
    currentModelLabel,
    inputPlaceholder,
    isCheckingDefaultModel,
    isConfigured,
    modelBadgeStateClass,
    modelSettingsDialogVisible,
    modelSettingsDraft,
    openModelSettingsDialog,
    requestModelRef,
    saveModelSettings,
    selectedModel,
  }
})
