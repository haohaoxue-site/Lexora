import type { FormInstance, FormRules } from 'element-plus'
import type { Ref } from 'vue'
import type { WorkspaceCreateDialogSubmitPayload } from './typing'
import {
  WORKSPACE_DESCRIPTION_MAX_LENGTH,
  WORKSPACE_ICON_MAX_BYTES,
  WORKSPACE_ICON_MIME_TYPES,
  WORKSPACE_NAME_MAX_LENGTH,
} from '@haohaoxue/samepage-contracts'
import { ElMessage } from 'element-plus'
import { computed, onBeforeUnmount, reactive } from 'vue'

function createDefaultForm() {
  return {
    name: '',
    description: '',
    iconFile: null as File | null,
    iconPreviewUrl: '',
  }
}

export function useWorkspaceCreateDialog(options: {
  isSubmitting: Ref<boolean>
  onSubmit: (payload: WorkspaceCreateDialogSubmitPayload) => void
  dialogVisible: Ref<boolean>
  fileInputRef: Ref<HTMLInputElement | null>
  workspaceFormRef: Ref<FormInstance | null>
}) {
  const form = reactive(createDefaultForm())
  const iconAccept = WORKSPACE_ICON_MIME_TYPES.join(',')
  const previewName = computed(() => form.name.trim() || '空间')
  const formRules = {
    name: [
      {
        required: true,
        message: '请输入空间名称',
        trigger: 'blur',
      },
      {
        min: 1,
        max: WORKSPACE_NAME_MAX_LENGTH,
        message: `空间名称长度需在 1 到 ${WORKSPACE_NAME_MAX_LENGTH} 个字符之间`,
        trigger: 'blur',
      },
    ],
    description: [
      {
        max: WORKSPACE_DESCRIPTION_MAX_LENGTH,
        message: `空间描述不能超过 ${WORKSPACE_DESCRIPTION_MAX_LENGTH} 个字符`,
        trigger: 'blur',
      },
    ],
  } satisfies FormRules

  function handlePickIcon() {
    if (options.isSubmitting.value) {
      return
    }

    options.fileInputRef.value?.click()
  }

  function handleIconChange(event: Event) {
    const target = event.target as HTMLInputElement
    const file = target.files?.[0] ?? null

    if (!file) {
      target.value = ''
      return
    }

    if (!WORKSPACE_ICON_MIME_TYPES.includes(file.type as (typeof WORKSPACE_ICON_MIME_TYPES)[number])) {
      ElMessage.error('空间图标仅支持 JPG、PNG、WEBP 格式')
      target.value = ''
      return
    }

    if (file.size > WORKSPACE_ICON_MAX_BYTES) {
      ElMessage.error('空间图标大小不能超过 2MB')
      target.value = ''
      return
    }

    revokePreviewUrl()
    form.iconFile = file
    form.iconPreviewUrl = URL.createObjectURL(file)
    target.value = ''
  }

  function clearIcon() {
    revokePreviewUrl()
    form.iconFile = null
    form.iconPreviewUrl = ''
  }

  async function handleSubmit() {
    if (options.isSubmitting.value) {
      return
    }

    const isValid = await options.workspaceFormRef.value?.validate().catch(() => false)

    if (!isValid) {
      return
    }

    options.onSubmit({
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      iconFile: form.iconFile,
    })
  }

  function handleClose() {
    options.dialogVisible.value = false
  }

  function resetForm() {
    revokePreviewUrl()
    Object.assign(form, createDefaultForm())
    options.workspaceFormRef.value?.clearValidate()
  }

  function revokePreviewUrl() {
    if (!form.iconPreviewUrl) {
      return
    }

    URL.revokeObjectURL(form.iconPreviewUrl)
  }

  onBeforeUnmount(revokePreviewUrl)

  return {
    clearIcon,
    form,
    formRules,
    handleClose,
    handleIconChange,
    handlePickIcon,
    handleSubmit,
    iconAccept,
    previewName,
    resetForm,
  }
}
