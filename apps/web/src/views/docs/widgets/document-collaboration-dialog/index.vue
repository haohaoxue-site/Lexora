<script setup lang="ts">
import type {
  DocumentCollaborationCollaborator,
  DocumentCollaborationGrant,
  DocumentCollaborationOverview,
  DocumentCollaborationPermission,
  DocumentCollaborationScope,
  UserCollabIdentity,
} from '@haohaoxue/lexora-contracts'
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
  DOCUMENT_COLLABORATION_PERMISSION_VALUES,
  DOCUMENT_COLLABORATION_SCOPE,
  DOCUMENT_COLLABORATION_SCOPE_VALUES,
} from '@haohaoxue/lexora-contracts/document/collaboration/constants'
import { USER_CODE_REGEX } from '@haohaoxue/lexora-contracts/identity/constants'
import { useClipboard, watchDebounced } from '@vueuse/core'
import { computed, reactive, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
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
import { ElMessage, ElMessageBox } from '@/utils/element-plus'
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
const { t } = useI18n()
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
    return t('docs.collaboration.manageCollaborators')
  }

  if (dialogView.value === 'password') {
    return t('docs.collaboration.passwordSettings')
  }

  return t('docs.collaboration.collaborationDocument')
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
const invitationSubmitLabel = computed(() => resolvedInvitation.value
  ? t('docs.collaboration.updateInvite')
  : t('docs.collaboration.sendInvite'))
const linkAccessTitle = computed(() => activeLink.value?.enabled
  ? t('docs.collaboration.linkAccessEnabled')
  : t('docs.collaboration.linkAccessDisabled'))
const linkAccessDescription = computed(() => {
  if (!activeLink.value?.enabled) {
    return t('docs.collaboration.linkAccessMembersOnly')
  }

  return t('docs.collaboration.linkAccessSummary', {
    permission: formatCollaborationPermission(linkForm.permission),
    scope: formatCollaborationScope(linkForm.scope),
  })
})
const linkPasswordLabel = computed(() => activeLink.value?.passwordEnabled
  ? t('docs.collaboration.managePassword')
  : t('docs.collaboration.enablePasswordShort'))
const canCopyLink = computed(() => Boolean(activeLink.value?.enabled && collaborationLinkUrl.value))
const canOpenCollaborators = computed(() => participantRows.value.length > 0)
const isPasswordEnabled = computed(() => passwordEnabledOverride.value ?? Boolean(activeLink.value?.passwordEnabled))
const trimmedPasswordDraft = computed(() => passwordDraft.value.trim())
const passwordValidationErrors = computed(() => {
  if (DOCUMENT_COLLABORATION_LINK_PASSWORD_REGEX.test(trimmedPasswordDraft.value)) {
    return []
  }

  return [t('docs.collaboration.passwordRule', { length: DOCUMENT_COLLABORATION_LINK_PASSWORD_LENGTH })]
})
const canSavePassword = computed(() => passwordValidationErrors.value.length === 0 && !isUpdatingLink.value)
const shouldShowPasswordValidation = computed(() => passwordDraft.value.length > 0 && passwordValidationErrors.value.length > 0)
const passwordStateLabel = computed(() => activeLink.value?.password ?? (linkPasswordPreview.value || t('docs.collaboration.passwordUnset')))
const permissionOptions = computed(() => DOCUMENT_COLLABORATION_PERMISSION_VALUES.map(value => ({
  value,
  label: formatCollaborationPermission(value),
})))
const scopeOptions = computed(() => DOCUMENT_COLLABORATION_SCOPE_VALUES.map(value => ({
  value,
  label: formatCollaborationScope(value),
})))

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
    errorMessage.value = error instanceof Error ? error.message : t('docs.collaboration.loadFailed')
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
    inviteeResolveError.value = t('docs.collaboration.invalidUserCode')
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
    inviteeResolveError.value = error instanceof Error ? error.message : t('docs.collaboration.userNotFound')
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
      ElMessage.warning(t('docs.collaboration.inviteOwnerNotNeeded'))
      return
    }

    if (resolvedCollaborator.value) {
      ElMessage.warning(t('docs.collaboration.alreadyCollaboratorWarning'))
      return
    }

    ElMessage.warning(t('docs.collaboration.noInviteeWarning'))
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
    ElMessage.success(isUpdatingInvitation
      ? t('docs.collaboration.inviteUpdated')
      : t('docs.collaboration.inviteSent'))
  }
  catch (error) {
    ElMessage.error(error instanceof Error ? error.message : t('docs.collaboration.inviteFailed'))
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
    ElMessage.success(hadActiveLink ? t('docs.collaboration.linkSaved') : t('docs.collaboration.linkGenerated'))
  }
  catch (error) {
    ElMessage.error(error instanceof Error ? error.message : t('docs.collaboration.linkUpdateFailed'))
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
      await updateLinkPasswordEnabled(true, t('docs.collaboration.linkPasswordEnabled'))
      return
    }

    await enableLinkPasswordWithGeneratedCode()
    return
  }

  passwordEnabledOverride.value = false
  await updateLinkPasswordEnabled(false, t('docs.collaboration.linkPasswordDisabled'))
}

