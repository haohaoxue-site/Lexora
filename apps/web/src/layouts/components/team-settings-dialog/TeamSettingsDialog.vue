<script setup lang="ts">
import type { FormInstance } from 'element-plus'
import type { TeamSettingsDialogProps } from './typing'
import { toRef, useTemplateRef } from 'vue'
import CollabIdentityItem from '@/components/collab-identity/CollabIdentityItem.vue'
import CollabUserLookupField from '@/components/collab-identity/CollabUserLookupField.vue'
import { useTeamSettingsDialog } from './useTeamSettingsDialog'

const props = defineProps<TeamSettingsDialogProps>()
const visible = defineModel<boolean>({
  required: true,
})
const inviteFormRef = useTemplateRef<FormInstance>('inviteFormRef')

const {
  cancelInvite,
  cancelingInviteId,
  deleteCurrentWorkspace,
  dialogTitle,
  inviteForm,
  inviteRules,
  isCreatingInvite,
  isDeletingWorkspace,
  isLoadingMembers,
  isLoadingPendingInvites,
  isOwner,
  memberLoadErrorMessage,
  memberCountLabel,
  memberItems,
  loadPendingInvites,
  pendingInviteCountLabel,
  pendingInviteErrorMessage,
  pendingInviteItems,
  roleSummaryLabel,
  loadMembers,
  handleInviteCleared,
  handleInviteResolved,
  resetInviteForm,
  submitInvite,
} = useTeamSettingsDialog({
  visible,
  workspace: toRef(props, 'workspace'),
  inviteFormRef,
})
</script>

<template>
  <ElDialog
    v-model="visible"
    :title="dialogTitle"
    width="42rem"
    align-center
    append-to-body
    modal-append-to-body
    destroy-on-close
    @closed="resetInviteForm"
  >
    <div class="team-settings-dialog">
      <section class="team-settings-dialog__hero">
        <div class="team-settings-dialog__hero-copy">
          <p class="team-settings-dialog__hero-title">
            {{ props.workspace?.name ?? '当前团队' }}
          </p>
          <p class="team-settings-dialog__hero-description">
            {{ roleSummaryLabel }}
          </p>
        </div>

        <div class="team-settings-dialog__hero-meta">
          <span class="team-settings-dialog__member-count">
            {{ memberCountLabel }}
          </span>
          <span
            v-if="isOwner"
            class="team-settings-dialog__member-count team-settings-dialog__member-count--pending"
          >
            {{ pendingInviteCountLabel }}
          </span>
        </div>
      </section>

      <section v-if="isOwner" class="team-settings-dialog__section">
        <div class="team-settings-dialog__section-header">
          <div>
            <h3 class="team-settings-dialog__section-title">
              邀请成员
            </h3>
            <p class="team-settings-dialog__section-description">
              仅支持按完整协作码邀请已注册用户。
            </p>
          </div>
        </div>

        <ElForm
          ref="inviteFormRef"
          :model="inviteForm"
          :rules="inviteRules"
          label-position="top"
          class="team-settings-dialog__invite-form"
          @submit.prevent="submitInvite"
        >
          <ElFormItem label="协作码" prop="userCode">
            <CollabUserLookupField
              v-model:code="inviteForm.userCode"
              self-target-message="不能邀请自己"
              @resolved="handleInviteResolved"
              @cleared="handleInviteCleared"
            />
          </ElFormItem>

          <div class="team-settings-dialog__invite-actions">
            <ElButton
              type="primary"
              :loading="isCreatingInvite"
              @click="submitInvite"
            >
              发送邀请
            </ElButton>
          </div>
        </ElForm>
      </section>

      <section v-if="isOwner" class="team-settings-dialog__section">
        <div class="team-settings-dialog__section-header">
          <div>
            <h3 class="team-settings-dialog__section-title">
              待处理邀请
            </h3>
            <p class="team-settings-dialog__section-description">
              已发出的邀请会保留在这里，等待对方接受或拒绝。
            </p>
          </div>

          <ElButton text @click="loadPendingInvites">
            刷新
          </ElButton>
        </div>

        <p v-if="pendingInviteErrorMessage" class="team-settings-dialog__error">
          {{ pendingInviteErrorMessage }}
        </p>

        <div v-else-if="isLoadingPendingInvites" class="team-settings-dialog__loading">
          正在加载待处理邀请...
        </div>

        <div v-else-if="!pendingInviteItems.length" class="team-settings-dialog__empty">
          暂无待处理邀请。
        </div>

        <ul v-else class="team-settings-dialog__invite-list">
          <li
            v-for="invite in pendingInviteItems"
            :key="invite.id"
            class="team-settings-dialog__invite-item"
          >
            <div class="team-settings-dialog__invite-main">
              <CollabIdentityItem
                :identity="invite.invitee"
                :avatar-size="42"
                class="team-settings-dialog__member-identity"
              />
            </div>

            <div class="team-settings-dialog__invite-side">
              <div class="team-settings-dialog__member-badges">
                <ElTag size="small" type="warning" effect="plain">
                  待处理
                </ElTag>
              </div>

              <span class="team-settings-dialog__member-time">
                {{ invite.invitedLabel }}
              </span>

              <ElButton
                size="small"
                type="danger"
                plain
                :loading="cancelingInviteId === invite.id"
                @click="cancelInvite(invite)"
              >
                取消邀请
              </ElButton>
            </div>
          </li>
        </ul>
      </section>

      <section class="team-settings-dialog__section">
        <div class="team-settings-dialog__section-header">
          <div>
            <h3 class="team-settings-dialog__section-title">
              团队成员
            </h3>
            <p class="team-settings-dialog__section-description">
              当前仅展示已加入团队的成员。
            </p>
          </div>

          <ElButton text @click="loadMembers">
            刷新
          </ElButton>
        </div>

        <p v-if="memberLoadErrorMessage" class="team-settings-dialog__error">
          {{ memberLoadErrorMessage }}
        </p>

        <div v-else-if="isLoadingMembers" class="team-settings-dialog__loading">
          正在加载团队成员...
        </div>

        <div v-else-if="!memberItems.length" class="team-settings-dialog__empty">
          当前团队还没有可展示的成员。
        </div>

        <ul v-else class="team-settings-dialog__member-list">
          <li
            v-for="member in memberItems"
            :key="member.user.id"
            class="team-settings-dialog__member-item"
          >
            <div class="team-settings-dialog__member-main">
              <CollabIdentityItem
                :identity="member.user"
                :avatar-size="42"
                class="team-settings-dialog__member-identity"
              />
            </div>

            <div class="team-settings-dialog__member-side">
              <div class="team-settings-dialog__member-badges">
                <ElTag size="small" effect="plain">
                  {{ member.roleLabel }}
                </ElTag>
                <ElTag
                  v-if="member.isCurrentUser"
                  size="small"
                  type="success"
                  effect="plain"
                >
                  你
                </ElTag>
              </div>

              <span class="team-settings-dialog__member-time">
                {{ member.joinedLabel }}
              </span>
            </div>
          </li>
        </ul>
      </section>

      <section v-if="isOwner" class="team-settings-dialog__section team-settings-dialog__section--danger">
        <div class="team-settings-dialog__section-header">
          <div>
            <h3 class="team-settings-dialog__section-title">
              危险操作
            </h3>
            <p class="team-settings-dialog__section-description">
              删除团队后会级联清理团队文档、成员、邀请和分享关系，删除后无法恢复。
            </p>
          </div>

          <ElButton
            type="danger"
            plain
            :loading="isDeletingWorkspace"
            @click="deleteCurrentWorkspace"
          >
            删除团队
          </ElButton>
        </div>
      </section>
    </div>

    <template #footer>
      <div class="team-settings-dialog__footer">
        <ElButton @click="visible = false">
          关闭
        </ElButton>
      </div>
    </template>
  </ElDialog>
