import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type { LocalProject } from '@buddy-electron/shared/localChatApi'
import type { LocalCapabilitiesStore } from '@/stores/useLocalCapabilitiesStore'
import type { ChatComposerContextOptions } from '@/workbenches/chat/composer/chatComposerInput'
import type { useChatDrafts } from '@/workbenches/chat/state/useChatDrafts'
import { computed, readonly } from 'vue'

interface ValueRef<T> {
  readonly value: T
}

export interface TaskProjectInput {
  instructions: string
  memoryScope: 'personal_and_project' | 'project_only'
  name: string
  root: string
}

interface UseTaskProjectsOptions {
  activateDraftScope: (projectId: string | null, preserveCurrent?: boolean) => void
  api: LexoraDesktopApi['localChat']
  drafts: ReturnType<typeof useChatDrafts>
  localCapabilities: LocalCapabilitiesStore
  onError: (error: unknown) => void
  persistWorkspaceState: () => Promise<boolean>
  projectId: ValueRef<string | null>
  projects: ValueRef<ReadonlyArray<LocalProject>>
  refreshIndex: () => Promise<void>
  selectDefaultModel: () => void
}

export function useTaskProjects(options: UseTaskProjectsOptions) {
  const activeProject = computed(() => options.projects.value.find(
    project => project.id === options.projectId.value,
  ) ?? null)
  const workingDirectory = computed(() => activeProject.value?.root ?? null)
  const scope = computed(() => activeProject.value ? 'project' as const : 'global' as const)

  async function activateProjectDraft(projectId: string) {
    const project = options.projects.value.find(
      item => item.id === projectId && item.revokedAt === null,
    )
    if (!project)
      return
    options.activateDraftScope(project.id)
    options.selectDefaultModel()
    await options.persistWorkspaceState()
  }

  async function createProject(input: TaskProjectInput) {
    try {
      const project = await options.api.projects.create(input)
      await options.refreshIndex()
      await activateProjectDraft(project.id)
      return true
    }
    catch (error) {
      options.onError(error)
      return false
    }
  }

  async function updateProject(input: TaskProjectInput & { projectId: string }) {
    try {
      await options.api.projects.update(input)
      await options.refreshIndex()
      if (options.projectId.value === input.projectId)
        await options.localCapabilities.loadSkills(input.projectId)
      return true
    }
    catch (error) {
      options.onError(error)
      return false
    }
  }

  async function deleteProject(projectId: string) {
    try {
      await options.api.projects.delete(projectId)
      await options.drafts.discard(`project:${projectId}`)
      if (options.projectId.value === projectId)
        options.activateDraftScope(null, false)
      await options.refreshIndex()
      await options.persistWorkspaceState()
      return true
    }
    catch (error) {
      options.onError(error)
      return false
    }
  }

  async function selectProjectDirectory(): Promise<string | null> {
    try {
      return await options.api.projects.selectDirectory()
    }
    catch (error) {
      options.onError(error)
      return null
    }
  }

  async function listContextOptions(fileQuery: string | null): Promise<ChatComposerContextOptions> {
    await options.localCapabilities.loadSkills(options.projectId.value)
    const files = options.projectId.value
      ? await options.api.projects.searchFiles(options.projectId.value, fileQuery ?? '')
      : []
    return {
      files: files.map(file => ({
        description: file.relativePath,
        kind: 'file' as const,
        label: file.name,
        path: file.relativePath,
        value: file.relativePath,
      })),
      skills: options.localCapabilities.skills.value.skills
        .filter(skill => skill.enabled)
        .map(skill => ({
          description: skill.description,
          kind: 'skill' as const,
          label: skill.name,
          path: null,
          value: skill.name,
        })),
    }
  }

  return {
    activeProject: readonly(activeProject),
    createProject,
    deleteProject,
    listContextOptions,
    scope: readonly(scope),
    activateProjectDraft,
    selectProjectDirectory,
    updateProject,
    workingDirectory: readonly(workingDirectory),
  }
}
