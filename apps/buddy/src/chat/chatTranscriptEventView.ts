import type { BuddyTranslate } from '@/i18n/buddyI18n'
import type { BuddyChatRunEvent } from '@/lib/tauriRuntime'
import {
  compactRunEventText,
  extractPatchChangeFilePaths,
  extractUnifiedDiffFilePaths,
  normalizeRunEventPayload,
  readRunEventPayloadString as readPayloadString,
  readRunEventFilePaths,
  stringifyRunEventPayloadPreview,
} from '@/lib/runEventPayload'

export interface BuddyChatRunActivityRow {
  id: string
  kind: BuddyChatRunActivityKind
  label: string
  output?: string
  status: 'running' | 'completed' | 'failed'
  summary: string
}

export type BuddyChatRunActivityKind
  = | 'approval'
    | 'diff'
    | 'notice'
    | 'plan'
    | 'thinking'
    | 'tool'

const BUDDY_ANIMATION_INTENT_START_TAG = '<lexora_buddy_animation_intent>'
const BUDDY_ANIMATION_INTENT_END_TAG = '</lexora_buddy_animation_intent>'
const CHAT_ACTIVITY_OUTPUT_PREVIEW_CHARS = 12000

export function createChatRunActivityRows(
  events: ReadonlyArray<BuddyChatRunEvent>,
  t: BuddyTranslate,
): ReadonlyArray<BuddyChatRunActivityRow> {
  const rows = new Map<string, BuddyChatRunActivityRow>()

  for (const event of events) {
    const payload = normalizeRunEventPayload(event.payload)
    if (event.eventType === 'reasoning.delta' || event.eventType === 'reasoning.summary_delta') {
      continue
    }

    if (event.eventType === 'reasoning.completed') {
      continue
    }

    if (event.eventType === 'plan.delta') {
      const id = readPayloadString(payload, 'itemId') ?? `plan-${event.id}`
      const current = rows.get(id)
      rows.set(id, {
        id,
        kind: 'plan',
        label: t('activity.plan'),
        output: current?.output,
        status: current?.status ?? 'running',
        summary: appendText(current?.summary, readPayloadString(payload, 'delta')),
      })
      continue
    }

    if (event.eventType === 'plan.updated') {
      const turnId = readPayloadString(payload, 'turnId')
      const id = readPayloadString(payload, 'itemId') ?? `plan-${turnId ?? event.id}`
      rows.set(id, {
        id,
        kind: 'plan',
        label: t('activity.plan'),
        output: renderPlanOutput(payload),
        status: 'completed',
        summary: readPayloadString(payload, 'explanation') ?? renderPlanSummary(payload, t),
      })
      continue
    }

    if (event.eventType === 'turn.diff.updated') {
      const turnId = readPayloadString(payload, 'turnId')
      const id = readPayloadString(payload, 'itemId') ?? `diff-${turnId ?? event.id}`
      const files = readRunEventFilePaths(
        payload,
        () => extractUnifiedDiffFilePaths(readPayloadString(payload, 'diff')),
      )
      rows.set(id, {
        id,
        kind: 'diff',
        label: t('activity.diff'),
        status: 'running',
        summary: renderFileListSummary(files, t),
      })
      continue
    }

    if (event.eventType === 'tool.patch_updated') {
      const id = readPayloadString(payload, 'itemId') ?? `patch-${event.id}`
      rows.set(id, {
        id,
        kind: 'diff',
        label: t('activity.diff'),
        status: 'running',
        summary: renderFileListSummary(
          readRunEventFilePaths(payload, () => extractPatchChangeFilePaths(payload.changes)),
          t,
        ),
      })
      continue
    }

    if (event.eventType === 'tool.started' || event.eventType === 'tool.finished') {
      const id = readPayloadString(payload, 'itemId') ?? `tool-${event.id}`
      const current = rows.get(id)
      const item = normalizeRunEventPayload(payload.item)
      const status = event.eventType === 'tool.finished'
        ? resolveFinishedToolStatus(item.status)
        : 'running'
      const output = resolveToolOutput(item) ?? current?.output
      rows.set(id, {
        id,
        kind: 'tool',
        label: resolveToolLabel(item, t),
        output,
        status,
        summary: resolveToolSummary(item, t) ?? current?.summary ?? t('tool.use'),
      })
      continue
    }

    if (event.eventType === 'tool.output_delta') {
      const id = readPayloadString(payload, 'itemId') ?? `tool-${event.id}`
      const current = rows.get(id)
      rows.set(id, {
        id,
        kind: 'tool',
        label: current?.label ?? t('tool.title'),
        output: appendText(
          current?.output,
          readPayloadString(payload, 'delta'),
          CHAT_ACTIVITY_OUTPUT_PREVIEW_CHARS,
        ),
        status: current?.status ?? 'running',
        summary: current?.summary ?? t('tool.output'),
      })
      continue
    }

    if (event.eventType === 'tool.progress') {
      const id = readPayloadString(payload, 'itemId') ?? `tool-progress-${event.id}`
      const current = rows.get(id)
      rows.set(id, {
        id,
        kind: 'tool',
        label: current?.label ?? t('tool.title'),
        output: current?.output,
        status: current?.status ?? 'running',
        summary: readPayloadString(payload, 'message') ?? current?.summary ?? t('activity.progress'),
      })
      continue
    }

    if (event.eventType === 'tool.terminal_interaction') {
      const id = readPayloadString(payload, 'itemId') ?? `terminal-${event.id}`
      const current = rows.get(id)
      rows.set(id, {
        id,
        kind: 'tool',
        label: current?.label ?? t('tool.command'),
        output: appendText(
          current?.output,
          readPayloadString(payload, 'stdin'),
          CHAT_ACTIVITY_OUTPUT_PREVIEW_CHARS,
        ),
        status: current?.status ?? 'running',
        summary: current?.summary ?? t('activity.terminalInteraction'),
      })
      continue
    }

    if (event.eventType === 'approval.requested') {
      const id = readPayloadString(payload, 'itemId') ?? `approval-${event.id}`
      rows.set(id, {
        id,
        kind: 'approval',
        label: t('activity.approval'),
        output: renderPayloadJson(payload),
        status: 'running',
        summary: resolveApprovalSummary(payload, t),
      })
      continue
    }

    if (event.eventType === 'user_input.requested') {
      const id = readPayloadString(payload, 'itemId') ?? `user-input-${event.id}`
      rows.set(id, {
        id,
        kind: 'approval',
        label: t('activity.userInput'),
        output: renderPayloadJson(payload.questions),
        status: 'running',
        summary: resolveUserInputSummary(payload, t),
      })
      continue
    }

    if (event.eventType === 'codex.notification') {
      const activity = createCodexNotificationActivityRow(event, payload, t)
      if (activity)
        rows.set(activity.id, activity)

      continue
    }

    if (event.eventType === 'run.failed') {
      rows.set(`run-failed-${event.id}`, {
        id: `run-failed-${event.id}`,
        kind: 'notice',
        label: t('activity.failure'),
        status: 'failed',
        summary: resolveRunFailureSummary(payload, t),
      })
      continue
    }
  }

  return [...rows.values()].filter(row => row.summary || row.output)
}

