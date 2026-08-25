export const DESKTOP_CHAT_SIDEBAR_LIST_PADDING_TOP = 4
export const DESKTOP_CHAT_SIDEBAR_ROW_HEIGHT = 36
export const DESKTOP_CHAT_SIDEBAR_ROW_SIZE = 40
export const DESKTOP_CHAT_SIDEBAR_SECTION_HEADER_SIZE = DESKTOP_CHAT_SIDEBAR_ROW_HEIGHT

export const DESKTOP_CHAT_SIDEBAR_SECTION_PRIORITIES = {
  pinned: 2,
  projects: 1,
  tasks: 1,
} as const

export type DesktopChatSidebarSectionLayoutMode = 'collapsed' | 'weighted'

export interface DesktopChatSidebarSectionLayout {
  mode: DesktopChatSidebarSectionLayoutMode
  naturalSize: string
  priority: number
}

export function resolveDesktopChatSidebarSectionLayout(input: {
  expanded: boolean
  priority: number
  rowCount: number
}): DesktopChatSidebarSectionLayout {
  const listSize = input.rowCount > 0
    ? DESKTOP_CHAT_SIDEBAR_LIST_PADDING_TOP + input.rowCount * DESKTOP_CHAT_SIDEBAR_ROW_SIZE
    : 0
  const naturalSize = DESKTOP_CHAT_SIDEBAR_SECTION_HEADER_SIZE + (input.expanded ? listSize : 0)

  if (!input.expanded)
    return { mode: 'collapsed', naturalSize: `${naturalSize}px`, priority: input.priority }

  return {
    mode: 'weighted',
    naturalSize: `${naturalSize}px`,
    priority: input.priority,
  }
}
