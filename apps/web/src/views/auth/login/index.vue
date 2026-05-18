<script setup lang="ts">
import type { FormInstance } from 'element-plus'
import { useTemplateRef } from 'vue'
import AuthEntryShell from '../components/AuthEntryShell.vue'
import { useLogin } from './composables/useLogin'

const betaTooltipContent = '当前为 Beta 开发阶段，平台数据可能随版本迭代清空，请勿存放重要资料。'
const repositoryUrl = 'https://github.com/haohaoxue-site/SamePage-AI'
const passwordFormRef = useTemplateRef<FormInstance>('passwordFormRef')
const oauthInviteFormRef = useTemplateRef<FormInstance>('oauthInviteFormRef')
const {
  continueOauthAsExistingAccount,
  continueOauthWithInviteCode,
  handleSubmitPasswordLogin,
  handleStartLogin,
  hasOauthProviders,
  isOauthInviteDialogVisible,
  isLoadingCapabilities,
  isPasswordSubmitting,
  loadErrorMessage,
  oauthInviteForm,
  oauthInviteFormRules,
  passwordRegistrationEnabled,
  passwordForm,
  passwordFormRules,
  providers,
  selectedOauthProviderMeta,
  startingOauthProvider,
} = useLogin({
  oauthInviteFormRef,
  passwordFormRef,
})
</script>

<template>
  <AuthEntryShell
    title="欢迎回来"
    description="使用邮箱或第三方账号继续。"
  >
    <template #actions>
      <a
        :href="repositoryUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="login-view__source-link"
        aria-label="打开 SamePage AI GitHub 项目地址"
      >
        <ElTooltip
          :content="betaTooltipContent"
          placement="top"
          effect="light"
          :show-after="120"
        >
          <span class="login-view__source-status">
            BETA
          </span>
        </ElTooltip>
        <span class="login-view__source-divider" />
        <SvgIcon category="ui" icon="brand-github" size="1.125rem" class="login-view__source-icon" />
        <span class="login-view__source-text">GitHub</span>
      </a>
    </template>

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

      <div
        class="login-view__providers"
        :style="{ gridTemplateColumns: `repeat(${providers.length}, 7.8rem)` }"
      >
        <ElButton
          v-for="item in providers"
          :key="item.provider"
          class="login-provider-btn justify-between"
          :class="{ 'is-loading': startingOauthProvider === item.provider }"
          :disabled="startingOauthProvider === item.provider"
          :aria-busy="startingOauthProvider === item.provider"
          @click="handleStartLogin(item.provider)"
        >
          <span class="login-provider-btn__icon-wrap">
            <SvgIcon category="ui" :icon="item.icon" size="1.125rem" class="login-provider-btn__icon" />
          </span>
          <span class="login-provider-btn__content">
            <span class="login-provider-btn__label">{{ item.title }}</span>
            <span class="login-provider-btn__arrow-wrap">
              <SvgIcon
                v-if="startingOauthProvider === item.provider"
                category="ui"
                icon="spinner-orbit"
                size="1rem"
                class="login-provider-btn__loading animate-spin"
              />
              <SvgIcon v-else category="ui" icon="arrow-right" size="1rem" class="login-provider-btn__arrow" />
            </span>
          </span>
        </ElButton>
      </div>
    </template>

    <template #footer>
      <template v-if="passwordRegistrationEnabled && !isLoadingCapabilities">
        <span class="login-view__footer-text">还没有账号？</span>
        <RouterLink :to="{ name: 'register' }" class="login-view__footer-link">
          创建邮箱账号
        </RouterLink>
      </template>
    </template>
  </AuthEntryShell>

  <ElDialog
    v-model="isOauthInviteDialogVisible"
    :title="`使用 ${selectedOauthProviderMeta?.title ?? '第三方账号'} 继续`"
    width="28rem"
    align-center
    destroy-on-close
  >
    <ElForm
      ref="oauthInviteFormRef"
      :model="oauthInviteForm"
      :rules="oauthInviteFormRules"
      label-position="top"
      @submit.prevent="continueOauthWithInviteCode"
    >
      <ElFormItem label="邀请码" prop="inviteCode">
        <ElInput
          v-model="oauthInviteForm.inviteCode"
          autocomplete="off"
          placeholder="新用户请输入邀请码"
        />
      </ElFormItem>
    </ElForm>

    <template #footer>
      <div class="login-view__oauth-dialog-footer">
        <ElButton
          :loading="Boolean(startingOauthProvider)"
          @click="continueOauthAsExistingAccount"
        >
          已有账号继续登录
        </ElButton>
        <ElButton
          type="primary"
          :loading="Boolean(startingOauthProvider)"
          @click="continueOauthWithInviteCode"
        >
          验证邀请码并继续
        </ElButton>
      </div>
    </template>
  </ElDialog>
</template>