async function submitLinkPassword() {
  if (!normalizedDocumentId.value || isUpdatingLink.value) {
    return
  }

  if (passwordValidationErrors.value.length > 0) {
    ElMessage.warning(t('docs.collaboration.passwordRequired', { length: DOCUMENT_COLLABORATION_LINK_PASSWORD_LENGTH }))
    return
  }

  await saveLinkPassword(
    trimmedPasswordDraft.value,
    activeLink.value?.passwordEnabled
      ? t('docs.collaboration.linkPasswordChanged')
      : t('docs.collaboration.linkPasswordEnabled'),
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
    ElMessage.error(error instanceof Error ? error.message : t('docs.collaboration.setPasswordFailed'))
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
  await saveLinkPassword(generatedPassword, t('docs.collaboration.linkPasswordEnabled'))
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
    ElMessage.error(error instanceof Error ? error.message : t('docs.collaboration.passwordToggleFailed'))
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
    ElMessage.success(t('docs.collaboration.linkDisabled'))
  }
  catch (error) {
    ElMessage.error(error instanceof Error ? error.message : t('docs.collaboration.linkDisableFailed'))
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
    ElMessage.error(t('docs.common.copyUnsupported'))
    return
  }

  try {
    await copy(collaborationLinkUrl.value)
    ElMessage.success(t('docs.collaboration.linkCopied'))
  }
  catch {
    ElMessage.error(t('docs.common.copyFailed'))
  }
}

async function removeGrant(row: DocumentCollaborationGrant) {
  if (!normalizedDocumentId.value || actionId.value) {
    return
  }

  try {
    await ElMessageBox.confirm(t('docs.collaboration.removeConfirmMessage'), t('docs.collaboration.removeConfirmTitle'), {
      confirmButtonText: t('docs.collaboration.remove'),
      cancelButtonText: t('docs.common.cancel'),
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
    ElMessage.success(t('docs.collaboration.removed'))
  }
  catch (error) {
    ElMessage.error(error instanceof Error ? error.message : t('docs.collaboration.removeFailed'))
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
    ElMessage.success(t('docs.collaboration.permissionUpdated'))
  }
  catch (error) {
    ElMessage.error(error instanceof Error ? error.message : t('docs.collaboration.permissionUpdateFailed'))
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
    await ElMessageBox.confirm(resolveScopeChangeMessage(scope), t('docs.collaboration.scopeAdjustTitle'), {
      confirmButtonText: t('docs.collaboration.scopeAdjustConfirm'),
      cancelButtonText: t('docs.common.cancel'),
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
    ElMessage.success(t('docs.collaboration.scopeUpdated'))
  }
  catch (error) {
    ElMessage.error(error instanceof Error ? error.message : t('docs.collaboration.scopeUpdateFailed'))
  }
  finally {
    actionId.value = ''
  }
}

function resolveScopeChangeMessage(scope: DocumentCollaborationScope) {
  if (scope === DOCUMENT_COLLABORATION_SCOPE.DESCENDANTS) {
    return t('docs.collaboration.scopeTreeChangeMessage')
  }

  return t('docs.collaboration.scopeSelfChangeMessage')
}
</script>

<template>
  <ElDialog
    class="document-collaboration-dialog"
    :model-value="props.modelValue"
    width="640px"
    append-to-body
    align-center
    body-class="pt-1"
    :show-close="dialogView === 'overview'"
    @update:model-value="handleVisibleChange"
  >
    <template #header>
      <div class="document-collaboration-dialog__header inline-flex items-center gap-2">
        <ElButton
          v-if="dialogView !== 'overview'"
          text
          class="document-collaboration-dialog__back h-8 min-w-8 w-8 rounded-lg p-0"
          :aria-label="t('docs.collaboration.backToSettings')"
          @click="backToOverview"
        >
          <SvgIcon category="ui" icon="arrow-left" size="1rem" />
        </ElButton>
        <span class="document-collaboration-dialog__title text-[1.15rem] font-bold leading-[1.4] text-main">{{ dialogTitle }}</span>
      </div>
    </template>

    <div
      class="document-collaboration-dialog__content grid content-start gap-4"
      :class="{ 'document-collaboration-dialog__content--overview': dialogView === 'overview' }"
    >
      <ElSkeleton v-if="isLoading" animated>
        <template #template>
          <div class="grid gap-4">
            <section class="rounded-lg border border-border-a60 p-4">
              <div class="mb-4 flex items-center justify-between gap-3">
                <ElSkeletonItem variant="h3" class="max-w-32" />
                <ElSkeletonItem variant="button" class="h-8 max-w-20" />
              </div>
              <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_9rem]">
                <ElSkeletonItem variant="rect" class="h-10 w-full" />
                <ElSkeletonItem variant="rect" class="h-10 w-full" />
                <ElSkeletonItem variant="rect" class="h-10 w-full" />
              </div>
            </section>
            <section class="rounded-lg border border-border-a60 p-4">
              <div class="mb-4 flex items-center justify-between gap-3">
                <ElSkeletonItem variant="h3" class="max-w-36" />
                <ElSkeletonItem variant="button" class="h-8 max-w-24" />
              </div>
              <div class="grid gap-3">
                <ElSkeletonItem v-for="row in 3" :key="row" variant="rect" class="h-10 w-full" />
              </div>
            </section>
          </div>
        </template>
      </ElSkeleton>

      <ElAlert
        v-else-if="errorMessage"
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
