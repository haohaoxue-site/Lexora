<script setup lang="ts">
import type {
  DocumentLinkShareMode,
  DocumentShareDialogMode,
  DocumentShareModeOption,
  DocumentSharePermission,
  DocumentSharePermissionOption,
} from '@haohaoxue/samepage-contracts'
import type { DocumentShareChangedPayload } from '../typing'
import {
  DOCUMENT_SHARE_INHERIT_MODE,
  DOCUMENT_SHARE_INHERIT_MODE_OPTION,
  DOCUMENT_SHARE_MODE,
  DOCUMENT_SHARE_MODE_OPTIONS,
  DOCUMENT_SHARE_PERMISSION,
  DOCUMENT_SHARE_PERMISSION_LABELS,
  WORKSPACE_TYPE,
} from '@haohaoxue/samepage-contracts'
import { canManageDocumentShare, getDocumentShareModeLabel } from '@haohaoxue/samepage-shared'
import { computed, shallowRef, watch } from 'vue'
import CollabIdentityItem from '@/components/collab-identity/CollabIdentityItem.vue'
import CollabUserLookupField from '@/components/collab-identity/CollabUserLookupField.vue'
import { SvgIcon } from '@/components/svg-icon'
import { useWorkspaceStore } from '@/stores/workspace'
import { useDocsPermissionsPage } from '../composables/useDocsPermissionsPage'

const props = withDefaults(defineProps<{
  modelValue: boolean
  documentId?: string | null
}>(), {
  documentId: '',
})

const emits = defineEmits<{
  'update:modelValue': [value: boolean]
  'shareChanged': [payload: DocumentShareChangedPayload]
}>()

const baseShareModeOptions: DocumentShareModeOption[] = [...DOCUMENT_SHARE_MODE_OPTIONS]
const directShareModeOption = baseShareModeOptions.find(option => option.value === DOCUMENT_SHARE_MODE.DIRECT_USER) ?? baseShareModeOptions[0]
const workspaceStore = useWorkspaceStore()

const sharePermissionOptions: DocumentSharePermissionOption[] = [
  {
    label: DOCUMENT_SHARE_PERMISSION_LABELS[DOCUMENT_SHARE_PERMISSION.VIEW],
    value: DOCUMENT_SHARE_PERMISSION.VIEW,
  },
  {
    label: DOCUMENT_SHARE_PERMISSION_LABELS[DOCUMENT_SHARE_PERMISSION.COMMENT],
    value: DOCUMENT_SHARE_PERMISSION.COMMENT,
    disabled: true,
  },
]

const normalizedDocumentId = computed(() => props.documentId?.trim() ?? '')
const canManagePublicSharePolicy = computed(() => {
  const currentWorkspace = workspaceStore.currentWorkspace

  if (!currentWorkspace) {
    return workspaceStore.currentWorkspaceType !== WORKSPACE_TYPE.TEAM
  }

  if (currentWorkspace.type === WORKSPACE_TYPE.PERSONAL) {
    return true
  }

  return canManageDocumentShare({
    workspaceType: currentWorkspace.type,
    workspaceMemberRole: currentWorkspace.role,
  })
})
const {
  currentDocumentId,
  publicShareInfo,
  directShareItems,
  directShareUserCode,
  fullShareLink,
  selectedShareMode,
  hasPublicShare,
  canRestoreInheritance,
  isInheritingSharePolicy,
  isRootDocument,
  localPolicy,
  effectivePolicy,
  isLoading,
  isLoadingDirectShares,
  isCreatingDirectShare,
  directShareActionRecipientId,
  selectedDirectShareUser,
  setSelectedShareMode,
  enablePublicShare,
  setNoShare,
  restoreInheritance,
  copyPublicShareLink,
  handleDirectShareResolved,
  handleDirectShareCleared,
  createDirectShare,
  copyDirectShareLink,
  revokeDirectShare,
} = useDocsPermissionsPage({
  documentId: normalizedDocumentId,
  enabled: () => props.modelValue,
  loadPublicShare: () => canManagePublicSharePolicy.value,
  onShareChanged: payload => emits('shareChanged', payload),
})

