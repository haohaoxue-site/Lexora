import type { JSONContent } from '@tiptap/core'
import type { BuddyChatDraftAttachment } from '@/chat/chatAttachmentView'
import type {
  BuddyChatModelSelection,
  BuddyChatPromptContextItem,
  BuddyCodexUserInput,
  BuddyConversation,
  BuddyProject,
  BuddyRun,
  BuddyRuntime,
  StartBuddyAgentTurnRequest,
} from '@/lib/tauriRuntime'
import { createEmptyBuddyComposerContent } from '@/chat/buddyChatInput'

export type BuddyChatWorkspaceScope = 'global' | 'project'

export type BuddyChatWorkspaceTarget
  = | {
    kind: 'draft'
    scope: BuddyChatWorkspaceScope
    projectRoot: string | null
  }
  | {
    conversationId: string
    kind: 'conversation'
  }

export interface BuddyChatDraftState {
  attachments: ReadonlyArray<BuddyChatDraftAttachment>
  contentJSON: JSONContent
  modelSelection: BuddyChatModelSelection | null
  projectRoot: string | null
  scope: BuddyChatWorkspaceScope
}

export interface BuddyChatConversationListItem {
  id: string
  latestRunStatus: BuddyRun['status'] | null
  projectRoot: string | null
  title: string
  updatedAt: string
}

export interface BuddyChatProjectListItem {
  conversations: ReadonlyArray<BuddyChatConversationListItem>
  lastActiveAt: string | null
  name: string
  root: string
}

export interface BuddyChatWorkspaceStatePayload {
  draft: BuddyChatDraftState
  lastTarget: BuddyChatWorkspaceTarget | null
  version: 1
}

const WORKSPACE_STATE_VERSION = 1 as const

export function createEmptyBuddyChatDraft(): BuddyChatDraftState {
  return {
    attachments: [],
    contentJSON: createEmptyBuddyComposerContent(),
    modelSelection: null,
    projectRoot: null,
    scope: 'global',
  }
}

export function createGlobalDraftTarget(): BuddyChatWorkspaceTarget {
  return {
    kind: 'draft',
    projectRoot: null,
    scope: 'global',
  }
}

export function createProjectDraftTarget(projectRoot: string): BuddyChatWorkspaceTarget {
  return {
    kind: 'draft',
    projectRoot,
    scope: 'project',
  }
}

export function createDraftTargetFromDraft(
  draft: BuddyChatDraftState,
): BuddyChatWorkspaceTarget {
  return draft.scope === 'project' && draft.projectRoot
    ? createProjectDraftTarget(draft.projectRoot)
    : createGlobalDraftTarget()
}

export function createConversationListItems(
  conversations: ReadonlyArray<BuddyConversation>,
  runs: ReadonlyArray<BuddyRun>,
): ReadonlyArray<BuddyChatConversationListItem> {
  const latestRunStatusByConversationId = new Map<string, BuddyRun['status']>()
  for (const run of runs) {
    if (!run.conversationId)
      continue
    if (!latestRunStatusByConversationId.has(run.conversationId))
      latestRunStatusByConversationId.set(run.conversationId, run.status)
  }

  return conversations
    .map(conversation => ({
      id: conversation.id,
      latestRunStatus: latestRunStatusByConversationId.get(conversation.id) ?? null,
      projectRoot: normalizeProjectRoot(conversation.projectRoot),
      title: resolveConversationTitle(conversation),
      updatedAt: conversation.updatedAt,
    }))
    .sort(compareConversationListItems)
}

export function createProjectListItems(
  projects: ReadonlyArray<BuddyProject>,
  conversations: ReadonlyArray<BuddyConversation>,
  runs: ReadonlyArray<BuddyRun>,
): ReadonlyArray<BuddyChatProjectListItem> {
  const conversationItems = createConversationListItems(
    conversations.filter(conversation => normalizeProjectRoot(conversation.projectRoot)),
    runs,
  )
  const conversationItemsByProjectRoot = new Map<string, BuddyChatConversationListItem[]>()
  for (const conversation of conversationItems) {
    const projectRoot = conversation.projectRoot
    if (!projectRoot)
      continue

    const entries = conversationItemsByProjectRoot.get(projectRoot) ?? []
    entries.push(conversation)
    conversationItemsByProjectRoot.set(projectRoot, entries)
  }

  return projects
    .map((project) => {
      const conversations = (conversationItemsByProjectRoot.get(project.root) ?? []).slice().sort(compareConversationListItems)
      return {
        conversations,
        lastActiveAt: conversations[0]?.updatedAt ?? null,
        name: project.name,
        root: project.root,
      }
    })
    .sort(compareProjectListItems)
}

