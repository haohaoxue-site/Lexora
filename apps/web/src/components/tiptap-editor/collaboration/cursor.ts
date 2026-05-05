import type { CollabAwarenessState } from '@haohaoxue/samepage-contracts'
import type { DecorationAttrs } from '@tiptap/pm/view'

const CURSOR_COLOR_PALETTE = [
  '#2563eb',
  '#0f766e',
  '#7c3aed',
  '#dc2626',
  '#ca8a04',
  '#0f766e',
  '#be185d',
  '#1d4ed8',
] as const
const CURSOR_INITIALS_SEPARATOR_PATTERN = /\s+/

/** 协作光标展示用户。 */
export interface TiptapCollaborationCursorUser {
  /** 用户 ID */
  id: string
  /** 展示名 */
  name: string
  /** 头像地址 */
  avatarUrl: string | null
  /** 光标颜色 */
  color: string
  /** 头像兜底缩写 */
  initials: string
}

export function createTiptapCollaborationCursorUser(
  awarenessState: CollabAwarenessState,
): TiptapCollaborationCursorUser {
  const { user } = awarenessState

  return {
    id: user.id,
    name: user.displayName,
    avatarUrl: user.avatarUrl,
    color: resolveCursorColor(user.id),
    initials: resolveCursorInitials(user.displayName),
  }
}

export function renderTiptapCollaborationCursor(user: Record<string, unknown>) {
  const cursor = document.createElement('span')
  const label = document.createElement('span')
  const identity = document.createElement(user.avatarUrl ? 'img' : 'span')
  const name = document.createElement('span')
  const color = typeof user.color === 'string' && user.color.length > 0
    ? user.color
    : CURSOR_COLOR_PALETTE[0]

  cursor.className = 'samepage-collaboration-cursor'
  cursor.style.borderColor = color

  label.className = 'samepage-collaboration-cursor__label'
  label.style.backgroundColor = color

  if (identity instanceof HTMLImageElement) {
    identity.className = 'samepage-collaboration-cursor__avatar'
    identity.alt = ''
    identity.src = typeof user.avatarUrl === 'string' ? user.avatarUrl : ''
    identity.referrerPolicy = 'no-referrer'
  }
  else {
    identity.className = 'samepage-collaboration-cursor__avatar samepage-collaboration-cursor__avatar--fallback'
    identity.textContent = typeof user.initials === 'string' && user.initials.length > 0
      ? user.initials
      : '?'
  }

  name.className = 'samepage-collaboration-cursor__name'
  name.textContent = typeof user.name === 'string' && user.name.length > 0
    ? user.name
    : '协作者'

  label.append(identity, name)
  cursor.append(label)

  return cursor
}

export function renderTiptapCollaborationSelection(user: Record<string, unknown>): DecorationAttrs {
  const color = typeof user.color === 'string' && user.color.length > 0
    ? user.color
    : CURSOR_COLOR_PALETTE[0]

  return {
    class: 'samepage-collaboration-cursor__selection',
    style: `background-color: ${resolveCursorSelectionColor(color)};`,
  }
}

function resolveCursorColor(input: string) {
  let hash = 0

  for (const char of input) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  }

  return CURSOR_COLOR_PALETTE[hash % CURSOR_COLOR_PALETTE.length]
}

function resolveCursorInitials(displayName: string) {
  const compactName = displayName.trim()

  if (!compactName) {
    return '?'
  }

  return compactName
    .split(CURSOR_INITIALS_SEPARATOR_PATTERN)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2)
}

function resolveCursorSelectionColor(color: string) {
  const normalized = color.replace('#', '')

  if (normalized.length !== 6) {
    return 'rgba(37, 99, 235, 0.16)'
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16)
  const green = Number.parseInt(normalized.slice(2, 4), 16)
  const blue = Number.parseInt(normalized.slice(4, 6), 16)

  return `rgba(${red}, ${green}, ${blue}, 0.16)`
}
