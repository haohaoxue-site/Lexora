import type { LocalChatIpcContext } from './registrar'
import { runtimeResponseSchemas } from '../../../shared/runtime/serviceState'
import { LOCAL_CHAT_IPC_CHANNELS } from '../../shared/localChatApi'

export function registerRuntimeIpc(context: LocalChatIpcContext): void {
  const { handle, options } = context

  handle(LOCAL_CHAT_IPC_CHANNELS.runtimeStatus, () => (
    runtimeResponseSchemas.runtimeState.parse(options.runtime.state)
  ))

  handle(LOCAL_CHAT_IPC_CHANNELS.runtimeRestart, async () => {
    await options.runtime.restart()
    return runtimeResponseSchemas.runtimeState.parse(options.runtime.state)
  })
}