export function resolveWorkspaceHeaderTitle(options: {
  conversations?: ReadonlyArray<BuddyConversation>
  draft: BuddyChatDraftState
  newConversationLabel: string
  projects: ReadonlyArray<BuddyProject>
  target: BuddyChatWorkspaceTarget
}) {
  const target = options.target
  if (target.kind === 'draft') {
    if (target.scope === 'project' && target.projectRoot) {
      return `${resolveProjectName(target.projectRoot, options.projects)} / ${options.newConversationLabel}`
    }

    return options.newConversationLabel
  }

  const conversation = options.conversations?.find(item => item.id === target.conversationId)
  if (!conversation)
    return options.newConversationLabel

  const title = resolveConversationTitle(conversation, options.newConversationLabel)
  if (conversation.projectRoot) {
    return `${resolveProjectName(conversation.projectRoot, options.projects)} / ${title}`
  }

  return title
}

export function resolveConversationTitle(
  conversation: Pick<BuddyConversation, 'title' | 'projectRoot'>,
  fallbackTitle = '新对话',
) {
  const title = conversation.title?.trim()
  return title && title.length > 0 ? title : fallbackTitle
}

export function resolveProjectName(
  projectRoot: string,
  projects: ReadonlyArray<BuddyProject>,
) {
  return projects.find(project => project.root === projectRoot)?.name
    ?? deriveProjectName(projectRoot)
}

export function resolveChatTargetCwd(options: {
  conversations?: ReadonlyArray<BuddyConversation>
  draft: BuddyChatDraftState
  target: BuddyChatWorkspaceTarget
}) {
  const target = options.target
  if (target.kind === 'draft')
    return target.scope === 'project' ? normalizeProjectRoot(target.projectRoot) : null

  return normalizeProjectRoot(
    options.conversations?.find(conversation => conversation.id === target.conversationId)?.projectRoot ?? null,
  )
}

export function isBuddyChatRuntimeSelectorVisible(target: BuddyChatWorkspaceTarget) {
  return target.kind === 'draft'
}

export function resolveChatTargetRuntime(options: {
  fallbackRuntime: BuddyRuntime
  runs: ReadonlyArray<Pick<BuddyRun, 'runtime' | 'conversationId' | 'startedAt'>>
  target: BuddyChatWorkspaceTarget
}): BuddyRuntime {
  if (options.target.kind === 'draft')
    return options.fallbackRuntime

  const conversationId = options.target.conversationId
  const firstRun = options.runs
    .filter(run => run.conversationId === conversationId)
    .slice()
    .sort((first, second) =>
      first.startedAt.localeCompare(second.startedAt)
      || first.runtime.localeCompare(second.runtime),
    )[0]

  return firstRun?.runtime ?? options.fallbackRuntime
}

export function createStartBuddyAgentTurnRequest(options: {
  attachments: ReadonlyArray<BuddyChatDraftAttachment>
  runtime: BuddyRuntime
  content: string
  contextItems: ReadonlyArray<BuddyChatPromptContextItem>
  currentCwd: string | null
  currentTarget: BuddyChatWorkspaceTarget
  draft: BuddyChatDraftState
  inputs: ReadonlyArray<BuddyCodexUserInput>
  modelSelection: BuddyChatModelSelection | null
  newConversationLabel: string
}): StartBuddyAgentTurnRequest {
  const baseRequest = {
    attachments: options.attachments,
    runtime: options.runtime,
    content: options.content,
    contextItems: options.contextItems,
    cwd: options.currentCwd,
    inputs: options.inputs,
    modelSelection: options.modelSelection,
  }
  if (options.currentTarget.kind === 'conversation') {
    return {
      ...baseRequest,
      conversationId: options.currentTarget.conversationId,
      conversationSeed: null,
    }
  }
  return {
    ...baseRequest,
    conversationId: null,
    conversationSeed: {
      forkedFromMessageId: null,
      projectRoot: options.draft.scope === 'project' ? options.draft.projectRoot : null,
      scope: options.draft.scope,
      sourceConversationId: null,
      sourceRunId: null,
      title: summarizeConversationTitle(options.content, options.newConversationLabel),
    },
  }
}

export function encodeBuddyWorkspaceState(
  draft: BuddyChatDraftState,
  lastTarget: BuddyChatWorkspaceTarget | null,
): BuddyChatWorkspaceStatePayload {
  return {
    draft: {
      attachments: draft.attachments,
      contentJSON: draft.contentJSON,
      modelSelection: draft.modelSelection,
      projectRoot: draft.projectRoot,
      scope: draft.scope,
    },
    lastTarget,
    version: WORKSPACE_STATE_VERSION,
  }
}

export function decodeBuddyWorkspaceState(value: unknown): {
  draft: BuddyChatDraftState
  lastTarget: BuddyChatWorkspaceTarget | null
} {
  if (!isRecord(value) || value.version !== WORKSPACE_STATE_VERSION) {
    return {
      draft: createEmptyBuddyChatDraft(),
      lastTarget: null,
    }
  }

  return {
    draft: decodeDraftState(value.draft),
    lastTarget: decodeTarget(value.lastTarget),
  }
}

