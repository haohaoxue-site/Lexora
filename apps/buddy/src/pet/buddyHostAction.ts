import type { BuddyChatRunEvent } from '@/lib/tauriRuntime'
import type {
  BuddyAiAnimationIntent,
  BuddyAiAnimationIntentName,
  BuddyAnimationName,
  BuddyAnimationPriority,
} from '@/pet/buddyAnimation'

export type BuddyNativePetMoveTarget
  = | { kind: 'center' }
    | { kind: 'home' }
    | { kind: 'edge', edge: 'left' | 'right' | 'top' | 'bottom' }
    | { kind: 'position', x: number, y: number }
    | { kind: 'x', x: number }

export type BuddyNativePetHostAction
  = | BuddyNativePetHostAnimationAction
    | BuddyNativePetHostMoveAction
    | BuddyNativePetHostSequenceAction

export interface BuddyNativePetHostAnimationAction {
  action: 'animation'
  animation: BuddyAnimationName
  durationMs?: number
  priority?: BuddyAnimationPriority
  reason?: string
  version?: 1
}

export interface BuddyNativePetHostMoveAction {
  action: 'move'
  after?: BuddyAnimationName
  reason?: string
  target: BuddyNativePetMoveTarget
  version?: 1
}

export interface BuddyNativePetHostSequenceAction {
  action: 'sequence'
  reason?: string
  steps: BuddyNativePetHostActionStep[]
  version?: 1
}

export type BuddyNativePetHostActionStep
  = | BuddyNativePetHostAnimationStep
    | BuddyNativePetHostMoveStep

export interface BuddyNativePetHostAnimationStep {
  animation: BuddyAnimationName
  durationMs?: number
  priority?: BuddyAnimationPriority
  reason?: string
  type: 'animation'
}

export interface BuddyNativePetHostMoveStep {
  after?: BuddyAnimationName
  reason?: string
  target: BuddyNativePetMoveTarget
  type: 'move'
}

export interface BuddyResolvedNativePetHostAction {
  action: BuddyNativePetHostAction
  createdAt?: string
  eventId?: number
  runId?: string
}

const BUDDY_NATIVE_PET_ANIMATION_NAMES = new Set<BuddyAnimationName>([
  'approval',
  'celebrate',
  'curious',
  'drag',
  'explain',
  'fallen_get_up_left',
  'fallen_get_up_right',
  'fallen_idle_left',
  'fallen_idle_right',
  'hover',
  'idle',
  'reassure',
  'run_left',
  'run_right',
  'sad',
  'sleep',
  'stumble_recover_left',
  'stumble_recover_right',
  'tap',
  'thinking',
  'trip_fall_left',
  'trip_fall_right',
  'wake',
  'working',
])

const BUDDY_NATIVE_PET_HOST_PRIORITIES = new Set<BuddyAnimationPriority>([
  'background',
  'high',
  'normal',
  'urgent',
])

export function resolveBuddyNativePetHostActionFromRunEvents(
  events: ReadonlyArray<BuddyChatRunEvent>,
): BuddyResolvedNativePetHostAction | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event.eventType !== 'host.action')
      continue

    const action = normalizeBuddyNativePetHostAction(event.payload)
    if (!action)
      continue

    return {
      action,
      createdAt: event.createdAt,
      eventId: event.id,
      runId: event.runId,
    }
  }

  return null
}

export function createBuddyNativePetHostActionPlaybackKey(
  resolved: BuddyResolvedNativePetHostAction | null,
): string | null {
  if (!resolved)
    return null

  return `host.action:${resolved.runId ?? 'run'}:${resolved.eventId ?? 'event'}`
}

export function resolveBuddyAiAnimationIntentFromHostAction(
  resolved: BuddyResolvedNativePetHostAction | null,
  nowUnixMs = Date.now(),
): BuddyAiAnimationIntent | null {
  const animation = firstBuddyNativePetHostAnimation(resolved?.action ?? null)
  if (!animation)
    return null

  const intent = mapBuddyNativePetHostAnimationToAiIntent(animation.animation)
  if (!intent)
    return null

  const expiresAtUnixMs = inferBuddyNativePetHostActionExpiration(
    animation.durationMs,
    resolved?.createdAt,
  )
  if (expiresAtUnixMs !== undefined && expiresAtUnixMs <= nowUnixMs)
    return null

  return {
    durationMs: animation.durationMs,
    expiresAtUnixMs,
    intent,
    priority: animation.priority,
    reason: animation.reason,
  }
}

function normalizeBuddyNativePetHostAction(payload: unknown): BuddyNativePetHostAction | null {
  if (!isRecord(payload))
    return null

  if (payload.version !== undefined && payload.version !== 1)
    return null

  switch (payload.action) {
    case 'animation':
      return normalizeBuddyNativePetHostAnimationAction(payload)
    case 'move':
      return normalizeBuddyNativePetHostMoveAction(payload)
    case 'sequence':
      return normalizeBuddyNativePetHostSequenceAction(payload)
    default:
      return null
  }
}

function normalizeBuddyNativePetHostAnimationAction(
  payload: Record<string, unknown>,
): BuddyNativePetHostAnimationAction | null {
  if (!isBuddyNativePetAnimationName(payload.animation))
    return null

  const common = normalizeBuddyNativePetHostAnimationFields(payload)
  if (!common)
    return null

  return {
    action: 'animation',
    animation: payload.animation,
    ...common,
    version: 1,
  }
}

function normalizeBuddyNativePetHostMoveAction(
  payload: Record<string, unknown>,
): BuddyNativePetHostMoveAction | null {
  const target = normalizeBuddyNativePetMoveTarget(payload.target)
  if (!target)
    return null

  const moveFields = normalizeBuddyNativePetMoveFields(payload)
  if (!moveFields)
    return null

  return {
    action: 'move',
    target,
    ...moveFields,
    version: 1,
  }
}

