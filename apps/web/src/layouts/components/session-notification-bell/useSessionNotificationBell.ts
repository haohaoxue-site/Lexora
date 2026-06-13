import type {
  DocumentCollaborationUserInviteNotification,
  NotificationItem,
  NotificationListFilter,
  NotificationSummary,
} from '@/apis/notification'
import {
  NOTIFICATION_LIST_FILTER,
  NOTIFICATION_SOURCE_KIND,
} from '@haohaoxue/lexora-contracts/notification'
import dayjs from 'dayjs'
import {
  computed,
  onMounted,
  reactive,
  shallowRef,
  watch,
} from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  acceptDocumentCollaborationInvitation,
  declineDocumentCollaborationInvitation,
} from '@/apis/document-collaboration'
import {
  getNotificationSummary,
  listNotifications,
  markAllNotificationsRead,
} from '@/apis/notification'
import { useWorkspaceStore } from '@/stores/workspace'
import { ElMessage } from '@/utils/element-plus'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'
import { useDocumentTree } from '@/views/docs/composables/useDocumentTree'

type InvitationAction = 'accept' | 'decline'
type Translate = ReturnType<typeof useI18n>['t']

export type SessionNotificationInvitationItem = DocumentCollaborationUserInviteNotification & {
  inviterLabel: string
  receivedLabel: string
}

export type SessionNotificationItem = NotificationItem & {
  senderLabel: string
  receivedLabel: string
  documentInviteItem: SessionNotificationInvitationItem | null
}

const EMPTY_NOTIFICATION_SUMMARY: NotificationSummary = {
  unreadCount: 0,
  pendingDocumentCollaborationUserInviteCount: 0,
  pendingDocumentCollaborationUserInvites: [],
}
const NOTIFICATION_PAGE_LIMIT = 20
const emptyCursorByFilter = {
  [NOTIFICATION_LIST_FILTER.ALL]: null,
  [NOTIFICATION_LIST_FILTER.UNREAD]: null,
} satisfies Record<NotificationListFilter, string | null>

