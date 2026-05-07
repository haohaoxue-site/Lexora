import type { FormInstance, FormRules } from 'element-plus'
import type { Ref } from 'vue'
import type { ChatModelSelection } from '@/apis/chat'

export function useChatProviderSettingsDialog(options: {
  form: Ref<ChatModelSelection>
  providerFormRef: Ref<FormInstance | null>
  onSave: () => Promise<boolean | void> | boolean | void
}) {
  const formRules: FormRules<ChatModelSelection> = {}

  async function handleSave() {
    const isValid = options.providerFormRef.value
      ? await options.providerFormRef.value.validate().catch(() => false)
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