export {
  normalizeRunEventPayload,
  readRunEventPayloadString as readPayloadString,
} from '@/lib/runEventPayload'

function appendText(
  current: string | undefined,
  delta: string | null,
  maxChars?: number,
): string {
  if (!delta)
    return current ?? ''

  const next = `${current ?? ''}${delta}`
  return typeof maxChars === 'number' ? compactRunEventText(next, maxChars) : next
}

export function stripBuddyAnimationIntentBlocks(delta: string | null): string | null {
  if (!delta)
    return delta

  let stripped = delta
  let changed = false

  for (;;) {
    const start = stripped.indexOf(BUDDY_ANIMATION_INTENT_START_TAG)
    if (start < 0)
      break

    const bodyStart = start + BUDDY_ANIMATION_INTENT_START_TAG.length
    const end = stripped.indexOf(BUDDY_ANIMATION_INTENT_END_TAG, bodyStart)
    changed = true
    if (end < 0) {
      stripped = stripped.slice(0, start)
      break
    }

    stripped = `${stripped.slice(0, start)}${stripped.slice(end + BUDDY_ANIMATION_INTENT_END_TAG.length)}`
  }

  const orphanEnd = stripped.indexOf(BUDDY_ANIMATION_INTENT_END_TAG)
  if (orphanEnd >= 0) {
    changed = true
    stripped = stripped.slice(orphanEnd + BUDDY_ANIMATION_INTENT_END_TAG.length)
  }

  return changed ? normalizeBuddyAnimationIntentStrippedText(stripped) : stripped
}

