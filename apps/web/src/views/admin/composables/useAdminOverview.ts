import type { SystemAdminOverview } from '@/apis/system-admin'
import { computed, onMounted, shallowRef } from 'vue'
import { getSystemAdminOverview } from '@/apis/system-admin'
import { SvgIconCategory } from '@/components/svg-icon/typing'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'

export function useAdminOverview() {
  const overview = shallowRef<SystemAdminOverview | null>(null)
  const errorMessage = shallowRef('')
  const isLoading = shallowRef(false)
  const metricCards = computed(() => {
    if (!overview.value) {
      return []
    }

    return [
      {
        label: '总用户',
        value: overview.value.totalUsers,
        detail: `活跃 ${overview.value.activeUsers}，禁用 ${overview.value.disabledUsers}`,
        iconCategory: SvgIconCategory.UI,
        icon: 'user-group',
      },
      {
        label: '系统管理员',
        value: overview.value.systemAdminCount,
        detail: '拥有系统后台权限',
        iconCategory: SvgIconCategory.UI,
        icon: 'user-admin',
      },
      {
        label: '总文档',
        value: overview.value.totalDocuments,
        detail: `发布 ${overview.value.publishedDocuments}，锁定 ${overview.value.lockedDocuments}`,
        iconCategory: SvgIconCategory.UI,
        icon: 'document-view',
      },
    ]
  })

  async function loadOverview() {
    isLoading.value = true
    errorMessage.value = ''

    try {
      overview.value = await getSystemAdminOverview()
    }
    catch (error) {
      errorMessage.value = getRequestErrorDisplayMessage(error, '加载系统概览失败')
    }
    finally {
      isLoading.value = false
    }
  }

  onMounted(loadOverview)

  return {
    overview,
    errorMessage,
    isLoading,
    loadOverview,
    metricCards,
  }
}
