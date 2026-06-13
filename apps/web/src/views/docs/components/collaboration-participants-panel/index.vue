<script setup lang="ts">
import type {
  DocumentCollaborationCollaborator,
} from '@haohaoxue/samepage-contracts/document/collaboration'
import type {
  CollaborationParticipantRow,
  CollaborationParticipantsPanelEmits,
  CollaborationParticipantsPanelProps,
} from './typing'
import {
  DOCUMENT_COLLABORATION_COLLABORATOR_SOURCE,
} from '@haohaoxue/samepage-contracts/document/collaboration/constants'
import { useI18n } from 'vue-i18n'
import {
  formatCollaborationIdentity,
  formatCollaborationPermission,
  formatCollaborationScope,
  formatCollaborationSource,
  getCollaborationAvatarText,
  getCollaborationIdentityName,
} from '../../utils/documentCollaboration'

const props = defineProps<CollaborationParticipantsPanelProps>()
const emits = defineEmits<CollaborationParticipantsPanelEmits>()
const { t } = useI18n()

function getParticipantRowKey(row: CollaborationParticipantRow) {
  return row.id
}

function getCollaboratorActionId(row: DocumentCollaborationCollaborator) {
  return row.source === DOCUMENT_COLLABORATION_COLLABORATOR_SOURCE.DIRECT
    ? row.grant?.id ?? row.userId
    : `user:${row.userId}`
}

function getCollaboratorScopeActionId(row: DocumentCollaborationCollaborator) {
  return row.grant ? `scope:${row.grant.id}` : `scope:${row.userId}`
}

function canRemoveCollaborator(row: DocumentCollaborationCollaborator) {
  return row.source === DOCUMENT_COLLABORATION_COLLABORATOR_SOURCE.DIRECT && Boolean(row.grant)
}

function canUpdateCollaboratorScope(row: DocumentCollaborationCollaborator) {
  return row.source === DOCUMENT_COLLABORATION_COLLABORATOR_SOURCE.DIRECT && Boolean(row.grant)
}

function canInheritCollaborator(row: DocumentCollaborationCollaborator) {
  return row.source === DOCUMENT_COLLABORATION_COLLABORATOR_SOURCE.DIRECT && Boolean(row.grant && row.inheritedFrom)
}

function formatInheritMenuLabel(row: DocumentCollaborationCollaborator) {
  if (!row.inheritedFrom) {
    return t('docs.collaboration.inheritParent')
  }

  return t('docs.collaboration.inheritParentWithPermission', {
    permission: formatCollaborationPermission(row.inheritedFrom.permission),
  })
}
</script>

