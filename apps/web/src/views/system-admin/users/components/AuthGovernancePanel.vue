<script setup lang="ts">
import type { FormInstance, FormRules } from 'element-plus'
import type {
  AuthGovernanceEntryCard,
  RegistrationGovernanceField,
} from '../composables/useUsers'
import type { SystemAuthGovernance } from '@/apis/system-admin'
import { reactive, useTemplateRef } from 'vue'

interface AuthGovernancePanelProps {
  governance: SystemAuthGovernance
  authGovernanceCards: readonly AuthGovernanceEntryCard[]
  savingGovernanceFields: Record<RegistrationGovernanceField, boolean>
  shouldShowMissingInviteCodeWarning: boolean
  isSavingInviteCode: boolean
  getGovernanceSwitchValue: (key: RegistrationGovernanceField) => boolean
  isGovernanceSwitchDisabled: (key: RegistrationGovernanceField) => boolean
  shouldShowEmailServiceHint: (key: RegistrationGovernanceField) => boolean
}

interface AuthGovernancePanelEmits {
  updateGovernanceSwitch: [key: RegistrationGovernanceField, value: string | number | boolean]
  openInviteCodeDialog: []
  updateInviteCode: []
}

interface InviteCodeFormModel {
  inviteCode: string
}

const props = defineProps<AuthGovernancePanelProps>()
const emit = defineEmits<AuthGovernancePanelEmits>()
const inviteCodeDialogVisible = defineModel<boolean>('inviteCodeDialogVisible', { required: true })
const inviteCode = defineModel<string>('inviteCode', { required: true })
const inviteCodeFormRef = useTemplateRef<FormInstance>('inviteCodeFormRef')
const inviteCodeFormModel = reactive<InviteCodeFormModel>({
  get inviteCode() {
    return inviteCode.value
  },
  set inviteCode(value: string) {
    inviteCode.value = value
  },
})
const inviteCodeFormRules: FormRules<InviteCodeFormModel> = {
  inviteCode: [
    {
      validator: (_rule, value: unknown, callback) => {
        const normalizedValue = typeof value === 'string' ? value.trim() : ''

        if (!normalizedValue || normalizedValue.length >= 4) {
          callback()
          return
        }

        callback(new Error('邀请码至少 4 位'))
      },
      trigger: 'change',
    },
  ],
}

async function submitInviteCode() {
  const form = inviteCodeFormRef.value

  if (!form) {
    return
  }

  const isValid = await form.validate().catch(() => false)

  if (!isValid) {
    return
  }

  emit('updateInviteCode')
}
</script>

