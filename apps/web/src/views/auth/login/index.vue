<script setup lang="ts">
import type { FormInstance } from 'element-plus'
import { useTemplateRef } from 'vue'
import AuthEntryShell from '../components/AuthEntryShell.vue'
import { useLogin } from './composables/useLogin'

const passwordFormRef = useTemplateRef<FormInstance>('passwordFormRef')
const {
  handleSubmitPasswordLogin,
  hasOauthProviders,
  isLoadingCapabilities,
  isPasswordSubmitting,
  loadErrorMessage,
  passwordRegistrationEnabled,
  passwordForm,
  passwordFormRules,
  providers,
  startLogin,
} = useLogin({
  passwordFormRef,
})
</script>

<template>
  <AuthEntryShell
    title="欢迎回来"
    description="使用邮箱或第三方账号继续。"
  >
    <ElAlert
      v-if="loadErrorMessage"
      type="warning"
      show-icon
      :closable="false"
      :title="loadErrorMessage"
      class="login-view__alert"
    />

    <ElForm
      ref="passwordFormRef"
      :model="passwordForm"
      :rules="passwordFormRules"
      label-position="top"
      class="login-view__form"
      @submit.prevent="handleSubmitPasswordLogin"
    >
      <ElFormItem label="邮箱" prop="email">
        <ElInput
          v-model="passwordForm.email"
          autocomplete="email"
          placeholder="输入邮箱地址"
        />
      </ElFormItem>
      <ElFormItem label="密码" prop="password">
        <ElInput
          v-model="passwordForm.password"
          type="password"
          show-password
          autocomplete="current-password"
          placeholder="输入密码"
        />
      </ElFormItem>

      <ElButton
        type="primary"
        native-type="submit"
        class="login-view__submit"
        :loading="isPasswordSubmitting"
      >
        登录
      </ElButton>
    </ElForm>

    <template v-if="hasOauthProviders">
      <div class="login-view__divider">
        <span class="login-view__divider-text">其他登录方式</span>
      </div>

      <div class="login-view__providers">
        <ElButton
          v-for="item in providers"
          :key="item.provider"
          class="login-provider-btn justify-between"
          @click="startLogin(item.provider)"
        >
          <span class="login-provider-btn__leading">
            <span class="login-provider-btn__icon-wrap">
              <SvgIcon category="ui" :icon="item.icon" size="1.125rem" class="login-provider-btn__icon" />
            </span>
            <span class="login-provider-btn__content">
              <span class="login-provider-btn__label">使用 {{ item.title }}</span>
              <span
                class="login-provider-btn__description"
                :class="{ 'login-provider-btn__description--warning': !item.acceptingNewUsers }"
              >
                {{ item.description }}
              </span>
            </span>
          </span>
          <span class="login-provider-btn__meta">
            <SvgIcon category="ui" icon="arrow-right" size="1rem" class="login-provider-btn__arrow" />
          </span>
        </ElButton>
      </div>
    </template>

    <template #footer>
      <template v-if="passwordRegistrationEnabled && !isLoadingCapabilities">
        <span class="login-view__footer-copy">还没有账号？</span>
        <RouterLink :to="{ name: 'register' }" class="login-view__footer-link">
          创建邮箱账号
        </RouterLink>
      </template>
    </template>
  </AuthEntryShell>
</template>

<style scoped lang="scss">
.login-view {
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
    font-weight: 600;
    box-shadow: 0 18px 30px -24px color-mix(in srgb, var(--brand-primary) 45%, transparent);
  }

  &__divider {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    margin-top: 0.25rem;
    color: var(--brand-text-secondary);

    &::before,
    &::after {
      flex: 1;
      height: 1px;
      background: color-mix(in srgb, var(--brand-border-base) 72%, transparent);
      content: '';
    }
  }

  &__divider-text {
    color: var(--brand-text-secondary);
    font-size: 0.8125rem;
    font-weight: 600;
  }

  &__footer-copy {
    color: var(--brand-text-secondary);
  }

  &__footer-link {
    color: var(--brand-primary);
    font-size: 0.875rem;
    font-weight: 600;
    text-decoration: none;
  }

  &__providers {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }
}

.login-provider-btn {
  width: 100%;
  min-height: 3.5rem;
  margin-left: 0;
  border-color: color-mix(in srgb, var(--brand-border-base) 82%, transparent);
  border-radius: 1rem;
  padding: 0.75rem 0.875rem;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--brand-bg-surface) 95%, white 5%), var(--brand-bg-surface));
  transition: transform 0.22s ease, border-color 0.22s ease, background-color 0.22s ease, box-shadow 0.22s ease;

  &:hover {
    border-color: color-mix(in srgb, var(--brand-primary) 38%, var(--brand-border-base));
    background-color: color-mix(in srgb, var(--brand-primary) 6%, var(--brand-bg-surface));
    box-shadow: 0 18px 28px -24px color-mix(in srgb, var(--brand-primary) 45%, transparent);
    transform: translateY(-1px);
  }

  &:hover &__arrow {
    color: var(--brand-primary);
    transform: translateX(0.25rem);
  }

  :deep(> span) {
    width: 100%;
  }

  &__leading {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 0.625rem;
    min-width: 0;
  }

  &__content {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  &__icon-wrap {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 72%, transparent);
    border-radius: 0.75rem;
    background: color-mix(in srgb, var(--brand-primary) 5%, var(--brand-bg-surface));
  }

  &__icon {
    color: var(--brand-text-primary);
  }

  &__label {
    min-width: 0;
    color: var(--brand-text-primary);
    font-size: 0.875rem;
    font-weight: 600;
    text-align: left;
    line-height: 1.3;
  }

  &__description {
    min-width: 0;
    color: var(--brand-text-secondary);
    font-size: 0.75rem;
    text-align: left;
    line-height: 1.4;
  }

  &__description--warning {
    color: var(--brand-warning);
  }

  &__meta {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    margin-left: auto;
    min-width: auto;
  }

  &__arrow {
    color: var(--brand-text-secondary);
    transition: transform 0.2s ease, color 0.2s ease;
  }
}

@media (max-width: 420px) {
  .login-view {
    &__providers {
      grid-template-columns: minmax(0, 1fr);
    }
  }
}
</style>