export function formatBuddyConversationRelativeTime(
  value: string,
  locale: string,
  now = Date.now(),
) {
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp))
    return ''

  const diffMs = Math.max(0, now - timestamp)
  const minuteMs = 60 * 1000
  const hourMs = 60 * minuteMs
  const dayMs = 24 * hourMs
  if (diffMs < hourMs) {
    const minutes = Math.max(1, Math.floor(diffMs / minuteMs))
    return locale === 'zh-CN' ? `${minutes} 分` : `${minutes}m`
  }
  if (diffMs < dayMs) {
    const hours = Math.max(1, Math.floor(diffMs / hourMs))
    return locale === 'zh-CN' ? `${hours} 小时` : `${hours}h`
  }
  if (diffMs < 30 * dayMs) {
    const days = Math.max(1, Math.floor(diffMs / dayMs))
    return locale === 'zh-CN' ? `${days} 天` : `${days}d`
  }

  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'numeric',
  }).format(timestamp)
}

export function summarizeConversationTitle(content: string, fallbackTitle = '新对话') {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (normalized.length === 0)
    return fallbackTitle
  if (normalized.length <= 24)
    return normalized

  return `${normalized.slice(0, 24).trim()}…`
}

export function resolveDrawerConversationStatus(status: BuddyRun['status'] | null) {
  if (status === 'failed')
    return 'failed' as const
  if (status === 'queued' || status === 'running')
    return 'running' as const

  return 'time' as const
}

function compareConversationListItems(
  first: BuddyChatConversationListItem,
  second: BuddyChatConversationListItem,
) {
  return second.updatedAt.localeCompare(first.updatedAt)
    || first.title.localeCompare(second.title, 'zh-CN')
    || first.id.localeCompare(second.id)
}

function compareProjectListItems(
  first: BuddyChatProjectListItem,
  second: BuddyChatProjectListItem,
) {
  if (first.lastActiveAt && second.lastActiveAt) {
    const activityOrder = second.lastActiveAt.localeCompare(first.lastActiveAt)
    if (activityOrder !== 0)
      return activityOrder
  }
  else if (first.lastActiveAt) {
    return -1
  }
  else if (second.lastActiveAt) {
    return 1
  }

  return first.name.localeCompare(second.name, 'zh-CN')
    || first.root.localeCompare(second.root, 'zh-CN')
}

function decodeDraftState(value: unknown): BuddyChatDraftState {
  if (!isRecord(value))
    return createEmptyBuddyChatDraft()

  const scope = value.scope === 'project' ? 'project' : 'global'
  const projectRoot = normalizeProjectRoot(readString(value.projectRoot))

  return {
    attachments: decodeAttachments(value.attachments),
    contentJSON: isRecord(value.contentJSON) ? value.contentJSON as JSONContent : createEmptyBuddyComposerContent(),
    modelSelection: decodeModelSelection(value.modelSelection),
    projectRoot: scope === 'project' ? projectRoot : null,
    scope: scope === 'project' && projectRoot ? 'project' : 'global',
  }
}

function decodeTarget(value: unknown): BuddyChatWorkspaceTarget | null {
  if (!isRecord(value))
    return null
  if (value.kind === 'conversation') {
    const conversationId = readString(value.conversationId)
    if (!conversationId)
      return null

    return {
      conversationId,
      kind: 'conversation',
    }
  }
  if (value.kind === 'draft') {
    const scope = value.scope === 'project' ? 'project' : 'global'
    const projectRoot = normalizeProjectRoot(readString(value.projectRoot))
    if (scope === 'project' && projectRoot) {
      return {
        kind: 'draft',
        projectRoot,
        scope,
      }
    }

    return createGlobalDraftTarget()
  }

  return null
}

function decodeAttachments(value: unknown): ReadonlyArray<BuddyChatDraftAttachment> {
  if (!Array.isArray(value))
    return []

  return value
    .filter(isRecord)
    .map(item => ({
      attachmentId: readString(item.attachmentId) ?? undefined,
      dataUrl: readString(item.dataUrl) ?? undefined,
      id: readString(item.id) ?? crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      kind: item.kind === 'image' || item.kind === 'text' ? item.kind : 'binary',
      mimeType: readString(item.mimeType) ?? 'application/octet-stream',
      name: readString(item.name) ?? 'attachment',
      previewPath: readString(item.previewPath) ?? undefined,
      sizeBytes: typeof item.sizeBytes === 'number' ? item.sizeBytes : 0,
      text: readString(item.text) ?? undefined,
    }))
}

function decodeModelSelection(value: unknown): BuddyChatModelSelection | null {
  if (!isRecord(value))
    return null
  if (value.runtime !== 'codex' && value.runtime !== 'claude')
    return null

  return {
    runtime: value.runtime,
    effort: readString(value.effort),
    model: readString(value.model),
    serviceTier: readString(value.serviceTier),
  }
}

function deriveProjectName(projectRoot: string) {
  const normalized = normalizeProjectRoot(projectRoot)
  if (!normalized)
    return '项目'

  const segments = normalized.split(/[\\/]/).filter(Boolean)
  return segments.at(-1) ?? normalized
}

function normalizeProjectRoot(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized && normalized.length > 0 ? normalized : null
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
