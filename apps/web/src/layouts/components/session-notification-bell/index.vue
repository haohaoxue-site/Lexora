<script setup lang="ts">
import type {
  DocumentCollaborationPermission,
  DocumentCollaborationScope,
} from '@haohaoxue/lexora-contracts'
import {
  DOCUMENT_COLLABORATION_PERMISSION,
  DOCUMENT_COLLABORATION_SCOPE,
} from '@haohaoxue/lexora-contracts/document/collaboration/constants'
import { useI18n } from 'vue-i18n'
import { useSessionNotificationBell } from './useSessionNotificationBell'

const props = withDefaults(defineProps<{
  isCollapsed?: boolean
}>(), {
  isCollapsed: false,
})

const {
  acceptInvitation,
  actingInvitationAction,
  actingInvitationId,
  closeInvitationDetail,
  declineInvitation,
  hasLoaded,
  hasPendingInvitations,
  invitationItems,
  isDetailDialogOpen,
  isLoading,
  loadErrorMessage,
  loadSummary,
  pendingInvitationCount,
  popoverVisible,
  selectedInvitation,
  viewInvitation,
} = useSessionNotificationBell()
const { t } = useI18n({ useScope: 'global' })

const permissionLabelKey = {
  [DOCUMENT_COLLABORATION_PERMISSION.READ]: 'collaboration.permission.read',
  [DOCUMENT_COLLABORATION_PERMISSION.EDIT]: 'collaboration.permission.edit',
} as const satisfies Record<DocumentCollaborationPermission, string>

const scopeLabelKey = {
  [DOCUMENT_COLLABORATION_SCOPE.SELF]: 'collaboration.scope.self',
  [DOCUMENT_COLLABORATION_SCOPE.DESCENDANTS]: 'collaboration.scope.descendants',
} as const satisfies Record<DocumentCollaborationScope, string>

function getPermissionLabel(permission: DocumentCollaborationPermission) {
  return t(permissionLabelKey[permission])
}

function getScopeLabel(scope: DocumentCollaborationScope) {
  return t(scopeLabelKey[scope])
}
</script>

<template>
  <div class="session-notification-bell-entry">
    <ElPopover
      v-model:visible="popoverVisible"
      trigger="click"
      placement="right-end"
      :width="360"
      :offset="12"
      :show-arrow="false"
      teleported
      popper-class="session-notification-bell-popper"
    >
      <template #reference>
        <ElBadge
          :value="pendingInvitationCount"
          :max="99"
          :hidden="!hasPendingInvitations"
          class="session-notification-bell__badge"
        >
          <ElButton
            circle
            class="session-notification-bell__trigger"
            :class="{ 'is-collapsed': props.isCollapsed }"
          >
            <SvgIcon category="ui" icon="bell" size="18px" class="session-notification-bell__icon" />
          </ElButton>
        </ElBadge>
      </template>

      <div class="session-notification-bell">
        <div class="session-notification-bell__header">
          <div class="session-notification-bell__header-main">
            <h3 class="session-notification-bell__title">
              {{ t('sessionMenu.notifications.title') }}
            </h3>
          </div>

          <ElButton text :loading="isLoading" @click="loadSummary">
            {{ t('sessionMenu.notifications.refresh') }}
          </ElButton>
        </div>

        <p v-if="loadErrorMessage" class="session-notification-bell__error">
          {{ loadErrorMessage }}
        </p>

        <div v-else-if="isLoading && !hasLoaded" class="session-notification-bell__loading">
          {{ t('sessionMenu.notifications.loading') }}
        </div>

        <div v-else-if="!invitationItems.length" class="session-notification-bell__empty">
          {{ t('sessionMenu.notifications.noPending') }}
        </div>

        <ul v-else class="session-notification-bell__list">
          <li
            v-for="invitation in invitationItems"
            :key="invitation.id"
            class="session-notification-bell__item"
          >
            <div class="session-notification-bell__item-main">
              <div class="session-notification-bell__item-title-row">
                <p class="session-notification-bell__item-title">
                  {{ t('sessionMenu.invitation.invitedDocumentTitle', { inviter: invitation.inviterLabel, title: invitation.documentTitle }) }}
                </p>
                <ElTag size="small" type="primary" effect="plain">
                  {{ t('sessionMenu.notifications.documentTag') }}
                </ElTag>
              </div>

              <p class="session-notification-bell__item-meta">
                {{ invitation.receivedLabel }}
              </p>
            </div>

            <div class="session-notification-bell__item-actions">
              <ElButton
                size="small"
                plain
                :disabled="Boolean(actingInvitationId)"
                @click="viewInvitation(invitation)"
              >
                {{ t('sessionMenu.notifications.view') }}
              </ElButton>
              <ElButton
                size="small"
                plain
                :disabled="Boolean(actingInvitationId)"
                :loading="actingInvitationId === invitation.id && actingInvitationAction === 'decline'"
                @click="declineInvitation(invitation)"
              >
                {{ t('sessionMenu.notifications.decline') }}
              </ElButton>
              <ElButton
                size="small"
                type="primary"
                :disabled="Boolean(actingInvitationId)"
                :loading="actingInvitationId === invitation.id && actingInvitationAction === 'accept'"
                @click="acceptInvitation(invitation)"
              >
                {{ t('sessionMenu.notifications.accept') }}
              </ElButton>
            </div>
          </li>
        </ul>
      </div>
    </ElPopover>

    <ElDialog
      :model-value="isDetailDialogOpen"
      :title="t('sessionMenu.invitation.title')"
      width="420px"
      append-to-body
      @update:model-value="(visible: boolean) => !visible && closeInvitationDetail()"
    >
      <div v-if="selectedInvitation" class="session-notification-bell__detail">
        <h3 class="session-notification-bell__detail-title">
          {{ selectedInvitation.documentTitle }}
        </h3>
        <p class="session-notification-bell__detail-subtitle">
          {{ t('sessionMenu.invitation.invitedDocument', { inviter: selectedInvitation.inviterLabel }) }}
        </p>

        <ElDescriptions :column="1" border>
          <ElDescriptionsItem :label="t('sessionMenu.invitation.permission')">
            {{ getPermissionLabel(selectedInvitation.permission) }}
          </ElDescriptionsItem>
          <ElDescriptionsItem :label="t('sessionMenu.invitation.scope')">
            {{ getScopeLabel(selectedInvitation.scope) }}
          </ElDescriptionsItem>
          <ElDescriptionsItem :label="t('sessionMenu.invitation.sentAt')">
            {{ selectedInvitation.receivedLabel }}
          </ElDescriptionsItem>
        </ElDescriptions>
      </div>

      <template #footer>
        <ElButton
          :disabled="Boolean(actingInvitationId)"
          @click="closeInvitationDetail"
        >
          {{ t('sessionMenu.invitation.later') }}
        </ElButton>
        <ElButton
          v-if="selectedInvitation"
          plain
          :disabled="Boolean(actingInvitationId)"
          :loading="actingInvitationId === selectedInvitation.id && actingInvitationAction === 'decline'"
          @click="declineInvitation(selectedInvitation)"
        >
          {{ t('sessionMenu.invitation.decline') }}
        </ElButton>
        <ElButton
          v-if="selectedInvitation"
          type="primary"
          :disabled="Boolean(actingInvitationId)"
          :loading="actingInvitationId === selectedInvitation.id && actingInvitationAction === 'accept'"
          @click="acceptInvitation(selectedInvitation)"
        >
          {{ t('sessionMenu.invitation.acceptAndOpen') }}
        </ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped lang="scss">
