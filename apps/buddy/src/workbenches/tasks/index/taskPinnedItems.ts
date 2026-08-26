import type { DesktopTaskPinnedItem } from '@buddy-electron/shared/desktopApi'
import type { LocalConversationSummary, LocalProject } from '@buddy-electron/shared/localChatApi'

export type TaskIndexRow
  = | {
    key: string
    kind: 'project'
    pinKey?: string
    pinnedTopLevel?: boolean
    project: LocalProject
  }
  | {
    task: LocalConversationSummary
    key: string
    kind: 'task'
    pinKey?: string
    pinnedTopLevel?: boolean
    projectTask?: boolean
  }

export interface TaskIndexProjection {
  pinnedItems: DesktopTaskPinnedItem[]
  pinnedRows: TaskIndexRow[]
  projectRows: TaskIndexRow[]
  globalTasks: LocalConversationSummary[]
}

export type DesktopTaskPinnedDropPosition = 'after' | 'before'

export function resolveTaskIndexProjection(input: {
  expandedProjectIds: ReadonlySet<string>
  pinnedItems: ReadonlyArray<DesktopTaskPinnedItem>
  projects: ReadonlyArray<LocalProject>
  tasks: ReadonlyArray<LocalConversationSummary>
}): TaskIndexProjection {
  const activeProjects = input.projects.filter(project => project.revokedAt === null)
  const projectsById = new Map(activeProjects.map(project => [project.id, project]))
  const globalTasks = input.tasks.filter(task => task.projectId === null)
  const globalTasksById = new Map(globalTasks.map(task => [task.id, task]))
  const tasksByProject = new Map<string, LocalConversationSummary[]>()

  for (const task of input.tasks) {
    if (!task.projectId)
      continue
    const tasks = tasksByProject.get(task.projectId) ?? []
    tasks.push(task)
    tasksByProject.set(task.projectId, tasks)
  }

  const pinnedItems = resolveVisiblePinnedItems({
    items: input.pinnedItems,
    projectsById,
    tasksById: globalTasksById,
  })
  const pinnedProjectIds = new Set(pinnedItems
    .filter(item => item.kind === 'project')
    .map(item => item.id))
  const pinnedConversationIds = new Set(pinnedItems
    .filter(item => item.kind === 'conversation')
    .map(item => item.id))

  return {
    pinnedItems,
    pinnedRows: pinnedItems.flatMap((item) => {
      const pinKey = getDesktopTaskPinnedItemKey(item)
      if (item.kind === 'conversation') {
        return [{
          task: globalTasksById.get(item.id)!,
          key: `pinned:${pinKey}`,
          kind: 'task' as const,
          pinKey,
          pinnedTopLevel: true,
        }]
      }

      const project = projectsById.get(item.id)!
      const rows: TaskIndexRow[] = [{
        key: `pinned:${pinKey}`,
        kind: 'project',
        pinKey,
        pinnedTopLevel: true,
        project,
      }]
      if (!input.expandedProjectIds.has(project.id))
        return rows
      const projectTasks = tasksByProject.get(project.id) ?? []
      return rows.concat(projectTasks.map(task => ({
        task,
        key: `pinned:${pinKey}:conversation:${task.id}`,
        kind: 'task' as const,
        pinKey,
        projectTask: true,
      })))
    }),
    projectRows: activeProjects
      .filter(project => !pinnedProjectIds.has(project.id))
      .flatMap(project => createProjectRows(
        project,
        tasksByProject.get(project.id) ?? [],
        input.expandedProjectIds.has(project.id),
      )),
    globalTasks: globalTasks.filter(task => !pinnedConversationIds.has(task.id)),
  }
}

export function prependDesktopTaskPinnedItem(
  items: ReadonlyArray<DesktopTaskPinnedItem>,
  item: DesktopTaskPinnedItem,
): DesktopTaskPinnedItem[] {
  const key = getDesktopTaskPinnedItemKey(item)
  return items.some(candidate => getDesktopTaskPinnedItemKey(candidate) === key)
    ? [...items]
    : [item, ...items]
}

export function removeDesktopTaskPinnedItem(
  items: ReadonlyArray<DesktopTaskPinnedItem>,
  key: string,
): DesktopTaskPinnedItem[] {
  return items.filter(item => getDesktopTaskPinnedItemKey(item) !== key)
}

export function reorderDesktopTaskPinnedItems(
  items: ReadonlyArray<DesktopTaskPinnedItem>,
  sourceKey: string,
  targetKey: string,
  position: DesktopTaskPinnedDropPosition,
): DesktopTaskPinnedItem[] {
  const sourceIndex = items.findIndex(item => getDesktopTaskPinnedItemKey(item) === sourceKey)
  const targetIndex = items.findIndex(item => getDesktopTaskPinnedItemKey(item) === targetKey)
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex)
    return [...items]

  const next = [...items]
  const [source] = next.splice(sourceIndex, 1)
  const nextTargetIndex = next.findIndex(item => getDesktopTaskPinnedItemKey(item) === targetKey)
  if (nextTargetIndex < 0)
    return [...items]
  next.splice(position === 'after' ? nextTargetIndex + 1 : nextTargetIndex, 0, source)
  return next
}

export function getDesktopTaskPinnedItemKey(item: DesktopTaskPinnedItem): string {
  return `${item.kind}:${item.id}`
}

function createProjectRows(
  project: LocalProject,
  tasks: ReadonlyArray<LocalConversationSummary>,
  expanded: boolean,
): TaskIndexRow[] {
  const rows: TaskIndexRow[] = [{
    key: `project:${project.id}`,
    kind: 'project',
    project,
  }]
  if (!expanded)
    return rows
  return rows.concat(tasks.map(task => ({
    task,
    key: `project:${project.id}:conversation:${task.id}`,
    kind: 'task' as const,
    projectTask: true,
  })))
}

function resolveVisiblePinnedItems(input: {
  items: ReadonlyArray<DesktopTaskPinnedItem>
  projectsById: ReadonlyMap<string, LocalProject>
  tasksById: ReadonlyMap<string, LocalConversationSummary>
}): DesktopTaskPinnedItem[] {
  const keys = new Set<string>()
  return input.items.filter((item) => {
    const key = getDesktopTaskPinnedItemKey(item)
    if (keys.has(key))
      return false
    const exists = item.kind === 'project'
      ? input.projectsById.has(item.id)
      : input.tasksById.has(item.id)
    if (exists)
      keys.add(key)
    return exists
  })
}
