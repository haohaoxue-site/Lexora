<script setup lang="ts">
import type { FormRules } from 'element-plus'
import type { CollaborationPasswordFormExposed } from '../../components/password-form'
import type { CollaborationPasswordFormModel } from '../../typing'
import type {
  DocumentCollaborationResolverPreview,
} from '@/apis/document-collaboration'
import {
  COLLABORATION_RESOLVER_ENTRY_TYPE,
  DOCUMENT_COLLABORATION_LINK_PASSWORD_LENGTH,
  DOCUMENT_COLLABORATION_LINK_PASSWORD_REGEX,
  DOCUMENT_COLLABORATION_RESOLVER_STATUS,
} from '@haohaoxue/lexora-contracts/document/collaboration/constants'
import { computed, reactive, shallowRef, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  confirmDocumentCollaborationEntry,
  resolveDocumentCollaborationEntry,
} from '@/apis/document-collaboration'
import { ElMessage } from '@/utils/element-plus'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'
import {
  formatCollaborationPermission,
  formatCollaborationScope,
} from '../../../docs/utils/documentCollaboration'
import CollaborationPasswordForm from '../../components/password-form'
import { useCollaborationResolverNavigation } from '../../composables/useCollaborationResolverNavigation'
import CollaborationResolverLayout from '../../layouts/resolver-shell'
import {
  getCollaborationPermissionRank,
  getCollaborationScopeRank,
} from '../../utils/collaborationResolver'

const { t } = useI18n()
const { code, openDocument } = useCollaborationResolverNavigation()
const passwordFormRef = useTemplateRef<CollaborationPasswordFormExposed>('passwordFormRef')
const preview = shallowRef<DocumentCollaborationResolverPreview | null>(null)
const isLoading = shallowRef(false)
const isConfirming = shallowRef(false)
const errorMessage = shallowRef('')
const passwordForm = reactive<CollaborationPasswordFormModel>({
  password: '',
})
const passwordRules = computed<FormRules<CollaborationPasswordFormModel>>(() => ({
  password: [
    { required: true, message: t('collaborationResolver.passwordRequired'), trigger: 'blur' },
    {
      validator: (_rule, value: string, callback) => {
        if (DOCUMENT_COLLABORATION_LINK_PASSWORD_REGEX.test(value.trim())) {
          callback()
          return
        }

        callback(new Error(t('collaborationResolver.passwordRule', { length: DOCUMENT_COLLABORATION_LINK_PASSWORD_LENGTH })))
      },
      trigger: 'blur',
    },
  ],
}))

const hasCurrentAccess = computed(() => Boolean(preview.value?.currentAccess))
const needsPassword = computed(() => Boolean(preview.value?.passwordRequired && !hasCurrentAccess.value))
const canConfirm = computed(() => preview.value ? canConfirmEntry(preview.value) : false)
const needsConfirm = computed(() => {
  const entry = preview.value

  return entry ? needsEntryConfirmation(entry) : false
})
const primaryActionLabel = computed(() => {
  if (!preview.value) {
    return t('collaborationResolver.openDocument')
  }

  return needsConfirm.value ? t('collaborationResolver.joinAndOpen') : t('collaborationResolver.openDocument')
})
const entryTypeLabel = computed(() => {
  if (preview.value?.type === COLLABORATION_RESOLVER_ENTRY_TYPE.DOCUMENT_USER_INVITE) {
    return t('collaborationResolver.documentInvite')
  }

  return t('collaborationResolver.linkEntry')
})
const statusLabel = computed(() => {
  const status = preview.value?.status

  if (status === DOCUMENT_COLLABORATION_RESOLVER_STATUS.PENDING) {
    return t('collaborationResolver.pending')
  }
  if (status === DOCUMENT_COLLABORATION_RESOLVER_STATUS.ACCEPTED) {
    return t('collaborationResolver.accepted')
  }
  if (status === DOCUMENT_COLLABORATION_RESOLVER_STATUS.ENABLED) {
    return t('collaborationResolver.enabled')
  }
  if (status === DOCUMENT_COLLABORATION_RESOLVER_STATUS.DISABLED) {
    return t('collaborationResolver.disabled')
  }
  if (status === DOCUMENT_COLLABORATION_RESOLVER_STATUS.DECLINED) {
    return t('collaborationResolver.rejected')
  }
  if (status === DOCUMENT_COLLABORATION_RESOLVER_STATUS.CANCELED) {
    return t('collaborationResolver.canceled')
  }

  return ''
})
const unavailableMessage = computed(() => {
  if (!preview.value || canConfirm.value || hasCurrentAccess.value) {
    return ''
  }

  return t('collaborationResolver.entryUnavailable')
})

watch(
  code,
  () => {
    void loadEntry()
  },
  { immediate: true },
)

async function loadEntry() {
  if (!code.value) {
    errorMessage.value = t('collaborationResolver.entryInvalid')
    preview.value = null
    return
  }

  isLoading.value = true
  errorMessage.value = ''
  passwordForm.password = ''

  try {
    const entry = await resolveDocumentCollaborationEntry(code.value)
    preview.value = entry

    if (shouldOpenDocumentDirectly(entry)) {
      await openDocument(entry.rootDocumentId)
    }
  }
  catch (error) {
    preview.value = null
    errorMessage.value = getRequestErrorDisplayMessage(error, t('collaborationResolver.entryMissing'))
  }
  finally {
    isLoading.value = false
  }
}

