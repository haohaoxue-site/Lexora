<script setup lang="ts">
import type {
  DocumentCollaborationCollaborator,
  DocumentCollaborationGrant,
  DocumentCollaborationOverview,
  DocumentCollaborationPermission,
  DocumentCollaborationScope,
  UserCollabIdentity,
} from '@haohaoxue/samepage-contracts'
import type { CollaborationParticipantRow } from '../../components/collaboration-participants-panel'
import type {
  CollaborationDialogView,
  CollaboratorPermissionCommand,
  DocumentCollaborationDialogEmits,
  DocumentCollaborationDialogProps,
  InvitationForm,
  LinkForm,
} from './typing'
import {
  DOCUMENT_COLLABORATION_COLLABORATOR_SOURCE,
  DOCUMENT_COLLABORATION_LINK_PASSWORD_LENGTH,
  DOCUMENT_COLLABORATION_LINK_PASSWORD_REGEX,
  DOCUMENT_COLLABORATION_PERMISSION,
  DOCUMENT_COLLABORATION_PERMISSION_LABELS,
  DOCUMENT_COLLABORATION_PERMISSION_VALUES,
  DOCUMENT_COLLABORATION_SCOPE,
  DOCUMENT_COLLABORATION_SCOPE_LABELS,
  DOCUMENT_COLLABORATION_SCOPE_VALUES,
  USER_CODE_REGEX,
} from '@haohaoxue/samepage-contracts'
import { useClipboard, watchDebounced } from '@vueuse/core'
import { ElMessage, ElMessageBox } from 'element-plus'
import { computed, reactive, shallowRef, watch } from 'vue'
import {
  createDocumentCollaborationInvitation,
  disableDocumentCollaborationLink,
  getDocumentCollaborationOverview,
  removeDocumentCollaborationGrant,
  resolveDocumentCollaborationInvitee,
  setDocumentCollaborationUserGrant,
  updateDocumentCollaborationGrant,
  upsertDocumentCollaborationLink,
} from '@/apis/document-collaboration'
import CollaborationInvitePanel from '../../components/collaboration-invite-panel'
import CollaborationLinkPanel from '../../components/collaboration-link-panel'
import CollaborationParticipantsPanel from '../../components/collaboration-participants-panel'
import CollaborationPasswordEditDialog from '../../components/collaboration-password-edit-dialog'
import CollaborationPasswordPanel from '../../components/collaboration-password-panel'
import {
  formatCollaborationPermission,
  formatCollaborationScope,
} from '../../utils/documentCollaboration'

const props = withDefaults(defineProps<DocumentCollaborationDialogProps>(), {
  documentId: '',
})
const emits = defineEmits<DocumentCollaborationDialogEmits>()
const { copy, isSupported: isClipboardSupported } = useClipboard({
  legacy: true,
})

const dialogView = shallowRef<CollaborationDialogView>('overview')
const overview = shallowRef<DocumentCollaborationOverview | null>(null)
const errorMessage = shallowRef('')
const isLoading = shallowRef(false)
const isCreatingInvitation = shallowRef(false)
const isResolvingInvitee = shallowRef(false)
const isUpdatingLink = shallowRef(false)
const actionId = shallowRef('')
const collaborationLinkUrl = shallowRef('')
const resolvedInvitee = shallowRef<UserCollabIdentity | null>(null)
const inviteeResolveError = shallowRef('')
const isPasswordEditDialogOpen = shallowRef(false)
const passwordDraft = shallowRef('')
const linkPasswordPreview = shallowRef('')
const passwordEnabledOverride = shallowRef<boolean | null>(null)
const invitationForm = reactive<InvitationForm>({
  userCode: '',
  permission: DOCUMENT_COLLABORATION_PERMISSION.READ,
  scope: DOCUMENT_COLLABORATION_SCOPE.SELF,
})
const linkForm = reactive<LinkForm>({
  enabled: true,
  permission: DOCUMENT_COLLABORATION_PERMISSION.READ,
  scope: DOCUMENT_COLLABORATION_SCOPE.SELF,
})

