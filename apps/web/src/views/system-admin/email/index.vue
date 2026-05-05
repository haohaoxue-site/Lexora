<script setup lang="ts">
import type { FormInstance } from 'element-plus'
import type { SystemEmailProvider } from '@/apis/system-admin'
import { Promotion } from '@element-plus/icons-vue'
import { computed, useTemplateRef } from 'vue'
import { formatDateTime } from '@/utils/dayjs'
import { useEmail } from './composables/useEmail'

const emailConfigFormRef = useTemplateRef<FormInstance>('emailConfigFormRef')
const testEmailFormRef = useTemplateRef<FormInstance>('testEmailFormRef')
const {
  closeTestDialog,
  currentConfig,
  currentServiceStatus,
  errorMessage,
  form,
  formRules,
  handleKeepSavedPassword,
  handleSaveConfig,
  handleSendTestEmail,
  handleServiceStatusChange,
  handleStartPasswordEdit,
  hasSavedPassword,
  isEditingPassword,
  isLoading,
  isSaving,
  isTestDialogVisible,
  isTesting,
  isUpdatingServiceStatus,
  openTestDialog,
  providerCards,
  selectProvider,
  testEmailForm,
  testEmailFormRules,
} = useEmail({
  emailConfigFormRef,
  testEmailFormRef,
})

const senderIdentityText = computed(() => {
  const fromName = currentConfig.value?.fromName?.trim() ?? ''
  const fromEmail = currentConfig.value?.fromEmail?.trim() ?? ''

  if (!fromName && !fromEmail) {
    return '-'
  }

  if (!fromEmail) {
    return fromName
  }

  if (!fromName) {
    return fromEmail
  }

  return `${fromName} <${fromEmail}>`
})

const canSendTestEmail = computed(() => {
  if (!currentConfig.value) {
    return false
  }

  return Boolean(
    currentConfig.value.smtpHost.trim()
    && currentConfig.value.smtpUsername.trim()
    && currentConfig.value.fromName.trim()
    && currentConfig.value.fromEmail.trim()
    && currentConfig.value.hasPassword,
  )
})

const testEmailTooltip = computed(() => {
  return canSendTestEmail.value
    ? '使用当前已保存配置发送测试邮件，不受服务开关影响。'
    : '请先保存完整 SMTP 配置和发件密码。'
})

const lastTestPrimaryText = computed(() => {
  const lastTest = currentConfig.value?.lastTest

  if (!lastTest) {
    return '尚未测试'
  }

  return `${lastTest.succeeded ? '成功' : '失败'} · ${formatDateTime(lastTest.testedAt)}`
})

const lastTestSecondaryText = computed(() => {
  const lastTest = currentConfig.value?.lastTest

  if (!lastTest) {
    return ''
  }

  if (lastTest.message?.trim()) {
    return lastTest.message.trim()
  }

  if (!lastTest.succeeded && lastTest.recipientEmail.trim()) {
    return `收件邮箱：${lastTest.recipientEmail}`
  }

  return ''
})

function handleProviderChange(value: string | number | boolean | undefined) {
  if (typeof value !== 'string') {
    return
  }

  if (!providerCards.value.some(provider => provider.provider === value)) {
    return
  }

  selectProvider(value as SystemEmailProvider)
}
</script>