.session-notification-bell-entry {
  display: inline-flex;
}

.session-notification-bell {
  width: 100%;

  &__badge {
    display: inline-flex;
  }

  &__trigger {
    width: 2.5rem;
    height: 2.5rem;
    border: 1px solid transparent;
    background: transparent;
    color: var(--brand-text-secondary);
    box-shadow: none;

    &:hover {
      border-color: transparent;
      background: color-mix(in srgb, var(--brand-primary) 8%, transparent);
      color: var(--brand-primary);
    }

    &.is-collapsed {
      width: 2.75rem;
      height: 2.75rem;
      background: transparent;
    }
  }

  &__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.875rem;
  }

  &__header-main {
    min-width: 0;
  }

  &__title,
  &__error,
  &__loading,
  &__empty,
  &__item-title,
  &__item-meta,
  &__detail-title,
  &__detail-subtitle {
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
    font-size: 13px;
    line-height: 1.5;
  }

  &__loading,
  &__empty {
    padding: 0.875rem 1rem;
    border-radius: 0.875rem;
    background: color-mix(in srgb, var(--brand-fill-lighter) 82%, transparent);
    color: var(--brand-text-secondary);
    font-size: 0.875rem;
    line-height: 1.6;
  }

  &__error {
    padding: 0.875rem 1rem;
    border: 1px solid color-mix(in srgb, var(--brand-error) 20%, transparent);
    border-radius: 0.875rem;
    background: color-mix(in srgb, var(--brand-error) 8%, white);
    color: var(--brand-error);
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
    gap: 0.75rem;
    padding: 0.75rem 0.875rem;
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 76%, transparent);
    border-radius: 0.5rem;
    background: color-mix(in srgb, var(--brand-fill-lighter) 42%, transparent);
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
    margin-bottom: 0.25rem;
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

  &__detail {
    display: grid;
    gap: 1rem;
  }

  &__detail-title {
    color: var(--brand-text-primary);
    font-size: 1.125rem;
    font-weight: 700;
    line-height: 1.4;
  }

  &__detail-subtitle {
    color: var(--brand-text-secondary);
    font-size: 0.875rem;
    line-height: 1.6;
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