const normalizedDocumentId = computed(() => props.documentId?.trim() ?? '')
const dialogTitle = computed(() => {
  if (dialogView.value === 'collaborators') {
    return '管理协作者'
  }

  if (dialogView.value === 'password') {
    return '链接密码设置'
  }

  return '协作文档'
})
const owner = computed(() => overview.value?.owner ?? null)
const collaborators = computed(() => overview.value?.collaborators ?? [])
const invitations = computed(() => overview.value?.userInvites ?? [])
const activeLink = computed(() => overview.value?.linkInvite ?? null)
const participantRows = computed<CollaborationParticipantRow[]>(() => {
  const rows: CollaborationParticipantRow[] = []

  if (owner.value) {
    rows.push({
      type: 'owner',
      id: `owner:${owner.value.id}`,
      owner: owner.value,
    })
  }

  rows.push(...collaborators.value.map(collaborator => ({
    type: 'collaborator' as const,
    id: `collaborator:${collaborator.userId}`,
    collaborator,
  })))

  return rows
})
const normalizedInvitationUserCode = computed(() => invitationForm.userCode.trim().toUpperCase())
const isInvitationUserCodeExact = computed(() => USER_CODE_REGEX.test(normalizedInvitationUserCode.value))
const resolvedCollaborator = computed(() => resolvedInvitee.value
  ? collaborators.value.find(collaborator => collaborator.userId === resolvedInvitee.value?.id) ?? null
  : null)
const resolvedInvitation = computed(() => resolvedInvitee.value
  ? invitations.value.find(invitation => invitation.inviteeUserId === resolvedInvitee.value?.id) ?? null
  : null)
const isResolvedOwner = computed(() => Boolean(resolvedInvitee.value && owner.value?.id === resolvedInvitee.value.id))
const canSubmitInvitation = computed(() => Boolean(
  resolvedInvitee.value
  && !isResolvingInvitee.value
  && !isResolvedOwner.value
  && !resolvedCollaborator.value,
))
const invitationSubmitLabel = computed(() => resolvedInvitation.value ? '更新邀请' : '发送邀请')
const linkAccessTitle = computed(() => activeLink.value?.enabled ? '获得链接的人' : '未开启')
const linkAccessDescription = computed(() => {
  if (!activeLink.value?.enabled) {
    return '仅已加入的协作者可以访问'
  }

  return `获得链接的人${formatCollaborationPermission(linkForm.permission)}，${formatCollaborationScope(linkForm.scope)}`
})
const linkPasswordLabel = computed(() => activeLink.value?.passwordEnabled ? '管理密码' : '启用密码')
const canCopyLink = computed(() => Boolean(activeLink.value?.enabled && collaborationLinkUrl.value))
const canOpenCollaborators = computed(() => participantRows.value.length > 0)
const isPasswordEnabled = computed(() => passwordEnabledOverride.value ?? Boolean(activeLink.value?.passwordEnabled))
const trimmedPasswordDraft = computed(() => passwordDraft.value.trim())
const passwordValidationErrors = computed(() => {
  if (DOCUMENT_COLLABORATION_LINK_PASSWORD_REGEX.test(trimmedPasswordDraft.value)) {
    return []
  }

  return [`请输入 ${DOCUMENT_COLLABORATION_LINK_PASSWORD_LENGTH} 位数字`]
})
const canSavePassword = computed(() => passwordValidationErrors.value.length === 0 && !isUpdatingLink.value)
const shouldShowPasswordValidation = computed(() => passwordDraft.value.length > 0 && passwordValidationErrors.value.length > 0)
const passwordStateLabel = computed(() => activeLink.value?.password ?? (linkPasswordPreview.value || '未设置'))
const permissionOptions = DOCUMENT_COLLABORATION_PERMISSION_VALUES.map(value => ({
  value,
  label: DOCUMENT_COLLABORATION_PERMISSION_LABELS[value],
}))
const scopeOptions = DOCUMENT_COLLABORATION_SCOPE_VALUES.map(value => ({
  value,
  label: DOCUMENT_COLLABORATION_SCOPE_LABELS[value],
}))

