<script setup lang="ts">
import type { BotsSectionEmits, BotsSectionProps } from './typing'
import { BOT_RUNTIME_STATE, WEIXIN_BOT_LOGIN_STATUS } from '@haohaoxue/samepage-contracts/bot'
import { computed } from 'vue'
import UserSettingsSectionHeader from '../section-header'

const props = defineProps<BotsSectionProps>()
const emit = defineEmits<BotsSectionEmits>()
const loginVisible = defineModel<boolean>('loginVisible', { required: true })
const verifyCode = defineModel<string>('verifyCode', { required: true })

const runtimeText = computed(() => {
  switch (props.status.runtimeState) {
    case BOT_RUNTIME_STATE.RUNNING:
      return '运行中'
    case BOT_RUNTIME_STATE.STARTING:
      return '启动中'
    case BOT_RUNTIME_STATE.STOPPING:
      return '停止中'
    case BOT_RUNTIME_STATE.ERROR:
      return '异常'
    case BOT_RUNTIME_STATE.STOPPED:
      return '已停止'
    case BOT_RUNTIME_STATE.NOT_BOUND:
      return '未绑定'
    default:
      return '未知'
  }
})
const runtimeTagType = computed(() => {
  switch (props.status.runtimeState) {
    case BOT_RUNTIME_STATE.RUNNING:
      return 'success'
    case BOT_RUNTIME_STATE.ERROR:
      return 'danger'
    case BOT_RUNTIME_STATE.NOT_BOUND:
      return 'info'
    default:
      return 'warning'
  }
})
const loginStatusText = computed(() => {
  switch (props.loginState?.status) {
    case WEIXIN_BOT_LOGIN_STATUS.SCANNED:
      return '已扫码'
    case WEIXIN_BOT_LOGIN_STATUS.NEED_VERIFY_CODE:
      return '需要验证码'
    case WEIXIN_BOT_LOGIN_STATUS.CONFIRMED:
      return '已绑定'
    case WEIXIN_BOT_LOGIN_STATUS.EXPIRED:
      return '已过期'
    case WEIXIN_BOT_LOGIN_STATUS.ERROR:
      return '绑定失败'
    case WEIXIN_BOT_LOGIN_STATUS.WAITING:
    default:
      return '等待扫码'
  }
})
const canSubmitVerifyCode = computed(() =>
  props.loginState?.status === WEIXIN_BOT_LOGIN_STATUS.NEED_VERIFY_CODE
  && Boolean(verifyCode.value.trim()),
)
const canStartRuntime = computed(() =>
  props.status.bound
  && props.status.runtimeState !== BOT_RUNTIME_STATE.RUNNING
  && props.status.runtimeState !== BOT_RUNTIME_STATE.STARTING,
)
const canStopRuntime = computed(() =>
  props.status.runtimeState === BOT_RUNTIME_STATE.RUNNING
  || props.status.runtimeState === BOT_RUNTIME_STATE.STARTING,
)
</script>

