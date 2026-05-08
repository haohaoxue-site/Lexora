import type { FormInstance, FormRules } from 'element-plus'
import type { Ref } from 'vue'
import type { ChatModelSelection } from '@/apis/chat'

export function useChatModelSettingsDialog(options: {
  form: Ref<ChatModelSelection>
  modelFormRef: Ref<FormInstance | null>
  onSave: () => Promise<boolean | void> | boolean | void
}) {
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

    await options.onSave()
  }

  return {
    formRules,
    handleSave,
  }
}