watch(
  () => [props.modelValue, normalizedDocumentId.value] as const,
  ([visible, documentId]) => {
    if (!visible || !documentId) {
      resetDialogViewState()
      return
    }

    resetDialogViewState()
    void loadOverview()
  },
  { immediate: true },
)

watchDebounced(
  normalizedInvitationUserCode,
  () => {
    void resolveInvitationUser()
  },
  {
    debounce: 300,
    maxWait: 800,
  },
)

watch(
  resolvedInvitation,
  (invitation) => {
    if (!invitation) {
      return
    }

    invitationForm.permission = invitation.permission
    invitationForm.scope = invitation.scope
  },
)

watch(isPasswordEditDialogOpen, (visible) => {
  if (!visible) {
    passwordDraft.value = ''
  }
})

function handleVisibleChange(visible: boolean) {
  if (!visible) {
    resetDialogViewState()
  }

  emits('update:modelValue', visible)
}

function resetDialogViewState() {
  dialogView.value = 'overview'
  isPasswordEditDialogOpen.value = false
  passwordDraft.value = ''
  passwordEnabledOverride.value = null
  resetInvitationDraft()
}

function backToOverview() {
  dialogView.value = 'overview'
  passwordDraft.value = ''
  passwordEnabledOverride.value = null
  isPasswordEditDialogOpen.value = false
}

async function loadOverview() {
  if (!normalizedDocumentId.value || isLoading.value) {
    return
  }

  isLoading.value = true
  errorMessage.value = ''

  try {
    overview.value = await getDocumentCollaborationOverview(normalizedDocumentId.value)
    syncLinkForm()
  }
  catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '加载协作设置失败'
  }
  finally {
    isLoading.value = false
  }
}

async function resolveInvitationUser() {
  if (!props.modelValue || dialogView.value !== 'overview' || !normalizedDocumentId.value) {
    return
  }

  inviteeResolveError.value = ''

  if (!normalizedInvitationUserCode.value) {
    resolvedInvitee.value = null
    return
  }

  if (!isInvitationUserCodeExact.value) {
    resolvedInvitee.value = null
    inviteeResolveError.value = '请输入完整协作码，例如 SP-XXXXXXX'
    return
  }

  isResolvingInvitee.value = true

  try {
    resolvedInvitee.value = await resolveDocumentCollaborationInvitee(
      normalizedDocumentId.value,
      normalizedInvitationUserCode.value,
    )
  }
  catch (error) {
    resolvedInvitee.value = null
    inviteeResolveError.value = error instanceof Error ? error.message : '未找到用户'
  }
  finally {
    isResolvingInvitee.value = false
  }
}

function resetInvitationDraft() {
  invitationForm.userCode = ''
  invitationForm.permission = DOCUMENT_COLLABORATION_PERMISSION.READ
  invitationForm.scope = DOCUMENT_COLLABORATION_SCOPE.SELF
  resolvedInvitee.value = null
  inviteeResolveError.value = ''
}

function openCollaboratorsView() {
  if (!canOpenCollaborators.value) {
    return
  }

  dialogView.value = 'collaborators'
}

async function submitInvitation() {
  if (!normalizedDocumentId.value || isCreatingInvitation.value) {
    return
  }

  if (!resolvedInvitee.value) {
    await resolveInvitationUser()
  }

  if (!canSubmitInvitation.value) {
    if (isResolvedOwner.value) {
      ElMessage.warning('文档所有者无需邀请')
      return
    }

    if (resolvedCollaborator.value) {
      ElMessage.warning('该用户已经是协作者，请在协作者列表调整权限')
      return
    }

    ElMessage.warning('请先输入可邀请的用户')
    return
  }

  isCreatingInvitation.value = true

  try {
    await createDocumentCollaborationInvitation(normalizedDocumentId.value, {
      userCode: normalizedInvitationUserCode.value,
      permission: invitationForm.permission,
      scope: invitationForm.scope,
    })
    const isUpdatingInvitation = Boolean(resolvedInvitation.value)

    resetInvitationDraft()
    await loadOverview()
    ElMessage.success(isUpdatingInvitation ? '协作邀请已更新' : '协作邀请已发送')
  }
  catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '发送邀请失败')
  }
  finally {
    isCreatingInvitation.value = false
  }
}