<template>
  <div v-loading="isLoading" class="admin-email">
    <ElAlert v-if="errorMessage" :title="errorMessage" type="error" show-icon :closable="false" class="rounded-xl" />

    <template v-else>
      <div class="admin-email__columns">
        <ElCard shadow="never" class="admin-email__main-card">
          <div class="admin-email__section">
            <h2 class="admin-email__section-title">
              SMTP 配置
            </h2>

            <ElRadioGroup
              v-model="form.provider"
              class="admin-email__provider-group mt-4"
              @change="handleProviderChange"
            >
              <ElRadio
                v-for="provider in providerCards"
                :key="provider.provider"
                :label="provider.provider"
                :value="provider.provider"
                :disabled="provider.disabled"
                border
                class="admin-email__provider-option"
              >
                <span class="admin-email__provider-title">
                  {{ provider.title }}
                </span>
                <span class="admin-email__provider-meta">
                  Host: {{ provider.defaults.smtpHost }} / Port: {{ provider.defaults.smtpPort }}
                </span>
              </ElRadio>
            </ElRadioGroup>
          </div>

          <div class="admin-email__section">
            <ElForm
              ref="emailConfigFormRef"
              :model="form"
              :rules="formRules"
              label-position="top"
              @submit.prevent="handleSaveConfig"
            >
              <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
                <ElFormItem label="SMTP Host" prop="smtpHost">
                  <ElInput v-model="form.smtpHost" placeholder="smtp.exmail.qq.com" />
                </ElFormItem>
                <ElFormItem label="端口" prop="smtpPort">
                  <ElInputNumber v-model="form.smtpPort" :min="1" :max="65535" controls-position="right" class="w-full" />
                </ElFormItem>
                <ElFormItem label="发件账号" prop="smtpUsername">
                  <ElInput v-model="form.smtpUsername" autocomplete="username" />
                </ElFormItem>
                <ElFormItem label="发件密码" prop="smtpPassword">
                  <ElButton v-if="hasSavedPassword && !isEditingPassword" plain type="primary" class="w-full" @click="handleStartPasswordEdit">
                    更换密码
                  </ElButton>
                  <div v-else class="flex w-full items-start gap-3">
                    <ElInput
                      v-model="form.smtpPassword"
                      class="min-w-0 flex-1"
                      type="password"
                      show-password
                      autocomplete="new-password"
                      :placeholder="hasSavedPassword ? '输入新的发件密码' : '请输入发件密码'"
                    />
                    <ElButton
                      v-if="hasSavedPassword && isEditingPassword"
                      link
                      class="shrink-0 self-center"
                      @click="handleKeepSavedPassword"
                    >
                      取消更换
                    </ElButton>
                  </div>
                </ElFormItem>
                <ElFormItem label="发件人名称" prop="fromName">
                  <ElInput v-model="form.fromName" />
                </ElFormItem>
                <ElFormItem label="发件邮箱" prop="fromEmail">
                  <ElInput v-model="form.fromEmail" autocomplete="email" />
                </ElFormItem>
              </div>

              <ElFormItem prop="smtpSecure">
                <ElCheckbox v-model="form.smtpSecure">
                  使用 SSL / TLS 加密连接
                </ElCheckbox>
              </ElFormItem>

              <div class="admin-email__form-actions">
                <ElButton type="primary" :loading="isSaving" native-type="submit">
                  {{ isSaving ? '保存中...' : '保存发件配置' }}
                </ElButton>
              </div>
            </ElForm>
          </div>
        </ElCard>

        <ElCard shadow="never" class="admin-email__side-card" body-class="admin-email__side-card-body">
          <div class="admin-email__side-header">
            <div class="min-w-0">
              <h2 class="admin-email__section-title">
                邮件服务
              </h2>
              <p class="admin-email__section-description mt-1.5">
                当前发件身份：{{ senderIdentityText }}
              </p>
            </div>
            <div class="admin-email__status-actions">
              <ElTooltip :content="testEmailTooltip" placement="top" effect="light">
                <span class="inline-flex">
                  <ElButton
                    circle
                    plain
                    size="small"
                    class="admin-email__test-trigger"
                    :icon="Promotion"
                    :disabled="!canSendTestEmail"
                    @click="openTestDialog"
                  />
                </span>
              </ElTooltip>
              <ElSwitch
                :model-value="currentServiceStatus?.enabled ?? false"
                :loading="isUpdatingServiceStatus"
                :disabled="isUpdatingServiceStatus"
                @change="handleServiceStatusChange"
              />
            </div>
          </div>

          <ElDivider class="admin-email__side-divider" />

          <div class="admin-email__side-block">
            <span class="admin-email__side-label">最近一次测试</span>
            <span class="admin-email__last-test-primary">{{ lastTestPrimaryText }}</span>
            <p v-if="lastTestSecondaryText" class="admin-email__last-test-secondary">
              {{ lastTestSecondaryText }}
            </p>
          </div>
        </ElCard>
      </div>

      <ElDialog
        v-model="isTestDialogVisible"
        title="发送测试邮件"
        width="32rem"
        destroy-on-close
        @close="closeTestDialog"
      >
        <ElForm
          ref="testEmailFormRef"
          :model="testEmailForm"
          :rules="testEmailFormRules"
          label-position="top"
          @submit.prevent="handleSendTestEmail"
        >
          <ElFormItem label="收件邮箱" prop="email">
            <ElInput
              v-model="testEmailForm.email"
              autocomplete="email"
              placeholder="请输入收件邮箱"
            />
          </ElFormItem>
        </ElForm>

        <template #footer>
          <div class="flex justify-end gap-3">
            <ElButton @click="closeTestDialog">
              取消
            </ElButton>
            <ElButton type="primary" :loading="isTesting" @click="handleSendTestEmail">
              {{ isTesting ? '发送中...' : '发送' }}
            </ElButton>
          </div>
        </template>
      </ElDialog>
    </template>
  </div>
