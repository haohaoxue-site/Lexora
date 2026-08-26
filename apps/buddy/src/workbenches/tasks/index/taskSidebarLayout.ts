export const DESKTOP_TASK_SIDEBAR_LIST_PADDING_TOP = 2
export const DESKTOP_TASK_SIDEBAR_ROW_HEIGHT = 34
export const DESKTOP_TASK_SIDEBAR_ROW_SIZE = 36
export const DESKTOP_TASK_SIDEBAR_SECTION_HEADER_SIZE = 28

export const DESKTOP_TASK_SIDEBAR_SECTION_PRIORITIES = {
  pinned: 2,
  projects: 1,
  tasks: 1,
} as const

export type DesktopTaskSidebarSectionLayoutMode = 'collapsed' | 'weighted'

export interface DesktopTaskSidebarSectionLayout {
  mode: DesktopTaskSidebarSectionLayoutMode
  naturalSize: string
  priority: number
}

export function resolveDesktopTaskSidebarSectionLayout(input: {
  expanded: boolean
  priority: number
  rowCount: number
}): DesktopTaskSidebarSectionLayout {
  const listSize = input.rowCount > 0
    ? DESKTOP_TASK_SIDEBAR_LIST_PADDING_TOP + input.rowCount * DESKTOP_TASK_SIDEBAR_ROW_SIZE
    : 0
  const naturalSize = DESKTOP_TASK_SIDEBAR_SECTION_HEADER_SIZE + (input.expanded ? listSize : 0)

  if (!input.expanded)
    return { mode: 'collapsed', naturalSize: `${naturalSize}px`, priority: input.priority }

  return {
    mode: 'weighted',
    naturalSize: `${naturalSize}px`,
    priority: input.priority,
  }
}
