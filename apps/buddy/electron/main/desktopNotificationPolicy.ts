export interface DesktopNotificationSettings {
  notificationsEnabled: boolean
  notifyWhenFocused: boolean
}

export interface DesktopNotificationPolicyInput {
  eventType: string
  isWindowFocused: boolean
  settings: DesktopNotificationSettings
}

const NOTIFIABLE_EVENT_TYPES = new Set([
  'approval.requested',
  'run.completed',
  'run.failed',
])

export function shouldShowDesktopNotification(
  input: DesktopNotificationPolicyInput,
): boolean {
  return input.settings.notificationsEnabled
    && NOTIFIABLE_EVENT_TYPES.has(input.eventType)
    && (!input.isWindowFocused || input.settings.notifyWhenFocused)
}
