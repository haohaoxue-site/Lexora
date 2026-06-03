import type { AppearancePreference } from '@haohaoxue/samepage-contracts'
import type { SessionContextSwitchAction, SessionMenuUser } from './typing'
import {
  APPEARANCE_PREFERENCE_LABELS,
  APPEARANCE_PREFERENCE_VALUES,
} from '@haohaoxue/samepage-contracts/user/constants'
import { useClipboard } from '@vueuse/core'
import { computed, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { SvgIconCategory } from '@/components/svg-icon/typing'
import { useSessionNotificationBell } from '@/layouts/components/session-notification-bell/useSessionNotificationBell'
import { useAuthSession } from '@/layouts/composables/useAuthSession'
import { getWorkspaceEntryPath } from '@/layouts/utils/workspace-entry'
import { ADMIN_ROUTE_NAME } from '@/router/constants'
import { useUserStore } from '@/stores/user'
import { ElMessage } from '@/utils/element-plus'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'

/**
 * 会话菜单组合参数。
 */
interface UseSessionUserMenuOptions {
  showContextSwitch: boolean
}

type SessionMenuPanel = 'appearance' | 'notifications' | null

export function useSessionUserMenu(options: UseSessionUserMenuOptions) {
  const route = useRoute()
  const router = useRouter()
  const userStore = useUserStore()
  const menuVisible = shallowRef(false)
  const activeSubmenu = shallowRef<SessionMenuPanel>(null)
  const { currentUser: sessionUser, isLoggingOut, logout } = useAuthSession()
  const {
    acceptInvitation,
    actingInvitationAction,
    actingInvitationId,
    closeInvitationDetail,
    declineInvitation,
    hasLoaded,
    hasPendingInvitations,
    invitationItems,
    isDetailDialogOpen,
    isLoading,
    loadErrorMessage,
    loadSummary,
    pendingInvitationCount,
    selectedInvitation,
    viewInvitation,
  } = useSessionNotificationBell()
  const lastKnownUser = shallowRef(sessionUser.value)
  const {
    copy,
    copied: copiedUserCode,
    isSupported: isClipboardSupported,
  } = useClipboard({
    copiedDuring: 1400,
    legacy: true,
  })

  const appearanceOptions = APPEARANCE_PREFERENCE_VALUES.map(value => ({
    label: APPEARANCE_PREFERENCE_LABELS[value],
    value,
  }))
  const appearanceMenuVisible = computed(() => activeSubmenu.value === 'appearance')
  const notificationPanelVisible = computed(() => activeSubmenu.value === 'notifications')
  const currentUser = computed<SessionMenuUser>(() => {
    const user = sessionUser.value ?? lastKnownUser.value!

    return {
      displayName: user.displayName,
      email: user.email ?? '',
      avatarUrl: user.avatarUrl,
      userCode: user.userCode,
    }
  })
  const isAdminRoute = computed(() => Boolean(route.meta?.requiresSystemAdmin))
  const contextSwitchAction = computed<SessionContextSwitchAction | null>(() => {
    if (!options.showContextSwitch) {
      return null
    }

    if (isAdminRoute.value) {
      return {
        label: '进入工作区',
        iconCategory: SvgIconCategory.UI,
        icon: 'arrow-left',
      }
    }

    if (userStore.isSystemAdmin) {
      return {
        label: '进入管理区',
        iconCategory: SvgIconCategory.UI,
        icon: 'user-admin',
      }
    }

    return null
  })
  const currentAppearance = computed(() => userStore.preferences.appearance)
  const currentAppearanceLabel = computed(() => APPEARANCE_PREFERENCE_LABELS[currentAppearance.value])
  const isSavingAppearance = computed(() => userStore.isSavingAppearance)

  watch(sessionUser, (user) => {
    if (user) {
      lastKnownUser.value = user
    }
  })

  watch(menuVisible, (visible) => {
    if (!visible) {
      activeSubmenu.value = null
    }
  })

  return {
    menuVisible,
    appearanceMenuVisible,
    isLoggingOut,
    appearanceOptions,
    currentUser,
    contextSwitchAction,
    currentAppearance,
    currentAppearanceLabel,
    isSavingAppearance,
    toggleAppearanceMenu,
    notificationPanelVisible,
    hasLoadedNotifications: hasLoaded,
    isLoadingNotifications: isLoading,
    loadNotificationError: loadErrorMessage,
    hasPendingInvitations,
    invitationItems,
    pendingInvitationCount,
    actingInvitationId,
    actingInvitationAction,
    selectedInvitation,
    isDetailDialogOpen,
    copiedUserCode,
    toggleNotificationPanel,
    refreshNotifications,
    handleCopyUserCode,
    handleViewInvitation,
    handleAcceptInvitation,
    handleDeclineInvitation,
    closeInvitationDetail,
    handleAppearanceSelect,
    switchContext,
    handleLogout,
    getLogoutIconName,
  }

  function toggleAppearanceMenu() {
    if (isSavingAppearance.value) {
      return
    }

    toggleSubmenu('appearance')
  }

  async function toggleNotificationPanel() {
    const nextVisible = activeSubmenu.value !== 'notifications'
    toggleSubmenu('notifications')

    if (nextVisible) {
      await loadSummary()
    }
  }

  function toggleSubmenu(target: NonNullable<SessionMenuPanel>) {
    activeSubmenu.value = activeSubmenu.value === target ? null : target
  }

  function closeMenu() {
    activeSubmenu.value = null
    menuVisible.value = false
  }

  async function handleAppearanceSelect(mode: AppearancePreference) {
    if (isSavingAppearance.value || currentAppearance.value === mode) {
      return
    }

    try {
      await userStore.updateAppearancePreference(mode)
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '保存外观偏好失败'))
    }
  }

  async function switchContext() {
    closeMenu()

    if (isAdminRoute.value) {
      await router.push(getWorkspaceEntryPath())
      return
    }

    await router.push({ name: ADMIN_ROUTE_NAME })
  }

  async function handleLogout() {
    closeMenu()
    await logout()
  }

  async function refreshNotifications() {
    await loadSummary()
  }

  async function handleCopyUserCode() {
    if (!isClipboardSupported.value) {
      ElMessage.error('当前环境不支持复制')
      return
    }

    try {
      await copy(currentUser.value.userCode)
      ElMessage.success('协作码已复制')
    }
    catch {
      ElMessage.error('复制失败')
    }
  }

  function handleViewInvitation(...args: Parameters<typeof viewInvitation>) {
    viewInvitation(...args)
  }

  async function handleAcceptInvitation(...args: Parameters<typeof acceptInvitation>) {
    await acceptInvitation(...args)
    closeMenu()
  }

  async function handleDeclineInvitation(...args: Parameters<typeof declineInvitation>) {
    await declineInvitation(...args)
  }

  function getLogoutIconName() {
    return isLoggingOut.value
      ? 'spinner-orbit'
      : 'logout'
  }
}
