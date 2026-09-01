import type { AutomationChangeCoordinator } from '../automations/AutomationChangeCoordinator'
import type { RuntimeRequestRegistrar } from '../rpc/runtimeRequest'
import type { SpaceRepository } from '../storage/spaceRepository'
import type { SpaceService } from './SpaceService'
import { z } from 'zod'
import { ok, parse } from '../rpc/runtimeRequest'
import { requireActiveSpace } from './requireActiveSpace'

const idSchema = z.string().trim().min(1).max(256)
const directorySchema = z.object({
  id: idSchema.nullable(),
  root: z.string().min(1),
}).strict()
const spaceInputSchema = z.object({
  memoryScope: z.enum(['personal_and_space', 'space_only']),
  name: z.string().trim().min(1).max(80),
  primaryDirectory: directorySchema.nullable(),
  primaryDirectorySelectionVerified: z.boolean(),
}).strict()
const spaceIdSchema = z.object({ spaceId: idSchema }).strict()
const spaceListSchema = z.object({
  limit: z.number().int().positive().max(500).optional(),
}).strict()
const spaceSearchSchema = z.object({
  query: z.string().max(512),
  spaceId: idSchema,
}).strict()
const spaceUpdateSchema = spaceInputSchema.safeExtend({ spaceId: idSchema }).strict()

export interface SpaceSessionInvalidator {
  invalidateSpace: (spaceId: string) => Promise<unknown>
}

export interface RegisterSpaceRpcOptions {
  automations: Pick<AutomationChangeCoordinator, 'blockSpace'>
  rpc: RuntimeRequestRegistrar
  service: SpaceService
  sessions: SpaceSessionInvalidator
  spaces: Pick<SpaceRepository, 'findById'>
}

export function registerSpaceRpc(options: RegisterSpaceRpcOptions): () => void {
  const disposers: Array<() => void> = []
  const on = (method: string, handler: (params: unknown) => Promise<unknown> | unknown) => {
    disposers.push(options.rpc.onRequest(method, handler))
  }

  on('spaces.create', (params) => {
    return options.service.create(parse(spaceInputSchema, params))
  })
  on('spaces.update', async (params) => {
    const input = parse(spaceUpdateSchema, params)
    requireActiveSpace(options.spaces.findById(input.spaceId))
    const updated = await options.service.update(input)
    await options.sessions.invalidateSpace(input.spaceId)
    return updated
  })
  on('spaces.delete', async (params) => {
    const input = parse(spaceIdSchema, params)
    requireActiveSpace(options.spaces.findById(input.spaceId))
    await options.service.delete(input.spaceId)
    options.automations.blockSpace(input.spaceId)
    await options.sessions.invalidateSpace(input.spaceId)
    return ok()
  })
  on('spaces.list', (params) => {
    const input = parse(spaceListSchema, params)
    return options.service.list().slice(0, input.limit ?? 100)
  })
  on('spaces.searchFiles', (params) => {
    const input = parse(spaceSearchSchema, params)
    return options.service.searchFiles(input.spaceId, input.query)
  })

  return () => disposers.splice(0).forEach(dispose => dispose())
}
