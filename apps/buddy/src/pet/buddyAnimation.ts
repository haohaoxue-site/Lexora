export type BuddyAnimationName
  = | 'idle'
    | 'run_left'
    | 'run_right'
    | 'sleep'
    | 'wake'
    | 'hover'
    | 'tap'
    | 'drag'
    | 'drop_land'
    | 'approval'
    | 'thinking'
    | 'working'
    | 'celebrate'
    | 'sad'
    | 'reassure'
    | 'explain'
    | 'curious'
    | 'trip_fall_left'
    | 'fallen_idle_left'
    | 'fallen_get_up_left'
    | 'trip_fall_right'
    | 'fallen_idle_right'
    | 'fallen_get_up_right'
    | 'stumble_recover_left'
    | 'stumble_recover_right'

export type BuddyAnimationLayer = 'lifecycle' | 'interaction' | 'task' | 'ai'

export type BuddyAnimationPriority = 'background' | 'normal' | 'high' | 'urgent'

export type BuddyLifecycleSignal = 'idle' | 'sleep' | 'wake'

export type BuddyInteractionSignal = 'hover' | 'tap' | 'drag' | 'drop'

export type BuddyTaskRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export type BuddyAiAnimationIntentName
  = | 'idle'
    | 'run_left'
    | 'run_right'
    | 'sleep'
    | 'wake'
    | 'focus'
    | 'celebrate'
    | 'reassure'
    | 'explain'
    | 'curious'
    | 'trip_fall_left'
    | 'trip_fall_right'
    | 'stumble_recover_left'
    | 'stumble_recover_right'

export interface BuddyAiAnimationIntent {
  durationMs?: number
  expiresAtUnixMs?: number
  intent: BuddyAiAnimationIntentName
  priority?: BuddyAnimationPriority
  reason?: string
}

export interface BuddyTaskAnimationSignal {
  isSending: boolean
  latestRunStatus: BuddyTaskRunStatus | null
  pendingApprovalCount: number
}

export interface BuddyAnimationResolveInput {
  aiIntent: BuddyAiAnimationIntent | null
  desktopReady: boolean
  hasError: boolean
  interaction: BuddyInteractionSignal | null
  lifecycle: BuddyLifecycleSignal
  nowUnixMs?: number
  task: BuddyTaskAnimationSignal
}

export interface BuddyAnimationState {
  durationMs: number | null
  layer: BuddyAnimationLayer
  loop: boolean
  name: BuddyAnimationName
  priority: BuddyAnimationPriority
  reason: string
}

const AI_HIGH_PRIORITY = new Set<BuddyAnimationPriority>(['high', 'urgent'])
const AI_INTENT_NAMES = new Set<BuddyAiAnimationIntentName>([
  'celebrate',
  'curious',
  'explain',
  'focus',
  'idle',
  'reassure',
  'run_left',
  'run_right',
  'sleep',
  'stumble_recover_left',
  'stumble_recover_right',
  'trip_fall_left',
  'trip_fall_right',
  'wake',
])
const AI_INTENT_PRIORITIES = new Set<BuddyAnimationPriority>([
  'background',
  'high',
  'normal',
  'urgent',
])

export function resolveBuddyAiAnimationIntentFromRunEvents(
  events: ReadonlyArray<{
    createdAt?: string
    eventType: string
    id?: number
    payload: unknown
    runId?: string
  }>,
  nowUnixMs = Date.now(),
): BuddyAiAnimationIntent | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event.eventType !== 'animation.intent')
      continue

    const intent = normalizeBuddyAiAnimationIntent(event.payload)
    if (!intent)
      continue

    const timedIntent = withInferredExpiration(intent, event.createdAt)
    if (timedIntent.expiresAtUnixMs !== undefined && timedIntent.expiresAtUnixMs <= nowUnixMs)
      return null

    return timedIntent
  }

  return null
}

export function resolveBuddyAnimationState(input: BuddyAnimationResolveInput): BuddyAnimationState {
  const interactionState = resolveInteractionAnimation(input.interaction)
  if (interactionState)
    return interactionState

  if (!input.desktopReady || input.hasError) {
    return {
      durationMs: null,
      layer: 'task',
      loop: true,
      name: 'sad',
      priority: 'high',
      reason: input.desktopReady ? 'task_error' : 'desktop_unavailable',
    }
  }

  if (input.task.pendingApprovalCount > 0) {
    return {
      durationMs: null,
      layer: 'task',
      loop: true,
      name: 'approval',
      priority: 'high',
      reason: 'approval_pending',
    }
  }

  const aiState = resolveAiAnimation(input.aiIntent, input.nowUnixMs)
  if (aiState && AI_HIGH_PRIORITY.has(aiState.priority))
    return aiState

  const taskState = resolveTaskAnimation(input.task)
  if (taskState)
    return taskState

  if (aiState)
    return aiState

  return resolveLifecycleAnimation(input.lifecycle)
}

