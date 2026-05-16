import type {
  PersonalWorkspaceSummary,
  TeamWorkspaceSummary,
  WorkspaceType,
} from '@haohaoxue/samepage-contracts'
import type { DeepReadonly } from 'vue'
import { WORKSPACE_TYPE } from '@haohaoxue/samepage-contracts'
import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'
import {
  createTeamWorkspace,
  deleteWorkspace as deleteWorkspaceRequest,
  getPersonalWorkspace,
  getVisibleTeamWorkspaces,
  updateTeamWorkspaceIcon,
} from '@/apis/workspace'
import { STORAGE_KEY } from '@/utils/storage'

export const WORKSPACE_PERSIST_KEY = STORAGE_KEY.workspace

/**
 * 空间切换列表项。
 */
export interface WorkspaceSwitcherItem {
  /**
   * 标识
   * @description 对应实际 workspace id。
   */
  id: string
  /**
   * 类型
   * @description PERSONAL 或 TEAM。
   */
  type: WorkspaceType
  /**
   * 标题
   * @description 菜单中展示的空间名称。
   */
  label: string
  /**
   * 副标题
   * @description 菜单中的辅助说明。
   */
  description?: string
  /**
   * 图标地址
   * @description 为空时使用名称首字符回退。
   */
  iconUrl: string | null
}

function clonePersonalWorkspace(
  workspace: PersonalWorkspaceSummary,
): PersonalWorkspaceSummary {
  return {
    id: workspace.id,
    type: workspace.type,
    name: workspace.name,
    description: workspace.description,
    iconUrl: workspace.iconUrl,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  }
}

function cloneTeamWorkspace(
  workspace: TeamWorkspaceSummary,
): TeamWorkspaceSummary {
  return {
    id: workspace.id,
    type: workspace.type,
    name: workspace.name,
    description: workspace.description,
    iconUrl: workspace.iconUrl,
    slug: workspace.slug,
    role: workspace.role,
    status: workspace.status,
    joinedAt: workspace.joinedAt,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  }
}

function sortTeamWorkspaces(
  workspaces: readonly TeamWorkspaceSummary[],
  lastVisitedAtByWorkspaceId: Readonly<Record<string, number>>,
) {
  return [...workspaces].sort((left, right) => {
    const leftLastVisitedAt = lastVisitedAtByWorkspaceId[left.id] ?? null
    const rightLastVisitedAt = lastVisitedAtByWorkspaceId[right.id] ?? null

    if (leftLastVisitedAt !== null || rightLastVisitedAt !== null) {
      if (leftLastVisitedAt === null) {
        return 1
      }

      if (rightLastVisitedAt === null) {
        return -1
      }

      if (leftLastVisitedAt !== rightLastVisitedAt) {
        return rightLastVisitedAt - leftLastVisitedAt
      }
    }

    return Date.parse(right.createdAt) - Date.parse(left.createdAt)
  })
}

function pruneWorkspaceLastVisitedAtById(
  lastVisitedAtByWorkspaceId: Readonly<Record<string, number>>,
  teamWorkspaceIds: readonly string[],
) {
  const teamWorkspaceIdSet = new Set(teamWorkspaceIds)

  return Object.fromEntries(
    Object.entries(lastVisitedAtByWorkspaceId).filter(([workspaceId]) => teamWorkspaceIdSet.has(workspaceId)),
  )
}

