<script setup lang="ts">
import type { FormInstance } from 'element-plus'
import { useTemplateRef } from 'vue'
import AuthEntryShell from '../components/AuthEntryShell.vue'
import { useChangePassword } from './composables/useChangePassword'

const changePasswordFormRef = useTemplateRef<FormInstance>('changePasswordFormRef')
const {
  form,
  formRules,
  handleSubmitChangePassword,
  isSubmitting,
  pageDescription,
  requiresPasswordChange,
} = useChangePassword({
  changePasswordFormRef,
})
</script>

<template>
  <AuthEntryShell
    title="修改密码"
    :description="pageDescription"
  >
    <ElAlert
      v-if="requiresPasswordChange"
      type="warning"
      show-icon
      :closable="false"
      title="当前正在使用初始密码，请先修改后继续。"
      class="change-password-view__alert"
    />

    <ElForm
      ref="changePasswordFormRef"
      :model="form"
      :rules="formRules"
      label-position="top"
      class="change-password-view__form"
      @submit.prevent="handleSubmitChangePassword"
    >
      <ElFormItem label="当前密码" prop="currentPassword">
        <ElInput v-model="form.currentPassword" type="password" show-password autocomplete="current-password" placeholder="输入当前密码" />
      </ElFormItem>
      <ElFormItem label="新密码" prop="newPassword">
        <ElInput v-model="form.newPassword" type="password" show-password autocomplete="new-password" placeholder="输入新密码" />
      </ElFormItem>
      <ElFormItem label="确认新密码" prop="confirmPassword">
        <ElInput v-model="form.confirmPassword" type="password" show-password autocomplete="new-password" placeholder="再次输入新密码" />
      </ElFormItem>
      <ElButton type="primary" native-type="submit" class="change-password-view__submit" :loading="isSubmitting">
        保存新密码
      </ElButton>
    </ElForm>
  </AuthEntryShell>
</template>

<style scoped lang="scss">
.change-password-view {
  &__alert {
    margin-bottom: 1rem;
  }

  &__form {
    width: 100%;
  }

  &__submit {
    width: 100%;
    min-height: 2.875rem;
    margin-top: 0.75rem;
  }
}
</style>