<template>
  <ElCard shadow="never" class="bots-section">
    <UserSettingsSectionHeader
      title="Bot 绑定"
      description="绑定后，聊天 Bot 可直接与 Agent 对话。"
    />

    <div v-loading="props.isLoading" class="bots-section__body grid gap-3">
      <div class="bots-section__status flex flex-wrap items-center justify-between gap-4 rounded-[1rem] p-4">
        <div class="flex min-w-0 items-center gap-3">
          <span class="bots-section__icon flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.875rem]">
            <SvgIcon category="brand" icon="brand-weixin" size="1.45rem" />
          </span>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <strong class="text-base text-main">微信 Bot</strong>
              <ElTag v-if="props.status.bound" size="small" :type="runtimeTagType" effect="light">
                {{ runtimeText }}
              </ElTag>
            </div>
            <div class="mt-1 text-[0.8125rem] leading-5 text-secondary">
              {{ props.status.accountId ? `账号 ${props.status.accountId}` : '尚未绑定微信账号' }}
            </div>
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <ElButton :loading="props.isStartingLogin" @click="emit('startLogin')">
            <SvgIcon category="ui" icon="link" size="0.95rem" class="mr-1.5" />
            {{ props.status.bound ? '重新绑定' : '绑定微信' }}
          </ElButton>
          <ElButton
            v-if="canStartRuntime"
            :loading="props.isStartingBot"
            @click="emit('startRuntime')"
          >
            <SvgIcon category="ui" icon="sync-refresh" size="0.95rem" class="mr-1.5" />
            启动
          </ElButton>
          <ElButton
            v-if="canStopRuntime"
            :loading="props.isStoppingBot"
            @click="emit('stopRuntime')"
          >
            停止
          </ElButton>
          <ElButton
            v-if="props.status.bound"
            type="danger"
            plain
            :loading="props.isDisconnecting"
            @click="emit('disconnect')"
          >
            <SvgIcon category="ui" icon="trash-can" size="0.95rem" class="mr-1.5" />
            解绑
          </ElButton>
        </div>
      </div>

      <ElAlert
        v-if="props.status.lastError"
        type="error"
        show-icon
        :closable="false"
        :title="props.status.lastError"
      />
    </div>

    <ElDialog
      v-model="loginVisible"
      title="绑定微信 Bot"
      width="24rem"
      align-center
      class="bots-section__dialog"
    >
      <div class="bots-section__qr-panel flex flex-col items-center gap-4">
        <div class="bots-section__qr-frame flex h-[17.5rem] w-[17.5rem] items-center justify-center rounded-[1rem]">
          <img
            v-if="props.loginState?.qrCodeDataUrl"
            :src="props.loginState.qrCodeDataUrl"
            alt="微信扫码绑定二维码"
            class="h-[16.5rem] w-[16.5rem]"
          >
          <ElSkeleton v-else animated class="w-full px-4">
            <template #template>
              <ElSkeletonItem variant="image" class="h-[16.5rem] w-[16.5rem]" />
            </template>
          </ElSkeleton>
        </div>

        <div class="text-center">
          <div class="text-sm font-medium text-main">
            {{ loginStatusText }}
          </div>
          <div class="mt-1 text-[0.8125rem] leading-5 text-secondary">
            {{ props.loginState?.message ?? '正在创建二维码' }}
          </div>
        </div>

        <div
          v-if="props.loginState?.status === WEIXIN_BOT_LOGIN_STATUS.NEED_VERIFY_CODE"
          class="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2"
        >
          <ElInput
            v-model="verifyCode"
            placeholder="手机验证码"
            maxlength="12"
            @keyup.enter="emit('submitVerifyCode')"
          />
          <ElButton
            type="primary"
            :disabled="!canSubmitVerifyCode"
            :loading="props.isSubmittingVerifyCode"
            @click="emit('submitVerifyCode')"
          >
            提交
          </ElButton>
        </div>
      </div>

      <template #footer>
        <div class="flex items-center justify-between gap-3">
          <span class="text-[0.8125rem] text-secondary">
            {{ props.isPollingLogin ? '正在等待确认' : '二维码有效期约 8 分钟' }}
          </span>
          <ElButton @click="loginVisible = false">
            关闭
          </ElButton>
        </div>
      </template>
    </ElDialog>
  </ElCard>
</template>

<style scoped lang="scss">
.bots-section {
  border-color: color-mix(in srgb, var(--brand-border-base) 85%, transparent);

  &__status,
  &__qr-frame {
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 78%, transparent);
    background: color-mix(in srgb, var(--brand-fill-lighter) 72%, transparent);
  }

  &__icon {
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 72%, transparent);
    background: color-mix(in srgb, var(--brand-primary) 5%, var(--brand-bg-surface));
    color: var(--brand-text-primary);
  }
}
</style>
