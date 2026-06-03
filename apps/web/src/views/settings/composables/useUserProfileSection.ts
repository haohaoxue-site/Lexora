import type { FormInstance } from 'element-plus'
import type { Ref } from 'vue'
import type { UserProfileSectionProps } from '../typing'
import { useClipboard } from '@vueuse/core'
import { computed, reactive } from 'vue'
import { ElMessage } from '@/utils/element-plus'
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
  const {
    copy: copyUserCode,
    copied: copiedUserCode,
    isSupported: isClipboardSupported,
  } = useClipboard({
    copiedDuring: 1400,
    legacy: true,
  })

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

  async function handleCopyUserCode() {
    if (!isClipboardSupported.value) {
      ElMessage.error('当前环境不支持复制')
      return
    }

    try {
      await copyUserCode(options.props.userCode)
      ElMessage.success('协作码已复制')
    }
    catch {
      ElMessage.error('复制失败')
    }
  }

  return {
    copiedUserCode,
    displayNameRules,
    form,
    handleCopyUserCode,
    handleFileChange,
    handlePickAvatar,
    handleSaveDisplayName,
    sectionDescription,
  }
}
