import type { BuddyRuntime } from '../BuddyRuntime'
import type { RuntimeRequestRegistrar } from '../rpc/runtimeRequest'
import type { ChatCommandService } from './ChatCommandService'
import type { ChatTurnService } from './ChatTurnService'
import { z } from 'zod'
import { BUDDY_EXECUTION_PROFILES } from '../../../shared/executionProfile'
import {
  BUDDY_SERVICE_TIERS,
  BUDDY_THINKING_LEVELS,
} from '../../../shared/modelSelection'
import { parse } from '../rpc/runtimeRequest'

const idSchema = z.string().trim().min(1).max(256)
const sessionIdentitySchema = z.string().regex(/^[A-Z0-9][\w-]{0,127}$/i)
const requestIdSchema = z.string().min(1).max(128)
const contextItemsSchema = z.array(z.object({
  kind: z.enum(['file', 'skill', 'slashCommand']),
  value: z.string().min(1),
}).strict()).max(64)
const attachmentIdsSchema = z.array(idSchema).max(16)
const modelSelectionSchema = z.object({
  modelId: idSchema,
  providerId: idSchema,
  reasoning: z.enum(BUDDY_THINKING_LEVELS).nullable(),
  serviceTier: z.enum(BUDDY_SERVICE_TIERS).nullable(),
}).strict()
const startTurnSchema = z.object({
  attachmentIds: attachmentIdsSchema,
  branchId: sessionIdentitySchema.nullable(),
  content: z.string().max(2 * 1024 * 1024),
  contextItems: contextItemsSchema,
  conversationId: sessionIdentitySchema.nullable(),
  draftId: sessionIdentitySchema,
  executionProfile: z.enum(BUDDY_EXECUTION_PROFILES),
  modelSelection: modelSelectionSchema.nullable(),
  spaceId: idSchema.nullable(),
  requestId: requestIdSchema,
}).strict().refine(
  value => value.content.trim().length > 0 || value.attachmentIds.length > 0,
).refine(value => new Set(value.attachmentIds).size === value.attachmentIds.length)
const editUserMessageSchema = z.object({
  attachmentIds: attachmentIdsSchema,
  content: z.string().max(2 * 1024 * 1024),
  contextItems: contextItemsSchema,
  conversationId: idSchema,
  draftId: sessionIdentitySchema,
  modelSelection: modelSelectionSchema.nullable(),
  requestId: requestIdSchema,
  userMessageId: idSchema,
}).strict().refine(
  value => value.content.trim().length > 0 || value.attachmentIds.length > 0,
).refine(value => new Set(value.attachmentIds).size === value.attachmentIds.length)
const regenerateAssistantSchema = z.object({
  conversationId: idSchema,
  requestId: requestIdSchema,
  sourceRunId: idSchema,
}).strict()
const chatCommandSchema = z.object({
  arguments: z.string().max(4_096),
  branchId: sessionIdentitySchema,
  command: z.literal('compact'),
  conversationId: sessionIdentitySchema,
  requestId: requestIdSchema,
}).strict()

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
