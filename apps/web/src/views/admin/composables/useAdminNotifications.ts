import type { TiptapJsonContent } from '@haohaoxue/samepage-contracts'
import type { FormInstance, FormRules } from 'element-plus'
import type {
  PlatformNotification,
  PlatformNotificationStatus,
} from '@/apis/notification'
import {
  PLATFORM_NOTIFICATION_STATUS,
  PLATFORM_NOTIFICATION_STATUS_VALUES,
  PLATFORM_NOTIFICATION_TITLE_MAX_LENGTH,
} from '@haohaoxue/samepage-contracts/notification'
import { createEmptyTiptapContent } from '@haohaoxue/samepage-shared/tiptap'
import { computed, onMounted, reactive, shallowRef } from 'vue'
import {
  createPlatformNotification,
  deletePlatformNotification,
  listPlatformNotifications,
  updatePlatformNotification,
} from '@/apis/notification'
import { ElMessage, ElMessageBox } from '@/utils/element-plus'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'

type NotificationDrawerMode = 'create' | 'edit' | 'view'
type NotificationStatusFilter = PlatformNotificationStatus | ''
export interface AdminNotificationForm {
  title: string
  content: TiptapJsonContent
}

const platformNotificationStatusLabels = {
  [PLATFORM_NOTIFICATION_STATUS.DRAFT]: '草稿',
  [PLATFORM_NOTIFICATION_STATUS.PUBLISHED]: '已发布',
} as const satisfies Record<PlatformNotificationStatus, string>

