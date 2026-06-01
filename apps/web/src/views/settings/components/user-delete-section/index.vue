<script setup lang="ts">
import type { FormInstance } from 'element-plus'
import type { UserDeleteSectionEmits, UserDeleteSectionProps } from './typing'
import { useTemplateRef } from 'vue'
import { useUserDeleteSection } from '../../composables/useUserDeleteSection'
import UserSettingsSectionHeader from '../section-header'

const props = defineProps<UserDeleteSectionProps>()
const emit = defineEmits<UserDeleteSectionEmits>()
const deleteFormRef = useTemplateRef<FormInstance>('deleteFormRef')
const {
  accountLabel,
  accountPlaceholder,
  form,
  handleConfirm,
  isDialogVisible,
  isSubmitDisabled,
  openDialog,
  closeDialog,
  resetForm,
  rules,
} = useUserDeleteSection({
  deleteFormRef,
  onDeleteAccount: payload => emit('deleteAccount', payload),
  props,
})
</script>

<template>
  <ElCard shadow="never" class="user-delete-section">
    <UserSettingsSectionHeader
      title="删除账号"
      description="删除后，当前邮箱、登录方式、文档和聊天记录都会被永久移除，无法恢复。"
    />

    <ElButton
      type="danger"
      :loading="props.isDeleting"
      @click="openDialog"
    >
      {{ props.isDeleting ? '删除中...' : '删除账号' }}
    </ElButton>

    <ElDialog
      v-model="isDialogVisible"
      title="确认删除账号"
      width="32rem"
      destroy-on-close
      @closed="resetForm"
    >
      <div class="mb-4">
        <p class="m-0 text-sm leading-6 text-main">
          输入 {{ accountLabel }} 与确认短语后，才会永久删除当前账号。
        </p>
        <p class="mt-1.5 break-all text-sm leading-6 text-secondary">
          {{ accountLabel }}：{{ props.confirmationTarget }}
        </p>
      </div>

      <ElForm
        ref="deleteFormRef"
        :model="form"
        :rules="rules"
        label-position="top"
        class="flex flex-col gap-1"
        @submit.prevent="handleConfirm"
      >
        <ElFormItem :label="accountLabel" prop="accountConfirmation">
          <ElInput
            v-model="form.accountConfirmation"
            :autocomplete="props.confirmationMode === 'email' ? 'email' : 'off'"
            :placeholder="accountPlaceholder"
          />
        </ElFormItem>

        <ElFormItem label="确认短语" prop="confirmationPhrase">
          <ElInput
            v-model="form.confirmationPhrase"
            :placeholder="`请输入“${props.confirmationPhrase}”`"
          />
        </ElFormItem>
      </ElForm>

      <template #footer>
        <div class="flex justify-end gap-3">
          <ElButton @click="closeDialog">
            取消
          </ElButton>
          <ElButton
            type="danger"
            :disabled="isSubmitDisabled"
            :loading="props.isDeleting"
            @click="handleConfirm"
          >
            {{ props.isDeleting ? '删除中...' : '永久删除' }}
          </ElButton>
        </div>
      </template>
    </ElDialog>
  </ElCard>
</template>

<style scoped lang="scss">
.user-delete-section {
  border-color: color-mix(in srgb, var(--brand-error) 34%, var(--brand-border-base));
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--brand-error) 3%, var(--brand-bg-surface)) 0%, var(--brand-bg-surface) 100%);
}
</style>
