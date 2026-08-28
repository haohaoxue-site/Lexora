import type { RunEventReader } from '../events/RunEventPorts'
import type { RuntimeRequestRegistrar } from '../rpc/runtimeRequest'
import type { RunInputRepository } from '../storage/runInputRepository'
import type { RunRecord } from '../storage/runRecord'
import type { RunRepository } from '../storage/runRepository'
import { z } from 'zod'
import { toPublicRunEvent } from '../../../shared/publicRunEvent'
import { BuddyServiceError, parse } from '../rpc/runtimeRequest'
import { toPublicRun } from './publicRun'

const idSchema = z.string().trim().min(1).max(256)
const limitSchema = z.number().int().positive().max(500).optional()
const eventLimitSchema = z.number().int().positive().max(1_000).optional()

export interface RegisterRunRpcOptions {
  eventLog: Pick<RunEventReader, 'list' | 'listForConversation'>
  inputs: Pick<RunInputRepository, 'findByRunId'>
  repository: Pick<
    RunRepository,
    'findById' | 'listForConversation' | 'listRecent'
  >
  rpc: RuntimeRequestRegistrar
}

export function registerRunRpc(options: RegisterRunRpcOptions): () => void {
  const publicRun = (run: RunRecord) => toPublicRun(
    run,
    options.inputs.findByRunId(run.id)?.reasoning ?? null,
  )
  const disposers = [
    options.rpc.onRequest('runs.list', (params) => {
      const input = parse(z.object({
        conversationId: idSchema.nullable().optional(),
        limit: limitSchema,
      }).strict(), params)
      const records = input.conversationId
        ? options.repository.listForConversation(input.conversationId, input.limit ?? 100)
        : options.repository.listRecent(input.limit ?? 100)
      return records.map(publicRun)
    }),
    options.rpc.onRequest('runs.get', (params) => {
      const input = parse(z.object({ runId: idSchema }).strict(), params)
      const run = options.repository.findById(input.runId)
      if (!run)
        throw new BuddyServiceError('VALIDATION_FAILED')
      return publicRun(run)
    }),
    options.rpc.onRequest('runs.listEvents', async (params) => {
      const input = parse(z.union([
        z.object({
          afterSequence: z.number().int().nonnegative().optional(),
          limit: eventLimitSchema,
          runId: idSchema,
        }).strict(),
        z.object({
          conversationId: idSchema,
          limit: eventLimitSchema,
        }).strict(),
      ]), params)
      const events = 'conversationId' in input
        ? options.eventLog.listForConversation(input.conversationId, {
            limit: input.limit ?? 500,
          })
        : await options.eventLog.list(input.runId, {
            afterSequence: input.afterSequence,
            limit: input.limit ?? 500,
          })
      return events.map(toPublicRunEvent)
    }),
  ]
  return () => disposers.splice(0).forEach(dispose => dispose())
}