async function handleLinkEnabledCommand(command: string | number | object) {
  const nextEnabled = String(command) === 'enabled'

  if (nextEnabled) {
    linkForm.enabled = true
    await saveLink()
    return
  }

  if (activeLink.value) {
    await disableLink()
    return
  }

  linkForm.enabled = false
}

async function saveLink() {
  if (!normalizedDocumentId.value || isUpdatingLink.value) {
    return
  }

  isUpdatingLink.value = true

  try {
    const hadActiveLink = Boolean(activeLink.value)
    const response = await upsertDocumentCollaborationLink(normalizedDocumentId.value, {
      enabled: linkForm.enabled,
      permission: linkForm.permission,
      scope: linkForm.scope,
    })
    const currentOverview = overview.value

    if (currentOverview) {
      overview.value = {
        ...currentOverview,
        linkInvite: response.linkInvite,
      }
    }
    collaborationLinkUrl.value = buildCollaborationLinkUrl(response.resolverCode)
    ElMessage.success(hadActiveLink ? '协作链接设置已保存' : '协作链接已生成')
  }
  catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '更新协作链接失败')
  }
  finally {
    isUpdatingLink.value = false
  }
}

function openPasswordView() {
  if (isUpdatingLink.value) {
    return
  }

  dialogView.value = 'password'
  passwordDraft.value = ''
}

function openPasswordEditDialog() {
  passwordDraft.value = ''
  isPasswordEditDialogOpen.value = true
}

function generatePasswordDraft() {
  passwordDraft.value = generateCollaborationPassword()
}

async function handlePasswordEnabledChange(value: string | number | boolean) {
  if (isUpdatingLink.value) {
    return
  }

  if (value) {
    passwordEnabledOverride.value = true

    if (activeLink.value?.password || linkPasswordPreview.value) {
      await updateLinkPasswordEnabled(true, '链接密码已启用')
      return
    }

    await enableLinkPasswordWithGeneratedCode()
    return
  }

  passwordEnabledOverride.value = false
  await updateLinkPasswordEnabled(false, '链接密码已停用')
}

async function submitLinkPassword() {
  if (!normalizedDocumentId.value || isUpdatingLink.value) {
    return
  }

  if (passwordValidationErrors.value.length > 0) {
    ElMessage.warning(`请输入 ${DOCUMENT_COLLABORATION_LINK_PASSWORD_LENGTH} 位数字密码`)
    return
  }

  await saveLinkPassword(
    trimmedPasswordDraft.value,
    activeLink.value?.passwordEnabled ? '链接密码已修改' : '链接密码已启用',
  )
}

async function saveLinkPassword(password: string, successMessage: string) {
  if (!normalizedDocumentId.value || isUpdatingLink.value) {
    return false
  }

  isUpdatingLink.value = true

  try {
    const response = await upsertDocumentCollaborationLink(normalizedDocumentId.value, {
      enabled: true,
      permission: linkForm.permission,
      scope: linkForm.scope,
      passwordEnabled: true,
      password,
    })
    const currentOverview = overview.value

    if (currentOverview) {
      overview.value = {
        ...currentOverview,
        linkInvite: response.linkInvite,
      }
    }

    linkForm.enabled = true
    collaborationLinkUrl.value = buildCollaborationLinkUrl(response.resolverCode)
    linkPasswordPreview.value = password
    passwordDraft.value = ''
    isPasswordEditDialogOpen.value = false
    passwordEnabledOverride.value = null
    ElMessage.success(successMessage)
    return true
  }
  catch (error) {
    passwordEnabledOverride.value = null
    ElMessage.error(error instanceof Error ? error.message : '设置链接密码失败')
    return false
  }
  finally {
    isUpdatingLink.value = false
  }
}

async function enableLinkPasswordWithGeneratedCode() {
  const generatedPassword = generateCollaborationPassword()
  linkPasswordPreview.value = generatedPassword
  passwordDraft.value = generatedPassword
  await saveLinkPassword(generatedPassword, '链接密码已启用')
}