</template>

<style scoped lang="scss">
.team-settings-dialog {
  display: flex;
  flex-direction: column;
  gap: 1rem;

  &__hero,
  &__section {
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 76%, transparent);
    border-radius: 1rem;
    background: color-mix(in srgb, var(--brand-fill-lighter) 56%, transparent);
  }

  &__hero {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 1.125rem 1.125rem 1rem;
    background:
      linear-gradient(145deg, color-mix(in srgb, var(--brand-primary) 8%, var(--brand-bg-surface)) 0%, var(--brand-bg-surface) 88%);
  }

  &__section--danger {
    border-color: color-mix(in srgb, var(--brand-error) 18%, var(--brand-border-base));
    background: color-mix(in srgb, var(--brand-error) 4%, var(--brand-bg-surface));
  }

  &__hero-copy {
    min-width: 0;
  }

  &__hero-meta {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  &__hero-title,
  &__hero-description,
  &__section-title,
  &__section-description,
  &__error,
  &__loading,
  &__empty,
  &__member-time {
    margin: 0;
  }

  &__hero-title {
    color: var(--brand-text-primary);
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.5;
  }

  &__hero-description,
  &__section-description,
  &__member-time {
    color: var(--brand-text-secondary);
    font-size: 0.8125rem;
    line-height: 1.5;
  }

  &__member-count {
    display: inline-flex;
    align-items: center;
    padding: 0.375rem 0.75rem;
    color: var(--brand-primary);
    border-radius: 999px;
    background: color-mix(in srgb, var(--brand-primary) 10%, white);
    font-size: 0.8125rem;
    font-weight: 600;
  }

  &__member-count--pending {
    color: var(--brand-warning);
    background: color-mix(in srgb, var(--brand-warning) 12%, white);
  }

  &__section {
    padding: 1rem 1.125rem;
  }

  &__section-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.875rem;
  }

  &__section-title {
    color: var(--brand-text-primary);
    font-size: 0.9375rem;
    font-weight: 700;
    line-height: 1.5;
  }

  &__invite-form {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  &__invite-actions,
  &__footer {
    display: flex;
    justify-content: flex-end;
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

  &__member-list,
  &__invite-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0;
    margin: 0;
    list-style: none;
  }

  &__member-item,
  &__invite-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-width: 0;
    padding: 0.875rem 1rem;
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 70%, transparent);
    border-radius: 0.875rem;
    background: var(--brand-bg-surface);
  }

  &__member-main,
  &__member-side,
  &__invite-main,
  &__invite-side {
    min-width: 0;
  }

  &__member-main,
  &__invite-main {
    flex: 1 1 auto;
  }

  &__member-side,
  &__invite-side {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.5rem;
  }

  &__member-badges {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.5rem;
  }
}

@media (max-width: 720px) {
  .team-settings-dialog {
    &__hero,
    &__section-header,
    &__member-item,
    &__invite-item {
      flex-direction: column;
      align-items: stretch;
    }

    &__member-side,
    &__invite-side,
    &__member-badges {
      align-items: flex-start;
      justify-content: flex-start;
    }
  }
}
</style>
