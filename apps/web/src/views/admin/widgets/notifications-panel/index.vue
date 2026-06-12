<script setup lang="ts">
import type { TiptapJsonContent } from '@haohaoxue/samepage-contracts'
import type { FormInstance, FormRules } from 'element-plus'
import type { AdminNotificationForm } from '../../composables/useAdminNotifications'
import type {
  PlatformNotification,
  PlatformNotificationStatus,
} from '@/apis/notification'
import { PLATFORM_NOTIFICATION_STATUS } from '@haohaoxue/samepage-contracts/notification'
import { StandaloneContentEditor } from '@/components/tiptap-editor'
import { formatDateTime } from '@/utils/dayjs'

interface NotificationsPanelProps {
  notifications: PlatformNotification[]
  total: number
  pageNo: number
  pageSize: number
  isLoading: boolean
  drawerTitle: string
  drawerVisible: boolean
  form: AdminNotificationForm
  formRules: FormRules<AdminNotificationForm>
  titleMaxLength: number
  isEditing: boolean
  isViewing: boolean
  isSaving: boolean
  deletingNotificationId: string
  setFormRef: (instance: FormInstance | null) => void
  getStatusLabel: (status: PlatformNotificationStatus) => string
}

interface NotificationsPanelEmits {
  viewNotification: [notification: PlatformNotification]
  editNotification: [notification: PlatformNotification]
  deleteNotification: [notification: PlatformNotification]
  pageChange: [pageNo: number]
  pageSizeChange: [pageSize: number]
  updateTitle: [title: string]
  updateContent: [content: TiptapJsonContent]
  closeDrawer: []
  saveDraft: []
  publishNotification: []
}

const props = defineProps<NotificationsPanelProps>()
const emits = defineEmits<NotificationsPanelEmits>()

function handleDrawerVisibleUpdate(visible: boolean) {
  if (!visible) {
    emits('closeDrawer')
  }
}

function handleTitleUpdate(value: string | number) {
  emits('updateTitle', String(value))
}

function handleFormRef(instance: unknown) {
  props.setFormRef(isFormInstance(instance) ? instance : null)
}

function isFormInstance(instance: unknown): instance is FormInstance {
  return typeof instance === 'object'
    && instance !== null
    && 'validate' in instance
    && 'clearValidate' in instance
}

function isPublishedNotification(notification: PlatformNotification) {
  return notification.status === PLATFORM_NOTIFICATION_STATUS.PUBLISHED
}
</script>