<template>
  <section class="collaboration-participants-panel grid content-start gap-3">
    <p class="collaboration-participants-panel__description m-0 text-[0.9rem] leading-[1.5] text-secondary">
      {{ t('docs.collaboration.allUsers') }}
    </p>

    <ElTable
      :data="props.rows"
      :row-key="getParticipantRowKey"
      :show-header="false"
      :max-height="272"
      class="collaboration-participants-panel__table min-h-36"
      :empty-text="t('docs.collaboration.noCollaborators')"
    >
      <ElTableColumn min-width="290">
        <template #default="{ row }">
          <div
            v-if="row.type === 'owner'"
            class="flex min-w-0 items-center gap-2.5"
          >
            <ElAvatar
              :size="34"
              :src="row.owner.avatarUrl ?? undefined"
            >
              {{ getCollaborationAvatarText(row.owner) }}
            </ElAvatar>
            <div class="min-w-0 flex-1">
              <div class="flex min-w-0 items-center gap-1.5 text-sm font-medium leading-[1.4] text-main">
                <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                  {{ getCollaborationIdentityName(row.owner) }}
                </span>
                <ElTag size="small" type="primary" effect="plain">
                  {{ t('docs.collaboration.owner') }}
                </ElTag>
              </div>
              <div class="overflow-hidden text-xs leading-[1.4] text-secondary text-ellipsis whitespace-nowrap">
                {{ t('docs.collaboration.ownerDescription') }}
              </div>
            </div>
          </div>

          <div
            v-else
            class="flex min-w-0 items-center gap-2.5"
          >
            <ElAvatar
              :size="34"
              :src="row.collaborator.user.avatarUrl ?? undefined"
            >
              {{ getCollaborationAvatarText(row.collaborator.user) }}
            </ElAvatar>
            <div class="min-w-0 flex-1">
              <div class="overflow-hidden text-sm font-medium leading-[1.4] text-main text-ellipsis whitespace-nowrap">
                {{ formatCollaborationIdentity(row.collaborator.user) }}
              </div>
              <div class="overflow-hidden text-xs leading-[1.4] text-secondary text-ellipsis whitespace-nowrap">
                {{ formatCollaborationSource(row.collaborator) }}
              </div>
            </div>
          </div>
        </template>
      </ElTableColumn>

      <ElTableColumn width="280" align="right">
        <template #default="{ row }">
          <div
            v-if="row.type === 'collaborator'"
            class="inline-flex flex-wrap justify-end gap-1.5"
          >
            <ElDropdown
              trigger="click"
              popper-class="collaboration-participants-panel__menu-popper"
              @command="command => emits('permissionCommand', row.collaborator, command)"
            >
              <ElButton
                text
                size="small"
                class="h-7 gap-1 rounded-lg px-2 text-[13px] text-main font-medium"
                :loading="props.actionId === getCollaboratorActionId(row.collaborator)"
              >
                {{ formatCollaborationPermission(row.collaborator.effectivePermission) }}
                <SvgIcon category="ui" icon="chevron-down" size="0.8rem" />
              </ElButton>

              <template #dropdown>
                <ElDropdownMenu>
                  <ElDropdownItem
                    command="inherit"
                    :disabled="!canInheritCollaborator(row.collaborator)"
                  >
                    {{ formatInheritMenuLabel(row.collaborator) }}
                  </ElDropdownItem>
                  <ElDropdownItem command="edit">
                    {{ t('docs.collaboration.canEdit') }}
                  </ElDropdownItem>
                  <ElDropdownItem command="read">
                    {{ t('docs.collaboration.canRead') }}
                  </ElDropdownItem>
                  <ElDropdownItem
                    command="remove"
                    divided
                    :disabled="!canRemoveCollaborator(row.collaborator)"
                  >
                    {{ t('docs.collaboration.remove') }}
                  </ElDropdownItem>
                </ElDropdownMenu>
              </template>
            </ElDropdown>

            <ElDropdown
              v-if="canUpdateCollaboratorScope(row.collaborator)"
              trigger="click"
              popper-class="collaboration-participants-panel__menu-popper"
              @command="command => emits('scopeCommand', row.collaborator, command)"
            >
              <ElButton
                text
                size="small"
                class="min-w-[7rem] h-7 justify-between gap-1 rounded-lg px-2 text-[13px] text-main font-medium"
                :loading="props.actionId === getCollaboratorScopeActionId(row.collaborator)"
              >
                {{ formatCollaborationScope(row.collaborator.effectiveScope) }}
                <SvgIcon category="ui" icon="chevron-down" size="0.8rem" />
              </ElButton>

              <template #dropdown>
                <ElDropdownMenu>
                  <ElDropdownItem
                    v-for="option in props.scopeOptions"
                    :key="option.value"
                    :command="option.value"
                    :disabled="option.value === row.collaborator.effectiveScope"
                  >
                    {{ option.label }}
                  </ElDropdownItem>
                </ElDropdownMenu>
              </template>
            </ElDropdown>

            <span
              v-else
              class="inline-flex min-h-7 items-center rounded-lg bg-fill-lighter-a70 px-2.5 text-[13px] leading-none text-secondary"
            >
              {{ formatCollaborationScope(row.collaborator.effectiveScope) }}
            </span>
          </div>
        </template>
      </ElTableColumn>
    </ElTable>
  </section>
</template>

<style scoped lang="scss">
:global(.collaboration-participants-panel__menu-popper .el-dropdown-menu) {
  padding: 0.25rem;
}

:global(.collaboration-participants-panel__menu-popper .el-dropdown-menu__item) {
  min-height: 2rem;
  border-radius: 0.5rem;
  padding-inline: 0.5rem;
}
</style>
