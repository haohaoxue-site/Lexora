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
  DOCUMENT_COLLABORATION_PERMISSION_LABELS,
  DOCUMENT_COLLABORATION_RESOLVER_STATUS,
  DOCUMENT_COLLABORATION_SCOPE_LABELS,
} from '@haohaoxue/samepage-contracts'
import { ElMessage } from 'element-plus'
import { computed, reactive, shallowRef, useTemplateRef, watch } from 'vue'
import {
  confirmDocumentCollaborationEntry,
  resolveDocumentCollaborationEntry,
} from '@/apis/document-collaboration'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'
import CollaborationPasswordForm from '../../components/password-form'
import { useCollaborationResolverNavigation } from '../../composables/useCollaborationResolverNavigation'
import CollaborationResolverLayout from '../../layouts/resolver-shell'
import {
  getCollaborationPermissionRank,
  getCollaborationScopeRank,
} from '../../utils/collaborationResolver'

const { code, openDocument } = useCollaborationResolverNavigation()
const passwordFormRef = useTemplateRef<CollaborationPasswordFormExposed>('passwordFormRef')
const preview = shallowRef<DocumentCollaborationResolverPreview | null>(null)
const isLoading = shallowRef(false)
const isConfirming = shallowRef(false)
const errorMessage = shallowRef('')
const passwordForm = reactive<CollaborationPasswordFormModel>({
  password: '',
})
const passwordRules: FormRules<CollaborationPasswordFormModel> = {
  password: [
    { required: true, message: '请输入协作链接密码', trigger: 'blur' },
    {
      validator: (_rule, value: string, callback) => {
        if (DOCUMENT_COLLABORATION_LINK_PASSWORD_REGEX.test(value.trim())) {
          callback()
          return
        }

        callback(new Error(`请输入 ${DOCUMENT_COLLABORATION_LINK_PASSWORD_LENGTH} 位数字密码`))
      },
      trigger: 'blur',
    },
  ],
}

const hasCurrentAccess = computed(() => Boolean(preview.value?.currentAccess))
const needsPassword = computed(() => Boolean(preview.value?.passwordRequired && !hasCurrentAccess.value))
const canConfirm = computed(() => preview.value ? canConfirmEntry(preview.value) : false)
const needsConfirm = computed(() => {
  const entry = preview.value

  return entry ? needsEntryConfirmation(entry) : false
})
const primaryActionLabel = computed(() => {
  if (!preview.value) {
    return '打开文档'
  }

  return needsConfirm.value ? '加入并打开' : '打开文档'
})
const entryTypeLabel = computed(() => {
  if (preview.value?.type === COLLABORATION_RESOLVER_ENTRY_TYPE.DOCUMENT_USER_INVITE) {
    return '指定用户邀请'
  }

  return '协作链接'
})
const statusLabel = computed(() => {
  const status = preview.value?.status

  if (status === DOCUMENT_COLLABORATION_RESOLVER_STATUS.PENDING) {
    return '待处理'
  }
  if (status === DOCUMENT_COLLABORATION_RESOLVER_STATUS.ACCEPTED) {
    return '已接受'
  }
  if (status === DOCUMENT_COLLABORATION_RESOLVER_STATUS.ENABLED) {
    return '已开启'
  }
  if (status === DOCUMENT_COLLABORATION_RESOLVER_STATUS.DISABLED) {
    return '已关闭'
  }
  if (status === DOCUMENT_COLLABORATION_RESOLVER_STATUS.DECLINED) {
    return '已拒绝'
  }
  if (status === DOCUMENT_COLLABORATION_RESOLVER_STATUS.CANCELED) {
    return '已取消'
  }

  return ''
})
const unavailableMessage = computed(() => {
  if (!preview.value || canConfirm.value || hasCurrentAccess.value) {
    return ''
  }

  return '这个协作入口已经不可用。'
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
    errorMessage.value = '协作入口无效'
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
    errorMessage.value = getRequestErrorDisplayMessage(error, '协作入口不存在或已失效')
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
      ElMessage.warning('请先登录后打开协作文档')
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

    ElMessage.success('已加入协作文档')
    await openDocument(response.documentId)
  }
  catch (error) {
    ElMessage.error(getRequestErrorDisplayMessage(error, '加入协作文档失败'))
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
      title="无法打开协作入口"
      :sub-title="errorMessage"
    />

    <div
      v-else
      v-loading="isLoading"
      class="collaboration-resolver-page__panel grid min-h-[18rem] w-full max-w-[34rem] gap-5 rounded-[1rem] border p-8"
    >
      <template v-if="preview">
        <div class="collaboration-resolver-page__header grid gap-1.5">
          <p class="collaboration-resolver-page__kicker m-0 text-[13px] font-bold leading-6 text-primary">
            {{ entryTypeLabel }}
          </p>
          <h1 class="collaboration-resolver-page__title m-0 text-[1.375rem] font-bold leading-[1.35] text-main">
            {{ preview.documentTitle }}
          </h1>
          <p class="collaboration-resolver-page__subtitle m-0 text-sm leading-[1.6] text-secondary">
            {{ preview.inviter?.displayName || '有人' }} 邀请你协作文档
          </p>
        </div>

        <ElDescriptions :column="1" border class="collaboration-resolver-page__details min-w-0">
          <ElDescriptionsItem label="入口状态">
            <ElTag size="small" effect="plain">
              {{ statusLabel }}
            </ElTag>
          </ElDescriptionsItem>
          <ElDescriptionsItem label="邀请权限">
            {{ DOCUMENT_COLLABORATION_PERMISSION_LABELS[preview.permission] }}
          </ElDescriptionsItem>
          <ElDescriptionsItem label="邀请范围">
            {{ DOCUMENT_COLLABORATION_SCOPE_LABELS[preview.scope] }}
          </ElDescriptionsItem>
          <ElDescriptionsItem v-if="preview.currentAccess" label="当前权限">
            {{ DOCUMENT_COLLABORATION_PERMISSION_LABELS[preview.currentAccess.permission] }}
            ·
            {{ DOCUMENT_COLLABORATION_SCOPE_LABELS[preview.currentAccess.scope] }}
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
