import type { BuddyChatRunEvent, BuddyRun, BuddyRunEventType } from '@/lib/tauriRuntime'
import type {
  BuddyAiAnimationIntent,
  BuddyAnimationState,
  BuddyInteractionSignal,
  BuddyLifecycleSignal,
} from '@/pet/buddyAnimation'
import { mapAnimationToPetMood, resolveBuddyAnimationState } from '@/pet/buddyAnimation'

export type BuddyPetMood = 'idle' | 'thinking' | 'done' | 'error'

export interface BuddyPetStateView {
  actionLabel: string
  animation: BuddyAnimationState
  mood: BuddyPetMood
  statusLabel: string
}

export interface BuddyPetAnimationPlaybackKeyInput {
  animation: BuddyAnimationState
  latestRun?: Pick<BuddyRun, 'id' | 'status'> | null
  pendingApprovalIds?: ReadonlyArray<string>
  runEvents?: ReadonlyArray<Pick<BuddyChatRunEvent, 'eventType' | 'id' | 'runId'>>
}

export function createBuddyPetStateView(options: {
  aiIntent?: BuddyAiAnimationIntent | null
  desktopReady: boolean
  chatErrorMessage: string | null
  interaction?: BuddyInteractionSignal | null
  isSending: boolean
  latestRunStatus: BuddyRun['status'] | null
  lifecycle?: BuddyLifecycleSignal
  nowUnixMs?: number
  pendingApprovalCount?: number
  runtimeErrorMessage: string | null
}): BuddyPetStateView {
  const hasError = Boolean(
    options.runtimeErrorMessage
    || options.chatErrorMessage
    || options.latestRunStatus === 'failed',
  )
  const animation = resolveBuddyAnimationState({
    aiIntent: options.aiIntent ?? null,
    desktopReady: options.desktopReady,
    hasError,
    interaction: options.interaction ?? null,
    lifecycle: options.lifecycle ?? 'idle',
    nowUnixMs: options.nowUnixMs,
    task: {
      isSending: options.isSending,
      latestRunStatus: options.latestRunStatus,
      pendingApprovalCount: options.pendingApprovalCount ?? 0,
    },
  })
  const mood = mapAnimationToPetMood(animation)

  if (!options.desktopReady) {
    return {
      actionLabel: '打开控制面板',
      animation,
      mood,
      statusLabel: '桌面端未连接',
    }
  }

  if (hasError) {
    return {
      actionLabel: '查看错误',
      animation,
      mood,
      statusLabel: '需要查看错误',
    }
  }

  if ((options.pendingApprovalCount ?? 0) > 0) {
    return {
      actionLabel: '处理授权',
      animation,
      mood,
      statusLabel: '等待授权确认',
    }
  }

  if (options.isSending || options.latestRunStatus === 'queued' || options.latestRunStatus === 'running') {
    return {
      actionLabel: '查看运行',
      animation,
      mood,
      statusLabel: 'Codex 正在思考',
    }
  }

  if (options.latestRunStatus === 'completed') {
    return {
      actionLabel: '查看结果',
      animation,
      mood,
      statusLabel: '刚完成一次运行',
    }
  }

  if (options.latestRunStatus === 'cancelled') {
    return {
      actionLabel: '查看运行',
      animation,
      mood,
      statusLabel: '运行已取消',
    }
  }

  return {
    actionLabel: '打开控制面板',
    animation,
    mood,
    statusLabel: '待命中',
  }
}

export function createBuddyPetAnimationPlaybackKey(
  options: BuddyPetAnimationPlaybackKeyInput,
): string {
  const { animation } = options

  if (animation.layer === 'ai') {
    const intentEvent = findLatestRunEvent(options.runEvents, 'animation.intent')
    if (intentEvent)
      return `ai:animation.intent:${intentEvent.runId}:${intentEvent.id}:${animation.name}`

    return `ai:${animation.reason}:${animation.name}`
  }

  if (animation.layer === 'task') {
    if (animation.reason === 'approval_pending') {
      const approvalSource = options.pendingApprovalIds?.length
        ? options.pendingApprovalIds.join(',')
        : 'pending'
      return `task:approval:${approvalSource}:${animation.name}`
    }

    const runEventType = resolveTaskRunEventType(animation.reason)
    const runEvent = runEventType
      ? findLatestRunEvent(options.runEvents, runEventType, options.latestRun?.id)
      : null

    if (runEvent)
      return `task:${runEvent.eventType}:${runEvent.runId}:${runEvent.id}:${animation.name}`

    if (options.latestRun)
      return `task:${animation.reason}:${options.latestRun.id}:${options.latestRun.status}:${animation.name}`

    return `task:${animation.reason}:${animation.name}`
  }

  return `${animation.layer}:${animation.reason}:${animation.name}`
}

function findLatestRunEvent(
  events: BuddyPetAnimationPlaybackKeyInput['runEvents'] = [],
  eventType: BuddyRunEventType,
  runId?: string,
) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event.eventType === eventType && (runId === undefined || event.runId === runId))
      return event
  }

  return null
}

function resolveTaskRunEventType(reason: string): BuddyRunEventType | null {
  switch (reason) {
    case 'run_cancelled':
      return 'run.cancelled'
    case 'run_completed':
      return 'run.completed'
    case 'run_failed':
      return 'run.failed'
    case 'run_queued':
    case 'run_running':
      return 'run.started'
    default:
      return null
  }
}
