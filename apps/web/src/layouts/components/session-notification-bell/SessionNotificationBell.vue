<script setup lang="ts">
import { useSessionNotificationBell } from './useSessionNotificationBell'

const {
  acceptInvite,
  actingInviteAction,
  actingInviteId,
  declineInvite,
  hasLoaded,
  hasPendingInvites,
  inviteItems,
  isLoading,
  loadErrorMessage,
  loadSummary,
  pendingInviteCount,
  popoverVisible,
} = useSessionNotificationBell()
</script>

<template>
  <ElPopover
    v-model:visible="popoverVisible"
    trigger="click"
    placement="bottom-end"
    :width="360"
    :offset="12"
    :show-arrow="false"
    teleported
    popper-class="session-notification-bell-popper"
  >
    <template #reference>
      <ElBadge
        :value="pendingInviteCount"
        :max="99"
        :hidden="!hasPendingInvites"
        class="session-notification-bell__badge"
      >
        <ElButton
          circle
          class="session-notification-bell__trigger"
        >
          <SvgIcon category="ui" icon="notification-bell" size="18px" class="session-notification-bell__icon" />
        </ElButton>
      </ElBadge>
    </template>

    <div class="session-notification-bell">
      <div class="session-notification-bell__header">
        <div class="session-notification-bell__header-copy">
          <h3 class="session-notification-bell__title">
            消息提醒
          </h3>
        </div>

        <ElButton text :loading="isLoading" @click="loadSummary">
          刷新
        </ElButton>
      </div>

      <p v-if="loadErrorMessage" class="session-notification-bell__error">
        {{ loadErrorMessage }}
      </p>

      <div v-else-if="isLoading && !hasLoaded" class="session-notification-bell__loading">
        正在加载消息提醒...
      </div>

      <div v-else-if="!inviteItems.length" class="session-notification-bell__empty">
        暂无待处理消息。
      </div>

      <ul v-else class="session-notification-bell__list">
        <li
          v-for="invite in inviteItems"
          :key="invite.id"
          class="session-notification-bell__item"
        >
          <div class="session-notification-bell__item-main">
            <div class="session-notification-bell__item-title-row">
              <p class="session-notification-bell__item-title">
                邀请你加入 {{ invite.workspaceName }}
              </p>
              <ElTag size="small" type="warning" effect="plain">
                团队邀请
              </ElTag>
            </div>

            <p class="session-notification-bell__item-meta">
              {{ invite.receivedLabel }}
            </p>
          </div>

          <div class="session-notification-bell__item-actions">
            <ElButton
              size="small"
              plain
              :disabled="Boolean(actingInviteId)"
              :loading="actingInviteId === invite.id && actingInviteAction === 'decline'"
              @click="declineInvite(invite)"
            >
              拒绝
            </ElButton>
            <ElButton
              size="small"
              type="primary"
              :disabled="Boolean(actingInviteId)"
              :loading="actingInviteId === invite.id && actingInviteAction === 'accept'"
              @click="acceptInvite(invite)"
            >
              接受
            </ElButton>
          </div>
        </li>
      </ul>
    </div>
  </ElPopover>
</template>

<style scoped lang="scss">
.session-notification-bell {
  width: 100%;

  &__badge {
    display: inline-flex;
  }

  &__trigger {
    width: 2.5rem;
    height: 2.5rem;
    color: var(--brand-text-secondary);
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 78%, transparent);
    background: color-mix(in srgb, var(--brand-bg-surface) 88%, transparent);
    box-shadow: 0 14px 30px -24px color-mix(in srgb, var(--brand-primary) 42%, transparent);

    &:hover {
      color: var(--brand-primary);
      border-color: color-mix(in srgb, var(--brand-primary) 24%, transparent);
      background: color-mix(in srgb, var(--brand-primary) 8%, white);
    }
  }

  &__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.875rem;
  }

  &__header-copy {
    min-width: 0;
  }

  &__title,
  &__error,
  &__loading,
  &__empty,
  &__item-title,
  &__item-meta {
    margin: 0;
  }

  &__title {
    color: var(--brand-text-primary);
    font-size: 0.9375rem;
    font-weight: 700;
    line-height: 1.5;
  }

  &__item-meta {
    color: var(--brand-text-secondary);
    font-size: 0.8125rem;
    line-height: 1.5;
  }

  &__loading,
  &__empty {
    padding: 0.875rem 1rem;
    color: var(--brand-text-secondary);
    border-radius: 0.875rem;
    background: color-mix(in srgb, var(--brand-fill-lighter) 82%, transparent);
    font-size: 0.875rem;
    line-height: 1.6;
  }

  &__error {
    padding: 0.875rem 1rem;
    color: var(--brand-error);
    border: 1px solid color-mix(in srgb, var(--brand-error) 20%, transparent);
    border-radius: 0.875rem;
    background: color-mix(in srgb, var(--brand-error) 8%, white);
    font-size: 0.875rem;
    line-height: 1.6;
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0;
    margin: 0;
    list-style: none;
  }

  &__item {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    padding: 0.9375rem 1rem;
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 76%, transparent);
    border-radius: 0.875rem;
    background: color-mix(in srgb, var(--brand-fill-lighter) 52%, transparent);
  }

  &__item-main,
  &__item-actions {
    min-width: 0;
  }

  &__item-title-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.375rem;
  }

  &__item-title {
    color: var(--brand-text-primary);
    font-size: 0.875rem;
    font-weight: 600;
    line-height: 1.5;
  }

  &__item-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
}

@media (max-width: 640px) {
  .session-notification-bell {
    &__header,
    &__item-title-row,
    &__item-actions {
      flex-direction: column;
      align-items: stretch;
    }
  }
}
</style>