export function useSessionNotificationBell() {
  const router = useRouter()
  const { t } = useI18n({ useScope: 'global' })
  const workspaceStore = useWorkspaceStore()
  const documentTree = useDocumentTree()
  const popoverVisible = shallowRef(false)
  const summary = shallowRef<NotificationSummary>(EMPTY_NOTIFICATION_SUMMARY)
  const activeFilter = shallowRef<NotificationListFilter>(NOTIFICATION_LIST_FILTER.ALL)
  const notificationItems = shallowRef<SessionNotificationItem[]>([])
  const nextCursorByFilter = reactive<Record<NotificationListFilter, string | null>>({ ...emptyCursorByFilter })
  const isLoading = shallowRef(false)
  const isLoadingMore = shallowRef(false)
  const isMarkingAllRead = shallowRef(false)
  const hasLoaded = shallowRef(false)
  const hasLoadedList = shallowRef(false)
  const loadErrorMessage = shallowRef('')
  const actingInvitationId = shallowRef('')
  const actingInvitationAction = shallowRef<InvitationAction | null>(null)
  const selectedInvitation = shallowRef<SessionNotificationInvitationItem | null>(null)
  const isDetailDialogOpen = shallowRef(false)
  let summaryRequestId = 0
  let listRequestId = 0

  const pendingInvitationCount = computed(() => summary.value.pendingDocumentCollaborationUserInviteCount)
  const hasPendingInvitations = computed(() => pendingInvitationCount.value > 0)
  const unreadNotificationCount = computed(() => summary.value.unreadCount)
  const hasUnreadNotifications = computed(() => unreadNotificationCount.value > 0)
  const hasMoreNotifications = computed(() => Boolean(nextCursorByFilter[activeFilter.value]))
  const invitationItems = computed<SessionNotificationInvitationItem[]>(() =>
    summary.value.pendingDocumentCollaborationUserInvites.map(item => toSessionInvitationItem(item, t)),
  )

  watch(popoverVisible, (visible) => {
    if (!visible) {
      return
    }

    void refreshNotifications()
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
        unreadCount: nextSummary.unreadCount,
        pendingDocumentCollaborationUserInviteCount: nextSummary.pendingDocumentCollaborationUserInviteCount,
        pendingDocumentCollaborationUserInvites: nextSummary.pendingDocumentCollaborationUserInvites,
      }
      hasLoaded.value = true
    }
    catch (error) {
      if (requestId !== summaryRequestId) {
        return
      }

      loadErrorMessage.value = getRequestErrorDisplayMessage(error, t('sessionMenu.notifications.loadFailed'))

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

  async function loadNotificationList(options: { reset?: boolean } = {}) {
    const reset = options.reset ?? true
    const requestId = ++listRequestId
    const filter = activeFilter.value
    const cursor = reset ? undefined : nextCursorByFilter[filter] ?? undefined

    if (!reset && !cursor) {
      return
    }

    if (reset) {
      isLoading.value = true
    }
    else {
      isLoadingMore.value = true
    }
    loadErrorMessage.value = ''

    try {
      const response = await listNotifications({
        filter,
        cursor,
        limit: NOTIFICATION_PAGE_LIMIT,
      })

      if (requestId !== listRequestId || filter !== activeFilter.value) {
        return
      }

      notificationItems.value = reset
        ? response.items.map(item => toSessionNotificationItem(item, t))
        : [...notificationItems.value, ...response.items.map(item => toSessionNotificationItem(item, t))]
      nextCursorByFilter[filter] = response.nextCursor
      summary.value = {
        ...summary.value,
        unreadCount: response.unreadCount,
      }
      hasLoadedList.value = true
    }
    catch (error) {
      if (requestId !== listRequestId) {
        return
      }

      loadErrorMessage.value = getRequestErrorDisplayMessage(error, t('sessionMenu.notifications.loadFailed'))

      if (!hasLoadedList.value || reset) {
        notificationItems.value = []
      }
    }
    finally {
      if (requestId === listRequestId) {
        isLoading.value = false
        isLoadingMore.value = false
      }
    }
  }

  async function refreshNotifications() {
    await Promise.all([
      loadSummary(),
      loadNotificationList({ reset: true }),
    ])
  }

  async function loadMoreNotifications() {
    if (isLoading.value || isLoadingMore.value || !hasMoreNotifications.value) {
      return
    }

    await loadNotificationList({ reset: false })
  }

  async function setNotificationFilter(filter: NotificationListFilter) {
    if (activeFilter.value === filter) {
      return
    }

    activeFilter.value = filter
    nextCursorByFilter[filter] = null
    notificationItems.value = []
    hasLoadedList.value = false
    await loadNotificationList({ reset: true })
  }

  async function markAllUnreadNotificationsRead() {
    if (isMarkingAllRead.value || !hasUnreadNotifications.value) {
      return
    }

    isMarkingAllRead.value = true

    try {
      const response = await markAllNotificationsRead()
      summary.value = {
        ...summary.value,
        unreadCount: response.unreadCount,
      }
      await loadNotificationList({ reset: true })
      ElMessage.success(t('sessionMenu.notifications.markedAllRead'))
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, t('sessionMenu.notifications.markAllReadFailed')))
    }
    finally {
      isMarkingAllRead.value = false
    }
  }

  async function acceptInvitation(invitation: DocumentCollaborationUserInviteNotification) {
    await applyInvitationAction('accept', invitation, async () => {
      const grant = await acceptDocumentCollaborationInvitation(invitation.id)
      ElMessage.success(t('sessionMenu.invitation.accepted'))

      try {
        await workspaceStore.ensurePersonalWorkspace()
        await documentTree.loadTree({ silent: true })
      }
      catch (error) {
        ElMessage.warning(getRequestErrorDisplayMessage(error, t('sessionMenu.invitation.acceptedRefreshFailed')))
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
      ElMessage.success(t('sessionMenu.invitation.declined'))
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
      await refreshNotifications()
    }
    catch (error) {
      const fallbackMessage = action === 'accept'
        ? t('sessionMenu.invitation.acceptFailed')
        : t('sessionMenu.invitation.declineFailed')

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
    activeFilter,
    hasLoaded,
    hasLoadedList,
    hasPendingInvitations,
    hasMoreNotifications,
    hasUnreadNotifications,
    invitationItems,
    isDetailDialogOpen,
    isLoading,
    isLoadingMore,
    isMarkingAllRead,
    loadErrorMessage,
    loadMoreNotifications,
    loadNotificationList,
    loadSummary,
    markAllUnreadNotificationsRead,
    notificationItems,
    pendingInvitationCount,
    popoverVisible,
    refreshNotifications,
    selectedInvitation,
    setNotificationFilter,
    unreadNotificationCount,
    closeInvitationDetail,
    viewInvitation,
  }
}

function toSessionNotificationItem(item: NotificationItem, t: Translate): SessionNotificationItem {
  const documentInviteItem = item.kind === NOTIFICATION_SOURCE_KIND.DOCUMENT_COLLABORATION_USER_INVITE
    ? toSessionInvitationItem(item.documentInvite, t)
    : null

  return {
    ...item,
    title: documentInviteItem
      ? t('sessionMenu.invitation.invitedDocumentTitle', {
          inviter: documentInviteItem.inviterLabel,
          title: documentInviteItem.documentTitle,
        })
      : item.title,
    contentText: documentInviteItem
      ? t('sessionMenu.invitation.invitedDocument', {
          inviter: documentInviteItem.inviterLabel,
        })
      : item.contentText,
    senderLabel: documentInviteItem?.inviterLabel ?? item.sender.displayName,
    receivedLabel: formatNotificationReceivedLabel(item.messageAt),
    documentInviteItem,
  }
}

function toSessionInvitationItem(
  invitation: DocumentCollaborationUserInviteNotification,
  t: Translate,
): SessionNotificationInvitationItem {
  return {
    ...invitation,
    inviterLabel: formatInvitationInviter(invitation, t),
    receivedLabel: formatInvitationReceivedLabel(invitation, t),
  }
}

function formatInvitationInviter(invitation: DocumentCollaborationUserInviteNotification, t: Translate) {
  return invitation.inviter?.displayName || t('sessionMenu.invitation.unknownInviter')
}

function formatInvitationReceivedLabel(invitation: DocumentCollaborationUserInviteNotification, t: Translate) {
  return t('sessionMenu.invitation.receivedAt', {
    time: dayjs(invitation.createdAt).format('YYYY-MM-DD HH:mm'),
  })
}

function formatNotificationReceivedLabel(value: string) {
  return dayjs(value).format('YYYY-MM-DD HH:mm')
}