function normalizeBuddyNativePetHostSequenceAction(
  payload: Record<string, unknown>,
): BuddyNativePetHostSequenceAction | null {
  if (!Array.isArray(payload.steps) || payload.steps.length < 1 || payload.steps.length > 8)
    return null

  const steps = payload.steps.map(normalizeBuddyNativePetHostActionStep)
  if (steps.includes(null))
    return null

  const reason = typeof payload.reason === 'string' && payload.reason.trim()
    ? payload.reason.trim()
    : undefined

  return {
    action: 'sequence',
    reason,
    steps: steps as BuddyNativePetHostActionStep[],
    version: 1,
  }
}

function normalizeBuddyNativePetHostActionStep(
  payload: unknown,
): BuddyNativePetHostActionStep | null {
  if (!isRecord(payload))
    return null

  switch (payload.type ?? payload.action) {
    case 'animation': {
      if (!isBuddyNativePetAnimationName(payload.animation))
        return null
      const common = normalizeBuddyNativePetHostAnimationFields(payload)
      if (!common)
        return null

      return {
        animation: payload.animation,
        ...common,
        type: 'animation',
      }
    }
    case 'move': {
      const target = normalizeBuddyNativePetMoveTarget(payload.target)
      if (!target)
        return null
      const moveFields = normalizeBuddyNativePetMoveFields(payload)
      if (!moveFields)
        return null

      return {
        target,
        ...moveFields,
        type: 'move',
      }
    }
    default:
      return null
  }
}

function normalizeBuddyNativePetHostAnimationFields(
  payload: Record<string, unknown>,
): Pick<BuddyNativePetHostAnimationAction, 'durationMs' | 'priority' | 'reason'> | null {
  const durationMs = payload.durationMs
  if (durationMs !== undefined && !isFiniteDurationMs(durationMs))
    return null

  const priority = payload.priority
  if (priority !== undefined && !isBuddyNativePetHostPriority(priority))
    return null

  const reason = typeof payload.reason === 'string' && payload.reason.trim()
    ? payload.reason.trim()
    : undefined

  return {
    durationMs,
    priority,
    reason,
  }
}

function normalizeBuddyNativePetMoveFields(
  payload: Record<string, unknown>,
): Pick<BuddyNativePetHostMoveAction, 'after' | 'reason'> | null {
  const after = payload.after
  if (after !== undefined && !isBuddyNativePetAnimationName(after))
    return null

  const reason = typeof payload.reason === 'string' && payload.reason.trim()
    ? payload.reason.trim()
    : undefined

  return {
    after,
    reason,
  }
}

function normalizeBuddyNativePetMoveTarget(value: unknown): BuddyNativePetMoveTarget | null {
  if (value === 'center' || value === 'home')
    return { kind: value }

  if (!isRecord(value) || typeof value.kind !== 'string')
    return null

  switch (value.kind) {
    case 'center':
    case 'home':
      return { kind: value.kind }
    case 'edge':
      return isBuddyNativePetEdge(value.edge)
        ? { kind: 'edge', edge: value.edge }
        : null
    case 'position':
      return isFiniteCoordinate(value.x) && isFiniteCoordinate(value.y)
        ? { kind: 'position', x: value.x, y: value.y }
        : null
    case 'x':
      return isFiniteCoordinate(value.x)
        ? { kind: 'x', x: value.x }
        : null
    default:
      return null
  }
}

function firstBuddyNativePetHostAnimation(
  action: BuddyNativePetHostAction | null,
): BuddyNativePetHostAnimationAction | BuddyNativePetHostAnimationStep | null {
  if (!action)
    return null

  if (action.action === 'animation')
    return action

  if (action.action !== 'sequence')
    return null

  return action.steps.find(isBuddyNativePetHostAnimationStep) ?? null
}

function isBuddyNativePetHostAnimationStep(
  step: BuddyNativePetHostActionStep,
): step is BuddyNativePetHostAnimationStep {
  return step.type === 'animation'
}

function mapBuddyNativePetHostAnimationToAiIntent(
  animation: BuddyAnimationName,
): BuddyAiAnimationIntentName | null {
  switch (animation) {
    case 'thinking':
    case 'working':
      return 'focus'
    case 'celebrate':
    case 'curious':
    case 'explain':
    case 'idle':
    case 'reassure':
    case 'run_left':
    case 'run_right':
    case 'sleep':
    case 'stumble_recover_left':
    case 'stumble_recover_right':
    case 'trip_fall_left':
    case 'trip_fall_right':
    case 'wake':
      return animation
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
      return null
  }
}

function inferBuddyNativePetHostActionExpiration(
  durationMs: number | undefined,
  createdAt: string | undefined,
): number | undefined {
  if (durationMs === undefined || createdAt === undefined)
    return undefined

  const createdAtUnixMs = Date.parse(createdAt)
  return Number.isFinite(createdAtUnixMs)
    ? createdAtUnixMs + durationMs
    : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isBuddyNativePetAnimationName(value: unknown): value is BuddyAnimationName {
  return typeof value === 'string'
    && BUDDY_NATIVE_PET_ANIMATION_NAMES.has(value as BuddyAnimationName)
}

function isBuddyNativePetHostPriority(value: unknown): value is BuddyAnimationPriority {
  return typeof value === 'string'
    && BUDDY_NATIVE_PET_HOST_PRIORITIES.has(value as BuddyAnimationPriority)
}

function isBuddyNativePetEdge(value: unknown): value is 'left' | 'right' | 'top' | 'bottom' {
  return value === 'left' || value === 'right' || value === 'top' || value === 'bottom'
}

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isFiniteDurationMs(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= 100
    && value <= 30000
}
