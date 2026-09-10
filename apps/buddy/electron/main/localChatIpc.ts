import type { RegisterLocalChatIpcOptions } from './local-chat/registrar'
import { registerActivityIpc } from './local-chat/activity'
import { registerAutomationsIpc } from './local-chat/automations'
import { registerComposerIpc } from './local-chat/composer'
import { registerConnectorsIpc } from './local-chat/connectors'
import { registerConversationIpc } from './local-chat/conversation'
import { registerLocalChatNotifications } from './local-chat/notifications'
import { registerProvidersIpc } from './local-chat/providers'
import { createLocalChatIpcContext } from './local-chat/registrar'
import { registerRuntimeIpc } from './local-chat/runtime'
import { registerSpacesIpc } from './local-chat/spaces'
import { registerTaskMarksIpc } from './local-chat/taskMarks'
import { registerWebIpc } from './local-chat/web'

export type { DesktopRuntimeGateway, RegisterLocalChatIpcOptions } from './local-chat/registrar'

export function registerLocalChatIpc(options: RegisterLocalChatIpcOptions): () => void {
  const context = createLocalChatIpcContext(options)
  registerRuntimeIpc(context)
  registerActivityIpc(context)
  registerAutomationsIpc(context)
  registerProvidersIpc(context)
  registerSpacesIpc(context)
  registerConnectorsIpc(context)
  registerConversationIpc(context)
  registerTaskMarksIpc(context)
  registerWebIpc(context)
  registerComposerIpc(context)
  const stopNotifications = registerLocalChatNotifications(options)
  return () => {
    stopNotifications()
    context.dispose()
  }
}