const dialogShareModeOverride = shallowRef<DocumentShareDialogMode | null>(null)
const selectedSharePermission = shallowRef<DocumentSharePermission>(DOCUMENT_SHARE_PERMISSION.VIEW)
const canRestoreDirectShareInheritance = computed(() =>
  canRestoreInheritance.value && localPolicy.value?.mode === DOCUMENT_SHARE_MODE.DIRECT_USER,
)
const canRestoreVisibleInheritance = computed(() =>
  canManagePublicSharePolicy.value ? canRestoreInheritance.value : canRestoreDirectShareInheritance.value,
)
const shouldShowShareModeDropdown = computed(() =>
  canManagePublicSharePolicy.value || canRestoreVisibleInheritance.value,
)
const shareModeOptions = computed<DocumentShareModeOption[]>(() => {
  if (!canManagePublicSharePolicy.value) {
    return [
      ...(canRestoreVisibleInheritance.value ? [{ ...DOCUMENT_SHARE_INHERIT_MODE_OPTION }] : []),
      directShareModeOption,
    ]
  }

  if (isRootDocument.value) {
    return baseShareModeOptions
  }

  return [
    { ...DOCUMENT_SHARE_INHERIT_MODE_OPTION },
    ...baseShareModeOptions,
  ]
})
const currentDialogShareMode = computed<DocumentShareDialogMode>(() => {
  if (!canManagePublicSharePolicy.value) {
    return DOCUMENT_SHARE_MODE.DIRECT_USER
  }

  if (dialogShareModeOverride.value) {
    return dialogShareModeOverride.value
  }

  if (!isRootDocument.value && isInheritingSharePolicy.value) {
    return DOCUMENT_SHARE_INHERIT_MODE
  }

  return selectedShareMode.value
})
const hasUsablePublicShareLink = computed(() => hasPublicShare.value && Boolean(fullShareLink.value))
const currentShareModeOption = computed(() =>
  shareModeOptions.value.find(option => option.value === currentDialogShareMode.value) ?? baseShareModeOptions[0],
)
const currentSharePermissionOption = computed(() =>
  sharePermissionOptions.find(option => option.value === selectedSharePermission.value) ?? sharePermissionOptions[0],
)
const inheritedSharePolicyText = computed(() => {
  if (localPolicy.value) {
    return '恢复后将跟随最近父级页面的分享设置。'
  }

  if (!effectivePolicy.value) {
    return `当前父级权限：${getDocumentShareModeLabel(null)}`
  }

  const policyModeText = getDocumentShareModeLabel(effectivePolicy.value.mode)
  const rootDocumentTitle = effectivePolicy.value.rootDocumentTitle?.trim()

  return rootDocumentTitle
    ? `当前父级权限：${policyModeText}（来自 ${rootDocumentTitle}）`
    : `当前父级权限：${policyModeText}`
})

watch(
  [currentDocumentId, selectedShareMode, isInheritingSharePolicy, localPolicy, effectivePolicy],
  () => {
    dialogShareModeOverride.value = null
  },
)

async function handleShareModeCommand(command: string | number | boolean) {
  if (!isShareModeCommand(command)) {
    return
  }

  if (command === DOCUMENT_SHARE_INHERIT_MODE) {
    if (canRestoreVisibleInheritance.value) {
      await handleRestoreInheritance()
      return
    }

    dialogShareModeOverride.value = DOCUMENT_SHARE_INHERIT_MODE
    return
  }

  if (command === DOCUMENT_SHARE_MODE.NONE) {
    if (!canManagePublicSharePolicy.value) {
      return
    }

    await handleSetNoShare()
    return
  }

  if (command === DOCUMENT_SHARE_MODE.LOGGED_IN || command === DOCUMENT_SHARE_MODE.PUBLIC) {
    if (!canManagePublicSharePolicy.value) {
      return
    }

    if (!hasPublicShare.value || publicShareInfo.value?.share?.mode !== command) {
      dialogShareModeOverride.value = command
      await handleEnablePublicShare(command)
      return
    }

    dialogShareModeOverride.value = command
    setSelectedShareMode(command)
    return
  }

  dialogShareModeOverride.value = DOCUMENT_SHARE_MODE.DIRECT_USER
  setSelectedShareMode(DOCUMENT_SHARE_MODE.DIRECT_USER)
}

function handlePermissionCommand(command: string | number | boolean) {
  if (command === DOCUMENT_SHARE_PERMISSION.VIEW || command === DOCUMENT_SHARE_PERMISSION.COMMENT) {
    selectedSharePermission.value = command
  }
}

async function handleSetNoShare() {
  await setNoShare()
  dialogShareModeOverride.value = null
}

async function handleEnablePublicShare(mode: DocumentLinkShareMode) {
  await enablePublicShare(mode)
  dialogShareModeOverride.value = null
}

