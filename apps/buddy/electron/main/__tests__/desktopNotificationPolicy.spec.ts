import { describe, expect, it } from 'vitest'
import { shouldShowDesktopNotification } from '../desktopNotificationPolicy'

describe('desktop notification policy', () => {
  it('notifies only actionable or terminal events when notifications are enabled', () => {
    const settings = { notificationsEnabled: true, notifyWhenFocused: false }

    expect(shouldShowDesktopNotification({
      eventType: 'approval.requested',
      isWindowFocused: false,
      settings,
    })).toBe(true)
    expect(shouldShowDesktopNotification({
      eventType: 'run.completed',
      isWindowFocused: false,
      settings,
    })).toBe(true)
    expect(shouldShowDesktopNotification({
      eventType: 'run.failed',
      isWindowFocused: false,
      settings,
    })).toBe(true)
    expect(shouldShowDesktopNotification({
      eventType: 'run.cancelled',
      isWindowFocused: false,
      settings,
    })).toBe(false)
    expect(shouldShowDesktopNotification({
      eventType: 'tool.completed',
      isWindowFocused: false,
      settings,
    })).toBe(false)
  })

  it('respects the master switch and focused-window override', () => {
    expect(shouldShowDesktopNotification({
      eventType: 'run.completed',
      isWindowFocused: true,
      settings: { notificationsEnabled: true, notifyWhenFocused: false },
    })).toBe(false)
    expect(shouldShowDesktopNotification({
      eventType: 'run.completed',
      isWindowFocused: true,
      settings: { notificationsEnabled: true, notifyWhenFocused: true },
    })).toBe(true)
    expect(shouldShowDesktopNotification({
      eventType: 'run.failed',
      isWindowFocused: false,
      settings: { notificationsEnabled: false, notifyWhenFocused: true },
    })).toBe(false)
  })
})