<template>
  <section class="admin-notifications-panel">
    <div class="admin-notifications-panel__table-wrap">
      <ElTable
        v-loading="props.isLoading"
        :data="props.notifications"
        row-key="id"
        class="admin-notifications__table"
        height="calc(100vh - 15rem)"
      >
        <ElTableColumn label="标题" min-width="220">
          <template #default="{ row }">
            <div class="min-w-0">
              <p class="m-0 truncate text-sm font-semibold leading-5 text-main">
                {{ row.title }}
              </p>
              <p class="m-0 mt-1 line-clamp-2 text-xs leading-5 text-secondary">
                {{ row.summary || '暂无摘要' }}
              </p>
            </div>
          </template>
        </ElTableColumn>
        <ElTableColumn label="状态" width="120">
          <template #default="{ row }">
            <ElTag :type="row.status === 'PUBLISHED' ? 'success' : 'info'" effect="plain">
              {{ props.getStatusLabel(row.status) }}
            </ElTag>
          </template>
        </ElTableColumn>
        <ElTableColumn label="发布时间" width="180">
          <template #default="{ row }">
            {{ row.publishedAt ? formatDateTime(row.publishedAt) : '-' }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="更新人" width="160">
          <template #default="{ row }">
            {{ row.updatedByUser?.displayName ?? '-' }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="更新时间" width="180">
          <template #default="{ row }">
            {{ formatDateTime(row.updatedAt) }}
          </template>
        </ElTableColumn>
        <ElTableColumn label="操作" width="132" fixed="right">
          <template #default="{ row }">
            <ElButton
              v-if="isPublishedNotification(row)"
              link
              type="primary"
              @click="emits('viewNotification', row)"
            >
              查看
            </ElButton>
            <ElButton
              v-else
              link
              type="primary"
              @click="emits('editNotification', row)"
            >
              编辑
            </ElButton>
            <ElButton
              link
              type="danger"
              :loading="props.deletingNotificationId === row.id"
              @click="emits('deleteNotification', row)"
            >
              删除
            </ElButton>
          </template>
        </ElTableColumn>
      </ElTable>
    </div>

    <div class="admin-notifications__pagination mt-4 flex justify-end">
      <ElPagination
        :current-page="props.pageNo"
        :page-size="props.pageSize"
        :total="props.total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        background
        @current-change="emits('pageChange', $event)"
        @size-change="emits('pageSizeChange', $event)"
      />
    </div>

    <ElDrawer
      :model-value="props.drawerVisible"
      :title="props.drawerTitle"
      size="44rem"
      destroy-on-close
      @update:model-value="handleDrawerVisibleUpdate"
      @close="emits('closeDrawer')"
    >
      <div v-if="props.isViewing" class="admin-notifications__view grid gap-4">
        <div>
          <h3 class="m-0 text-lg font-semibold leading-7 text-main">
            {{ props.form.title }}
          </h3>
        </div>

        <div class="admin-notifications__editor w-full">
          <StandaloneContentEditor
            :content="props.form.content"
            :editable="false"
          />
        </div>
      </div>

      <ElForm
        v-else
        :ref="handleFormRef"
        :model="props.form"
        :rules="props.formRules"
        label-position="top"
        class="admin-notifications__form"
      >
        <ElFormItem label="标题" prop="title">
          <ElInput
            :model-value="props.form.title"
            :maxlength="props.titleMaxLength"
            show-word-limit
            @update:model-value="handleTitleUpdate"
          />
        </ElFormItem>
        <ElFormItem label="内容" prop="content">
          <div class="admin-notifications__editor w-full">
            <StandaloneContentEditor
              :content="props.form.content"
              :editable="!props.isViewing"
              @update:content="emits('updateContent', $event)"
            />
          </div>
        </ElFormItem>
      </ElForm>

      <template #footer>
        <div v-if="props.isViewing" class="flex justify-end">
          <ElButton @click="emits('closeDrawer')">
            关闭
          </ElButton>
        </div>
        <div v-else class="flex justify-end gap-3">
          <ElButton @click="emits('closeDrawer')">
            取消
          </ElButton>
          <ElButton :loading="props.isSaving" @click="emits('saveDraft')">
            保存草稿
          </ElButton>
          <ElButton type="primary" :loading="props.isSaving" @click="emits('publishNotification')">
            {{ props.isEditing ? '保存并发布' : '发布' }}
          </ElButton>
        </div>
      </template>
    </ElDrawer>
  </section>
</template>

<style scoped lang="scss">
.admin-notifications-panel {
  min-height: 0;
}

.admin-notifications {
  &__table {
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 82%, transparent);
    border-radius: 8px;
  }

  &__editor {
    height: 24rem;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--brand-border-base) 84%, transparent);
    border-radius: 8px;
    background: var(--brand-bg-surface);

    :deep(.standalone-content-editor) {
      display: flex;
      height: 100%;
      min-height: 0;
      flex-direction: column;
    }

    :deep(.standalone-content-editor__surface) {
      min-height: 0;
      flex: 1 1 0%;
    }

    :deep(.tiptap-editor) {
      min-height: 0;
    }

    :deep(.tiptap-editor__content) {
      min-height: 0;
      overflow: auto;
    }

    :deep(.ProseMirror) {
      min-height: 100%;
      padding: 1rem;
    }
  }
}
</style>
