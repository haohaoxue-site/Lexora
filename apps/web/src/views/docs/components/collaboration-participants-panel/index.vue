<script setup lang="ts">
import type {
  DocumentCollaborationCollaborator,
} from '@haohaoxue/samepage-contracts'
import type {
  CollaborationParticipantRow,
  CollaborationParticipantsPanelEmits,
  CollaborationParticipantsPanelProps,
} from './typing'
import {
  DOCUMENT_COLLABORATION_COLLABORATOR_SOURCE,
} from '@haohaoxue/samepage-contracts'
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
    return '继承父级'
  }

  return `继承父级（${formatCollaborationPermission(row.inheritedFrom.permission)}）`
}
</script>

<template>
  <section class="collaboration-participants-panel grid content-start gap-3">
    <p class="m-0 text-[0.9rem] leading-[1.5] text-secondary">
      所有可访问此文档的用户
    </p>

    <ElTable
      :data="props.rows"
      :row-key="getParticipantRowKey"
      :show-header="false"
      :max-height="288"
      class="min-h-[8.75rem]"
      empty-text="暂无协作者"
    >
      <ElTableColumn min-width="290">
        <template #default="{ row }">
          <div
            v-if="row.type === 'owner'"
            class="flex min-w-0 items-center gap-3"
          >
            <ElAvatar
              :size="36"
              :src="row.owner.avatarUrl ?? undefined"
            >
              {{ getCollaborationAvatarText(row.owner) }}
            </ElAvatar>
            <div class="min-w-0 flex-1">
              <div class="flex min-w-0 items-center gap-[0.4rem] text-sm font-medium leading-[1.4] text-main">
                <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                  {{ getCollaborationIdentityName(row.owner) }}
                </span>
                <ElTag size="small" type="primary" effect="plain">
                  所有者
                </ElTag>
              </div>
              <div class="overflow-hidden text-xs leading-[1.4] text-secondary text-ellipsis whitespace-nowrap">
                拥有完整管理权限
              </div>
            </div>
          </div>

          <div
            v-else
            class="flex min-w-0 items-center gap-3"
          >
            <ElAvatar
              :size="36"
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
            class="inline-flex flex-wrap justify-end gap-[0.4rem]"
          >
            <ElDropdown
              trigger="click"
              @command="command => emits('permissionCommand', row.collaborator, command)"
            >
              <ElButton
                text
                size="small"
                class="gap-1 px-1 text-main font-medium"
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
                    可编辑
                  </ElDropdownItem>
                  <ElDropdownItem command="read">
                    可阅读
                  </ElDropdownItem>
                  <ElDropdownItem
                    command="remove"
                    divided
                    :disabled="!canRemoveCollaborator(row.collaborator)"
                  >
                    移除
                  </ElDropdownItem>
                </ElDropdownMenu>
              </template>
            </ElDropdown>

            <ElDropdown
              v-if="canUpdateCollaboratorScope(row.collaborator)"
              trigger="click"
              @command="command => emits('scopeCommand', row.collaborator, command)"
            >
              <ElButton
                text
                size="small"
                class="min-w-[7.4rem] justify-between gap-1 px-1 text-main font-medium"
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
              class="inline-flex min-h-7 items-center rounded-[0.45rem] bg-fill-lighter-a70 px-[0.65rem] text-[0.82rem] leading-none text-secondary"
            >
              {{ formatCollaborationScope(row.collaborator.effectiveScope) }}
            </span>
          </div>
        </template>
      </ElTableColumn>
    </ElTable>
  </section>
</template>