<style scoped lang="scss">
.login-view {
  &__source-link {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2.375rem;
    border: 1px solid color-mix(in srgb, var(--brand-warning) 38%, var(--brand-border-base));
    border-radius: 8px;
    padding: 0.375rem 0.625rem 0.375rem 0.5rem;
    background: color-mix(in srgb, var(--brand-warning) 9%, var(--brand-bg-surface));
    box-shadow: 0 14px 24px -22px color-mix(in srgb, var(--brand-warning) 65%, transparent);
    color: color-mix(in srgb, var(--brand-warning) 64%, var(--brand-text-primary));
    font-size: 0.8125rem;
    font-weight: 700;
    line-height: 1;
    text-decoration: none;
    transition: transform 0.2s ease, border-color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease;

    &:hover {
      border-color: color-mix(in srgb, var(--brand-warning) 62%, var(--brand-border-base));
      background: color-mix(in srgb, var(--brand-warning) 13%, var(--brand-bg-surface));
      box-shadow: 0 18px 30px -22px color-mix(in srgb, var(--brand-warning) 75%, transparent);
      transform: translateY(-1px);
    }
  }

  &__source-status {
    display: inline-flex;
    align-items: center;
    height: 1.625rem;
    border-radius: 4px;
    padding: 0 0.5rem;
    background: color-mix(in srgb, var(--brand-warning) 16%, transparent);
    color: color-mix(in srgb, var(--brand-warning) 76%, var(--brand-text-primary));
    font-size: 0.6875rem;
    font-weight: 800;
  }

  &__source-divider {
    width: 1px;
    height: 1.125rem;
    background: color-mix(in srgb, var(--brand-warning) 35%, var(--brand-border-base));
  }

  &__source-icon,
  &__source-text {
    flex-shrink: 0;
  }

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

  &__footer-text {
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
    justify-content: start;
    gap: 0.625rem;
  }

  &__oauth-dialog-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
  }
}

.login-provider-btn {
  width: 100%;
  min-height: 3.5rem;
  margin-left: 0;
  border-color: color-mix(in srgb, var(--brand-border-base) 82%, transparent);
  border-radius: 8px;
  padding: 6px 0.75rem;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--brand-bg-surface) 95%, white 5%), var(--brand-bg-surface));
  transition: transform 0.22s ease, border-color 0.22s ease, background-color 0.22s ease, box-shadow 0.22s ease;

  &:hover {
    border-color: color-mix(in srgb, var(--brand-primary) 38%, var(--brand-border-base));
    background-color: color-mix(in srgb, var(--brand-primary) 6%, var(--brand-bg-surface));
    box-shadow: 0 18px 28px -24px color-mix(in srgb, var(--brand-primary) 45%, transparent);
    transform: translateY(-1px);
  }

  &:hover &__arrow-wrap {
    color: var(--brand-primary);
  }

  &:hover &__arrow {
    color: var(--brand-primary);
    transform: translateX(0.125rem);
  }

  &.is-loading,
  &.is-disabled,
  &.is-disabled:hover {
    border-color: color-mix(in srgb, var(--brand-primary) 34%, var(--brand-border-base));
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--brand-primary) 6%, white 94%), var(--brand-bg-surface));
    box-shadow: 0 18px 28px -24px color-mix(in srgb, var(--brand-primary) 45%, transparent);
    color: var(--brand-text-primary);
    cursor: default;
    opacity: 1;
    transform: none;
  }

  &.is-loading &__arrow-wrap {
    color: var(--brand-primary);
  }

  :deep(> span) {
    width: 100%;
    height: 2.25rem;
    display: grid;
    grid-template-columns: 2.125rem minmax(0, 1fr);
    align-items: center;
    gap: 0.75rem;
  }

  &__icon-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.125rem;
    height: 2.125rem;
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 72%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--brand-primary) 5%, var(--brand-bg-surface));
  }

  &__icon {
    color: var(--brand-text-primary);
  }

  &__label {
    align-self: end;
    min-width: 0;
    font-size: 0.875rem;
    font-weight: 600;
    text-align: right;
    white-space: nowrap;
  }

  &__content {
    display: grid;
    min-width: 0;
    min-height: 2.125rem;
    grid-template-rows: 1fr 1fr;
    align-items: stretch;
    justify-items: end;
  }

  &__arrow-wrap {
    display: flex;
    align-self: start;
    align-items: center;
    justify-content: center;
    width: 1rem;
    height: 1.125rem;
    color: var(--brand-text-secondary);
    transition: color 0.2s ease;
  }

  &__arrow {
    color: var(--brand-text-secondary);
    transition: transform 0.2s ease, color 0.2s ease;
  }

  &__loading {
    color: var(--brand-primary);
  }
}

@media (max-width: 420px) {
  .login-view {
    &__source-link {
      gap: 0.375rem;
      min-height: 2.25rem;
      padding: 0.3125rem 0.5rem;
    }

    &__source-status {
      height: 1.5rem;
      padding: 0 0.4375rem;
    }

    &__source-divider {
      display: none;
    }

    &__source-text {
      display: none;
    }

    &__providers {
      grid-template-columns: minmax(0, 1fr);
    }
  }
}

@media (min-width: 421px) and (max-width: 680px) {
  .login-view {
    &__providers {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }
  }
}
</style>
