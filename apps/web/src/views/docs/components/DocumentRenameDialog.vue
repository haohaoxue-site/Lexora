<script setup lang="ts">
import type { FormInstance, FormRules } from 'element-plus'
import { DOCUMENT_TITLE_MAX_LENGTH } from '@haohaoxue/samepage-contracts'
import { ElMessage } from 'element-plus'
import { computed, nextTick, reactive, useTemplateRef, watch } from 'vue'
import { useActiveDocument } from '../composables/useActiveDocument'
import { useDocumentTree } from '../composables/useDocumentTree'

interface RenameFormModel {
  title: string
}

const tree = useDocumentTree()
const activeDocument = useActiveDocument()
const formRef = useTemplateRef<FormInstance>('formRef')
const titleInputRef = useTemplateRef<{ focus: () => void }>('titleInputRef')

const form = reactive<RenameFormModel>({
  title: '',
})
const rules: FormRules<RenameFormModel> = {
  title: [
    {
      validator: (_rule, value: string, callback) => {
        if (value.trim()) {
          callback()
          return
        }

        callback(new Error('请输入文档名称'))
      },
      trigger: 'blur',
    },
    {
      max: DOCUMENT_TITLE_MAX_LENGTH,
      message: `文档名称不能超过 ${DOCUMENT_TITLE_MAX_LENGTH} 个字符`,
      trigger: 'blur',
    },
  ],
}

const isOpen = computed(() => tree.isRenameDialogOpen.value)
const isSubmitting = computed(() => tree.isRenaming.value)

watch(
  () => tree.renameDialogTarget.value,
  async (target) => {
    form.title = target?.documentTitle ?? ''
    await nextTick()
    formRef.value?.clearValidate()
  },
)

function handleDialogVisibleChange(value: boolean) {
  if (value || isSubmitting.value) {
    return
  }

  tree.closeRenameDialog()
}

function focusTitleInput() {
  titleInputRef.value?.focus()
}

async function confirmRename() {
  if (isSubmitting.value) {
    return
  }

  const isValid = await formRef.value?.validate().catch(() => false)

  if (!isValid) {
    return
  }

  try {
    const current = await tree.confirmRenameDocument(form.title)

    if (!current) {
      return
    }

    activeDocument.applyDocumentTitleChanged(current)
    ElMessage.success('已重命名')
  }
  catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '重命名失败')
  }
}
</script>

<template>
  <ElDialog
    :model-value="isOpen"
    title="重命名"
    width="28rem"
    align-center
    destroy-on-close
    :close-on-click-modal="false"
    :close-on-press-escape="!isSubmitting"
    :show-close="!isSubmitting"
    @opened="focusTitleInput"
    @update:model-value="handleDialogVisibleChange"
  >
    <ElForm
      ref="formRef"
      :model="form"
      :rules="rules"
      label-position="top"
      class="document-rename-dialog__form"
      @submit.prevent
    >
      <ElFormItem label="文档名称" prop="title">
        <ElInput
          ref="titleInputRef"
          v-model="form.title"
          :maxlength="DOCUMENT_TITLE_MAX_LENGTH"
          show-word-limit
          :disabled="isSubmitting"
          @keydown.enter.prevent="confirmRename"
        />
      </ElFormItem>
    </ElForm>

    <template #footer>
      <ElButton :disabled="isSubmitting" @click="tree.closeRenameDialog">
        取消
      </ElButton>
      <ElButton type="primary" :loading="isSubmitting" @click="confirmRename">
        确定
      </ElButton>
    </template>
  </ElDialog>
</template>

<style scoped lang="scss">
.document-rename-dialog__form {
  padding-top: 0.25rem;
}
</style>