export function mapAnimationToPetMood(animation: BuddyAnimationState): 'idle' | 'thinking' | 'done' | 'error' {
  switch (animation.name) {
    case 'approval':
    case 'curious':
    case 'explain':
    case 'reassure':
    case 'thinking':
    case 'working':
      return 'thinking'
    case 'celebrate':
    case 'drop_land':
    case 'tap':
      return 'done'
    case 'sad':
      return 'error'
    case 'drag':
    case 'fallen_get_up_left':
    case 'fallen_get_up_right':
    case 'fallen_idle_left':
    case 'fallen_idle_right':
    case 'hover':
    case 'idle':
    case 'run_left':
    case 'run_right':
    case 'sleep':
    case 'stumble_recover_left':
    case 'stumble_recover_right':
    case 'trip_fall_left':
    case 'trip_fall_right':
    case 'wake':
      return 'idle'
  }
}

function resolveInteractionAnimation(interaction: BuddyInteractionSignal | null): BuddyAnimationState | null {
  switch (interaction) {
    case 'drag':
      return {
        durationMs: null,
        layer: 'interaction',
        loop: true,
        name: 'drag',
        priority: 'urgent',
        reason: 'user_drag',
      }
    case 'tap':
      return {
        durationMs: 700,
        layer: 'interaction',
        loop: false,
        name: 'tap',
        priority: 'high',
        reason: 'user_tap',
      }
    case 'drop':
      return {
        durationMs: 650,
        layer: 'interaction',
        loop: false,
        name: 'drop_land',
        priority: 'high',
        reason: 'user_drop',
      }
    case 'hover':
      return {
        durationMs: null,
        layer: 'interaction',
        loop: true,
        name: 'hover',
        priority: 'normal',
        reason: 'user_hover',
      }
    case null:
      return null
  }
}

