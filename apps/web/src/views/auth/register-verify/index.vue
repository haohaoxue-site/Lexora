<script setup lang="ts">
import type { FormInstance } from 'element-plus'
import { useTemplateRef } from 'vue'
import AuthEntryShell from '../components/AuthEntryShell.vue'
import { useRegisterVerify } from './composables/useRegisterVerify'

const registerFormRef = useTemplateRef<FormInstance>('registerFormRef')
const {
  errorMessage,
  form,
  formRules,
  handleSubmitRegistration,
  isReady,
  isSubmitting,
  pageDescription,
  statusLabel,
} = useRegisterVerify({
  registerFormRef,
})
</script>

<template>
  <AuthEntryShell
    :title="statusLabel"
    :description="pageDescription"
  >
    <ElAlert
      v-if="errorMessage"
      :title="errorMessage"
      type="error"
      show-icon
      :closable="false"
      class="password-register-verify-view__alert"
    />

    <div v-else class="password-register-verify-view__body">
      <ElForm
        ref="registerFormRef"
        :model="form"
        :rules="formRules"
        label-position="top"
        class="password-register-verify-view__form"
        @submit.prevent="handleSubmitRegistration"
      >
        <ElFormItem label="注册邮箱" prop="email">
          <ElInput v-model="form.email" disabled />
        </ElFormItem>
        <ElFormItem label="验证码" prop="code">
          <ElInput
            v-model="form.code"
            maxlength="6"
            placeholder="输入 6 位验证码"
            :disabled="!isReady || isSubmitting"
          />
        </ElFormItem>
        <ElFormItem label="显示名称" prop="displayName">
          <ElInput
            v-model="form.displayName"
            autocomplete="nickname"
            placeholder="输入显示名称"
            :disabled="!isReady || isSubmitting"
          />
        </ElFormItem>
        <ElFormItem label="密码" prop="password">
          <ElInput
            v-model="form.password"
            type="password"
            show-password
            autocomplete="new-password"
            placeholder="设置密码"
            :disabled="!isReady || isSubmitting"
          />
        </ElFormItem>
        <ElFormItem label="确认密码" prop="confirmPassword">
          <ElInput
            v-model="form.confirmPassword"
            type="password"
            show-password
            autocomplete="new-password"
            placeholder="再次输入密码"
            :disabled="!isReady || isSubmitting"
          />
        </ElFormItem>
        <ElButton
          type="primary"
          native-type="submit"
          class="password-register-verify-view__submit"
          :loading="isSubmitting"
          :disabled="!isReady"
        >
          完成注册
        </ElButton>
      </ElForm>
    </div>

    <template #footer>
      <span class="password-register-verify-view__footer-copy">已有账号？</span>
      <RouterLink :to="{ name: 'login' }" class="password-register-verify-view__footer-link">
        返回登录
      </RouterLink>
    </template>
  </AuthEntryShell>
</template>

<style scoped lang="scss">
.password-register-verify-view {
  &__alert {
    margin-bottom: 1rem;
  }

  &__body {
    width: 100%;
  }

  &__form {
    width: 100%;
  }

  &__submit {
    width: 100%;
    min-height: 2.875rem;
  }

  &__footer-copy {
    color: var(--brand-text-secondary);
  }

  &__footer-link {
    color: var(--brand-primary);
    font-weight: 600;
    text-decoration: none;
  }
}
</style>
