<script setup lang="ts">
import type { FormInstance, FormRules } from 'element-plus'
import type { RenameFormModel } from './typing'
import { DOCUMENT_TITLE_MAX_LENGTH } from '@haohaoxue/samepage-contracts/document/constants'
import { computed, nextTick, reactive, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from '@/utils/element-plus'
import { useActiveDocument } from '../../composables/useActiveDocument'
import { useDocumentTree } from '../../composables/useDocumentTree'

const tree = useDocumentTree()
const activeDocument = useActiveDocument()
const { t } = useI18n()
const formRef = useTemplateRef<FormInstance>('formRef')
const titleInputRef = useTemplateRef<{ focus: () => void }>('titleInputRef')

const form = reactive<RenameFormModel>({
  title: '',
})
const rules = computed<FormRules<RenameFormModel>>(() => ({
  title: [
    {
      validator: (_rule, value: string, callback) => {
        if (value.trim()) {
          callback()
          return
        }

        callback(new Error(t('docs.renameDialog.required')))
      },
      trigger: 'blur',
    },
    {
      max: DOCUMENT_TITLE_MAX_LENGTH,
      message: t('docs.renameDialog.maxLength', { max: DOCUMENT_TITLE_MAX_LENGTH }),
      trigger: 'blur',
    },
  ],
}))

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
    ElMessage.success(t('docs.renameDialog.success'))
  }
  catch (error) {
    ElMessage.error(error instanceof Error ? error.message : t('docs.renameDialog.failed'))
  }
}
</script>

<template>
  <ElDialog
    :model-value="isOpen"
    :title="t('docs.renameDialog.title')"
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
      class="pt-1"
      @submit.prevent
    >
      <ElFormItem :label="t('docs.renameDialog.name')" prop="title">
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
        {{ t('docs.common.cancel') }}
      </ElButton>
      <ElButton type="primary" :loading="isSubmitting" @click="confirmRename">
        {{ t('docs.common.confirm') }}
      </ElButton>
    </template>
  </ElDialog>
</template>
