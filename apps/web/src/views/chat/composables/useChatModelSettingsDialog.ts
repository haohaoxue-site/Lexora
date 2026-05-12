import type { FormInstance, FormRules } from 'element-plus'
import type { Ref } from 'vue'
import type { ChatModelSelection } from '@/apis/chat'
import { useChatModelSettings } from './useChatModelSettings'

export function useChatModelSettingsDialog(options: {
  modelFormRef: Ref<FormInstance | null>
}) {
  const { modelSettingsDialogVisible, modelSettingsDraft, saveModelSettings } = useChatModelSettings()

  const formRules: FormRules<ChatModelSelection> = {
    modelRef: [
      {
        required: true,
        message: '请选择模型',
        trigger: 'change',
      },
    ],
  }

  async function handleSave() {
    const isValid = options.modelFormRef.value
      ? await options.modelFormRef.value.validate().catch(() => false)
      : false

    if (!isValid) {
      return
    }

    await saveModelSettings()
  }

  return {
    formRules,
    handleSave,
    modelSettingsDialogVisible,
    modelSettingsDraft,
  }
}
