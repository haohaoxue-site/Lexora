import type { AppearancePreference } from '@haohaoxue/samepage-contracts'
import type { WorkspaceCreateDialogSubmitPayload } from '../workspace-create-dialog/typing'
import type { SessionContextSwitchAction, SessionMenuUser } from './typing'
import {
  APPEARANCE_PREFERENCE_LABELS,
  APPEARANCE_PREFERENCE_VALUES,
  WORKSPACE_TYPE,
} from '@haohaoxue/samepage-contracts'
import { ElMessage } from 'element-plus'
import { computed, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { SvgIconCategory } from '@/components/svg-icon/typing'
import { useAuthSession } from '@/layouts/composables/useAuthSession'
import { getWorkspaceEntryPath } from '@/layouts/utils/workspace-entry'
import { DEFAULT_ADMIN_NAVIGATION_ITEM } from '@/router/navigation'
import { useUserStore } from '@/stores/user'
import { useWorkspaceStore } from '@/stores/workspace'
import { getRequestErrorDisplayMessage } from '@/utils/request-error'

/**
 * 会话菜单组合参数。
 */
interface UseSessionUserMenuOptions {
  showContextSwitch: boolean
}

export function useSessionUserMenu(options: UseSessionUserMenuOptions) {
  const route = useRoute()
  const router = useRouter()
  const userStore = useUserStore()
  const workspaceStore = useWorkspaceStore()
  const menuVisible = shallowRef(false)
  const appearanceMenuVisible = shallowRef(false)
  const workspaceMenuVisible = shallowRef(false)
  const teamSettingsDialogVisible = shallowRef(false)
  const workspaceCreateDialogVisible = shallowRef(false)
  const isCreatingWorkspace = shallowRef(false)
  const { currentUser: sessionUser, isLoggingOut, logout } = useAuthSession()
  const sessionUserSnapshot = shallowRef(sessionUser.value)

  const appearanceOptions = APPEARANCE_PREFERENCE_VALUES.map(value => ({
    label: APPEARANCE_PREFERENCE_LABELS[value],
    value,
  }))
  const resolvedSessionUser = computed(() => sessionUser.value ?? sessionUserSnapshot.value!)
  const currentUser = computed<SessionMenuUser>(() => {
    const user = resolvedSessionUser.value

    return {
      displayName: user.displayName,
      email: user.email ?? '',
      avatarUrl: user.avatarUrl,
    }
  })
  const isAdminRoute = computed(() => route.path.startsWith('/admin'))
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
  const currentWorkspaceLabel = computed(() => workspaceStore.currentWorkspaceLabel)
  const currentWorkspaceId = computed(() => workspaceStore.currentWorkspace?.id ?? '')
  const currentTeamWorkspace = computed(() =>
    workspaceStore.currentWorkspace?.type === WORKSPACE_TYPE.TEAM
      ? workspaceStore.currentWorkspace
      : null,
  )
  const switchableWorkspaces = computed(() => workspaceStore.switchableWorkspaces)

  watch(sessionUser, (user) => {
    if (user) {
      sessionUserSnapshot.value = user
    }
  }, {
    immediate: true,
  })

  watch(menuVisible, (visible) => {
    if (!visible) {
      appearanceMenuVisible.value = false
      workspaceMenuVisible.value = false
    }
  })

  return {
    menuVisible,
    appearanceMenuVisible,
    workspaceMenuVisible,
    teamSettingsDialogVisible,
    workspaceCreateDialogVisible,
    isCreatingWorkspace,
    isLoggingOut,
    appearanceOptions,
    currentUser,
    contextSwitchAction,
    currentAppearance,
    currentAppearanceLabel,
    isSavingAppearance,
    currentWorkspaceLabel,
    currentWorkspaceId,
    currentTeamWorkspace,
    switchableWorkspaces,
    toggleAppearanceMenu,
    toggleWorkspaceMenu,
    openWorkspaceCreateDialog,
    openTeamSettingsDialog,
    handleAppearanceSelect,
    handleWorkspaceCreate,
    switchContext,
    openUserSettings,
    handleLogout,
    handleWorkspaceSelect,
    getLogoutIconName,
  }

  function toggleAppearanceMenu() {
    if (isSavingAppearance.value) {
      return
    }

    workspaceMenuVisible.value = false
    appearanceMenuVisible.value = !appearanceMenuVisible.value
  }

  function toggleWorkspaceMenu() {
    appearanceMenuVisible.value = false
    workspaceMenuVisible.value = !workspaceMenuVisible.value
  }

  function openWorkspaceCreateDialog() {
    workspaceCreateDialogVisible.value = true
    appearanceMenuVisible.value = false
    workspaceMenuVisible.value = false
    menuVisible.value = false
  }

  function openTeamSettingsDialog() {
    if (!currentTeamWorkspace.value) {
      return
    }

    appearanceMenuVisible.value = false
    workspaceMenuVisible.value = false
    teamSettingsDialogVisible.value = true
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

  async function handleWorkspaceCreate(payload: WorkspaceCreateDialogSubmitPayload) {
    if (isCreatingWorkspace.value) {
      return
    }

    isCreatingWorkspace.value = true

    try {
      const createdWorkspace = await workspaceStore.createWorkspace({
        name: payload.name,
        description: payload.description,
      })
      let selectedWorkspace = createdWorkspace
      let iconUploadError: unknown = null

      if (payload.iconFile) {
        try {
          selectedWorkspace = await workspaceStore.uploadWorkspaceIcon(createdWorkspace.id, payload.iconFile)
        }
        catch (error) {
          iconUploadError = error
        }
      }

      workspaceStore.selectWorkspace(selectedWorkspace.id)
      workspaceCreateDialogVisible.value = false
      ElMessage.success('团队创建成功')

      if (iconUploadError) {
        ElMessage.warning(getRequestErrorDisplayMessage(iconUploadError, '团队已创建，但空间图标上传失败'))
      }
    }
    catch (error) {
      ElMessage.error(getRequestErrorDisplayMessage(error, '创建团队失败'))
    }
    finally {
      isCreatingWorkspace.value = false
    }
  }

  async function switchContext() {
    appearanceMenuVisible.value = false
    workspaceMenuVisible.value = false
    menuVisible.value = false

    if (isAdminRoute.value) {
      await router.push(getWorkspaceEntryPath())
      return
    }

    await router.push(DEFAULT_ADMIN_NAVIGATION_ITEM.path)
  }

  async function openUserSettings() {
    appearanceMenuVisible.value = false
    workspaceMenuVisible.value = false
    menuVisible.value = false
    await router.push('/user')
  }

  async function handleLogout() {
    appearanceMenuVisible.value = false
    workspaceMenuVisible.value = false
    menuVisible.value = false
    await logout()
  }

  function handleWorkspaceSelect(workspaceId: string) {
    workspaceStore.selectWorkspace(workspaceId)
    appearanceMenuVisible.value = false
    workspaceMenuVisible.value = false
    menuVisible.value = false
  }

  function getLogoutIconName() {
    return isLoggingOut.value
      ? 'spinner-orbit'
      : 'logout'
  }
}