function normalizeBuddyAnimationIntentStrippedText(value: string): string {
  return value
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

function renderPlanSummary(payload: Record<string, unknown>, t: BuddyTranslate): string {
  const plan = Array.isArray(payload.plan) ? payload.plan : []
  return t('activity.planStepCount', { count: plan.length })
}

function renderPlanOutput(payload: Record<string, unknown>): string | undefined {
  const plan = Array.isArray(payload.plan) ? payload.plan : []
  if (plan.length === 0)
    return undefined

  return compactRunEventText(plan
    .map((step, index) => {
      const item = normalizeRunEventPayload(step)
      const label = readPayloadString(item, 'step') ?? `Step ${index + 1}`
      const status = readPayloadString(item, 'status') ?? 'pending'
      return `${index + 1}. [${status}] ${label}`
    })
    .join('\n'), CHAT_ACTIVITY_OUTPUT_PREVIEW_CHARS)
}

function renderPayloadJson(value: unknown): string | undefined {
  if (value === undefined || value === null)
    return undefined

  return stringifyRunEventPayloadPreview(value)
}

function renderFileListSummary(paths: ReadonlyArray<string>, t: BuddyTranslate): string {
  if (paths.length === 0)
    return t('activity.diffUpdated')

  return compactRunEventText(paths.join(', '))
}

function resolveApprovalSummary(payload: Record<string, unknown>, t: BuddyTranslate): string {
  return readPayloadString(payload, 'command')
    ?? readPayloadString(payload, 'reason')
    ?? readPayloadString(payload, 'method')
    ?? t('activity.approval')
}

function resolveUserInputSummary(payload: Record<string, unknown>, t: BuddyTranslate): string {
  const questions = Array.isArray(payload.questions) ? payload.questions : []
  for (const question of questions) {
    const normalizedQuestion = normalizeRunEventPayload(question)
    const text = readPayloadString(normalizedQuestion, 'question')
    if (text)
      return text
  }

  return t('activity.userInput')
}

function resolveFinishedToolStatus(value: unknown): BuddyChatRunActivityRow['status'] {
  if (value === 'failed' || value === 'declined' || value === 'errored')
    return 'failed'

  return 'completed'
}

function resolveToolLabel(item: Record<string, unknown>, t: BuddyTranslate) {
  const type = readPayloadString(item, 'type')
  const commandActionType = resolvePrimaryCommandActionType(item)
  if (commandActionType === 'read')
    return t('activity.readFile')

  if (commandActionType === 'listFiles')
    return t('activity.explore')

  if (commandActionType === 'search')
    return t('tool.search')

  if (type === 'commandExecution')
    return t('tool.command')

  if (type === 'fileChange')
    return t('tool.file')

  if (type === 'mcpToolCall') {
    const tool = readPayloadString(item, 'tool')
    if (tool === 'read_mcp_resource' || tool === 'read_mcp_resource_template')
      return t('activity.readResource')

    if (tool === 'list_mcp_resources' || tool === 'list_mcp_resource_templates')
      return t('activity.explore')

    return readPayloadString(item, 'tool') ?? 'MCP'
  }

  if (type === 'dynamicToolCall')
    return readPayloadString(item, 'tool') ?? t('tool.title')

  if (type === 'webSearch')
    return t('tool.search')

  if (type === 'imageGeneration')
    return t('tool.image')

  return t('tool.title')
}

function resolveToolSummary(item: Record<string, unknown>, t: BuddyTranslate): string | null {
  const commandAction = resolvePrimaryCommandAction(item)
  if (commandAction) {
    return summarizeCommandAction(commandAction)
  }

  if (readPayloadString(item, 'type') === 'fileChange') {
    return renderFileListSummary(
      readRunEventFilePaths(item, () => extractPatchChangeFilePaths(item.changes)),
      t,
    )
  }

  const argumentsSummary = summarizeToolArguments(item.arguments)
  return readPayloadString(item, 'command')
    ?? readPayloadString(item, 'query')
    ?? readPayloadString(item, 'tool')
    ?? readPayloadString(item, 'path')
    ?? argumentsSummary
    ?? summarizeMcpToolResult(item)
}

function resolveToolOutput(item: Record<string, unknown>): string | null {
  const output = readPayloadString(item, 'aggregatedOutput')
    ?? readPayloadString(item, 'output')
  if (!output)
    return null

  return compactRunEventText(output, CHAT_ACTIVITY_OUTPUT_PREVIEW_CHARS)
}

function summarizeCommandAction(action: Record<string, unknown>): string | null {
  const type = readPayloadString(action, 'type')
  const name = readNonEmptyPayloadString(action, 'name')
  const path = readInformativePath(action)
  const query = readNonEmptyPayloadString(action, 'query')
  const command = readNonEmptyPayloadString(action, 'command')

  if (type === 'read')
    return path ?? name ?? command ?? query

  if (type === 'search')
    return query ?? command ?? path ?? name

  if (type === 'listFiles')
    return path ?? command ?? name

  return name ?? path ?? query ?? command
}

function readInformativePath(payload: Record<string, unknown>): string | null {
  const path = readNonEmptyPayloadString(payload, 'path')
  if (!path || path === '.' || path === './')
    return null

  return path
}

function readNonEmptyPayloadString(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const value = readPayloadString(payload, key)?.trim()
  return value || null
}

function createCodexNotificationActivityRow(
  event: BuddyChatRunEvent,
  payload: Record<string, unknown>,
  t: BuddyTranslate,
): BuddyChatRunActivityRow | null {
  const method = readPayloadString(payload, 'method')
  const params = normalizeRunEventPayload(payload.params)

  if (method === 'thread/status/changed') {
    const status = normalizeRunEventPayload(params.status)
    const statusType = readPayloadString(status, 'type')
    const threadId = readPayloadString(params, 'threadId') ?? event.id.toString()
    if (statusType === 'active')
      return null

    if (statusType === 'systemError') {
      return {
        id: `thread-status-${threadId}`,
        kind: 'notice',
        label: t('activity.failure'),
        output: renderPayloadJson(params),
        status: 'failed',
        summary: t('activity.systemError'),
      }
    }

    return null
  }

  if (method === 'mcpServer/startupStatus/updated') {
    return null
  }

  if (method === 'account/rateLimits/updated') {
    const summary = resolveRateLimitSummary(params, t)
    if (!summary)
      return null

    return {
      id: `rate-limits-${event.id}`,
      kind: 'notice',
      label: t('activity.rateLimit'),
      output: renderPayloadJson(params.rateLimits),
      status: 'failed',
      summary,
    }
  }

  if (
    method === 'thread/started'
    || method === 'turn/started'
    || method === 'thread/settings/updated'
    || method === 'thread/tokenUsage/updated'
    || method === 'account/updated'
  ) {
    return null
  }

  return null
}

function resolveRunFailureSummary(payload: Record<string, unknown>, t: BuddyTranslate): string {
  return readPayloadString(payload, 'message') ?? t('chat.codexRunFailed')
}

function resolveRateLimitSummary(
  payload: Record<string, unknown>,
  t: BuddyTranslate,
): string | null {
  const rateLimits = normalizeRunEventPayload(payload.rateLimits)
  const reachedType = readPayloadString(rateLimits, 'rateLimitReachedType')
  if (reachedType)
    return t('activity.rateLimitReached')

  const credits = normalizeRunEventPayload(rateLimits.credits)
  if (credits.hasCredits === false && credits.unlimited !== true)
    return t('activity.creditsDepleted')

  return null
}

function resolvePrimaryCommandAction(item: Record<string, unknown>): Record<string, unknown> | null {
  if (!Array.isArray(item.commandActions))
    return null

  for (const action of item.commandActions) {
    const normalizedAction = normalizeRunEventPayload(action)
    if (readPayloadString(normalizedAction, 'type'))
      return normalizedAction
  }

  return null
}

function resolvePrimaryCommandActionType(item: Record<string, unknown>): string | null {
  const action = resolvePrimaryCommandAction(item)
  return action ? readPayloadString(action, 'type') : null
}

function summarizeToolArguments(value: unknown): string | null {
  const args = normalizeRunEventPayload(value)
  return readPayloadString(args, 'name')
    ?? readPayloadString(args, 'path')
    ?? readPayloadString(args, 'uri')
    ?? readPayloadString(args, 'query')
    ?? readPayloadString(args, 'q')
    ?? readPayloadString(args, 'pattern')
}

function summarizeMcpToolResult(item: Record<string, unknown>): string | null {
  const result = normalizeRunEventPayload(item.result)
  const content = Array.isArray(result.content) ? result.content : []
  for (const contentItem of content) {
    const normalizedContentItem = normalizeRunEventPayload(contentItem)
    const text = readPayloadString(normalizedContentItem, 'text')
    if (text)
      return compactRunEventText(text)
  }

  return null
}