<template>
  <ElCard shadow="never" class="auth-governance-panel border-border-a80">
    <div class="flex flex-col gap-5">
      <header class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2 class="m-0 text-base font-bold text-main">
          认证注册
        </h2>
        <ElButton @click="emit('openInviteCodeDialog')">
          设置/更换邀请码
        </ElButton>
      </header>

      <ElAlert
        v-if="props.shouldShowMissingInviteCodeWarning"
        title="已启用邀请码要求，但当前还没有设置邀请码。对应入口的新用户注册会被后端拒绝。"
        type="warning"
        show-icon
        :closable="false"
      />

      <div class="auth-governance-panel__entry-grid">
        <section
          v-for="card in props.authGovernanceCards"
          :key="card.key"
          class="auth-governance-panel__entry-card"
        >
          <div>
            <div class="text-sm font-semibold text-main">
              {{ card.title }}
            </div>
            <p class="m-0 mt-1 text-xs leading-5 text-secondary">
              {{ card.description }}
            </p>
          </div>

          <div class="auth-governance-panel__switch-list">
            <label
              v-for="item in card.switches"
              :key="item.key"
              class="auth-governance-panel__switch-row"
            >
              <span class="min-w-0">
                <span class="block text-sm font-medium text-main">{{ item.label }}</span>
                <span class="mt-0.5 block text-xs leading-5 text-secondary">{{ item.description }}</span>
              </span>
              <span class="flex shrink-0 items-center gap-2.5">
                <ElTooltip
                  v-if="props.shouldShowEmailServiceHint(item.key)"
                  placement="top"
                  effect="light"
                  :show-after="150"
                >
                  <template #content>
                    <div class="auth-governance-panel__switch-hint">
                      <p class="auth-governance-panel__switch-hint-text">
                        未启用发件服务，开启邮箱密码注册前请先前往邮件配置启用发件服务。
                      </p>
                      <RouterLink to="/admin/email" class="auth-governance-panel__switch-hint-link">
                        前往发件配置
                      </RouterLink>
                    </div>
                  </template>
                  <button
                    type="button"
                    class="auth-governance-panel__switch-hint-trigger"
                    @click.stop.prevent
                    @mousedown.stop.prevent
                  >
                    <SvgIcon category="ui" icon="info" size="1rem" />
                  </button>
                </ElTooltip>
                <ElSwitch
                  :model-value="props.getGovernanceSwitchValue(item.key)"
                  :disabled="props.isGovernanceSwitchDisabled(item.key)"
                  :loading="props.savingGovernanceFields[item.key]"
                  @change="emit('updateGovernanceSwitch', item.key, $event)"
                />
              </span>
            </label>
          </div>
        </section>
      </div>
    </div>
  </ElCard>

  <ElDialog
    v-model="inviteCodeDialogVisible"
    title="设置/更换邀请码"
    width="28rem"
    align-center
    destroy-on-close
  >
    <ElForm
      ref="inviteCodeFormRef"
      :model="inviteCodeFormModel"
      :rules="inviteCodeFormRules"
      label-position="top"
      @submit.prevent="submitInviteCode"
    >
      <ElFormItem label="新邀请码" prop="inviteCode">
        <ElInput
          v-model="inviteCodeFormModel.inviteCode"
          autocomplete="off"
          clearable
          maxlength="120"
          placeholder="输入新的注册邀请码，留空保存将清空"
          show-word-limit
        />
      </ElFormItem>
    </ElForm>

    <template #footer>
      <ElButton :disabled="props.isSavingInviteCode" @click="inviteCodeDialogVisible = false">
        取消
      </ElButton>
      <ElButton type="primary" :loading="props.isSavingInviteCode" @click="submitInviteCode">
        保存
      </ElButton>
    </template>
  </ElDialog>
</template>

<style scoped lang="scss">
.auth-governance-panel {
  &__entry-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;

    @media (min-width: 1024px) {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  &__entry-card {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-height: 12.5rem;
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 80%, transparent);
    border-radius: 0.5rem;
    padding: 1rem;
    background: var(--brand-bg-surface);
  }

  &__switch-list {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 0.75rem;
  }

  &__switch-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-height: 3rem;
  }

  &__switch-hint {
    max-width: 16rem;
  }

  &__switch-hint-text {
    margin: 0;
    color: var(--brand-text-primary);
    font-size: 0.75rem;
    line-height: 1.6;
  }

  &__switch-hint-link {
    display: inline-flex;
    margin-top: 0.5rem;
    color: var(--brand-primary);
    font-size: 0.75rem;
    font-weight: 600;
    text-decoration: none;

    &:hover {
      opacity: 0.8;
    }
  }

  &__switch-hint-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    border: none;
    border-radius: 999px;
    color: var(--brand-warning);
    background: color-mix(in srgb, var(--brand-warning) 12%, transparent);
    cursor: pointer;
    transition: background-color 0.2s ease, color 0.2s ease;

    &:hover {
      background: color-mix(in srgb, var(--brand-warning) 18%, transparent);
    }

    &:focus-visible {
      outline: 2px solid color-mix(in srgb, var(--brand-primary) 35%, transparent);
      outline-offset: 2px;
    }
  }
}
</style>