async function handleRestoreInheritance() {
  await restoreInheritance()
  dialogShareModeOverride.value = null
}

function getRecipientStatusLabel(status: string) {
  if (status === 'ACTIVE') {
    return '已接收'
  }

  if (status === 'DECLINED') {
    return '已拒绝'
  }

  if (status === 'EXITED') {
    return '已退出'
  }

  return '待确认'
}

function isShareModeCommand(command: string | number | boolean): command is DocumentShareDialogMode {
  return command === DOCUMENT_SHARE_INHERIT_MODE
    || command === DOCUMENT_SHARE_MODE.NONE
    || command === DOCUMENT_SHARE_MODE.DIRECT_USER
    || command === DOCUMENT_SHARE_MODE.LOGGED_IN
    || command === DOCUMENT_SHARE_MODE.PUBLIC
}
</script>

<template>
  <ElDialog
    :model-value="props.modelValue"
    title="分享"
    width="880px"
    destroy-on-close
    append-to-body
    class="document-share-dialog"
    @update:model-value="emits('update:modelValue', $event)"
  >
    <section class="document-share-panel is-compact">
      <div class="document-share-panel__content">
        <section class="document-share-panel__summary">
          <div class="document-share-panel__summary-row">
            <ElDropdown
              v-if="shouldShowShareModeDropdown"
              trigger="click"
              class="document-share-panel__mode-dropdown"
              placement="bottom"
              @command="handleShareModeCommand"
            >
              <button type="button" class="document-share-panel__mode-trigger">
                <span class="document-share-panel__mode-trigger-icon" aria-hidden="true">
                  <SvgIcon
                    category="ui"
                    :icon="currentShareModeOption.icon"
                    size="1rem"
                    class="document-share-panel__mode-symbol"
                  />
                </span>

                <span class="document-share-panel__mode-copy">
                  <span class="document-share-panel__mode-title">
                    {{ currentShareModeOption.label }}
                  </span>

                  <span
                    v-if="currentDialogShareMode === DOCUMENT_SHARE_INHERIT_MODE"
                    class="document-share-panel__mode-description"
                  >
                    {{ inheritedSharePolicyText }}
                  </span>

                  <span
                    v-else-if="!canManagePublicSharePolicy"
                    class="document-share-panel__mode-description"
                  >
                    当前仅可管理指定用户分享
                  </span>
                </span>

                <SvgIcon
                  category="ui"
                  icon="chevron-down"
                  size="0.78rem"
                  class="document-share-panel__dropdown-caret"
                  aria-hidden="true"
                />
              </button>

              <template #dropdown>
                <ElDropdownMenu>
                  <ElDropdownItem
                    v-for="(option, idx) in shareModeOptions"
                    :key="option.value"
                    :command="option.value"
                    :divided="idx !== 0"
                  >
                    <span class="document-share-panel__mode-option min-w-30 flex items-center gap-2 py-0.5 text-sm font-medium">
                      <span class="document-share-panel__mode-option-icon inline-flex h-4 w-4 flex-none items-center justify-center" aria-hidden="true">
                        <SvgIcon
                          category="ui"
                          :icon="option.icon"
                          size="0.95rem"
                          class="document-share-panel__mode-symbol"
                        />
                      </span>

                      <span class="document-share-panel__mode-option-title">
                        {{ option.label }}
                      </span>
                    </span>
                  </ElDropdownItem>
                </ElDropdownMenu>
              </template>
            </ElDropdown>

            <div v-else class="document-share-panel__mode-trigger">
              <span class="document-share-panel__mode-trigger-icon" aria-hidden="true">
                <SvgIcon
                  category="ui"
                  :icon="currentShareModeOption.icon"
                  size="1rem"
                  class="document-share-panel__mode-symbol"
                />
              </span>

              <span class="document-share-panel__mode-copy">
                <span class="document-share-panel__mode-title">
                  {{ currentShareModeOption.label }}
                </span>

                <span
                  v-if="!canManagePublicSharePolicy"
                  class="document-share-panel__mode-description"
                >
                  当前仅可管理指定用户分享
                </span>
              </span>
            </div>

            <ElDropdown
              trigger="click"
              class="document-share-panel__permission-dropdown"
              @command="handlePermissionCommand"
            >
              <button type="button" class="document-share-panel__permission-trigger">
                {{ currentSharePermissionOption.label }}
                <SvgIcon
                  category="ui"
                  icon="chevron-down"
                  size="0.78rem"
                  class="document-share-panel__dropdown-caret"
                  aria-hidden="true"
                />
              </button>

              <template #dropdown>
                <ElDropdownMenu>
                  <ElDropdownItem
                    v-for="option in sharePermissionOptions"
                    :key="option.value"
                    :command="option.value"
                    :disabled="option.disabled"
                  >
                    <span
                      class="document-share-panel__permission-item"
                      :aria-disabled="option.disabled ? 'true' : 'false'"
                    >
                      {{ option.label }}
                    </span>
                  </ElDropdownItem>
                </ElDropdownMenu>
              </template>
            </ElDropdown>
          </div>
        </section>

        <ElSkeleton v-if="isLoading" :rows="5" animated class="document-share-panel__skeleton" />

        <template v-else>
          <section
            v-if="currentDialogShareMode === DOCUMENT_SHARE_MODE.DIRECT_USER"
            class="document-share-panel__card document-share-panel__card--direct"
          >
            <div class="document-share-panel__direct-form">
              <CollabUserLookupField
                v-model:code="directShareUserCode"
                lookup-button-text="查找分享对象"
                self-target-message="不能分享给自己"
                :disabled="isCreatingDirectShare"
                @resolved="handleDirectShareResolved"
                @cleared="handleDirectShareCleared"
              />

              <ElButton
                type="primary"
                :disabled="!selectedDirectShareUser"
                :loading="isCreatingDirectShare"
                @click="createDirectShare"
              >
                添加分享对象
              </ElButton>
            </div>

            <div v-if="isLoadingDirectShares" class="document-share-panel__list-state">
              正在加载分享对象...
            </div>

            <ElTable
              v-else
              :data="directShareItems"
              row-key="recipient.id"
              :show-header="false"
              class="document-share-panel__share-table"
            >
              <ElTableColumn min-width="220">
                <template #default="{ row }">
                  <CollabIdentityItem
                    :identity="row.recipientUser"
                    :avatar-size="40"
                  />
                </template>
              </ElTableColumn>

              <ElTableColumn min-width="240">
                <template #default="{ row }">
                  <div>
                    来源：{{ row.workspaceType === 'TEAM' ? '团队空间' : '我的空间' }} · {{ row.workspaceName }}
                  </div>

                  <div>
                    状态：{{ getRecipientStatusLabel(row.recipient.status) }}
                  </div>
                </template>
              </ElTableColumn>

              <ElTableColumn width="220" align="right">
                <template #default="{ row }">
                  <ElButton
                    :disabled="directShareActionRecipientId === row.recipient.id"
                    @click="copyDirectShareLink(row)"
                  >
                    复制链接
                  </ElButton>

                  <ElButton
                    type="danger"
                    plain
                    :loading="directShareActionRecipientId === row.recipient.id"
                    @click="revokeDirectShare(row)"
                  >
                    移除分享对象
                  </ElButton>
                </template>
              </ElTableColumn>
            </ElTable>
          </section>
        </template>

        <section v-if="canManagePublicSharePolicy" class="document-share-panel__copy-strip">
          <ElButton
            class="document-share-panel__copy-button"
            :disabled="!hasUsablePublicShareLink"
            @click="copyPublicShareLink"
          >
            <SvgIcon
              category="ui"
              icon="global-link-outlined"
              class="document-share-panel__copy-icon"
            />
            复制链接
          </ElButton>
        </section>
      </div>
    </section>
  </ElDialog>