function normalizeBuddyAiAnimationIntent(payload: unknown): BuddyAiAnimationIntent | null {
  if (!isRecord(payload))
    return null

  const intent = payload.intent
  if (typeof intent !== 'string' || !isBuddyAiAnimationIntentName(intent))
    return null

  const priority = payload.priority
  if (priority !== undefined && (typeof priority !== 'string' || !isBuddyAnimationPriority(priority)))
    return null

  const durationMs = payload.durationMs
  if (durationMs !== undefined && !isFiniteNonNegativeNumber(durationMs))
    return null

  const expiresAtUnixMs = payload.expiresAtUnixMs
  if (expiresAtUnixMs !== undefined && !isFiniteNonNegativeNumber(expiresAtUnixMs))
    return null

  const reason = payload.reason
  if (reason !== undefined && typeof reason !== 'string')
    return null

  return {
    durationMs,
    expiresAtUnixMs,
    intent,
    priority,
    reason,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isBuddyAiAnimationIntentName(value: string): value is BuddyAiAnimationIntentName {
  return AI_INTENT_NAMES.has(value as BuddyAiAnimationIntentName)
}

function isBuddyAnimationPriority(value: string): value is BuddyAnimationPriority {
  return AI_INTENT_PRIORITIES.has(value as BuddyAnimationPriority)
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function withInferredExpiration(
  intent: BuddyAiAnimationIntent,
  createdAt: string | undefined,
): BuddyAiAnimationIntent {
  const durationMs = intent.durationMs ?? defaultAiDurationMs(mapAiIntentName(intent))
  if (
    intent.expiresAtUnixMs !== undefined
    || durationMs === null
    || createdAt === undefined
  ) {
    return intent
  }

  const createdAtUnixMs = Date.parse(createdAt)
  if (!Number.isFinite(createdAtUnixMs))
    return intent

  return {
    ...intent,
    expiresAtUnixMs: createdAtUnixMs + durationMs,
  }
}

function resolveAiAnimation(intent: BuddyAiAnimationIntent | null, nowUnixMs = Date.now()): BuddyAnimationState | null {
  if (!intent)
    return null

  if (intent.expiresAtUnixMs !== undefined && intent.expiresAtUnixMs <= nowUnixMs)
    return null

  const priority = resolveAiAnimationPriority(intent)
  const name = mapAiIntentName(intent)

  return {
    durationMs: intent.durationMs ?? defaultAiDurationMs(name),
    layer: 'ai',
    loop: isLoopingAiIntent(intent.intent),
    name,
    priority,
    reason: intent.reason ?? `ai_${intent.intent}`,
  }
}

function resolveAiAnimationPriority(intent: BuddyAiAnimationIntent): BuddyAnimationPriority {
  const priority = intent.priority ?? 'normal'
  if (priority === 'normal' && isMotionAiIntent(intent.intent))
    return 'high'

  return priority
}

function isMotionAiIntent(intent: BuddyAiAnimationIntentName): boolean {
  switch (intent) {
    case 'run_left':
    case 'run_right':
    case 'trip_fall_left':
    case 'trip_fall_right':
    case 'stumble_recover_left':
    case 'stumble_recover_right':
      return true
    case 'celebrate':
    case 'curious':
    case 'explain':
    case 'focus':
    case 'idle':
    case 'reassure':
    case 'sleep':
    case 'wake':
      return false
  }
}

function isLoopingAiIntent(intent: BuddyAiAnimationIntentName): boolean {
  return intent === 'focus' || intent === 'sleep'
}

function resolveTaskAnimation(task: BuddyTaskAnimationSignal): BuddyAnimationState | null {
  if (task.isSending) {
    return {
      durationMs: null,
      layer: 'task',
      loop: true,
      name: 'thinking',
      priority: 'normal',
      reason: 'chat_sending',
    }
  }

  switch (task.latestRunStatus) {
    case 'queued':
    case 'running':
      return {
        durationMs: null,
        layer: 'task',
        loop: true,
        name: 'working',
        priority: 'normal',
        reason: `run_${task.latestRunStatus}`,
      }
    case 'completed':
      return {
        durationMs: 1800,
        layer: 'task',
        loop: false,
        name: 'celebrate',
        priority: 'normal',
        reason: 'run_completed',
      }
    case 'failed':
      return {
        durationMs: null,
        layer: 'task',
        loop: true,
        name: 'sad',
        priority: 'high',
        reason: 'run_failed',
      }
    case 'cancelled':
      return {
        durationMs: 1400,
        layer: 'task',
        loop: false,
        name: 'reassure',
        priority: 'normal',
        reason: 'run_cancelled',
      }
    case null:
      return null
  }
}

function resolveLifecycleAnimation(lifecycle: BuddyLifecycleSignal): BuddyAnimationState {
  switch (lifecycle) {
    case 'sleep':
      return {
        durationMs: null,
        layer: 'lifecycle',
        loop: true,
        name: 'sleep',
        priority: 'background',
        reason: 'lifecycle_sleep',
      }
    case 'wake':
      return {
        durationMs: 900,
        layer: 'lifecycle',
        loop: false,
        name: 'wake',
        priority: 'normal',
        reason: 'lifecycle_wake',
      }
    case 'idle':
      return {
        durationMs: null,
        layer: 'lifecycle',
        loop: true,
        name: 'idle',
        priority: 'background',
        reason: 'lifecycle_idle',
      }
  }
}

function mapAiIntentName(intent: BuddyAiAnimationIntent): BuddyAnimationName {
  switch (intent.intent) {
    case 'focus':
      return 'working'
    case 'run_left':
    case 'run_right':
    case 'idle':
    case 'sleep':
    case 'wake':
    case 'celebrate':
    case 'reassure':
    case 'explain':
    case 'curious':
    case 'trip_fall_left':
    case 'trip_fall_right':
    case 'stumble_recover_left':
    case 'stumble_recover_right':
      return intent.intent
  }
}

function defaultAiDurationMs(animation: BuddyAnimationName): number | null {
  switch (animation) {
    case 'sleep':
      return null
    case 'celebrate':
      return 2200
    case 'run_left':
    case 'run_right':
      return 1400
    case 'trip_fall_left':
    case 'trip_fall_right':
      return 1800
    case 'stumble_recover_left':
    case 'stumble_recover_right':
      return 1600
    case 'curious':
    case 'explain':
    case 'idle':
    case 'reassure':
    case 'wake':
      return 1400
    case 'approval':
    case 'drag':
    case 'drop_land':
    case 'fallen_get_up_left':
    case 'fallen_get_up_right':
    case 'fallen_idle_left':
    case 'fallen_idle_right':
    case 'hover':
    case 'sad':
    case 'tap':
    case 'thinking':
    case 'working':
      return null
  }
}
