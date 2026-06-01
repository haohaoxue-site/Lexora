<script setup lang="ts">
import type { FormInstance } from 'element-plus'
import { computed, useTemplateRef } from 'vue'
import { useRouter } from 'vue-router'
import { useRegister } from '../../composables/useRegister'
import AuthEntryShell from '../../layouts/entry-shell'

const router = useRouter()
const registerRequestFormRef = useTemplateRef<FormInstance>('registerRequestFormRef')
const {
  form,
  formRules,
  handleSubmitEmailVerificationRequest,
  isLoadingCapabilities,
  isSubmitting,
  loadErrorMessage,
  passwordRegistrationInviteCodeRequired,
  passwordRegistrationEnabled,
} = useRegister({
  registerRequestFormRef,
})

const isRegistrationClosed = computed(() => !isLoadingCapabilities && !passwordRegistrationEnabled)
const pageTitle = computed(() => isRegistrationClosed.value ? '邮箱注册暂未开放' : '创建账号')
const pageDescription = computed(() => {
  if (isRegistrationClosed.value) {
    return '当前仅支持已有账号登录。'
  }

  if (passwordRegistrationInviteCodeRequired.value) {
    return '输入邮箱和邀请码，我们会发送验证码。'
  }

  return '输入邮箱，我们会发送验证码。'
})

function goToLogin() {
  void router.push({ name: 'login' })
}
</script>

<template>
  <AuthEntryShell
    :title="pageTitle"
    :description="pageDescription"
  >
    <ElAlert
      v-if="loadErrorMessage"
      :title="loadErrorMessage"
      type="error"
      show-icon
      :closable="false"
      class="password-register-view__alert mb-4"
    />

    <template v-else>
      <ElResult
        v-if="isRegistrationClosed"
        icon="warning"
        title="当前未开放邮箱注册"
        sub-title="请返回登录页，使用已有账号或第三方账号继续。"
        class="password-register-view__closed-result !p-0"
      >
        <template #extra>
          <ElButton type="primary" @click="goToLogin">
            返回登录
          </ElButton>
        </template>
      </ElResult>

      <template v-else>
        <ElForm
          ref="registerRequestFormRef"
          v-loading="isLoadingCapabilities"
          :model="form"
          :rules="formRules"
          label-position="top"
          class="password-register-view__form w-full"
          @submit.prevent="handleSubmitEmailVerificationRequest"
        >
          <ElFormItem label="注册邮箱" prop="email">
            <ElInput
              v-model="form.email"
              autocomplete="email"
              placeholder="输入邮箱地址"
              :disabled="isSubmitting"
            />
          </ElFormItem>
          <ElFormItem v-if="passwordRegistrationInviteCodeRequired" label="邀请码" prop="inviteCode">
            <ElInput
              v-model="form.inviteCode"
              autocomplete="off"
              placeholder="输入邀请码"
              :disabled="isSubmitting"
            />
          </ElFormItem>

          <ElButton
            type="primary"
            native-type="submit"
            class="password-register-view__submit w-full min-h-[2.875rem]"
            :loading="isSubmitting"
          >
            发送验证码
          </ElButton>
        </ElForm>
      </template>
    </template>

    <template #footer>
      <template v-if="loadErrorMessage || isLoadingCapabilities || passwordRegistrationEnabled">
        <span class="password-register-view__footer-text text-secondary">已有账号？</span>
        <RouterLink :to="{ name: 'login' }" class="password-register-view__footer-link text-primary font-semibold no-underline">
          返回登录
        </RouterLink>
      </template>
    </template>
  </AuthEntryShell>
</template>
