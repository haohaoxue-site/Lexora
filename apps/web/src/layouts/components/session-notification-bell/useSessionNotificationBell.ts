import type {
  DocumentCollaborationUserInviteNotification,
  NotificationSummary,
} from '@/apis/notification'
import dayjs from 'dayjs'
import {
  computed,
  onMounted,
  shallowRef,
  watch,
} from 'vue'
import { useRouter } from 'vue-router'
import {
  acceptDocumentCollaborationInvitation,
  declineDocumentCollaborationInvitation,
} from '@/apis/document-collaboration'
import { getNotificationSummary } from '@/apis/notification'
import { useWorkspaceStore } from '@/stores/workspace'
import { ElMessage } from '@/utils/element-plus'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'
import { useDocumentTree } from '@/views/docs/composables/useDocumentTree'

type InvitationAction = 'accept' | 'decline'

export type SessionNotificationInvitationItem = DocumentCollaborationUserInviteNotification & {
  inviterLabel: string
  receivedLabel: string
}

const EMPTY_NOTIFICATION_SUMMARY: NotificationSummary = {
  pendingDocumentCollaborationUserInviteCount: 0,
  pendingDocumentCollaborationUserInvites: [],
}

export function useSessionNotificationBell() {
  const router = useRouter()
  const workspaceStore = useWorkspaceStore()
  const documentTree = useDocumentTree()
  const popoverVisible = shallowRef(false)
  const summary = shallowRef<NotificationSummary>(EMPTY_NOTIFICATION_SUMMARY)
  const isLoading = shallowRef(false)
  const hasLoaded = shallowRef(false)
  const loadErrorMessage = shallowRef('')
  const actingInvitationId = shallowRef('')
  const actingInvitationAction = shallowRef<InvitationAction | null>(null)
  const selectedInvitation = shallowRef<SessionNotificationInvitationItem | null>(null)
  const isDetailDialogOpen = shallowRef(false)
  let summaryRequestId = 0

  const pendingInvitationCount = computed(() => summary.value.pendingDocumentCollaborationUserInviteCount)
  const hasPendingInvitations = computed(() => pendingInvitationCount.value > 0)
  const invitationItems = computed<SessionNotificationInvitationItem[]>(() =>
    summary.value.pendingDocumentCollaborationUserInvites.map(invitation => ({
      ...invitation,
      inviterLabel: formatInvitationInviter(invitation),
      receivedLabel: formatInvitationReceivedLabel(invitation),
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
        pendingDocumentCollaborationUserInviteCount: nextSummary.pendingDocumentCollaborationUserInviteCount,
        pendingDocumentCollaborationUserInvites: nextSummary.pendingDocumentCollaborationUserInvites,
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

  async function acceptInvitation(invitation: DocumentCollaborationUserInviteNotification) {
    await applyInvitationAction('accept', invitation, async () => {
      const grant = await acceptDocumentCollaborationInvitation(invitation.id)
      ElMessage.success('已接受协作邀请')

      try {
        await workspaceStore.ensurePersonalWorkspace()
        await documentTree.loadTree({ silent: true })
      }
      catch (error) {
        ElMessage.warning(getRequestErrorDisplayMessage(error, '已接受邀请，但刷新文档库失败'))
      }

      popoverVisible.value = false
      isDetailDialogOpen.value = false
      selectedInvitation.value = null
      await router.push({
        name: 'docs',
        params: {
          id: grant.rootDocumentId,
        },
      })
    })
  }

  async function declineInvitation(invitation: DocumentCollaborationUserInviteNotification) {
    await applyInvitationAction('decline', invitation, async () => {
      await declineDocumentCollaborationInvitation(invitation.id)
      ElMessage.success('已拒绝协作邀请')
      isDetailDialogOpen.value = false
      selectedInvitation.value = null
    })
  }

  function viewInvitation(invitation: SessionNotificationInvitationItem) {
    selectedInvitation.value = invitation
    isDetailDialogOpen.value = true
  }

  function closeInvitationDetail() {
    isDetailDialogOpen.value = false
    selectedInvitation.value = null
  }

  async function applyInvitationAction(
    action: InvitationAction,
    invitation: DocumentCollaborationUserInviteNotification,
    handler: () => Promise<void>,
  ) {
    if (actingInvitationId.value) {
      return
    }

    actingInvitationId.value = invitation.id
    actingInvitationAction.value = action

    try {
      await handler()
      await loadSummary()
    }
    catch (error) {
      const fallbackMessage = action === 'accept'
        ? '接受协作邀请失败'
        : '拒绝协作邀请失败'

      ElMessage.error(getRequestErrorDisplayMessage(error, fallbackMessage))
    }
    finally {
      if (actingInvitationId.value === invitation.id) {
        actingInvitationId.value = ''
        actingInvitationAction.value = null
      }
    }
  }

  return {
    acceptInvitation,
    actingInvitationAction,
    actingInvitationId,
    declineInvitation,
    hasLoaded,
    hasPendingInvitations,
    invitationItems,
    isDetailDialogOpen,
    isLoading,
    loadErrorMessage,
    loadSummary,
    pendingInvitationCount,
    popoverVisible,
    selectedInvitation,
    closeInvitationDetail,
    viewInvitation,
  }
}

function formatInvitationInviter(invitation: DocumentCollaborationUserInviteNotification) {
  return invitation.inviter?.displayName || '有人'
}

function formatInvitationReceivedLabel(invitation: DocumentCollaborationUserInviteNotification) {
  return `邀请发送于 ${dayjs(invitation.createdAt).format('YYYY-MM-DD HH:mm')}`
}