</template>

<style scoped lang="scss">
.document-share-dialog {
  :deep(.el-dialog) {
    overflow: hidden;
    width: min(880px, calc(100vw - 2rem)) !important;
    border-radius: 1.4rem;
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 72%, transparent);
    background: color-mix(in srgb, white 98%, var(--brand-bg-base));
    box-shadow: 0 32px 72px -44px rgba(31, 35, 41, 0.4);
  }

  :deep(.el-dialog__header) {
    margin: 0;
    padding: 1.1rem 1.35rem 0.35rem;
  }

  :deep(.el-dialog__title) {
    color: var(--brand-text-primary);
    font-size: 1.15rem;
    font-weight: 700;
  }

  :deep(.el-dialog__body) {
    padding: 0 0 1.35rem;
  }

  :deep(.el-dialog__headerbtn) {
    top: 1rem;
    right: 1rem;
  }
}

.document-share-panel {
  --document-share-panel-border: color-mix(in srgb, var(--brand-border-base) 76%, transparent);
  --document-share-panel-surface: color-mix(in srgb, white 94%, var(--brand-bg-base));
  --document-share-panel-shadow: 0 26px 52px -40px rgba(31, 35, 41, 0.32);
  display: flex;
  flex: 1 1 0%;
  min-height: 0;
  padding: clamp(1.25rem, 2vw, 1.9rem);
  box-sizing: border-box;
  background:
    radial-gradient(circle at top, color-mix(in srgb, var(--brand-primary) 6%, transparent) 0%, transparent 36%),
    linear-gradient(180deg, color-mix(in srgb, var(--brand-primary) 2%, white) 0%, var(--brand-bg-base) 100%);

  &.is-compact {
    padding: 0;
    background: transparent;

    .document-share-panel__content {
      width: 100%;
    }
  }
  .document-share-panel__content {
    display: grid;
    gap: 1.1rem;
    width: min(100%, 66rem);
    margin: 0 auto;
  }

  .document-share-panel__skeleton {
    border: 1px solid var(--document-share-panel-border);
    border-radius: 1.35rem;
    background: var(--document-share-panel-surface);
    box-shadow: var(--document-share-panel-shadow);
  }

  .document-share-panel__card {
    padding: 0 clamp(1.35rem, 3vw, 1.75rem);
    display: grid;
    gap: 0.9rem;
    overflow: hidden;
  }

  .document-share-panel__summary {
    padding: clamp(0.65rem, 1.5vw, 1rem) clamp(1.35rem, 3vw, 1.75rem) 0;
  }

  .document-share-panel__summary-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-width: 0;
  }

  .document-share-panel__mode-trigger,
  .document-share-panel__permission-trigger {
    display: flex;
    align-items: center;
  }

  .document-share-panel__mode-trigger,
  .document-share-panel__permission-trigger {
    border: 0;
    background: transparent;
    color: var(--brand-text-primary);
    cursor: pointer;
  }

  .document-share-panel__mode-trigger {
    gap: 0.85rem;
    max-width: 100%;
    padding: 0.55rem 0;
    text-align: left;
  }

  .document-share-panel__mode-dropdown,
  .document-share-panel__mode-copy {
    min-width: 0;
  }

  .document-share-panel__mode-copy {
    display: grid;
    align-content: start;
  }

  .document-share-panel__mode-copy {
    gap: 0.14rem;
  }

  .document-share-panel__mode-title {
    color: var(--brand-text-primary);
    font-size: 0.95rem;
    font-weight: 650;
    line-height: 1.3;
  }

  .document-share-panel__mode-description,
  .document-share-panel__list-state {
    margin: 0;
    color: var(--brand-text-secondary);
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .document-share-panel__mode-trigger-icon {
    display: inline-grid;
    flex: 0 0 auto;
    place-items: center;
    width: 2.15rem;
    height: 2.15rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--brand-fill-light) 62%, white);
  }

  .document-share-panel__mode-option-icon {
    color: currentColor;
  }

  .document-share-panel__mode-option-title {
    line-height: 1.35;
  }

  .document-share-panel__permission-trigger {
    gap: 0.45rem;
    padding: 0.55rem 0;
    white-space: nowrap;
    font-size: 0.95rem;
    font-weight: 650;
  }

  .document-share-panel__permission-item {
    display: inline-flex;
    min-width: 5.5rem;
    color: var(--brand-text-primary);
  }

  .document-share-panel__permission-item[aria-disabled='true'] {
    color: var(--brand-text-tertiary);
  }

  .document-share-panel__dropdown-caret {
    flex: 0 0 auto;
    color: var(--brand-text-secondary);
  }

  .document-share-panel__copy-strip {
    display: flex;
    align-items: center;
    min-height: 4.3rem;
    padding: 0.8rem clamp(1.35rem, 3vw, 1.75rem);
    background: color-mix(in srgb, var(--brand-fill-light) 36%, white);
  }

  .document-share-panel__copy-button {
    border-radius: 999px;
    background: white;
  }

  .document-share-panel__copy-icon {
    display: inline-flex;
    flex: 0 0 auto;
    width: 1rem;
    height: 1rem;
    margin-right: 0.35rem;
  }

  .document-share-panel__direct-form {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.875rem;
    align-items: start;
  }
}

@media (max-width: 960px) {
  .document-share-panel {
    .document-share-panel__direct-form {
      grid-template-columns: minmax(0, 1fr);
    }

    .document-share-panel__summary-row {
      flex-direction: column;
      align-items: stretch;
    }

    .document-share-panel__permission-trigger {
      justify-content: flex-start;
    }
  }
}
</style>