function canConfirmEntry(entry: DocumentCollaborationResolverPreview) {
  return (
    entry.status === DOCUMENT_COLLABORATION_RESOLVER_STATUS.PENDING
    || entry.status === DOCUMENT_COLLABORATION_RESOLVER_STATUS.ACCEPTED
    || entry.status === DOCUMENT_COLLABORATION_RESOLVER_STATUS.ENABLED
  )
}

function needsEntryConfirmation(entry: DocumentCollaborationResolverPreview) {
  if (!canConfirmEntry(entry)) {
    return false
  }

  if (!entry.currentAccess) {
    return true
  }

  return (
    getCollaborationPermissionRank(entry.permission) > getCollaborationPermissionRank(entry.currentAccess.permission)
    || getCollaborationScopeRank(entry.scope) > getCollaborationScopeRank(entry.currentAccess.scope)
  )
}

function shouldOpenDocumentDirectly(entry: DocumentCollaborationResolverPreview): entry is DocumentCollaborationResolverPreview & { rootDocumentId: string } {
  return Boolean(entry.rootDocumentId && entry.currentAccess && !needsEntryConfirmation(entry))
}

async function handlePrimaryAction() {
  const entry = preview.value

  if (!entry || isConfirming.value) {
    return
  }

  if (!needsConfirm.value) {
    if (!entry.rootDocumentId) {
      ElMessage.warning(t('collaborationResolver.loginRequired'))
      return
    }

    await openDocument(entry.rootDocumentId)
    return
  }

  if (needsPassword.value) {
    await passwordFormRef.value?.validate()
  }

  isConfirming.value = true

  try {
    const response = await confirmDocumentCollaborationEntry(code.value, {
      ...(needsPassword.value ? { password: passwordForm.password } : {}),
    })

    ElMessage.success(t('collaborationResolver.joined'))
    await openDocument(response.documentId)
  }
  catch (error) {
    ElMessage.error(getRequestErrorDisplayMessage(error, t('collaborationResolver.joinFailed')))
  }
  finally {
    isConfirming.value = false
  }
}
</script>

<template>
  <CollaborationResolverLayout>
    <ElResult
      v-if="errorMessage"
      icon="error"
      :title="t('collaborationResolver.resultTitle')"
      :sub-title="errorMessage"
    />

    <div
      v-else
      class="collaboration-resolver-page__panel grid min-h-[18rem] w-full max-w-[34rem] gap-5 rounded-[1rem] border p-8"
    >
      <ElSkeleton v-if="isLoading" animated>
        <template #template>
          <div class="grid gap-5">
            <div class="grid gap-2">
              <ElSkeletonItem variant="text" class="max-w-24" />
              <ElSkeletonItem variant="h3" class="max-w-64" />
              <ElSkeletonItem variant="text" class="max-w-80" />
            </div>
            <ElSkeletonItem variant="rect" class="h-28 w-full" />
            <div class="flex justify-end">
              <ElSkeletonItem variant="button" class="h-9 max-w-24" />
            </div>
          </div>
        </template>
      </ElSkeleton>

      <template v-else-if="preview">
        <div class="collaboration-resolver-page__header grid gap-1.5">
          <p class="collaboration-resolver-page__kicker m-0 text-[13px] font-bold leading-6 text-primary">
            {{ entryTypeLabel }}
          </p>
          <h1 class="collaboration-resolver-page__title m-0 text-[1.375rem] font-bold leading-[1.35] text-main">
            {{ preview.documentTitle }}
          </h1>
          <p class="collaboration-resolver-page__subtitle m-0 text-sm leading-[1.6] text-secondary">
            {{ t('collaborationResolver.inviteMessage', { name: preview.inviter?.displayName || t('collaborationResolver.fallbackInviter') }) }}
          </p>
        </div>

        <ElDescriptions :column="1" border class="collaboration-resolver-page__details min-w-0">
          <ElDescriptionsItem :label="t('collaborationResolver.entryStatus')">
            <ElTag size="small" effect="plain">
              {{ statusLabel }}
            </ElTag>
          </ElDescriptionsItem>
          <ElDescriptionsItem :label="t('collaborationResolver.invitePermission')">
            {{ formatCollaborationPermission(preview.permission) }}
          </ElDescriptionsItem>
          <ElDescriptionsItem :label="t('collaborationResolver.inviteScope')">
            {{ formatCollaborationScope(preview.scope) }}
          </ElDescriptionsItem>
          <ElDescriptionsItem v-if="preview.currentAccess" :label="t('collaborationResolver.currentAccess')">
            {{ formatCollaborationPermission(preview.currentAccess.permission) }}
            ·
            {{ formatCollaborationScope(preview.currentAccess.scope) }}
          </ElDescriptionsItem>
        </ElDescriptions>

        <CollaborationPasswordForm
          v-if="needsPassword"
          ref="passwordFormRef"
          v-model:password="passwordForm.password"
          :rules="passwordRules"
          :disabled="isConfirming"
          @submit="handlePrimaryAction"
        />

        <ElAlert
          v-if="unavailableMessage"
          :title="unavailableMessage"
          type="warning"
          show-icon
          :closable="false"
        />

        <div class="collaboration-resolver-page__actions flex justify-end">
          <ElButton
            type="primary"
            :disabled="Boolean(unavailableMessage)"
            :loading="isConfirming"
            @click="handlePrimaryAction"
          >
            {{ primaryActionLabel }}
          </ElButton>
        </div>
      </template>
    </div>
  </CollaborationResolverLayout>
</template>

<style scoped lang="scss">
.collaboration-resolver-page {
  &__panel {
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 74%, transparent);
    background: var(--brand-bg-surface-raised);
    box-shadow: 0 18px 44px color-mix(in srgb, var(--brand-text-primary) 8%, transparent);
  }
}
</style>
