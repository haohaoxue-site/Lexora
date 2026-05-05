import type { NotificationSummary } from '@/apis/notification'
import type { WorkspaceInviteSummary } from '@/apis/workspace'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import {
  computed,
  onMounted,
  shallowRef,
  watch,
} from 'vue'
import { getNotificationSummary } from '@/apis/notification'
import {
  acceptWorkspaceInvite,
  declineWorkspaceInvite,
} from '@/apis/workspace'
import { useWorkspaceStore } from '@/stores/workspace'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'

type InviteAction = 'accept' | 'decline'

type NotificationInviteItem = WorkspaceInviteSummary & {
  receivedLabel: string
}

const EMPTY_NOTIFICATION_SUMMARY: NotificationSummary = {
  pendingTeamInviteCount: 0,
  pendingTeamInvites: [],
}

export function useSessionNotificationBell() {
  const workspaceStore = useWorkspaceStore()
  const popoverVisible = shallowRef(false)
  const summary = shallowRef<NotificationSummary>(EMPTY_NOTIFICATION_SUMMARY)
  const isLoading = shallowRef(false)
  const hasLoaded = shallowRef(false)
  const loadErrorMessage = shallowRef('')
  const actingInviteId = shallowRef('')
  const actingInviteAction = shallowRef<InviteAction | null>(null)
  let summaryRequestId = 0

  const pendingInviteCount = computed(() => summary.value.pendingTeamInviteCount)
  const hasPendingInvites = computed(() => pendingInviteCount.value > 0)
  const inviteItems = computed<NotificationInviteItem[]>(() =>
    summary.value.pendingTeamInvites.map(invite => ({
      ...invite,
      receivedLabel: formatNotificationInviteLabel(invite),
    })),
  )

  watch(popoverVisible, (visible) => {
    if (!visible) {
      return
    }

    void loadSummary()
  })

  onMounted(() => {
    void loadSummary()
  })

  async function loadSummary() {
    const requestId = ++summaryRequestId

    isLoading.value = true
    loadErrorMessage.value = ''

    try {
      const nextSummary = await getNotificationSummary()

      if (requestId !== summaryRequestId) {
        return
      }

      summary.value = {
        pendingTeamInviteCount: nextSummary.pendingTeamInviteCount,
        pendingTeamInvites: nextSummary.pendingTeamInvites,
      }
      hasLoaded.value = true
    }
    catch (error) {
      if (requestId !== summaryRequestId) {
        return
      }

      loadErrorMessage.value = getRequestErrorDisplayMessage(error, '加载消息提醒失败')

      if (!hasLoaded.value) {
        summary.value = EMPTY_NOTIFICATION_SUMMARY
      }
    }
    finally {
      if (requestId === summaryRequestId) {
        isLoading.value = false
      }
    }
  }

  async function acceptInvite(invite: WorkspaceInviteSummary) {
    await applyInviteAction('accept', invite, async () => {
      await acceptWorkspaceInvite(invite.id)
      ElMessage.success(`已加入 ${invite.workspaceName}`)

      try {
        await workspaceStore.refreshVisibleWorkspaces()
      }
      catch (error) {
        ElMessage.warning(getRequestErrorDisplayMessage(error, '已接受邀请，但刷新空间列表失败'))
      }
    })
  }

  async function declineInvite(invite: WorkspaceInviteSummary) {
    await applyInviteAction('decline', invite, async () => {
      await declineWorkspaceInvite(invite.id)
      ElMessage.success(`已拒绝加入 ${invite.workspaceName}`)
    })
  }

  async function applyInviteAction(
    action: InviteAction,
    invite: WorkspaceInviteSummary,
    handler: () => Promise<void>,
  ) {
    if (actingInviteId.value) {
      return
    }

    actingInviteId.value = invite.id
    actingInviteAction.value = action

    try {
      await handler()
      await loadSummary()
    }
    catch (error) {
      const fallbackMessage = action === 'accept'
        ? '接受团队邀请失败'
        : '拒绝团队邀请失败'

      ElMessage.error(getRequestErrorDisplayMessage(error, fallbackMessage))
    }
    finally {
      if (actingInviteId.value === invite.id) {
        actingInviteId.value = ''
        actingInviteAction.value = null
      }
    }
  }

  return {
    acceptInvite,
    actingInviteAction,
    actingInviteId,
    declineInvite,
    hasLoaded,
    hasPendingInvites,
    inviteItems,
    isLoading,
    loadErrorMessage,
    loadSummary,
    pendingInviteCount,
    popoverVisible,
  }
}

function formatNotificationInviteLabel(invite: WorkspaceInviteSummary) {
  return `邀请发送于 ${dayjs(invite.createdAt).format('YYYY-MM-DD HH:mm')}`
}
