import type { BuddyRuntime } from '../BuddyRuntime'
import type { RuntimeRequestRegistrar } from '../rpc/runtimeRequest'
import type { ChatCommandService } from './ChatCommandService'
import type { ChatTurnService } from './ChatTurnService'
import { chatRpc } from '../../../shared/conversation/chatApi'

import { registerRuntimeRequest } from '../rpc/runtimeRequest'

export interface RegisterChatRpcOptions {
  commands: Pick<ChatCommandService, 'execute'>
  rpc: RuntimeRequestRegistrar
  runtime: BuddyRuntime
  turns: Pick<
    ChatTurnService,
    'cancel' | 'editUserMessage' | 'regenerateAssistant'
  >
}

export function registerChatRpc(options: RegisterChatRpcOptions): () => void {
  const disposers = [
    registerRuntimeRequest(options.rpc, chatRpc.executeCommand, params => (
      options.commands.execute(params)
    )),
    registerRuntimeRequest(options.rpc, chatRpc.startTurn, params => (
      options.runtime.startTurn(params)
    )),
    registerRuntimeRequest(options.rpc, chatRpc.editUserMessage, params => (
      options.turns.editUserMessage(params)
    )),
    registerRuntimeRequest(options.rpc, chatRpc.regenerateAssistant, params => (
      options.turns.regenerateAssistant(params)
    )),
    registerRuntimeRequest(options.rpc, chatRpc.cancel, (input) => {
      return options.turns.cancel(input.runId)
    }),
  ]
  return () => disposers.splice(0).forEach(dispose => dispose())
}