async function updateLinkPasswordEnabled(enabled: boolean, successMessage: string) {
  if (!normalizedDocumentId.value || isUpdatingLink.value) {
    return
  }

  isUpdatingLink.value = true

  try {
    const response = await upsertDocumentCollaborationLink(normalizedDocumentId.value, {
      enabled: true,
      permission: linkForm.permission,
      scope: linkForm.scope,
      passwordEnabled: enabled,
    })
    const currentOverview = overview.value

    if (currentOverview) {
      overview.value = {
        ...currentOverview,
        linkInvite: response.linkInvite,
      }
    }

    linkForm.enabled = true
    collaborationLinkUrl.value = buildCollaborationLinkUrl(response.resolverCode)
    passwordDraft.value = ''
    isPasswordEditDialogOpen.value = false
    passwordEnabledOverride.value = null
    ElMessage.success(successMessage)
  }
  catch (error) {
    passwordEnabledOverride.value = null
    ElMessage.error(error instanceof Error ? error.message : '更新链接密码开关失败')
  }
  finally {
    isUpdatingLink.value = false
  }
}

function generateCollaborationPassword() {
  const passwordLimit = 10 ** DOCUMENT_COLLABORATION_LINK_PASSWORD_LENGTH
  const randomValues = new Uint32Array(1)

  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(randomValues)
    return String(randomValues[0] % passwordLimit).padStart(DOCUMENT_COLLABORATION_LINK_PASSWORD_LENGTH, '0')
  }

  return String(Math.floor(Math.random() * passwordLimit)).padStart(DOCUMENT_COLLABORATION_LINK_PASSWORD_LENGTH, '0')
}

async function disableLink() {
  if (!normalizedDocumentId.value || isUpdatingLink.value) {
    return
  }

  isUpdatingLink.value = true

  try {
    await disableDocumentCollaborationLink(normalizedDocumentId.value)
    await loadOverview()
    collaborationLinkUrl.value = ''
    ElMessage.success('协作链接已停用')
  }
  catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '停用协作链接失败')
  }
  finally {
    isUpdatingLink.value = false
  }
}

async function copyLink() {
  if (!collaborationLinkUrl.value) {
    return
  }

  if (!isClipboardSupported.value) {
    ElMessage.error('当前环境不支持复制')
    return
  }

  try {
    await copy(collaborationLinkUrl.value)
    ElMessage.success('协作链接已复制')
  }
  catch {
    ElMessage.error('复制失败')
  }
}

