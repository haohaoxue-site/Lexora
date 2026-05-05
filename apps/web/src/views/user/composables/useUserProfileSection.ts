import type { FormInstance } from 'element-plus'
import type { Ref } from 'vue'
import type { UserProfileSectionProps } from '../typing'
import { computed, reactive } from 'vue'
import { createDisplayNameRules } from '@/views/auth/utils/rules'

export function useUserProfileSection(options: {
  displayName: Ref<string>
  fileInputRef: Ref<HTMLInputElement | null>
  onSaveDisplayName: () => void
  onUpload: (file: File) => void
  props: UserProfileSectionProps
  profileFormRef: Ref<FormInstance | null>
}) {
  const form = reactive({
    displayName: options.displayName,
  })
  const displayNameRules = {
    displayName: createDisplayNameRules(),
  } as const
  const sectionDescription = computed(() =>
    options.props.canEditDisplayName
      ? '更换头像后会立即生效，显示名称保存后会同步更新。'
      : '更换头像后会立即生效，当前账号的显示名称不可修改。',
  )

  function handlePickAvatar() {
    options.fileInputRef.value?.click()
  }

  function handleFileChange(event: Event) {
    const target = event.target as HTMLInputElement
    const file = target.files?.[0]

    if (file) {
      options.onUpload(file)
    }

    target.value = ''
  }

  async function handleSaveDisplayName() {
    if (!options.props.canEditDisplayName) {
      return
    }

    const isValid = await options.profileFormRef.value?.validate().catch(() => false)

    if (!isValid) {
      return
    }

    options.onSaveDisplayName()
  }

  return {
    displayNameRules,
    form,
    handleFileChange,
    handlePickAvatar,
    handleSaveDisplayName,
    sectionDescription,
  }
}
