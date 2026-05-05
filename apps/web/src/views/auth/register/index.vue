<script setup lang="ts">
import type { FormInstance } from 'element-plus'
import { computed, useTemplateRef } from 'vue'
import { useRouter } from 'vue-router'
import AuthEntryShell from '../components/AuthEntryShell.vue'
import { useRegister } from './composables/useRegister'

const router = useRouter()
const registerRequestFormRef = useTemplateRef<FormInstance>('registerRequestFormRef')
const {
  form,
  formRules,
  handleSubmitEmailVerificationRequest,
  isLoadingCapabilities,
  isSubmitting,
  loadErrorMessage,
  passwordRegistrationEnabled,
} = useRegister({
  registerRequestFormRef,
})

const isRegistrationClosed = computed(() => !isLoadingCapabilities && !passwordRegistrationEnabled)
const pageTitle = computed(() => isRegistrationClosed.value ? '邮箱注册暂未开放' : '创建账号')
const pageDescription = computed(() => isRegistrationClosed.value ? '当前仅支持已有账号登录。' : '输入邮箱，我们会发送验证码。')

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
      class="password-register-view__alert"
    />

    <template v-else>
      <ElResult
        v-if="isRegistrationClosed"
        icon="warning"
        title="当前未开放邮箱注册"
        sub-title="请返回登录页，使用已有账号或第三方账号继续。"
        class="password-register-view__closed-result"
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
          class="password-register-view__form"
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

          <ElButton
            type="primary"
            native-type="submit"
            class="password-register-view__submit"
            :loading="isSubmitting"
          >
            发送验证码
          </ElButton>
        </ElForm>
      </template>
    </template>

    <template #footer>
      <template v-if="loadErrorMessage || isLoadingCapabilities || passwordRegistrationEnabled">
        <span class="password-register-view__footer-copy">已有账号？</span>
        <RouterLink :to="{ name: 'login' }" class="password-register-view__footer-link">
          返回登录
        </RouterLink>
      </template>
    </template>
  </AuthEntryShell>
</template>

<style scoped lang="scss">
.password-register-view {
  &__alert {
    margin-bottom: 1rem;
  }

  &__closed-result {
    padding: 0;
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