async function removeGrant(row: DocumentCollaborationGrant) {
  if (!normalizedDocumentId.value || actionId.value) {
    return
  }

  try {
    await ElMessageBox.confirm('移除后，对方将不能继续访问该协作文档。', '移除协作者', {
      confirmButtonText: '移除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  }
  catch {
    return
  }

  actionId.value = row.id

  try {
    await removeDocumentCollaborationGrant(normalizedDocumentId.value, row.id)
    await loadOverview()
    ElMessage.success('已移除协作者')
  }
  catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '移除协作者失败')
  }
  finally {
    actionId.value = ''
  }
}

function syncLinkForm() {
  passwordEnabledOverride.value = null
  const link = activeLink.value

  if (!link) {
    linkForm.enabled = true
    linkForm.permission = DOCUMENT_COLLABORATION_PERMISSION.READ
    linkForm.scope = DOCUMENT_COLLABORATION_SCOPE.SELF
    collaborationLinkUrl.value = ''
    linkPasswordPreview.value = ''
    return
  }

  linkForm.enabled = link.enabled
  linkForm.permission = link.permission
  linkForm.scope = link.scope
  collaborationLinkUrl.value = link.enabled ? buildCollaborationLinkUrl(link.resolverCode) : ''

  if (!link.password) {
    linkPasswordPreview.value = ''
  }
}

function buildCollaborationLinkUrl(code: string) {
  return new URL(`/r/${encodeURIComponent(code)}`, window.location.origin).toString()
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

function canInheritCollaborator(row: DocumentCollaborationCollaborator) {
  return row.source === DOCUMENT_COLLABORATION_COLLABORATOR_SOURCE.DIRECT && Boolean(row.grant && row.inheritedFrom)
}

function removeCollaborator(row: DocumentCollaborationCollaborator) {
  if (!row.grant || !canRemoveCollaborator(row)) {
    return
  }

  void removeGrant(row.grant)
}

async function handleCollaboratorPermissionCommand(
  row: DocumentCollaborationCollaborator,
  command: string | number | object,
) {
  const normalizedCommand = String(command) as CollaboratorPermissionCommand

  if (normalizedCommand === 'remove') {
    removeCollaborator(row)
    return
  }

  if (normalizedCommand === 'inherit') {
    if (!canInheritCollaborator(row)) {
      return
    }

    removeCollaborator(row)
    return
  }

  if (normalizedCommand === 'read') {
    await saveCollaboratorPermission(row, DOCUMENT_COLLABORATION_PERMISSION.READ)
    return
  }

  if (normalizedCommand === 'edit') {
    await saveCollaboratorPermission(row, DOCUMENT_COLLABORATION_PERMISSION.EDIT)
  }
}

async function saveCollaboratorPermission(
  row: DocumentCollaborationCollaborator,
  permission: DocumentCollaborationPermission,
) {
  if (!normalizedDocumentId.value || actionId.value) {
    return
  }

  if (
    row.source === DOCUMENT_COLLABORATION_COLLABORATOR_SOURCE.DIRECT
    && row.grant
    && row.effectivePermission === permission
  ) {
    return
  }

  actionId.value = getCollaboratorActionId(row)

  try {
    if (row.source === DOCUMENT_COLLABORATION_COLLABORATOR_SOURCE.DIRECT && row.grant) {
      await updateDocumentCollaborationGrant(normalizedDocumentId.value, row.grant.id, {
        permission,
      })
    }
    else {
      await setDocumentCollaborationUserGrant(normalizedDocumentId.value, row.userId, {
        permission,
        scope: DOCUMENT_COLLABORATION_SCOPE.SELF,
      })
    }

    await loadOverview()
    ElMessage.success('协作者权限已更新')
  }
  catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '更新协作者权限失败')
  }
  finally {
    actionId.value = ''
  }
}

async function handleCollaboratorScopeCommand(
  row: DocumentCollaborationCollaborator,
  command: string | number | object,
) {
  const scope = String(command) as DocumentCollaborationScope

  if (!DOCUMENT_COLLABORATION_SCOPE_VALUES.includes(scope) || !row.grant || row.effectiveScope === scope) {
    return
  }

  try {
    await ElMessageBox.confirm(resolveScopeChangeMessage(scope), '调整协作范围', {
      confirmButtonText: '确认调整',
      cancelButtonText: '取消',
      type: 'warning',
    })
  }
  catch {
    return
  }

  if (!normalizedDocumentId.value || actionId.value) {
    return
  }

  actionId.value = getCollaboratorScopeActionId(row)

  try {
    await updateDocumentCollaborationGrant(normalizedDocumentId.value, row.grant.id, {
      scope,
    })
    await loadOverview()
    ElMessage.success('协作范围已更新')
  }
  catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '更新协作范围失败')
  }
  finally {
    actionId.value = ''
  }
}

function resolveScopeChangeMessage(scope: DocumentCollaborationScope) {
  if (scope === DOCUMENT_COLLABORATION_SCOPE.DESCENDANTS) {
    return '调整为“当前页面及子页面”后，该协作者会按当前权限访问这棵子页面。'
  }

  return '调整为“仅当前页面”后，该协作者将不再通过这条授权访问子页面；子页面可能失去访问。'
}
</script>

