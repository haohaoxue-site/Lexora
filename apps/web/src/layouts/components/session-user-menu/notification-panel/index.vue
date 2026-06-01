<script setup lang="ts">
import type { SessionNotificationPanelProps } from '../typing'
import type { SessionNotificationInvitationItem } from '@/layouts/components/session-notification-bell/useSessionNotificationBell'

const props = defineProps<SessionNotificationPanelProps>()
const emits = defineEmits<{
  refresh: []
  view: [invitation: SessionNotificationInvitationItem]
  accept: [invitation: SessionNotificationInvitationItem]
  decline: [invitation: SessionNotificationInvitationItem]
}>()
</script>

<template>
  <div class="session-user-menu-subpanel session-notification-panel absolute left-[calc(100%+12px)] top-1/2 z-[8] w-[21rem] -translate-y-1/2 p-2.5">
    <div class="mb-3 flex items-center justify-between gap-3">
      <div class="min-w-0">
        <h3 class="m-0 text-sm font-semibold leading-5 text-main">
          站内信
        </h3>
        <p class="m-0 mt-1 text-xs leading-5 text-secondary">
          处理协作文档邀请
        </p>
      </div>

      <ElButton text size="small" :loading="props.isLoading" @click="emits('refresh')">
        刷新
      </ElButton>
    </div>

    <p v-if="props.loadErrorMessage" class="m-0 text-xs leading-5 text-danger">
      {{ props.loadErrorMessage }}
    </p>

    <div v-else-if="props.isLoading && !props.hasLoaded" class="rounded-lg bg-fill-light px-3 py-8 text-center text-sm text-secondary">
      正在加载站内信...
    </div>

    <div v-else-if="!props.invitationItems.length" class="rounded-lg bg-fill-light px-3 py-8 text-center text-sm text-secondary">
      暂无待处理站内信。
    </div>

    <ElScrollbar v-else max-height="26rem">
      <ul class="m-0 flex list-none flex-col gap-2 p-0">
        <li
          v-for="invitation in props.invitationItems"
          :key="invitation.id"
          class="rounded-[0.625rem] border border-base bg-[color-mix(in_srgb,var(--brand-bg-surface)_92%,transparent)] p-3"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <p class="m-0 text-sm font-semibold leading-5 text-main">
                {{ invitation.inviterLabel }} 邀请你协作《{{ invitation.documentTitle }}》
              </p>
              <p class="m-0 mt-1 text-xs leading-5 text-secondary">
                {{ invitation.receivedLabel }}
              </p>
            </div>

            <ElTag size="small" type="primary" effect="plain">
              文档协作
            </ElTag>
          </div>

          <div class="mt-3 flex items-center justify-end gap-2">
            <ElButton
              size="small"
              plain
              :disabled="Boolean(props.actingInvitationId)"
              @click="emits('view', invitation)"
            >
              查看
            </ElButton>
            <ElButton
              size="small"
              plain
              :disabled="Boolean(props.actingInvitationId)"
              :loading="props.actingInvitationId === invitation.id && props.actingInvitationAction === 'decline'"
              @click="emits('decline', invitation)"
            >
              拒绝
            </ElButton>
            <ElButton
              size="small"
              type="primary"
              :disabled="Boolean(props.actingInvitationId)"
              :loading="props.actingInvitationId === invitation.id && props.actingInvitationAction === 'accept'"
              @click="emits('accept', invitation)"
            >
              接受
            </ElButton>
          </div>
        </li>
      </ul>
    </ElScrollbar>
  </div>
</template>

<style scoped lang="scss">
.session-user-menu-subpanel {
  border: 1px solid color-mix(in srgb, var(--brand-border-base) 94%, transparent);
  border-radius: 12px;
  background: var(--brand-bg-surface-raised);
  box-shadow:
    0 16px 36px color-mix(in srgb, var(--brand-text-primary) 9%, transparent),
    0 4px 12px color-mix(in srgb, var(--brand-text-primary) 5%, transparent);
}
</style>
