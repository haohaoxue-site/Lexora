import type { BuddyRuntime } from '../BuddyRuntime'
import type { RuntimeRequestRegistrar } from '../rpc/runtimeRequest'
import type { ChatCommandService } from './ChatCommandService'
import type { ChatTurnService } from './ChatTurnService'
import { z } from 'zod'

import { buddyComposerDraftSendSchema } from '../../../shared/composerDraft'
import { parse } from '../rpc/runtimeRequest'

const idSchema = z.string().trim().min(1).max(256)
const sessionIdentitySchema = z.string().regex(/^[A-Z0-9][\w-]{0,127}$/i)
const requestIdSchema = z.string().min(1).max(128)
const startTurnSchema = buddyComposerDraftSendSchema
const editUserMessageSchema = z.object({
  conversationId: idSchema,
  draftId: sessionIdentitySchema,
  expectedRevision: z.number().int().nonnegative(),
  requestId: requestIdSchema,
  userMessageId: idSchema,
}).strict()
const regenerateAssistantSchema = z.object({
  conversationId: idSchema,
  requestId: requestIdSchema,
  sourceRunId: idSchema,
}).strict()
const chatCommandSchema = buddyComposerDraftSendSchema

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
    options.rpc.onRequest('chat.executeCommand', params => (
      options.commands.execute(parse(chatCommandSchema, params))
    )),
    options.rpc.onRequest('chat.startTurn', params => (
      options.runtime.startTurn(parse(startTurnSchema, params))
    )),
    options.rpc.onRequest('chat.editUserMessage', params => (
      options.turns.editUserMessage(parse(editUserMessageSchema, params))
    )),
    options.rpc.onRequest('chat.regenerateAssistant', params => (
      options.turns.regenerateAssistant(parse(regenerateAssistantSchema, params))
    )),
    options.rpc.onRequest('chat.cancel', (params) => {
      const input = parse(z.object({ runId: idSchema }).strict(), params)
      return options.turns.cancel(input.runId)
    }),
  ]
  return () => disposers.splice(0).forEach(dispose => dispose())
}
