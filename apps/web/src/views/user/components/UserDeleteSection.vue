<script setup lang="ts">
import type { FormInstance } from 'element-plus'
import type { UserDeleteSectionEmits, UserDeleteSectionProps } from '../typing'
import { useTemplateRef } from 'vue'
import { useUserDeleteSection } from '../composables/useUserDeleteSection'
import UserSettingsSectionHeader from './UserSettingsSectionHeader.vue'

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
      class="user-delete-section__action"
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
      <div class="user-delete-section__dialog-copy">
        <p class="user-delete-section__dialog-text">
          输入 {{ accountLabel }} 与确认短语后，才会永久删除当前账号。
        </p>
        <p class="user-delete-section__dialog-target">
          {{ accountLabel }}：{{ props.confirmationTarget }}
        </p>
      </div>

      <ElForm
        ref="deleteFormRef"
        :model="form"
        :rules="rules"
        label-position="top"
        class="user-delete-section__form"
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
        <div class="user-delete-section__dialog-actions">
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

  &__dialog-text,
  &__dialog-target {
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.6;
  }

  &__dialog-text {
    color: var(--brand-text-primary);
  }

  &__dialog-copy {
    margin-bottom: 1rem;
  }

  &__dialog-target {
    margin-top: 0.375rem;
    color: var(--brand-text-secondary);
    word-break: break-all;
  }

  &__form {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  &__dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
  }
}
</style>