</template>

<style scoped lang="scss">
.admin-email {
  &__columns {
    display: grid;
    gap: 1.5rem;

    @media (min-width: 1024px) {
      grid-template-columns: minmax(0, 1.5fr) minmax(22rem, 0.9fr);
    }
  }

  &__main-card,
  &__side-card {
    border-color: color-mix(in srgb, var(--brand-border-base) 82%, transparent);
    box-shadow: 0 16px 36px -32px color-mix(in srgb, var(--brand-text-primary) 20%, transparent);
  }

  &__status-actions {
    display: inline-flex;
    align-items: center;
    gap: 0.625rem;
  }

  &__side-card {
    order: -1;
    overflow: hidden;
    background: var(--brand-bg-surface);

    @media (min-width: 1024px) {
      order: 0;
      position: sticky;
      top: 1.5rem;
    }
  }

  :deep(.admin-email__side-card-body) {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.25rem;
  }

  &__section + &__section {
    margin-top: 1.75rem;
  }

  &__section-title {
    margin: 0;
    color: var(--brand-text-primary);
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.5;
  }

  &__section-description {
    margin: 0.375rem 0 0;
    color: var(--brand-text-secondary);
    font-size: 0.8125rem;
    line-height: 1.7;
  }

  &__provider-group {
    display: grid;
    grid-template-columns: repeat(1, minmax(0, 1fr));
    gap: 0.75rem;

    @media (min-width: 768px) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  &__provider-option {
    width: 100%;
    height: auto;
    margin: 0;
    text-align: left;
    border-radius: 1rem;
    transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;

    &:not(.is-disabled):hover {
      border-color: color-mix(in srgb, var(--brand-primary) 36%, var(--brand-border-base));
      transform: translateY(-1px);
      box-shadow: 0 16px 28px -24px color-mix(in srgb, var(--brand-primary) 55%, transparent);
    }

    &.is-checked {
      border-color: color-mix(in srgb, var(--brand-primary) 60%, transparent);
      transform: translateY(-1px);
      background: color-mix(in srgb, var(--brand-primary) 6%, var(--brand-bg-surface));
      box-shadow: 0 20px 36px -28px color-mix(in srgb, var(--brand-primary) 72%, transparent);
    }

    &.is-disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    :deep(.el-radio__input) {
      display: none;
    }

    :deep(.el-radio__label) {
      display: grid;
      gap: 0.45rem;
      width: 100%;
      padding: 1rem;
      color: inherit;
      line-height: 1.6;
      white-space: normal;
    }
  }

  &__provider-title {
    color: var(--brand-text-primary);
    font-size: 0.95rem;
    font-weight: 700;
    line-height: 1.4;
  }

  &__provider-meta {
    color: var(--brand-text-secondary);
    font-size: 0.8125rem;
    line-height: 1.6;
  }

  &__test-trigger {
    color: var(--brand-primary);
  }

  &__side-divider {
    margin: 0;
  }

  &__side-block {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  &__side-header {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  &__side-label {
    color: var(--brand-text-secondary);
    font-size: 0.75rem;
    font-weight: 600;
    line-height: 1.6;
  }

  &__last-test-primary {
    color: var(--brand-text-primary);
    font-size: 0.875rem;
    font-weight: 700;
    line-height: 1.6;
  }

  &__last-test-secondary {
    margin: 0;
    color: var(--brand-text-secondary);
    font-size: 0.75rem;
    line-height: 1.6;
  }

  &__form-actions {
    display: flex;
    justify-content: flex-start;
    padding-top: 0.25rem;
  }
}
</style>
