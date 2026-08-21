import type { LexoraConfig } from '../shared/desktopApi'
import type { DesktopRuntimeGateway } from './localChatIpc'
import { localChatResponseSchemas, localChatSchemas } from '../shared/localChatApiSchemas'
import { shouldShowDesktopNotification } from './desktopNotificationPolicy'

export interface DesktopNotificationInput {
  body: string
  title: string
}

export interface DesktopSystemNotification {
  onClick: (listener: () => void) => void
  show: () => void
}

export interface DesktopNotificationTarget {
  conversationId: string
  runId: string
}

export interface DesktopNotificationServiceOptions {
  createNotification: (input: DesktopNotificationInput) => DesktopSystemNotification
  getLanguage: () => LexoraConfig['desktop']['language']
  getSettings: () => Pick<
    LexoraConfig['desktop'],
    'notificationsEnabled' | 'notifyWhenFocused'
  >
  isWindowFocused: () => boolean
  openTarget: (target: DesktopNotificationTarget) => Promise<void> | void
  request: DesktopRuntimeGateway['request']
}

const BODY_LABELS = {
  'zh-CN': {
    'approval.requested': '等待你的确认',
    'run.completed': '任务已完成',
    'run.failed': '任务失败',
    'untitled': '未命名对话',
  },
  'en-US': {
    'approval.requested': 'Waiting for your approval',
    'run.completed': 'Task completed',
    'run.failed': 'Task failed',
    'untitled': 'Untitled conversation',
  },
} as const

export class DesktopNotificationService {
  readonly #options: DesktopNotificationServiceOptions
  readonly #shownEvents = new Set<string>()

  constructor(options: DesktopNotificationServiceOptions) {
    this.#options = options
  }

  async handle(notification: { method: string, params: unknown }): Promise<void> {
    if (notification.method !== 'run.event')
      return
    const event = localChatSchemas.runStateEvent.safeParse(notification.params)
    if (!event.success)
      return
    const eventKey = `${event.data.runId}:${event.data.sequence}:${event.data.type}`
    if (this.#shownEvents.has(eventKey))
      return
    if (!shouldShowDesktopNotification({
      eventType: event.data.type,
      isWindowFocused: this.#options.isWindowFocused(),
      settings: this.#options.getSettings(),
    })) {
      return
    }

    const run = localChatResponseSchemas.run.parse(
      await this.#options.request('runs.get', { runId: event.data.runId }),
    )
    const conversations = localChatResponseSchemas.conversations.parse(
      await this.#options.request('conversations.list', { limit: 500 }),
    )
    const labels = BODY_LABELS[this.#options.getLanguage()]
    const conversation = conversations.find(item => item.id === run.conversationId)
    const systemNotification = this.#options.createNotification({
      body: labels[event.data.type as keyof Omit<typeof labels, 'untitled'>],
      title: conversation?.title?.trim() || labels.untitled,
    })
    systemNotification.onClick(() => {
      void this.#options.openTarget({
        conversationId: run.conversationId,
        runId: run.id,
      })
    })
    systemNotification.show()
    this.#shownEvents.add(eventKey)
  }
}