export const useWorkspaceStore = defineStore('workspace', () => {
  const _personalWorkspace = shallowRef<PersonalWorkspaceSummary | null>(null)
  const _teamWorkspaces = shallowRef<TeamWorkspaceSummary[]>([])
  const _teamWorkspaceLastVisitedAtById = shallowRef<Record<string, number>>({})
  const _selectedWorkspaceId = shallowRef<string | null>(null)
  const sortedTeamWorkspaces = computed(() =>
    sortTeamWorkspaces(_teamWorkspaces.value, _teamWorkspaceLastVisitedAtById.value),
  )
  const personalWorkspace = computed<DeepReadonly<PersonalWorkspaceSummary> | null>(() =>
    _personalWorkspace.value as DeepReadonly<PersonalWorkspaceSummary> | null,
  )
  const teamWorkspaces = computed<DeepReadonly<TeamWorkspaceSummary[]>>(() =>
    sortedTeamWorkspaces.value as DeepReadonly<TeamWorkspaceSummary[]>,
  )
  const currentWorkspace = computed<DeepReadonly<PersonalWorkspaceSummary | TeamWorkspaceSummary> | null>(() => {
    const selectedTeamWorkspace = _teamWorkspaces.value.find(workspace => workspace.id === _selectedWorkspaceId.value)

    if (selectedTeamWorkspace) {
      return selectedTeamWorkspace as DeepReadonly<TeamWorkspaceSummary>
    }

    if (_personalWorkspace.value) {
      return _personalWorkspace.value as DeepReadonly<PersonalWorkspaceSummary>
    }

    return null
  })
  const currentWorkspaceType = computed(() => currentWorkspace.value?.type ?? WORKSPACE_TYPE.PERSONAL)
  const currentWorkspaceLabel = computed(() =>
    currentWorkspace.value?.type === WORKSPACE_TYPE.TEAM
      ? currentWorkspace.value.name
      : '我的空间',
  )
  const switchableWorkspaces = computed<DeepReadonly<WorkspaceSwitcherItem[]>>(() => {
    const items: WorkspaceSwitcherItem[] = []

    if (_personalWorkspace.value) {
      items.push({
        id: _personalWorkspace.value.id,
        type: WORKSPACE_TYPE.PERSONAL,
        label: '我的空间',
        iconUrl: _personalWorkspace.value.iconUrl,
      })
    }

    items.push(...sortedTeamWorkspaces.value.map(workspace => ({
      id: workspace.id,
      type: WORKSPACE_TYPE.TEAM,
      label: workspace.name,
      description: workspace.description ?? undefined,
      iconUrl: workspace.iconUrl,
    })))

    return items as DeepReadonly<WorkspaceSwitcherItem[]>
  })

  function clear() {
    _personalWorkspace.value = null
    _teamWorkspaces.value = []
    _teamWorkspaceLastVisitedAtById.value = {}
    _selectedWorkspaceId.value = null
  }

  function setPersonalWorkspace(nextWorkspace: PersonalWorkspaceSummary) {
    _personalWorkspace.value = clonePersonalWorkspace(nextWorkspace)
    normalizeSelectedWorkspace()
  }

  function setTeamWorkspaces(nextWorkspaces: TeamWorkspaceSummary[]) {
    _teamWorkspaces.value = nextWorkspaces.map(item => cloneTeamWorkspace(item))
    _teamWorkspaceLastVisitedAtById.value = pruneWorkspaceLastVisitedAtById(
      _teamWorkspaceLastVisitedAtById.value,
      _teamWorkspaces.value.map(workspace => workspace.id),
    )
    normalizeSelectedWorkspace()
  }

  async function refreshVisibleWorkspaces() {
    const [nextPersonalWorkspace, nextTeamWorkspaces] = await Promise.all([
      getPersonalWorkspace(),
      getVisibleTeamWorkspaces(),
    ])
    setVisibleWorkspaces({
      personalWorkspace: nextPersonalWorkspace,
      teamWorkspaces: nextTeamWorkspaces,
    })
  }

  function upsertTeamWorkspace(nextWorkspace: TeamWorkspaceSummary) {
    const nextTeamWorkspace = cloneTeamWorkspace(nextWorkspace)
    const existingIndex = _teamWorkspaces.value.findIndex(workspace => workspace.id === nextWorkspace.id)

    if (existingIndex === -1) {
      _teamWorkspaces.value = [nextTeamWorkspace, ..._teamWorkspaces.value]
      normalizeSelectedWorkspace()
      return nextTeamWorkspace
    }

    const nextWorkspaces = [..._teamWorkspaces.value]
    nextWorkspaces.splice(existingIndex, 1)
    _teamWorkspaces.value = [nextTeamWorkspace, ...nextWorkspaces]
    normalizeSelectedWorkspace()
    return nextTeamWorkspace
  }

  async function createWorkspace(payload: {
    name: string
    description?: string
  }) {
    const workspace = await createTeamWorkspace({
      name: payload.name,
      description: payload.description,
    })

    return upsertTeamWorkspace(workspace)
  }

  async function uploadWorkspaceIcon(workspaceId: string, file: File) {
    const workspace = await updateTeamWorkspaceIcon(workspaceId, file)
    return upsertTeamWorkspace(workspace)
  }

  async function deleteWorkspace(workspaceId: string) {
    await deleteWorkspaceRequest(workspaceId)
    _teamWorkspaces.value = _teamWorkspaces.value.filter(workspace => workspace.id !== workspaceId)
    _teamWorkspaceLastVisitedAtById.value = pruneWorkspaceLastVisitedAtById(
      _teamWorkspaceLastVisitedAtById.value,
      _teamWorkspaces.value.map(workspace => workspace.id),
    )
    normalizeSelectedWorkspace()
  }

  function selectWorkspace(workspaceId: string) {
    if (_personalWorkspace.value?.id === workspaceId) {
      _selectedWorkspaceId.value = workspaceId
      return
    }

    if (_teamWorkspaces.value.some(workspace => workspace.id === workspaceId)) {
      _selectedWorkspaceId.value = workspaceId
      _teamWorkspaceLastVisitedAtById.value = {
        ..._teamWorkspaceLastVisitedAtById.value,
        [workspaceId]: Date.now(),
      }
      return
    }

    normalizeSelectedWorkspace()
  }

  function selectPersonalWorkspace() {
    if (!_personalWorkspace.value) {
      return
    }

    _selectedWorkspaceId.value = _personalWorkspace.value.id
  }

  function normalizeSelectedWorkspace() {
    if (_personalWorkspace.value?.id === _selectedWorkspaceId.value) {
      return
    }

    if (_teamWorkspaces.value.some(workspace => workspace.id === _selectedWorkspaceId.value)) {
      return
    }

    _selectedWorkspaceId.value = _personalWorkspace.value?.id ?? null
  }

  function setVisibleWorkspaces(payload: {
    personalWorkspace: PersonalWorkspaceSummary
    teamWorkspaces: TeamWorkspaceSummary[]
  }) {
    const previousSelectedWorkspaceId = _selectedWorkspaceId.value

    _personalWorkspace.value = clonePersonalWorkspace(payload.personalWorkspace)
    _teamWorkspaces.value = payload.teamWorkspaces.map(item => cloneTeamWorkspace(item))
    _teamWorkspaceLastVisitedAtById.value = pruneWorkspaceLastVisitedAtById(
      _teamWorkspaceLastVisitedAtById.value,
      _teamWorkspaces.value.map(workspace => workspace.id),
    )

    if (
      previousSelectedWorkspaceId === _personalWorkspace.value.id
      || _teamWorkspaces.value.some(workspace => workspace.id === previousSelectedWorkspaceId)
    ) {
      _selectedWorkspaceId.value = previousSelectedWorkspaceId
      return
    }

    normalizeSelectedWorkspace()
  }

  return {
    _personalWorkspace,
    _selectedWorkspaceId,
    _teamWorkspaceLastVisitedAtById,
    _teamWorkspaces,
    currentWorkspace,
    currentWorkspaceLabel,
    currentWorkspaceType,
    deleteWorkspace,
    personalWorkspace,
    selectPersonalWorkspace,
    selectWorkspace,
    switchableWorkspaces,
    teamWorkspaces,
    uploadWorkspaceIcon,
    upsertTeamWorkspace,
    clear,
    createWorkspace,
    normalizeSelectedWorkspace,
    refreshVisibleWorkspaces,
    setPersonalWorkspace,
    setVisibleWorkspaces,
    setTeamWorkspaces,
  }
}, {
  persist: {
    key: WORKSPACE_PERSIST_KEY,
    pick: ['_selectedWorkspaceId', '_teamWorkspaceLastVisitedAtById'],
  },
})
