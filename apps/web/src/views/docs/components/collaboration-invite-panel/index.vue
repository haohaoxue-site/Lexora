<script setup lang="ts">
import type {
  DocumentCollaborationPermission,
  DocumentCollaborationScope,
} from '@haohaoxue/lexora-contracts'
import type {
  CollaborationInvitePanelEmits,
  CollaborationInvitePanelProps,
} from './typing'
import { useI18n } from 'vue-i18n'
import {
  formatCollaborationIdentity,
  formatCollaborationPermission,
  formatCollaborationScope,
  formatCollaborationSource,
  getCollaborationAvatarText,
} from '../../utils/documentCollaboration'
import CollaborationAvatarStack from '../collaboration-avatar-stack'

const props = defineProps<CollaborationInvitePanelProps>()
const emits = defineEmits<CollaborationInvitePanelEmits>()
const userCode = defineModel<string>('userCode', { required: true })
const permission = defineModel<DocumentCollaborationPermission>('permission', { required: true })
const scope = defineModel<DocumentCollaborationScope>('scope', { required: true })
const { t } = useI18n()

function setPermission(command: string | number | object) {
  permission.value = String(command) as DocumentCollaborationPermission
}

function setScope(command: string | number | object) {
  scope.value = String(command) as DocumentCollaborationScope
}
</script>

<template>
  <section class="collaboration-invite-panel grid gap-3">
    <div class="flex items-center justify-between gap-4 max-[720px]:grid">
      <h3 class="m-0 text-[0.95rem] leading-[1.4]">
        {{ t('docs.collaboration.inviteTitle') }}
      </h3>
      <CollaborationAvatarStack
        :owner="props.owner"
        :collaborators="props.collaborators"
        :can-open="props.canOpenCollaborators"
        @open="emits('openCollaborators')"
      />
    </div>

    <ElInput
      v-model="userCode"
      class="collaboration-invite-panel__input"
      size="large"
      :placeholder="t('docs.collaboration.invitePlaceholder')"
      clearable
    >
      <template #append>
        <ElButton
          class="m-0 h-full w-full rounded-none"
          :loading="props.isCreatingInvitation || props.isResolvingInvitee"
          :disabled="!props.canSubmitInvitation"
          @click="emits('submit')"
        >
          <SvgIcon category="ui" icon="plus" size="1rem" />
        </ElButton>
      </template>
    </ElInput>

    <div
      v-if="props.isResolvingInvitee || props.resolvedInvitee || props.inviteeResolveError"
      class="collaboration-invite-panel__invitee-card rounded-lg p-3"
    >
      <p v-if="props.isResolvingInvitee" class="m-0 text-xs leading-[1.5] text-secondary">
        {{ t('docs.collaboration.resolvingUser') }}
      </p>
      <p v-else-if="props.inviteeResolveError && !props.resolvedInvitee" class="m-0 text-xs leading-[1.5] text-danger">
        {{ props.inviteeResolveError }}
      </p>
      <template v-else-if="props.resolvedInvitee">
        <div class="flex min-w-0 items-center gap-3">
          <ElAvatar
            :size="34"
            :src="props.resolvedInvitee.avatarUrl ?? undefined"
          >
            {{ getCollaborationAvatarText(props.resolvedInvitee) }}
          </ElAvatar>
          <div class="min-w-0 flex-1">
            <div class="overflow-hidden text-sm font-medium leading-[1.4] text-main text-ellipsis whitespace-nowrap">
              {{ formatCollaborationIdentity(props.resolvedInvitee) }}
            </div>
            <div class="overflow-hidden text-xs leading-[1.4] text-secondary text-ellipsis whitespace-nowrap">
              <template v-if="props.isResolvedOwner">
                {{ t('docs.collaboration.inviteOwnerNotNeeded') }}
              </template>
              <template v-else-if="props.resolvedCollaborator">
                {{ t('docs.collaboration.alreadyCollaborator', {
                  source: formatCollaborationSource(props.resolvedCollaborator),
                  permission: formatCollaborationPermission(props.resolvedCollaborator.effectivePermission),
                }) }}
              </template>
              <template v-else-if="props.hasResolvedInvitation">
                {{ t('docs.collaboration.existingInvitation') }}
              </template>
              <template v-else>
                {{ t('docs.collaboration.willSendInvite') }}
              </template>
            </div>
          </div>

          <div
            v-if="props.canSubmitInvitation"
            class="flex flex-[0_0_auto] flex-wrap justify-end gap-2 max-[720px]:w-full max-[720px]:justify-start"
          >
            <ElDropdown trigger="click" @command="setPermission">
              <ElButton size="small" class="min-w-24 justify-between gap-2">
                {{ formatCollaborationPermission(permission) }}
                <SvgIcon category="ui" icon="chevron-down" size="0.82rem" />
              </ElButton>

              <template #dropdown>
                <ElDropdownMenu>
                  <ElDropdownItem
                    v-for="option in props.permissionOptions"
                    :key="option.value"
                    :command="option.value"
                    :disabled="option.value === permission"
                  >
                    {{ option.label }}
                  </ElDropdownItem>
                </ElDropdownMenu>
              </template>
            </ElDropdown>

            <ElDropdown trigger="click" @command="setScope">
              <ElButton size="small" class="min-w-[9.25rem] justify-between gap-2">
                {{ formatCollaborationScope(scope) }}
                <SvgIcon category="ui" icon="chevron-down" size="0.82rem" />
              </ElButton>

              <template #dropdown>
                <ElDropdownMenu>
                  <ElDropdownItem
                    v-for="option in props.scopeOptions"
                    :key="option.value"
                    :command="option.value"
                    :disabled="option.value === scope"
                  >
                    {{ option.label }}
                  </ElDropdownItem>
                </ElDropdownMenu>
              </template>
            </ElDropdown>

            <ElButton
              type="primary"
              size="small"
              :loading="props.isCreatingInvitation"
              @click="emits('submit')"
            >
              {{ props.invitationSubmitLabel }}
            </ElButton>
          </div>

          <ElButton
            v-else-if="props.resolvedCollaborator"
            size="small"
            @click="emits('openCollaborators')"
          >
            {{ t('docs.collaboration.viewCollaborators') }}
          </ElButton>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped lang="scss">
.collaboration-invite-panel__input {
  :deep(.el-input-group__append) {
    width: 3.25rem;
    padding: 0;
  }
}

.collaboration-invite-panel__invitee-card {
  border: 1px solid color-mix(in srgb, var(--brand-border-base) 72%, transparent);
  background: color-mix(in srgb, var(--brand-bg-surface-raised) 88%, var(--brand-bg-surface));
}
</style>