export function useAdminNotifications() {
  const notifications = shallowRef<PlatformNotification[]>([])
  const total = shallowRef(0)
  const errorMessage = shallowRef('')
  const isLoading = shallowRef(false)
  const isSaving = shallowRef(false)
  const deletingNotificationId = shallowRef('')
  const formRef = shallowRef<FormInstance | null>(null)
  const drawerVisible = shallowRef(false)
  const drawerMode = shallowRef<NotificationDrawerMode>('create')
  const currentNotificationId = shallowRef('')
  const query = reactive({
    pageNo: 1,
    pageSize: 20,
    status: '' as NotificationStatusFilter,
  })
  const form = reactive<AdminNotificationForm>({
    title: '',
    content: createEmptyTiptapContent() as TiptapJsonContent,
  })
  const formRules: FormRules<typeof form> = {
    title: [
      { required: true, message: '请输入站内信标题', trigger: 'blur' },
      { max: PLATFORM_NOTIFICATION_TITLE_MAX_LENGTH, message: `标题不能超过 ${PLATFORM_NOTIFICATION_TITLE_MAX_LENGTH} 个字符`, trigger: 'blur' },
    ],
  }
  const statusOptions = [
    { label: '全部', value: '' },
    ...PLATFORM_NOTIFICATION_STATUS_VALUES.map(status => ({
      label: platformNotificationStatusLabels[status],
      value: status,
    })),
  ]

  const drawerTitle = computed(() => {
    if (drawerMode.value === 'create') {
      return '新建站内信'
    }

    if (drawerMode.value === 'view') {
      return '查看站内信'
    }

    return '编辑站内信'
  })
  const isEditing = computed(() => drawerMode.value === 'edit')
  const isViewing = computed(() => drawerMode.value === 'view')

  async function loadNotifications() {
    isLoading.value = true
    errorMessage.value = ''

    try {
      const response = await listPlatformNotifications({
        pageNo: query.pageNo,
        pageSize: query.pageSize,
        status: query.status || undefined,
      })

      notifications.value = response.items
      total.value = response.total
    }
    catch (error) {
      errorMessage.value = getRequestErrorDisplayMessage(error, '加载站内信失败')
    }
    finally {
      isLoading.value = false
    }
  }

  function openCreateDrawer() {
    drawerMode.value = 'create'
    currentNotificationId.value = ''
    resetForm()
    drawerVisible.value = true
  }

  function openEditDrawer(notification: PlatformNotification) {
    if (notification.status === PLATFORM_NOTIFICATION_STATUS.PUBLISHED) {
      openViewDrawer(notification)
      return
    }

    drawerMode.value = 'edit'
    currentNotificationId.value = notification.id
    syncForm(notification)
    drawerVisible.value = true
  }

  function openViewDrawer(notification: PlatformNotification) {
    drawerMode.value = 'view'
    currentNotificationId.value = notification.id
    syncForm(notification)
    drawerVisible.value = true
  }

  function closeDrawer() {
    drawerVisible.value = false
  }

  function updateContent(content: TiptapJsonContent) {
    form.content = content
  }

  function updateTitle(title: string) {
    form.title = title
  }

  function setFormRef(instance: FormInstance | null) {
    formRef.value = instance
  }

  function getStatusLabel(status: PlatformNotificationStatus) {
    return platformNotificationStatusLabels[status]
  }

  async function saveDraft() {
    await saveNotification(PLATFORM_NOTIFICATION_STATUS.DRAFT)
  }

  async function publishNotification() {
    await saveNotification(PLATFORM_NOTIFICATION_STATUS.PUBLISHED)
  }

  async function saveNotification(status: PlatformNotificationStatus) {
    if (drawerMode.value === 'view') {
      return
    }

    form.title = form.title.trim()
    const isValid = await formRef.value?.validate().catch(() => false)

    if (!isValid) {
      return
    }

    isSaving.value = true

    try {
      if (drawerMode.value === 'create') {
        await createPlatformNotification({
          title: form.title,
          content: form.content,
          status,
        })
      }
      else {
        await updatePlatformNotification(currentNotificationId.value, {
          title: form.title,
          content: form.content,
          status,
        })
      }

      ElMessage.success(status === PLATFORM_NOTIFICATION_STATUS.PUBLISHED ? '站内信已发布' : '草稿已保存')
      drawerVisible.value = false
      await loadNotifications()
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '保存站内信失败'))
    }
    finally {
      isSaving.value = false
    }
  }

  async function deleteNotification(notification: PlatformNotification) {
    try {
      await ElMessageBox.confirm(
        `删除后，这条站内信将不再出现在用户站内信列表中。`,
        `删除「${notification.title}」`,
        {
          type: 'warning',
          confirmButtonText: '删除',
          cancelButtonText: '取消',
          confirmButtonClass: 'el-button--danger',
        },
      )
    }
    catch {
      return
    }

    deletingNotificationId.value = notification.id

    try {
      await deletePlatformNotification(notification.id)
      ElMessage.success('站内信已删除')

      if (currentNotificationId.value === notification.id) {
        drawerVisible.value = false
      }

      await loadNotifications()
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '删除站内信失败'))
    }
    finally {
      deletingNotificationId.value = ''
    }
  }

  async function handleStatusFilterChange(value: string | number | boolean | undefined) {
    if (value !== '' && !PLATFORM_NOTIFICATION_STATUS_VALUES.includes(value as PlatformNotificationStatus)) {
      return
    }

    query.status = value as NotificationStatusFilter
    query.pageNo = 1
    await loadNotifications()
  }

  async function handlePageChange(pageNo: number) {
    query.pageNo = pageNo
    await loadNotifications()
  }

  async function handlePageSizeChange(pageSize: number) {
    query.pageSize = pageSize
    query.pageNo = 1
    await loadNotifications()
  }

  onMounted(loadNotifications)

  return {
    closeDrawer,
    deletingNotificationId,
    drawerTitle,
    drawerVisible,
    errorMessage,
    form,
    formRules,
    getStatusLabel,
    handlePageChange,
    handlePageSizeChange,
    handleStatusFilterChange,
    isEditing,
    isLoading,
    isSaving,
    isViewing,
    loadNotifications,
    notifications,
    openCreateDrawer,
    openEditDrawer,
    openViewDrawer,
    platformNotificationStatusLabels,
    publishNotification,
    query,
    saveDraft,
    setFormRef,
    statusOptions,
    titleMaxLength: PLATFORM_NOTIFICATION_TITLE_MAX_LENGTH,
    total,
    deleteNotification,
    updateContent,
    updateTitle,
  }

  function resetForm() {
    form.title = ''
    form.content = createEmptyTiptapContent()
    formRef.value?.clearValidate()
  }

  function syncForm(notification: PlatformNotification) {
    form.title = notification.title
    form.content = cloneContent(notification.content)
  }
}

function cloneContent(content: TiptapJsonContent): TiptapJsonContent {
  return JSON.parse(JSON.stringify(content)) as TiptapJsonContent
}