<template>
  <ElDialog
    class="document-collaboration-dialog"
    :model-value="props.modelValue"
    width="640px"
    append-to-body
    align-center
    body-class="pt-[0.35rem]"
    :show-close="dialogView === 'overview'"
    @update:model-value="handleVisibleChange"
  >
    <template #header>
      <div class="document-collaboration-dialog__header inline-flex items-center gap-[0.45rem]">
        <ElButton
          v-if="dialogView !== 'overview'"
          text
          circle
          class="document-collaboration-dialog__back h-[1.9rem] w-[1.9rem]"
          aria-label="返回协作设置"
          @click="backToOverview"
        >
          <SvgIcon category="ui" icon="arrow-left" size="1rem" />
        </ElButton>
        <span class="document-collaboration-dialog__title text-[1.15rem] font-bold leading-[1.4] text-main">{{ dialogTitle }}</span>
      </div>
    </template>

    <div
      v-loading="isLoading"
      class="document-collaboration-dialog__content grid content-start gap-[1.15rem]"
      :class="{ 'document-collaboration-dialog__content--overview': dialogView === 'overview' }"
    >
      <ElAlert
        v-if="errorMessage"
        :title="errorMessage"
        type="error"
        :closable="false"
        show-icon
      />

      <template v-else-if="dialogView === 'overview'">
        <CollaborationInvitePanel
          v-model:user-code="invitationForm.userCode"
          v-model:permission="invitationForm.permission"
          v-model:scope="invitationForm.scope"
          :owner="owner"
          :collaborators="collaborators"
          :can-open-collaborators="canOpenCollaborators"
          :resolved-invitee="resolvedInvitee"
          :resolved-collaborator="resolvedCollaborator"
          :has-resolved-invitation="Boolean(resolvedInvitation)"
          :is-resolved-owner="isResolvedOwner"
          :invitee-resolve-error="inviteeResolveError"
          :is-resolving-invitee="isResolvingInvitee"
          :is-creating-invitation="isCreatingInvitation"
          :can-submit-invitation="canSubmitInvitation"
          :invitation-submit-label="invitationSubmitLabel"
          :permission-options="permissionOptions"
          :scope-options="scopeOptions"
          @open-collaborators="openCollaboratorsView"
          @submit="submitInvitation"
        />

        <CollaborationLinkPanel
          v-model:permission="linkForm.permission"
          v-model:scope="linkForm.scope"
          :active-link="activeLink"
          :access-title="linkAccessTitle"
          :access-description="linkAccessDescription"
          :password-label="linkPasswordLabel"
          :can-copy-link="canCopyLink"
          :is-updating-link="isUpdatingLink"
          :permission-options="permissionOptions"
          :scope-options="scopeOptions"
          @link-enabled-command="handleLinkEnabledCommand"
          @save-link="saveLink"
          @open-password="openPasswordView"
          @copy-link="copyLink"
        />
      </template>

      <CollaborationParticipantsPanel
        v-else-if="dialogView === 'collaborators'"
        :rows="participantRows"
        :action-id="actionId"
        :scope-options="scopeOptions"
        @permission-command="handleCollaboratorPermissionCommand"
        @scope-command="handleCollaboratorScopeCommand"
      />

      <CollaborationPasswordPanel
        v-else-if="dialogView === 'password'"
        :password-enabled="isPasswordEnabled"
        :password-state-label="passwordStateLabel"
        :password-length="DOCUMENT_COLLABORATION_LINK_PASSWORD_LENGTH"
        :updating="isUpdatingLink"
        @update-password-enabled="handlePasswordEnabledChange"
        @edit-password="openPasswordEditDialog"
      />
    </div>
  </ElDialog>

  <CollaborationPasswordEditDialog
    v-model="isPasswordEditDialogOpen"
    v-model:password="passwordDraft"
    :password-length="DOCUMENT_COLLABORATION_LINK_PASSWORD_LENGTH"
    :validation-errors="passwordValidationErrors"
    :show-validation="shouldShowPasswordValidation"
    :saving="isUpdatingLink"
    :can-save="canSavePassword"
    @generate="generatePasswordDraft"
    @submit="submitLinkPassword"
  />
</template>

<style scoped lang="scss">
.document-collaboration-dialog__content--overview {
  min-height: 14rem;
}

.document-collaboration-dialog__back {
  color: var(--brand-text-secondary);
}
</style>
