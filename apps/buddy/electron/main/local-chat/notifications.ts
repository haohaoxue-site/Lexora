import type { BrowserWindow } from 'electron'
import type { RegisterLocalChatIpcOptions } from './registrar'
import { automationNotifications } from '../../../shared/automation/automationApi'
import { providerNotifications } from '../../../shared/providers/providerApi'
import { toPublicRunEvent } from '../../../shared/runs/publicRunEvent'
import { runNotifications } from '../../../shared/runs/runApi'
import { runtimeResponseSchemas } from '../../../shared/runtime/serviceState'
import { LOCAL_CHAT_IPC_CHANNELS } from '../../shared/localChatApi'

export function registerLocalChatNotifications(options: RegisterLocalChatIpcOptions): () => void {
  const stopStateSubscription = options.runtime.onStateChange((state) => {
    const parsed = runtimeResponseSchemas.runtimeState.safeParse(state)
    if (parsed.success)
      sendToRenderer(options.getWindow(), LOCAL_CHAT_IPC_CHANNELS.runtimeStateChanged, parsed.data)
  })
  const stopNotificationSubscription = options.runtime.onNotification((notification) => {
    if (notification.method === runNotifications.event.method) {
      const event = runNotifications.event.params.safeParse(notification.params)
      if (event.success) {
        sendToRenderer(
          options.getWindow(),
          LOCAL_CHAT_IPC_CHANNELS.runEvent,
          toPublicRunEvent(event.data),
        )
      }
      return
    }
    if (notification.method === automationNotifications.changed.method) {
      const changed = automationNotifications.changed.params.safeParse(notification.params)
      if (changed.success) {
        sendToRenderer(
          options.getWindow(),
          LOCAL_CHAT_IPC_CHANNELS.automationChanged,
          changed.data.automationId,
        )
      }
      return
    }
    if (notification.method === providerNotifications.authChallenge.method) {
      const challenge = providerNotifications.authChallenge.params.safeParse(notification.params)
      if (challenge.success) {
        sendToRenderer(
          options.getWindow(),
          LOCAL_CHAT_IPC_CHANNELS.providerAuthChallenge,
          challenge.data,
        )
      }
    }
  })
  return () => {
    stopNotificationSubscription()
    stopStateSubscription()
  }
}

function sendToRenderer(window: BrowserWindow | null, channel: string, payload: unknown): void {
  if (!window || window.isDestroyed() || window.webContents.isDestroyed())
    return
  window.webContents.send(channel, payload)
}
